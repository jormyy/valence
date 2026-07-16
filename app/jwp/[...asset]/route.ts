import { NextResponse } from "next/server";
import { isSafeAssetPath, jwpContentType, proxyEmbedAsset } from "@/lib/embed-assets";
import { originFromEmbedReferer } from "@/lib/streams/providers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string[] }> },
) {
  const { asset } = await params;
  if (!isSafeAssetPath(asset)) return new NextResponse("not found", { status: 404 });

  const pathname = asset.join("/");
  const embedOrigin = originFromEmbedReferer(request);
  return proxyEmbedAsset({
    request,
    pathname: `/jwp/${pathname}`,
    contentType: jwpContentType(pathname),
    upstreamOrigin: embedOrigin === "https://embedindia.st"
      ? "https://assets.embedindia.st"
      : embedOrigin,
  });
}
