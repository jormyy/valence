import { strict as assert } from "node:assert";
import { AsyncTtlCache } from "../lib/async-ttl-cache";
import { closeOnUpstreamFailure, shouldBufferMedia } from "../lib/media-body";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(complete, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function validateCache() {
  const cache = new AsyncTtlCache<string, number>(40, 2);
  let loads = 0;
  const loader = async (signal: AbortSignal) => {
    loads += 1;
    await delay(10, signal);
    return loads;
  };

  const values = await Promise.all(Array.from({ length: 8 }, () => cache.get("shared", loader)));
  assert.deepEqual(values, Array(8).fill(1), "concurrent cache callers should share one load");
  assert.equal(await cache.get("shared", loader), 1, "fresh cache hit should not reload");
  assert.equal(loads, 1);

  await delay(45);
  assert.equal(await cache.get("shared", loader), 2, "expired data must not be served");

  let sharedAborted = false;
  const sharedLoader = async (signal: AbortSignal) => {
    signal.addEventListener("abort", () => { sharedAborted = true; }, { once: true });
    await delay(20, signal);
    return 7;
  };
  const first = new AbortController();
  const abandoned = cache.get("waiters", sharedLoader, first.signal);
  const remaining = cache.get("waiters", sharedLoader);
  first.abort();
  await assert.rejects(abandoned, { name: "AbortError" });
  assert.equal(await remaining, 7, "one leaving waiter must not cancel remaining callers");
  assert.equal(sharedAborted, false);

  const only = new AbortController();
  let onlyAborted = false;
  const cancelled = cache.get("cancelled", async (signal) => {
    signal.addEventListener("abort", () => { onlyAborted = true; }, { once: true });
    await delay(100, signal);
    return 9;
  }, only.signal);
  only.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  await delay(0);
  assert.equal(onlyAborted, true, "final waiter should cancel shared upstream work");
  assert.equal(await cache.get("cancelled", async () => 10), 10, "abort must not poison the cache");
}

async function validateMediaBodies() {
  assert.equal(shouldBufferMedia(new URL("https://media.test/segment.ts"), "application/octet-stream"), true);
  assert.equal(shouldBufferMedia(new URL("https://media.test/chunk"), "video/iso.segment"), true);
  assert.equal(shouldBufferMedia(new URL("https://media.test/video.mp4"), "video/mp4"), false);

  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.error(new Error("late upstream failure"));
    },
  });
  const guarded = closeOnUpstreamFailure(upstream);
  assert.ok(guarded);
  assert.deepEqual(
    new Uint8Array(await new Response(guarded).arrayBuffer()),
    new Uint8Array(),
    "a body that fails before its first read should close cleanly",
  );

  let pulls = 0;
  const lateFailure = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) controller.enqueue(new Uint8Array([4, 5]));
      else controller.error(new Error("late upstream failure"));
    },
  });
  assert.deepEqual(
    new Uint8Array(await new Response(closeOnUpstreamFailure(lateFailure)).arrayBuffer()),
    new Uint8Array([4, 5]),
    "guard should preserve bytes read before a late failure",
  );
}

async function main() {
  await validateCache();
  await validateMediaBodies();
  console.log("performance contracts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
