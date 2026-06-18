import { NextResponse } from "next/server";
import { isSafeAssetPath, jwpContentType, proxyEmbedAsset } from "@/lib/embed-assets";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string[] }> },
) {
  const { asset } = await params;
  if (!isSafeAssetPath(asset)) return new NextResponse("not found", { status: 404 });

  const pathname = asset.join("/");
  return proxyEmbedAsset({
    request,
    pathname: `/jwp/${pathname}`,
    contentType: jwpContentType(pathname),
  });
}
