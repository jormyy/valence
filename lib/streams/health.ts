import type { Stream, StreamHealth } from "../types";
import { browserHeaders } from "../embed-request";
import { fetchWithTimeout } from "../upstream";
import { isAllowedStreamUrl } from "./providers";
import type { StreamProviderOptions } from "./types";

const STREAM_HEALTH_TIMEOUT_MS = 2_500;
const STREAM_HEALTH_CONCURRENCY = 8;
const STREAM_HEALTH_CHECK_LIMIT = 32;
const STREAM_HEALTH_ONLINE_CACHE_MS = 60_000;
const STREAM_HEALTH_OFFLINE_CACHE_MS = 15_000;
const STREAM_HEALTH_CACHE_LIMIT = 512;

type HealthFetch = typeof fetchWithTimeout;
type CacheEntry = {
  readonly health: StreamHealth;
  readonly expiresAt: number;
};
type HealthProbeResult = {
  readonly health: StreamHealth;
  readonly cacheable: boolean;
};
type ReleaseHealthSlot = () => void;
type HealthQueueEntry = {
  readonly resolve: (release: ReleaseHealthSlot) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  abort?: () => void;
};
type PendingHealthCheck = {
  readonly controller: AbortController;
  promise: Promise<HealthProbeResult>;
  waiters: number;
};

export type StreamHealthCheck = (
  stream: Stream,
  index: number,
) => Promise<StreamHealth>;

export interface StreamHealthOptions extends StreamProviderOptions {
  readonly allowEmbedUrl?: (url: URL) => boolean;
  readonly checkHealth?: StreamHealthCheck;
  readonly fetcher?: HealthFetch;
  readonly maxHealthChecks?: number;
}

const healthCache = new Map<string, CacheEntry>();
const pendingHealthChecks = new Map<string, PendingHealthCheck>();
const healthFetchQueue: HealthQueueEntry[] = [];
let activeHealthFetches = 0;

function cachedHealth(key: string, now: number): StreamHealth | null {
  const entry = healthCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > now) return entry.health;

  healthCache.delete(key);
  return null;
}

function cacheTtl(health: StreamHealth): number {
  return health === "online" ? STREAM_HEALTH_ONLINE_CACHE_MS : STREAM_HEALTH_OFFLINE_CACHE_MS;
}

function pruneHealthCache(now: number) {
  for (const [key, entry] of healthCache) {
    if (entry.expiresAt <= now) healthCache.delete(key);
  }
  while (healthCache.size > STREAM_HEALTH_CACHE_LIMIT) {
    const oldestKey = healthCache.keys().next().value;
    if (!oldestKey) break;
    healthCache.delete(oldestKey);
  }
}

function rememberHealth(key: string, health: StreamHealth, now = Date.now()) {
  healthCache.set(key, { health, expiresAt: now + cacheTtl(health) });
  if (healthCache.size > STREAM_HEALTH_CACHE_LIMIT) pruneHealthCache(now);
}

function healthCacheKey(target: URL): string {
  const key = new URL(target.href);
  key.hash = "";
  return key.href;
}

function isKnownCloudBlockedWrapper(target: URL): boolean {
  return target.hostname === "embed.st"
    || target.hostname === "embedindia.st"
    || target.hostname === "embed.streamapi.cc";
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function releaseHealthSlot() {
  activeHealthFetches = Math.max(0, activeHealthFetches - 1);
  drainHealthQueue();
}

function drainHealthQueue() {
  while (activeHealthFetches < STREAM_HEALTH_CONCURRENCY && healthFetchQueue.length > 0) {
    const entry = healthFetchQueue.shift()!;
    if (entry.abort) entry.signal?.removeEventListener("abort", entry.abort);
    if (entry.signal?.aborted) {
      entry.reject(abortError());
      continue;
    }
    activeHealthFetches += 1;
    entry.resolve(releaseHealthSlot);
  }
}

async function acquireHealthSlot(signal?: AbortSignal): Promise<ReleaseHealthSlot> {
  if (signal?.aborted) throw abortError();
  if (activeHealthFetches < STREAM_HEALTH_CONCURRENCY) {
    activeHealthFetches += 1;
    return releaseHealthSlot;
  }

  return new Promise((resolve, reject) => {
    const entry: HealthQueueEntry = { resolve, reject, signal };
    entry.abort = () => {
      const index = healthFetchQueue.indexOf(entry);
      if (index !== -1) healthFetchQueue.splice(index, 1);
      reject(abortError());
    };
    signal?.addEventListener("abort", entry.abort, { once: true });
    healthFetchQueue.push(entry);
  });
}

async function fetchStreamHealth(
  target: URL,
  options: StreamHealthOptions = {},
): Promise<HealthProbeResult> {
  let release: ReleaseHealthSlot | null = null;
  try {
    release = await acquireHealthSlot(options.signal);
    if (options.signal?.aborted) throw abortError();
    const fetcher = options.fetcher ?? fetchWithTimeout;
    const res = await fetcher(target.href, {
      cache: "no-store",
      headers: browserHeaders(target),
      redirect: "follow",
      signal: options.signal,
      timeoutMs: STREAM_HEALTH_TIMEOUT_MS,
    });
    void res.body?.cancel().catch(() => undefined);
    if (options.signal?.aborted) return { health: "offline", cacheable: false };
    return { health: res.ok ? "online" : "offline", cacheable: true };
  } catch (error) {
    return { health: "offline", cacheable: !isAbortError(error) && !options.signal?.aborted };
  } finally {
    release?.();
  }
}

function waitForPendingHealth(
  entry: PendingHealthCheck,
  signal?: AbortSignal,
): Promise<HealthProbeResult> {
  if (signal?.aborted) return Promise.resolve({ health: "offline", cacheable: false });

  entry.waiters += 1;
  let released = false;
  const releaseWaiter = () => {
    if (released) return;
    released = true;
    entry.waiters -= 1;
    if (entry.waiters === 0) entry.controller.abort();
  };

  return new Promise((resolve) => {
    const abort = () => {
      releaseWaiter();
      resolve({ health: "offline", cacheable: false });
    };
    signal?.addEventListener("abort", abort, { once: true });
    entry.promise.then(resolve, () => resolve({ health: "offline", cacheable: false })).finally(() => {
      signal?.removeEventListener("abort", abort);
      releaseWaiter();
    });
  });
}

export async function probeStreamHealth(
  rawUrl: string,
  options: StreamHealthOptions = {},
): Promise<StreamHealth> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return "offline";
  }

  const allowEmbedUrl = options.allowEmbedUrl ?? isAllowedStreamUrl;
  if (!allowEmbedUrl(target)) return "offline";
  if (options.signal?.aborted) return "offline";
  if (isKnownCloudBlockedWrapper(target)) return "offline";

  const key = healthCacheKey(target);
  const now = Date.now();
  const cached = cachedHealth(key, now);
  if (cached) return cached;

  const pending = pendingHealthChecks.get(key);
  if (pending?.controller.signal.aborted) pendingHealthChecks.delete(key);
  else if (pending) return (await waitForPendingHealth(pending, options.signal)).health;

  const controller = new AbortController();
  const entry: PendingHealthCheck = {
    controller,
    promise: Promise.resolve({ health: "offline", cacheable: false }),
    waiters: 0,
  };
  entry.promise = fetchStreamHealth(target, { ...options, signal: controller.signal }).then((result) => {
    if (result.cacheable && !controller.signal.aborted) rememberHealth(key, result.health);
    return result;
  }).finally(() => {
    if (pendingHealthChecks.get(key) === entry) pendingHealthChecks.delete(key);
  });
  pendingHealthChecks.set(key, entry);
  return (await waitForPendingHealth(entry, options.signal)).health;
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length && !signal?.aborted) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return out.filter((value): value is R => value !== undefined);
}

function healthRank(health: StreamHealth | undefined): number {
  if (health === "online") return 0;
  if (health === undefined) return 1;
  return 2;
}

function cloudPlaybackRank(stream: Stream): number {
  try {
    const target = new URL(stream.url);
    if (isAllowedStreamUrl(target) && target.hostname === "streams.esportex.site") return 0;
    if (target.hostname === "embedindia.st") return 1;
    if (target.hostname === "embedhd.org" || target.hostname === "exposestrat.com") return 1;
    if (target.hostname === "embed.st" && target.pathname.startsWith("/embed/golf/")) return 1;
    if (target.hostname === "embed.st" || target.hostname === "embed.streamapi.cc") return 3;
  } catch {
    return 4;
  }

  return 2;
}

export async function rankStreamsByHealth(
  streams: readonly Stream[],
  options: StreamHealthOptions = {},
): Promise<Stream[]> {
  const checkLimit = Math.max(
    0,
    Math.min(options.maxHealthChecks ?? STREAM_HEALTH_CHECK_LIMIT, streams.length),
  );
  const streamsToCheck = streams.slice(0, checkLimit);
  const unchecked = streams.slice(checkLimit);
  const checkHealth = options.checkHealth ?? (
    (stream: Stream) => probeStreamHealth(stream.url, options)
  );
  const checked = await mapConcurrent(
    streamsToCheck,
    STREAM_HEALTH_CONCURRENCY,
    async (stream, index) => ({
      stream: { ...stream, health: await checkHealth(stream, index) },
      index,
    }),
    options.signal,
  );

  return [
    ...checked,
    ...unchecked.map((stream, index) => ({ stream, index: checkLimit + index })),
  ]
    .sort((a, b) =>
      healthRank(a.stream.health) - healthRank(b.stream.health)
      || cloudPlaybackRank(a.stream) - cloudPlaybackRank(b.stream)
      || a.index - b.index
    )
    .map(({ stream }) => stream);
}
