import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { isAllowedMediaUrl, originFromEmbedReferer } from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HEADER_SEPARATOR = Buffer.from("\r\n\r\n");

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

function parseCurlResponse(raw: Buffer): Response {
  const splitAt = raw.indexOf(HEADER_SEPARATOR);
  if (splitAt === -1) {
    throw new Error("curl response missing headers");
  }

  const headerText = raw.subarray(0, splitAt).toString("latin1");
  const body = raw.subarray(splitAt + HEADER_SEPARATOR.length);
  const [statusLine = "", ...lines] = headerText.split(/\r?\n/);
  const status = Number(statusLine.match(/^HTTP\/\S+\s+(\d+)/)?.[1] ?? 502);
  const headers = new Headers();

  for (const line of lines) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }

  return new Response(new Uint8Array(body), { status, headers });
}

function fetchMediaWithCurl(
  target: URL,
  headers: Headers,
  signal: AbortSignal,
): Promise<Response> {
  const args = [
    "--http1.1",
    "--silent",
    "--show-error",
    "--max-time",
    String(Math.ceil(PROXY_FETCH_TIMEOUT_MS / 1000)),
    "--include",
  ];

  for (const [key, value] of headers) {
    args.push("--header", `${key}: ${value}`);
  }
  args.push("--url", target.href);

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const abort = () => {
      child.kill("SIGTERM");
      reject(new Error("curl aborted"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `curl exited ${code}`));
        return;
      }

      try {
        resolve(parseCurlResponse(Buffer.concat(stdout)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function shouldUseCurlFallback(target: URL, response?: Response): boolean {
  return target.hostname === "strmd.st"
    || target.hostname.endsWith(".strmd.st")
    || response?.status === 403;
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

  try {
    const upstream = await fetchWithTimeout(target, {
      signal: request.signal,
      headers,
      redirect: "follow",
      cache: "no-store",
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
    });
    if (upstream.ok || !shouldUseCurlFallback(target, upstream)) return upstream;
  } catch {
    if (!shouldUseCurlFallback(target)) throw new Error("native media fetch failed");
  }

  return fetchMediaWithCurl(target, headers, request.signal);
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
