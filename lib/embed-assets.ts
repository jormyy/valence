import { NextResponse } from "next/server";
import { originFromEmbedReferer } from "./streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "./upstream";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface ProxyEmbedAssetOptions {
  readonly request: Request;
  readonly pathname: string;
  readonly contentType: string;
  readonly accept?: string;
  readonly fallbackOrigin?: string;
  readonly upstreamOrigin?: string;
}

export function wasmContentType(asset: string): string {
  return asset.endsWith(".wasm")
    ? "application/wasm"
    : "application/javascript; charset=utf-8";
}

export function jwpContentType(pathname: string): string {
  if (pathname.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export function isSafeAssetPath(parts: readonly string[]): boolean {
  return parts.length > 0 && parts.every((part) => part !== ".." && !part.includes("\\"));
}

export async function proxyEmbedAsset({
  request,
  pathname,
  contentType,
  accept = "*/*",
  fallbackOrigin,
  upstreamOrigin,
}: ProxyEmbedAssetOptions): Promise<NextResponse> {
  const origin = upstreamOrigin ?? originFromEmbedReferer(request, fallbackOrigin);
  const target = `${origin}${pathname}`;

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(target, {
      signal: request.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept,
        referer: `${origin}/`,
      },
      cache: "no-store",
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
    });
  } catch {
    return new NextResponse("upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse("upstream asset failed", { status: upstream.status });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? contentType,
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
