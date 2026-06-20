import { NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { isAllowedEmbedUrl, isAllowedMediaUrl, originFromEmbedReferer } from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";
import { publicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const NODE_TRANSPORT_REDIRECT_LIMIT = 4;

function corsHeaders(request: Request): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "accept, content-type, range",
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

function proxiedMediaUrl(url: URL, appOrigin: string, refererOrigin: string): string {
  const params = new URLSearchParams({ r: refererOrigin, u: url.href });
  return `${appOrigin}/api/media?${params}`;
}

function rewritePlaylist(text: string, target: URL, appOrigin: string, refererOrigin: string): string {
  const proxiedMedia = (url: URL) => proxiedMediaUrl(url, appOrigin, refererOrigin);

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
    if (upstream.url) {
      const url = new URL(upstream.url);
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
      if (isRedirect(upstream.statusCode) && location && redirectCount < NODE_TRANSPORT_REDIRECT_LIMIT) {
        upstream.resume();
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
        headers: copyNodeResponseHeaders(upstream.headers),
      }));
    });

    request.end();
  });
}

async function fetchMedia(target: URL, request: Request): Promise<Response> {
  const embedOrigin = mediaRefererOrigin(request);
  const headers = new Headers({
    "user-agent": USER_AGENT,
    referer: `${embedOrigin}/`,
    accept: request.headers.get("accept") ?? "*/*",
  });

  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  try {
    const upstream = await fetchWithTimeout(target, {
      signal: request.signal,
      headers,
      redirect: "follow",
      cache: "no-store",
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
    });
    if (upstream.ok || !shouldUseNodeTransport(target, upstream)) return upstream;
  } catch {
    if (!shouldUseNodeTransport(target)) throw new Error("native media fetch failed");
  }

  return fetchMediaWithNodeTransport(target, headers, request.signal);
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
  try {
    upstream = await fetchMedia(target, request);
  } catch {
    return corsResponse(request, "upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
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
  if (acceptRanges) responseHeaders.set("accept-ranges", acceptRanges);
  if (contentLength && !rewritesPlaylist) responseHeaders.set("content-length", contentLength);

  if (!includeBody) {
    await upstream.body?.cancel().catch(() => undefined);
    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  if (rewritesPlaylist) {
    const text = await upstream.text();
    const playlist = rewritePlaylist(text, playlistBaseUrl(upstream, target), appOrigin, refererOrigin);
    responseHeaders.set("content-length", String(new TextEncoder().encode(playlist).length));
    return new NextResponse(playlist, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(upstream.body, {
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
