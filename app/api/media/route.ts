import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STRMD_HOST = /(^|\.)strmd\.st$/i;
const TIKTOK_MEDIA_HOST = /(^|\.)tiktokcdn\.com$/i;
const execFileAsync = promisify(execFile);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isAllowedMediaUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (STRMD_HOST.test(url.hostname)) return true;
  return TIKTOK_MEDIA_HOST.test(url.hostname) && url.pathname.startsWith("/obj/");
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

async function curlMedia(target: URL, request: Request): Promise<Buffer> {
  const args = [
    "--location",
    "--silent",
    "--show-error",
    "--fail",
    "--compressed",
    "--http1.1",
    "--user-agent",
    USER_AGENT,
    "--referer",
    "https://embed.st/",
    "--header",
    `Accept: ${request.headers.get("accept") ?? "*/*"}`,
  ];

  const range = request.headers.get("range");
  if (range) {
    args.push("--header", `Range: ${range}`);
  }

  args.push(target.href);

  const { stdout } = await execFileAsync("curl", args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }

  if (!isAllowedMediaUrl(target)) {
    return new NextResponse("host not allowed", { status: 403 });
  }

  let body: Buffer;
  try {
    body = await curlMedia(target, request);
  } catch {
    return new NextResponse("upstream fetch failed", { status: 502 });
  }

  const contentType = contentTypeFor(target);
  const responseHeaders = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });

  if (contentType.includes("mpegurl") || /\.m3u8(?:$|[?#])/i.test(target.pathname)) {
    const text = body.toString("utf8");
    return new NextResponse(rewritePlaylist(text, target, requestUrl.origin), {
      status: 200,
      headers: responseHeaders,
    });
  }

  const arrayBuffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(arrayBuffer).set(body);

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: responseHeaders,
  });
}
