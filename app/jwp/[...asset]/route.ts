import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMBED_HOSTS = new Set([
  "embed.st",
  "embedindia.st",
  "embed.streamapi.cc",
]);

function originFromReferer(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return "https://embed.st";

  try {
    const ref = new URL(referer);
    const raw = ref.searchParams.get("u");
    if (!raw) return "https://embed.st";

    const target = new URL(raw);
    if (target.protocol === "https:" && EMBED_HOSTS.has(target.hostname)) {
      return target.origin;
    }
  } catch {
    return "https://embed.st";
  }

  return "https://embed.st";
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string[] }> },
) {
  const { asset } = await params;
  if (!asset.length || asset.some((part) => part === ".." || part.includes("\\"))) {
    return new NextResponse("not found", { status: 404 });
  }

  const pathname = asset.join("/");
  const target = `${originFromReferer(request)}/jwp/${pathname}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "*/*",
        referer: `${new URL(target).origin}/`,
      },
      cache: "no-store",
    });
  } catch {
    return new NextResponse("upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse("upstream asset failed", { status: upstream.status });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? contentTypeFor(pathname),
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
