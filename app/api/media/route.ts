import { NextResponse } from "next/server";
import { isAllowedMediaUrl, originFromEmbedReferer } from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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

function rewritePlaylist(text: string, target: URL, appOrigin: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const uriRewritten = line.replace(/URI="([^"]+)"/g, (_match, value: string) => {
        try {
          const next = new URL(value, target);
          if (isAllowedMediaUrl(next)) {
            return `URI="${appOrigin}/api/media?u=${encodeURIComponent(next.href)}"`;
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
          return `${appOrigin}/api/media?u=${encodeURIComponent(next.href)}`;
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

async function fetchMedia(target: URL, request: Request): Promise<Response> {
  const embedOrigin = originFromEmbedReferer(request);
  const headers = new Headers({
    "user-agent": USER_AGENT,
    referer: `${embedOrigin}/`,
    accept: request.headers.get("accept") ?? "*/*",
  });

  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  return fetchWithTimeout(target, {
    signal: request.signal,
    headers,
    redirect: "follow",
    cache: "no-store",
    timeoutMs: PROXY_FETCH_TIMEOUT_MS,
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
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
  const responseHeaders = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
  });
  for (const [key, value] of corsHeaders(request)) {
    responseHeaders.set(key, value);
  }
  const contentRange = upstream.headers.get("content-range");
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (contentRange) responseHeaders.set("content-range", contentRange);
  if (acceptRanges) responseHeaders.set("accept-ranges", acceptRanges);

  if (isPlaylist || contentType.toLowerCase().includes("mpegurl")) {
    const text = await upstream.text();
    return new NextResponse(rewritePlaylist(text, target, requestUrl.origin), {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
