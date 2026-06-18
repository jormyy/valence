import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMBED_HOSTS = new Set([
  "embed.st",
  "embedindia.st",
  "embed.streamapi.cc",
]);

const ALLOWED_ASSETS = new Map([
  ["gasm.js", "application/javascript; charset=utf-8"],
  ["gasm.wasm", "application/wasm"],
  ["lock.js", "application/javascript; charset=utf-8"],
  ["lock.wasm", "application/wasm"],
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const contentType = ALLOWED_ASSETS.get(asset);
  if (!contentType) return new NextResponse("not found", { status: 404 });

  const target = `${originFromReferer(request)}/js/wasm/${asset}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: asset.endsWith(".wasm")
          ? "application/wasm,*/*;q=0.8"
          : "application/javascript,*/*;q=0.8",
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
      "content-type": contentType,
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
