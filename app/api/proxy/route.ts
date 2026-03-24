import { NextRequest, NextResponse } from "next/server";

// Known ad/popup script domains to strip
const AD_DOMAINS =
  /popads\.net|popcash\.net|propellerads\.com|exoclick\.com|adsterra\.com|trafficjunky\.net|juicyads\.com|yllix\.com|hilltopads\.com|adcash\.com|adspyglass\.com|pornvertiser\.com|dtscout\.com/i;

// Injected at the top of <head> — runs before any page scripts
const INJECT = `<script>
(function(){
  window.open = function(){ return null; };
  window._pop = null; window.popunder = null; window.popit = null;
  var _href = Object.getOwnPropertyDescriptor(window.location, 'href');
  try {
    Object.defineProperty(window.location, 'href', {
      set: function(v) {
        // Block navigations to ad/popunder networks
        if (/${AD_DOMAINS.source}/.test(v)) return;
        if (_href && _href.set) _href.set.call(window.location, v);
      },
      get: _href ? _href.get : undefined,
    });
  } catch(e) {}
})();
</script>`;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing url", { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(raw, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://streamed.pk/",
        Origin: "https://streamed.pk",
      },
    });
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }

  let html = await res.text();

  // Strip <script> tags loading from ad domains
  html = html.replace(
    /<script[^>]+src=["'][^"']*(?:popads|popcash|propeller|exoclick|adsterra|trafficjunky|juicyads|dtscout)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );

  // Inject base href so relative URLs resolve to the original origin,
  // then inject our anti-popup script
  const baseTag = `<base href="${url.origin}">`;
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>${baseTag}${INJECT}`);
  } else {
    html = `${baseTag}${INJECT}${html}`;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
