import { NextResponse } from "next/server";
import { publicRequestOrigin } from "@/lib/request-origin";
import { isAllowedStreamUrl } from "@/lib/streams/providers";

export const dynamic = "force-dynamic";

function dedicatedPlayerOrigin(appOrigin: string): string | null {
  const configuredPlayer = process.env.VALENCE_PLAYER_ORIGIN;
  const configuredApp = process.env.VALENCE_APP_ORIGIN;
  if (configuredPlayer || configuredApp) {
    if (!configuredPlayer || !configuredApp) return null;
    try {
      const player = new URL(configuredPlayer);
      const app = new URL(configuredApp);
      if (app.origin !== appOrigin || player.origin === app.origin) return null;
      if (player.protocol !== "https:" && player.protocol !== "http:") return null;
      return player.origin;
    } catch {
      return null;
    }
  }

  const app = new URL(appOrigin);
  if (app.hostname === "localhost" || app.hostname === "127.0.0.1" || app.hostname === "[::1]") {
    const port = app.port ? `:${app.port}` : "";
    return `${app.protocol}//player.localhost${port}`;
  }

  return null;
}

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!isAllowedStreamUrl(target)) {
    return new NextResponse("host not allowed", { status: 403 });
  }

  const appOrigin = publicRequestOrigin(request);
  const playerOrigin = dedicatedPlayerOrigin(appOrigin);
  if (!playerOrigin || playerOrigin === appOrigin) {
    return new NextResponse("dedicated player origin unavailable", { status: 503 });
  }

  const destination = new URL("/api/embed", playerOrigin);
  destination.searchParams.set("u", target.href);
  destination.searchParams.set("p", target.href);
  destination.searchParams.set("a", appOrigin);
  return NextResponse.redirect(destination, 307);
}
