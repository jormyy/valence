import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import type { Stream } from "../lib/types";
import {
  decodeEsportexPlayerId,
  parseEmbedhdFid,
  parseExposestratHlsUrl,
  parseXoredEsportexData,
  resolveEsportexEmbed,
} from "../lib/streams/esportex-resolver";
import { probeStreamHealth, rankStreamsByHealth } from "../lib/streams/health";
import { MEDIA_HOST_RULES } from "../lib/streams/providers";

function stream(url: string, label: string): Stream {
  return { label, url, quality: "HD", language: "EN" };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

const requestsByUrl = new Map<string, number>();

const server = createServer((request, response) => {
  const path = request.url ?? "/";
  requestsByUrl.set(path, (requestsByUrl.get(path) ?? 0) + 1);

  switch (request.url) {
    case "/good-a":
    case "/good-b":
    case "/good-c":
    case "/good-cache":
    case "/good-flight":
    case "/good-hash":
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body>ok</body></html>");
      return;
    case "/bad-a":
    case "/bad-b":
    case "/bad-c":
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("down");
      return;
    default:
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
  }
});

function listen(): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("server did not bind a port"));
    });
  });
}

async function closeServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function assertOnlineFirst(name: string, ranked: Stream[]) {
  const firstOffline = ranked.findIndex((item) => item.health === "offline");
  if (firstOffline === -1) return;
  if (ranked.every((item) => item.health === "offline")) return;
  assert.notEqual(firstOffline, 0, `${name}: first stream should not be offline`);

  const laterOnline = ranked.slice(firstOffline + 1).find((item) => item.health === "online");
  assert.equal(laterOnline, undefined, `${name}: online stream found after offline stream`);
}

async function main() {
  const port = await listen();
  const base = `http://127.0.0.1:${port}`;
  const options = { allowEmbedUrl: () => true };

  assert.equal(
    decodeEsportexPlayerId(new URL("https://streams.esportex.site/player#ZWhkLzcx")),
    "ehd/71",
  );
  assert.equal(
    decodeEsportexPlayerId(new URL("https://streams.esportex.site/player#cHB2LzIzNDM4")),
    "ppv/23438",
  );
  assert.ok(
    MEDIA_HOST_RULES.some((rule) =>
      rule.hostname === "indianservers.st"
      && rule.includeSubdomains === true
      && rule.pathPrefix === "/secure/"
    ),
    "EmbedIndia PPV HLS host should be proxied",
  );

  const esportexData = JSON.stringify({
    id: "ehd/71",
    type: "iframe",
    url: "https://embedhd.org/source/fetch.php?hd=71",
  });
  const xored = new Uint8Array(Buffer.from(esportexData).map((byte) => byte ^ 90));
  assert.deepEqual(parseXoredEsportexData(xored.buffer), {
    id: "ehd/71",
    type: "iframe",
    url: "https://embedhd.org/source/fetch.php?hd=71",
  });
  const ppvData = JSON.stringify({
    id: "ppv/23438",
    type: "iframe",
    url: "https://embedindia.st/embed/wnba/2026-06-20/ind-atl",
  });
  const ppvXored = new Uint8Array(Buffer.from(ppvData).map((byte) => byte ^ 90));
  const resolvedPpv = await resolveEsportexEmbed(
    new URL("https://streams.esportex.site/player#cHB2LzIzNDM4"),
    {
      fetcher: async () => new Response(ppvXored),
    },
  );
  assert.equal(
    resolvedPpv?.embedUrl.href,
    "https://embedindia.st/embed/wnba/2026-06-20/ind-atl",
  );
  assert.equal(parseEmbedhdFid(`<script>fid="ntsn1fhd";</script>`), "ntsn1fhd");
  assert.equal(
    parseExposestratHlsUrl(`
      function tleptrgtUH(){
        return(["h","t","t","p","s",":","\\/","\\/","c","d","n","1","5",".","z","o","h","a","n","a","y","a","a","n",".","c","o","m",":","1","6","8","6","\\/","h","l","s","\\/","n","t","s","n","1","f","h","d",".","m","3","u","8","?","m","d","5","=","a","b","c","&","e","x","p","i","r","e","s","=","1"].join("") + "");
      }
    `),
    "https://cdn15.zohanayaan.com:1686/hls/ntsn1fhd.m3u8?md5=abc&expires=1",
  );

  assert.equal(await probeStreamHealth(`${base}/good-a`, options), "online");
  assert.equal(await probeStreamHealth(`${base}/bad-a`, options), "offline");
  assert.equal(await probeStreamHealth(`${base}/missing`, options), "offline");
  assert.equal(await probeStreamHealth(`${base}/good-cache`, options), "online");
  assert.equal(await probeStreamHealth(`${base}/good-cache`, options), "online");
  assert.equal(requestsByUrl.get("/good-cache"), 1, "cached health should not refetch a fresh URL");

  await Promise.all(Array.from(
    { length: 8 },
    () => probeStreamHealth(`${base}/good-flight`, options),
  ));
  assert.equal(requestsByUrl.get("/good-flight"), 1, "concurrent health checks should share one fetch");
  assert.equal(await probeStreamHealth(`${base}/good-hash#one`, options), "online");
  assert.equal(await probeStreamHealth(`${base}/good-hash#two`, options), "online");
  assert.equal(requestsByUrl.get("/good-hash"), 1, "hash-only variants should share one probe");

  const cases: Array<{ name: string; streams: Stream[]; expectedLabels: string[] }> = [
    {
      name: "basketball mixed providers",
      streams: [
        stream(`${base}/bad-a`, "nba streamed"),
        stream(`${base}/good-a`, "nba sportsrc"),
        stream(`${base}/bad-b`, "nba embedsportex"),
        stream(`${base}/good-b`, "nba ppv"),
      ],
      expectedLabels: ["nba sportsrc", "nba ppv", "nba streamed", "nba embedsportex"],
    },
    {
      name: "baseball keeps working provider order",
      streams: [
        stream(`${base}/good-a`, "mlb streamed"),
        stream(`${base}/good-b`, "mlb sportsrc"),
        stream(`${base}/bad-a`, "mlb ppv"),
      ],
      expectedLabels: ["mlb streamed", "mlb sportsrc", "mlb ppv"],
    },
    {
      name: "tennis all down keeps source order",
      streams: [
        stream(`${base}/bad-a`, "atp streamed"),
        stream(`${base}/bad-b`, "atp sportsrc"),
        stream(`${base}/bad-c`, "atp ppv"),
      ],
      expectedLabels: ["atp streamed", "atp sportsrc", "atp ppv"],
    },
    {
      name: "wta late working source is promoted",
      streams: [
        stream(`${base}/bad-a`, "wta streamed"),
        stream(`${base}/bad-b`, "wta sportsrc"),
        stream(`${base}/good-c`, "wta embedsportex"),
      ],
      expectedLabels: ["wta embedsportex", "wta streamed", "wta sportsrc"],
    },
  ];

  for (const item of cases) {
    const ranked = await rankStreamsByHealth(item.streams, options);
    assertOnlineFirst(item.name, ranked);
    assert.deepEqual(ranked.map((entry) => entry.label), item.expectedLabels, item.name);
  }

  const cloudPlayableTies = await rankStreamsByHealth(
    [
      stream("https://embed.st/embed/event-slug/1", "embed shell"),
      stream("https://streams.esportex.site/player#ZWhkLzcx", "cloud playable"),
      stream("https://embedindia.st/embed/event-slug/2", "token shell"),
    ],
    {
      allowEmbedUrl: () => true,
      fetcher: async () => new Response("<html>ok</html>", { status: 200 }),
      maxHealthChecks: 3,
    },
  );
  assert.deepEqual(
    cloudPlayableTies.map((entry) => entry.label),
    ["cloud playable", "token shell", "embed shell"],
    "cloud-playable players should win online health ties",
  );

  const embedStFamilies = await rankStreamsByHealth(
    [
      stream("https://embed.st/embed/admin/event/1", "strmd admin shell"),
      stream("https://embed.st/embed/golf/23290/1", "embedhd golf shell"),
      stream("https://embed.st/embed/delta/event/1", "strmd delta shell"),
    ],
    {
      allowEmbedUrl: () => true,
      fetcher: async () => new Response("<html>ok</html>", { status: 200 }),
      maxHealthChecks: 3,
    },
  );
  assert.deepEqual(
    embedStFamilies.map((entry) => entry.label),
    ["embedhd golf shell", "strmd admin shell", "strmd delta shell"],
    "EmbedHD-backed embed.st sources should be tried before strmd-backed shells",
  );

  const windowed = await rankStreamsByHealth(
    Array.from({ length: 50 }, (_, index) => stream(`${base}/window-${index}`, `window ${index}`)),
    { ...options, maxHealthChecks: 32 },
  );
  const windowRequests = Array.from({ length: 50 }, (_, index) =>
    requestsByUrl.get(`/window-${index}`) ?? 0
  );
  assert.equal(
    windowRequests.reduce((sum, count) => sum + count, 0),
    32,
    "health ranking should cap synchronous probes",
  );
  assert.equal(windowed.filter((entry) => entry.health === "offline").length, 32);
  assert.equal(windowed.filter((entry) => entry.health === undefined).length, 18);
  assert.deepEqual(
    windowed.slice(0, 18).map((entry) => entry.health),
    Array.from({ length: 18 }, () => undefined),
    "unchecked overflow should be tried before known-offline streams",
  );

  let activeGlobalFetches = 0;
  let maxGlobalFetches = 0;
  let totalGlobalFetches = 0;
  const globalLimitFetcher: typeof import("../lib/upstream").fetchWithTimeout = async () => {
    activeGlobalFetches += 1;
    totalGlobalFetches += 1;
    maxGlobalFetches = Math.max(maxGlobalFetches, activeGlobalFetches);
    await delay(10);
    activeGlobalFetches -= 1;
    return new Response("ok", { status: 200 });
  };
  await Promise.all(Array.from({ length: 3 }, (_, group) =>
    rankStreamsByHealth(
      Array.from({ length: 12 }, (_, index) =>
        stream(`https://global-limit.test/${group}-${index}`, `global ${group}-${index}`)
      ),
      { allowEmbedUrl: () => true, fetcher: globalLimitFetcher, maxHealthChecks: 12 },
    )
  ));
  assert.equal(totalGlobalFetches, 36);
  assert.ok(maxGlobalFetches <= 8, `expected global health fetch concurrency <= 8, got ${maxGlobalFetches}`);

  const abortController = new AbortController();
  let abortFetches = 0;
  const abortFetcher: typeof import("../lib/upstream").fetchWithTimeout = async (_input, init) => {
    abortFetches += 1;
    abortController.abort();
    await delay(10);
    if (init?.signal?.aborted) throw abortError();
    return new Response("ok", { status: 200 });
  };
  await rankStreamsByHealth(
    Array.from({ length: 20 }, (_, index) => stream(`${base}/abort-${index}`, `abort ${index}`)),
    { ...options, fetcher: abortFetcher, maxHealthChecks: 20, signal: abortController.signal },
  );
  assert.equal(abortFetches, 1, "aborted rankings should stop admitting new health probes");

  await delay(20);
  let retryFetches = 0;
  const retryFetcher: typeof import("../lib/upstream").fetchWithTimeout = async () => {
    retryFetches += 1;
    return new Response("ok", { status: 200 });
  };
  assert.equal(
    await probeStreamHealth(`${base}/abort-0`, { ...options, fetcher: retryFetcher }),
    "online",
    "abort-created offline state should not be cached",
  );
  assert.equal(retryFetches, 1);

  const raceFirst = new AbortController();
  const raceSecond = new AbortController();
  const raceFirstRelease = deferred<void>();
  const raceSecondRelease = deferred<void>();
  let raceFetches = 0;
  const raceFetcher: typeof import("../lib/upstream").fetchWithTimeout = async (_input, init) => {
    raceFetches += 1;
    const release = raceFetches === 1 ? raceFirstRelease : raceSecondRelease;
    await release.promise;
    if (init?.signal?.aborted) throw abortError();
    return new Response("ok", { status: 200 });
  };
  const firstRace = probeStreamHealth(`${base}/race#first`, {
    ...options,
    fetcher: raceFetcher,
    signal: raceFirst.signal,
  });
  await delay(5);
  raceFirst.abort();
  const secondRace = probeStreamHealth(`${base}/race#second`, {
    ...options,
    fetcher: raceFetcher,
    signal: raceSecond.signal,
  });
  await delay(5);
  raceFirstRelease.resolve();
  await firstRace;
  const thirdRace = probeStreamHealth(`${base}/race#third`, {
    ...options,
    fetcher: raceFetcher,
  });
  await delay(5);
  assert.equal(raceFetches, 2, "stale aborted cleanup should not remove a newer in-flight probe");
  raceSecondRelease.resolve();
  assert.equal(await secondRace, "online");
  assert.equal(await thirdRace, "online");
  assert.equal(raceFetches, 2);

  const ignoredAbortController = new AbortController();
  const ignoredAbortRelease = deferred<void>();
  let ignoredAbortFetches = 0;
  const ignoredAbortFetcher: typeof import("../lib/upstream").fetchWithTimeout = async () => {
    ignoredAbortFetches += 1;
    ignoredAbortController.abort();
    await ignoredAbortRelease.promise;
    return new Response("ok", { status: 200 });
  };
  const ignoredAbortFirst = probeStreamHealth(`${base}/ignored-abort`, {
    ...options,
    fetcher: ignoredAbortFetcher,
    signal: ignoredAbortController.signal,
  });
  await delay(5);
  ignoredAbortRelease.resolve();
  assert.equal(await ignoredAbortFirst, "offline");
  assert.equal(ignoredAbortFetches, 1);

  let ignoredAbortRetryFetches = 0;
  const ignoredAbortRetryFetcher: typeof import("../lib/upstream").fetchWithTimeout = async () => {
    ignoredAbortRetryFetches += 1;
    return new Response("ok", { status: 200 });
  };
  assert.equal(
    await probeStreamHealth(`${base}/ignored-abort`, {
      ...options,
      fetcher: ignoredAbortRetryFetcher,
    }),
    "online",
    "abort-ignored success should not be cached after caller aborts",
  );
  assert.equal(ignoredAbortRetryFetches, 1);
}

main()
  .finally(closeServer)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
