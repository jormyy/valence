type Loader<T> = (signal: AbortSignal) => Promise<T>;

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

interface PendingEntry<T> {
  readonly controller: AbortController;
  promise: Promise<T>;
  waiters: number;
  settled: boolean;
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Small process-local cache for volatile upstream snapshots. Entries have a hard TTL,
 * expired data is never served, concurrent loads coalesce, and the shared request is
 * cancelled when its final caller leaves. Insertion order doubles as an LRU bound.
 */
export class AsyncTtlCache<K, T> {
  private readonly values = new Map<K, CacheEntry<T>>();
  private readonly pending = new Map<K, PendingEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  async get(key: K, load: Loader<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();

    const now = Date.now();
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > now) {
      this.values.delete(key);
      this.values.set(key, cached);
      return cached.value;
    }
    if (cached) this.values.delete(key);

    const inFlight = this.pending.get(key);
    if (inFlight && !inFlight.controller.signal.aborted) return this.wait(inFlight, signal);
    if (inFlight) this.pending.delete(key);

    const controller = new AbortController();
    let entry: PendingEntry<T>;
    const promise = load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) this.remember(key, value);
        return value;
      })
      .finally(() => {
        entry.settled = true;
        if (this.pending.get(key) === entry) this.pending.delete(key);
      });
    entry = {
      controller,
      promise,
      waiters: 0,
      settled: false,
    };
    this.pending.set(key, entry);
    return this.wait(entry, signal);
  }

  private remember(key: K, value: T) {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }

  private wait(entry: PendingEntry<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    entry.waiters += 1;

    return new Promise((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        entry.waiters -= 1;
        if (entry.waiters === 0 && !entry.settled) entry.controller.abort();
      };
      const abort = () => {
        release();
        reject(abortError());
      };

      signal?.addEventListener("abort", abort, { once: true });
      entry.promise.then(resolve, reject).finally(() => {
        signal?.removeEventListener("abort", abort);
        release();
      });
    });
  }
}
