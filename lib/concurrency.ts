// Bounded-concurrency worker pool: runs `fn` over `items` with at most `limit`
// promises in flight, preserving input order in the result. When `signal` aborts,
// workers stop pulling new items and only the slots that completed are returned.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  // Only relevant on the abort path: which slots actually ran, so we drop
  // skipped slots by completion rather than by sentinel value.
  const completed = signal ? new Array<boolean>(items.length).fill(false) : null;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length && !signal?.aborted) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
      if (completed) completed[index] = true;
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return completed ? out.filter((_, index) => completed[index]) : out;
}
