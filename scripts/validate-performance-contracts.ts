import { strict as assert } from "node:assert";
import { AsyncTtlCache } from "../lib/async-ttl-cache";
import { closeOnUpstreamFailure, shouldBufferMedia } from "../lib/media-body";
import { readNdjson } from "../lib/ndjson";
import { nextViableStream } from "../lib/stream-failover";
import type { Stream } from "../lib/types";
import { fetchWithValidatedRedirects } from "../lib/validated-redirect";
import { GAME_BOOTSTRAP_TTL_MS, isGameBootstrapFresh, type GameBootstrap } from "../lib/game-bootstrap";
import { todayInPT } from "../lib/datetime";

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

  let snapshotLoads = 0;
  const snapshots = new AsyncTtlCache<string, { complete: boolean; generation: number }>(
    1_000,
    2,
    (snapshot) => snapshot.complete,
  );
  const loadSnapshot = async () => {
    snapshotLoads += 1;
    return { complete: snapshotLoads >= 2, generation: snapshotLoads };
  };
  assert.equal((await snapshots.get("today", loadSnapshot)).generation, 1);
  assert.equal(
    (await snapshots.get("today", loadSnapshot)).generation,
    2,
    "partial upstream snapshots must be retried instead of cached",
  );
  assert.equal((await snapshots.get("today", loadSnapshot)).generation, 2);

  let ageBoundedLoads = 0;
  const ageBounded = new AsyncTtlCache<string, { loadedAt: number; generation: number }>(
    1_000,
    1,
    () => true,
    (snapshot, now) => 20 - (now - snapshot.loadedAt),
  );
  const loadAgeBounded = async () => ({ loadedAt: Date.now(), generation: ++ageBoundedLoads });
  assert.equal((await ageBounded.get("today", loadAgeBounded)).generation, 1);
  assert.equal((await ageBounded.get("today", loadAgeBounded)).generation, 1);
  await delay(25);
  assert.equal(
    (await ageBounded.get("today", loadAgeBounded)).generation,
    2,
    "value age must cap cache lifetime even when the default TTL is longer",
  );
}

async function validateRedirects() {
  const visited: string[] = [];
  const allowed = (url: URL) => url.protocol === "https:" && url.hostname === "allowed.test";
  const fetcher = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    visited.push(url.href);
    if (url.pathname === "/start") {
      return new Response(null, { status: 302, headers: { location: "/final" } });
    }
    return new Response("ok", { status: 200 });
  };
  assert.equal(
    await (await fetchWithValidatedRedirects(
      "https://allowed.test/start",
      allowed,
      {},
      fetcher,
    )).text(),
    "ok",
  );
  assert.deepEqual(visited, ["https://allowed.test/start", "https://allowed.test/final"]);

  await assert.rejects(
    fetchWithValidatedRedirects(
      "https://allowed.test/start",
      allowed,
      {},
      async () => new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      }),
    ),
    /redirect host not allowed/,
  );
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

async function validateNdjson() {
  const chunks = ["{\"id\":1}\n{\"", "id\":2}\n{\"id\":", "3}"];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(chunk));
    },
  });
  const values: Array<{ id: number }> = [];
  await readNdjson<{ id: number }>(body, (value) => values.push(value));
  assert.deepEqual(values, [{ id: 1 }, { id: 2 }, { id: 3 }]);
}

function validateFailover() {
  const streams: Stream[] = [
    { label: "one", url: "https://one.test", quality: "HD", health: "online" },
    { label: "two", url: "https://two.test", quality: "HD", health: "offline" },
    { label: "three", url: "https://three.test", quality: "HD", health: "online" },
  ];
  assert.equal(nextViableStream(streams, 0, new Set([streams[0].url])), 2, "failover should skip a DOWN source");
  assert.equal(nextViableStream(streams, 2, new Set([streams[2].url])), 0, "failover should wrap deterministically");
  assert.equal(
    nextViableStream(streams, 0, new Set([streams[0].url, streams[2].url])),
    -1,
    "failover must stop when none remain",
  );

  const reordered = [streams[2], streams[0], streams[1]];
  assert.equal(
    reordered.findIndex((stream) => stream.url === streams[0].url),
    1,
    "active source identity must survive health-based reordering",
  );
}

function validateGameBootstrap() {
  const now = Date.now();
  const bootstrap: GameBootstrap = {
    games: [],
    leagueDisplay: [],
    date: todayInPT(),
    loadedAt: now,
  };
  assert.equal(isGameBootstrapFresh(bootstrap, now), true);
  assert.equal(isGameBootstrapFresh(bootstrap, now + GAME_BOOTSTRAP_TTL_MS - 1), true);
  assert.equal(isGameBootstrapFresh(bootstrap, now + GAME_BOOTSTRAP_TTL_MS), false);
  assert.equal(isGameBootstrapFresh({ ...bootstrap, loadedAt: now + 1 }, now), false);
  assert.equal(isGameBootstrapFresh({ ...bootstrap, date: "2000-01-01" }, now), false);
}

async function main() {
  await validateCache();
  await validateMediaBodies();
  await validateNdjson();
  await validateRedirects();
  validateFailover();
  validateGameBootstrap();
  console.log("performance contracts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
