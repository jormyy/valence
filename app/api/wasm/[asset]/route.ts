import { NextResponse } from "next/server";
import { proxyEmbedAsset, wasmContentType } from "@/lib/embed-assets";

export const dynamic = "force-dynamic";

const ALLOWED_ASSETS = new Set(["gasm.js", "gasm.wasm"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (!ALLOWED_ASSETS.has(asset)) return new NextResponse("not found", { status: 404 });

  return proxyEmbedAsset({
    request,
    pathname: `/js/wasm/${asset}`,
    contentType: wasmContentType(asset),
    accept: asset.endsWith(".wasm") ? "application/wasm,*/*;q=0.8" : "application/javascript,*/*;q=0.8",
    upstreamOrigin: "https://assets.embedindia.st",
  });
}
