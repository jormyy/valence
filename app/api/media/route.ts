import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { isAllowedEmbedUrl, isAllowedMediaUrl, originFromEmbedReferer } from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";
import { publicRequestOrigin } from "@/lib/request-origin";
import { closeOnUpstreamFailure, shouldBufferMedia } from "@/lib/media-body";
import { fetchWithValidatedRedirects } from "@/lib/validated-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const NODE_TRANSPORT_REDIRECT_LIMIT = 4;
const CURL_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const CURL_STATUS_MARKER = "\n__VALENCE_CURL_STATUS__:";
const CURL_REDIRECT_MARKER = "\n__VALENCE_CURL_REDIRECT__:";
const UPSTREAM_URL_HEADER = "x-valence-upstream-url";

function corsHeaders(request: Request): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "accept, content-type, goat, range",
    "access-control-expose-headers": "accept-ranges, content-length, content-range",
    "access-control-max-age": "86400",
  });
}

function corsResponse(
  request: Request,
  body: BodyInit | null,
  init: ResponseInit,
): NextResponse {
  const headers = new Headers(init.headers);
  for (const [key, value] of corsHeaders(request)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new NextResponse(body, {
    ...init,
    headers,
  });
}

function safeGoat(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  return /^[A-Za-z0-9+/=_:.,-]+$/.test(trimmed) ? trimmed : undefined;
}

function mediaGoat(request: Request): string | undefined {
  const requestUrl = new URL(request.url);
  return safeGoat(request.headers.get("goat")) ?? safeGoat(requestUrl.searchParams.get("g"));
}

function proxiedMediaUrl(
  url: URL,
  appOrigin: string,
  refererOrigin: string,
  goat?: string,
): string {
  const params = new URLSearchParams({ r: refererOrigin, u: url.href });
  if (goat) params.set("g", goat);
  return `${appOrigin}/api/media?${params}`;
}

function rewritePlaylist(
  text: string,
  target: URL,
  appOrigin: string,
  refererOrigin: string,
  goat?: string,
): string {
  const proxiedMedia = (url: URL) => proxiedMediaUrl(url, appOrigin, refererOrigin, goat);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const uriRewritten = line.replace(/URI="([^"]+)"/g, (_match, value: string) => {
        try {
          const next = new URL(value, target);
          if (isAllowedMediaUrl(next)) {
            return `URI="${proxiedMedia(next)}"`;
          }
        } catch {
          return `URI="${value}"`;
        }
        return `URI="${value}"`;
      });

      const trimmed = uriRewritten.trim();
      if (!trimmed || trimmed.startsWith("#")) return uriRewritten;

      try {
        const next = new URL(trimmed, target);
        if (isAllowedMediaUrl(next)) {
          return proxiedMedia(next);
        }
      } catch {
        return uriRewritten;
      }

      return uriRewritten;
    })
    .join("\n");
}

function contentTypeFor(target: URL): string {
  if (/\.m3u8(?:$|[?#])/i.test(target.pathname)) {
    return "application/vnd.apple.mpegurl; charset=utf-8";
  }
  if (/\.ts(?:$|[?#])/i.test(target.pathname)) return "video/mp2t";
  if (/\.m4s(?:$|[?#])/i.test(target.pathname)) return "video/iso.segment";
  if (/\.mp4(?:$|[?#])/i.test(target.pathname)) return "video/mp4";
  return "application/octet-stream";
}

function playlistBaseUrl(upstream: Response, fallback: URL): URL {
  try {
    const raw = upstream.url || upstream.headers.get(UPSTREAM_URL_HEADER);
    if (raw) {
      const url = new URL(raw);
      if (isAllowedMediaUrl(url)) return url;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function shouldUseNodeTransport(target: URL, response?: Response): boolean {
  return target.hostname === "strmd.st"
    || target.hostname.endsWith(".strmd.st")
    || response?.status === 403;
}

function shouldUseCurlTransport(target: URL, response?: Response): boolean {
  if (response && response.status !== 403) return false;
  return target.hostname === "indianservers.st"
    || target.hostname.endsWith(".indianservers.st")
    || target.hostname === "strmd.st"
    || target.hostname.endsWith(".strmd.st");
}

function copyNodeResponseHeaders(rawHeaders: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function nodeRequestHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers) out[key] = value;
  out["accept-encoding"] = "identity";
  return out;
}

function isRedirect(status: number | undefined): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function fetchMediaWithNodeTransport(
  target: URL,
  headers: Headers,
  signal: AbortSignal,
  redirectCount = 0,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("node transport aborted"));
      return;
    }

    const client = target.protocol === "http:" ? http : https;
    const request = client.request(target, {
      method: "GET",
      headers: nodeRequestHeaders(headers),
      timeout: PROXY_FETCH_TIMEOUT_MS,
    });

    let settled = false;
    const cleanup = () => {
      request.off("error", onError);
      request.off("timeout", onTimeout);
      signal.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      request.destroy();
      reject(error);
    };
    const onError = (error: Error) => fail(error);
    const onTimeout = () => fail(new Error("node transport timed out"));
    const onAbort = () => fail(new Error("node transport aborted"));

    request.on("error", onError);
    request.on("timeout", onTimeout);
    signal.addEventListener("abort", onAbort, { once: true });

    request.on("response", (upstream) => {
      const location = upstream.headers.location;
      if (isRedirect(upstream.statusCode) && location) {
        upstream.resume();
        if (redirectCount >= NODE_TRANSPORT_REDIRECT_LIMIT) {
          fail(new Error("node media redirect limit exceeded"));
          return;
        }
        let next: URL;
        try {
          next = new URL(Array.isArray(location) ? location[0] : location, target);
        } catch {
          fail(new Error("bad media redirect"));
          return;
        }
        if (!isAllowedMediaUrl(next)) {
          fail(new Error("media redirect host not allowed"));
          return;
        }

        settled = true;
        cleanup();
        resolve(fetchMediaWithNodeTransport(next, headers, signal, redirectCount + 1));
        return;
      }

      settled = true;
      cleanup();
      resolve(new Response(Readable.toWeb(upstream) as BodyInit, {
        status: upstream.statusCode ?? 502,
        statusText: upstream.statusMessage,
        headers: (() => {
          const responseHeaders = copyNodeResponseHeaders(upstream.headers);
          responseHeaders.set(UPSTREAM_URL_HEADER, target.href);
          return responseHeaders;
        })(),
      }));
    });

    request.end();
  });
}

function fetchMediaWithCurlTransport(
  target: URL,
  headers: Headers,
  signal: AbortSignal,
  redirectCount = 0,
): Promise<Response> {
  if (signal.aborted) return Promise.reject(new Error("curl media aborted"));
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "--http1.1",
      "--max-time",
      String(Math.ceil(PROXY_FETCH_TIMEOUT_MS / 1000)),
      "-A",
      headers.get("user-agent") ?? USER_AGENT,
      "-w",
      `${CURL_STATUS_MARKER}%{http_code}${CURL_REDIRECT_MARKER}%{redirect_url}`,
    ];

    for (const key of ["referer", "origin", "accept", "range", "goat"]) {
      const value = headers.get(key);
      if (value) args.push("-H", `${key}: ${value}`);
    }
    args.push(target.href);

    const child = execFile("curl", args, {
      encoding: "buffer",
      maxBuffer: CURL_MAX_BUFFER_BYTES,
    }, (error, stdout) => {
      signal.removeEventListener("abort", abort);
      if (error) {
        reject(error);
        return;
      }

      const marker = Buffer.from(CURL_STATUS_MARKER);
      const markerIndex = stdout.lastIndexOf(marker);
      if (markerIndex < 0) {
        reject(new Error("curl media status missing"));
        return;
      }

      const body = stdout.subarray(0, markerIndex);
      const metadata = stdout.subarray(markerIndex + marker.length).toString("utf8");
      const redirectIndex = metadata.indexOf(CURL_REDIRECT_MARKER);
      if (redirectIndex < 0) {
        reject(new Error("curl media redirect metadata missing"));
        return;
      }
      const statusText = metadata.slice(0, redirectIndex).trim();
      const status = Number.parseInt(statusText, 10);
      if (!Number.isFinite(status)) {
        reject(new Error("curl media status invalid"));
        return;
      }

      const location = metadata.slice(redirectIndex + CURL_REDIRECT_MARKER.length).trim();
      if (isRedirect(status) && location) {
        if (redirectCount >= NODE_TRANSPORT_REDIRECT_LIMIT) {
          reject(new Error("curl media redirect limit exceeded"));
          return;
        }
        let next: URL;
        try {
          next = new URL(location, target);
        } catch {
          reject(new Error("bad curl media redirect"));
          return;
        }
        if (!isAllowedMediaUrl(next)) {
          reject(new Error("curl media redirect host not allowed"));
          return;
        }
        resolve(fetchMediaWithCurlTransport(next, headers, signal, redirectCount + 1));
        return;
      }

      resolve(new Response(body, {
        status,
        headers: {
          "content-type": contentTypeFor(target),
          "content-length": String(body.length),
          [UPSTREAM_URL_HEADER]: target.href,
        },
      }));
    });

    const abort = () => {
      child.kill();
      reject(new Error("curl media aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

async function fetchMedia(target: URL, request: Request, embedOrigin: string, goat?: string): Promise<Response> {
  const headers = new Headers({
    "user-agent": USER_AGENT,
    referer: `${embedOrigin}/`,
    origin: embedOrigin,
    accept: request.headers.get("accept") ?? "*/*",
  });

  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  if (goat) headers.set("goat", goat);

  try {
    const upstream = await fetchWithValidatedRedirects(target, isAllowedMediaUrl, {
      signal: request.signal,
      headers,
      cache: "no-store",
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
    }, fetchWithTimeout);
    const finalTarget = playlistBaseUrl(upstream, target);
    if (upstream.ok || !shouldUseNodeTransport(finalTarget, upstream)) return upstream;
    await upstream.body?.cancel().catch(() => undefined);
    if (shouldUseCurlTransport(finalTarget, upstream)) {
      return fetchMediaWithCurlTransport(finalTarget, headers, request.signal);
    }
  } catch {
    if (request.signal.aborted) throw new Error("media request aborted");
    if (shouldUseCurlTransport(target)) {
      return fetchMediaWithCurlTransport(target, headers, request.signal);
    }
    if (!shouldUseNodeTransport(target)) throw new Error("native media fetch failed");
  }

  const upstream = await fetchMediaWithNodeTransport(target, headers, request.signal);
  if (!upstream.ok && shouldUseCurlTransport(target, upstream)) {
    await upstream.body?.cancel().catch(() => undefined);
    if (request.signal.aborted) throw new Error("media request aborted");
    return fetchMediaWithCurlTransport(target, headers, request.signal);
  }
  return upstream;
}

function mediaRefererOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("r");
  if (raw) {
    try {
      const ref = new URL(raw);
      if (isAllowedEmbedUrl(ref)) return ref.origin;
    } catch {
      // Fall back to the browser referer below.
    }
  }

  return originFromEmbedReferer(request);
}

async function proxyMedia(request: Request, includeBody: boolean) {
  const requestUrl = new URL(request.url);
  const appOrigin = publicRequestOrigin(request);
  const raw = requestUrl.searchParams.get("u");
  if (!raw) return corsResponse(request, "missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return corsResponse(request, "bad url", { status: 400 });
  }

  if (!isAllowedMediaUrl(target)) {
    return corsResponse(request, "host not allowed", { status: 403 });
  }

  let upstream: Response;
  const refererOrigin = mediaRefererOrigin(request);
  const goat = mediaGoat(request);
  try {
    upstream = await fetchMedia(target, request, refererOrigin, goat);
  } catch {
    if (request.signal.aborted) {
      return corsResponse(request, null, { status: 499 });
    }
    return corsResponse(request, "upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return corsResponse(request, "upstream fetch failed", { status: upstream.status });
  }

  const isPlaylist = /\.m3u8(?:$|[?#])/i.test(target.pathname);
  const contentType = isPlaylist
    ? contentTypeFor(target)
    : upstream.headers.get("content-type") ?? contentTypeFor(target);
  const rewritesPlaylist = isPlaylist || contentType.toLowerCase().includes("mpegurl");
  const responseHeaders = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
  });
  for (const [key, value] of corsHeaders(request)) {
    responseHeaders.set(key, value);
  }
  const contentRange = upstream.headers.get("content-range");
  const acceptRanges = upstream.headers.get("accept-ranges");
  const contentLength = upstream.headers.get("content-length");
  if (contentRange) responseHeaders.set("content-range", contentRange);
  // Some upstreams (and the curl/node transports) echo "bytes, bytes"; native
  // iOS HLS wants a single clean token. Collapse any byte-range support to "bytes".
  if (acceptRanges) {
    responseHeaders.set("accept-ranges", /bytes/i.test(acceptRanges) ? "bytes" : acceptRanges);
  }
  if (contentLength && !rewritesPlaylist) responseHeaders.set("content-length", contentLength);

  if (!includeBody) {
    await upstream.body?.cancel().catch(() => undefined);
    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  if (rewritesPlaylist) {
    let text: string;
    try {
      text = await upstream.text();
    } catch {
      return corsResponse(request, "upstream body failed", { status: 502 });
    }
    const playlist = rewritePlaylist(text, playlistBaseUrl(upstream, target), appOrigin, refererOrigin, goat);
    responseHeaders.set("content-length", String(new TextEncoder().encode(playlist).length));
    return new NextResponse(playlist, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  if (shouldBufferMedia(target, contentType)) {
    let body: ArrayBuffer;
    try {
      body = await upstream.arrayBuffer();
    } catch {
      return corsResponse(request, "upstream body failed", { status: 502 });
    }
    responseHeaders.set("content-length", String(body.byteLength));
    return new NextResponse(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  // A guarded stream may close early after an upstream body error. Do not retain an
  // upstream content-length that would make that graceful close an invalid response.
  responseHeaders.delete("content-length");
  return new NextResponse(closeOnUpstreamFailure(upstream.body), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request) {
  return proxyMedia(request, true);
}

export async function HEAD(request: Request) {
  return proxyMedia(request, false);
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
