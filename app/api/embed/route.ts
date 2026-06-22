import { NextResponse } from "next/server";
import { browserHeaders } from "@/lib/embed-request";
import {
  MEDIA_HOST_RULES,
  embedHostsCsp,
  isAllowedEmbedUrl,
  isAllowedMediaUrl,
  originFromEmbedReferer,
} from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";
import { autoBootstrap } from "@/lib/embed-bootstrap";
import { BLOCKED_HOST, BLOCKED_URL, PLAYER_SCRIPT_HOSTS } from "@/lib/embed-blocklist";
import { shim } from "@/lib/embed-shim";
import { publicRequestOrigin } from "@/lib/request-origin";
import { resolveEsportexEmbed, resolveEsportexHls } from "@/lib/streams/esportex-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function corsHeaders(request: Request, methods: readonly string[]): Headers {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": methods.join(", "),
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "accept, content-type, goat, indians, island, range",
    "access-control-max-age": "86400",
  });
  return headers;
}

function corsResponse(
  request: Request,
  body: BodyInit | null,
  init: ResponseInit,
): NextResponse {
  const headers = new Headers(init.headers);
  for (const [key, value] of corsHeaders(request, ["GET", "HEAD", "POST", "OPTIONS"])) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new NextResponse(body, {
    ...init,
    headers,
  });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isBlockedUrl(url: URL): boolean {
  return BLOCKED_HOST.test(url.hostname) || BLOCKED_URL.test(url.href);
}

function isTrustedScriptUrl(url: URL): boolean {
  return isAllowedEmbedUrl(url) || PLAYER_SCRIPT_HOSTS.has(url.hostname);
}

function allowedEmbedOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    return isAllowedEmbedUrl(url) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function embedRefererOrigin(request: Request, fallback: string): string {
  const fromParam = allowedEmbedOrigin(new URL(request.url).searchParams.get("r") ?? undefined);
  return fromParam ?? originFromEmbedReferer(request, fallback);
}

function allowedStreamTarget(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return isAllowedEmbedUrl(url) || isAllowedMediaUrl(url) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function proxied(
  url: URL,
  appOrigin: string,
  refererOrigin?: string,
  parentTarget?: string,
): string {
  const params = new URLSearchParams({ u: url.href });
  const safeReferer = allowedEmbedOrigin(refererOrigin);
  if (safeReferer) params.set("r", safeReferer);
  if (parentTarget) params.set("p", parentTarget);
  return `${appOrigin}/api/embed?${params}`;
}

function proxiedMedia(url: URL, appOrigin: string, refererOrigin?: string): string {
  const params = new URLSearchParams({ u: url.href });
  if (refererOrigin) params.set("r", refererOrigin);
  return `${appOrigin}/api/media?${params}`;
}

function isHlsPlaylistUrl(url: URL): boolean {
  return isAllowedMediaUrl(url) && /\.m3u8(?:$|[?#])/i.test(url.pathname);
}

function hlsPlayerHtml(
  target: URL,
  appOrigin: string,
  options: {
    readonly refererOrigin?: string;
    readonly playerTarget?: string;
  } = {},
): string {
  const mediaUrl = proxiedMedia(target, appOrigin, allowedEmbedOrigin(options.refererOrigin));
  const playerTarget = options.playerTarget ?? target.href;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050608;color:#f4f7fb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{position:fixed;inset:0;display:grid;place-items:center;background:#050608}
video{width:100%;height:100%;object-fit:contain;background:#050608}
.status{position:absolute;left:14px;bottom:14px;max-width:calc(100% - 28px);padding:7px 10px;border-radius:6px;background:rgba(5,6,8,.72);font-size:12px;line-height:1.35;color:#dbe4f0}
.status[data-state="ready"]{display:none}
</style>
</head>
<body>
<div class="wrap">
<video id="video" controls autoplay muted playsinline></video>
<div id="status" class="status">Loading stream...</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script>
(function(){
  "use strict";
  var source=${JSON.stringify(mediaUrl)};
  var APP_ORIGIN=${JSON.stringify(appOrigin)};
  var PLAYER_TARGET=${JSON.stringify(playerTarget)};
  var video=document.getElementById("video");
  var status=document.getElementById("status");
  function setStatus(text,state){
    if(status){ status.textContent=text; if(state) status.setAttribute("data-state",state); }
  }
  function reportFailure(kind,status){
    try{
      var message={
        source:"valence-player",
        type:"media-error",
        kind:kind,
        status:status || 0,
        original:PLAYER_TARGET,
        proxied:source,
        target:PLAYER_TARGET,
        embedTarget:PLAYER_TARGET
      };
      window.parent.postMessage(message, APP_ORIGIN);
      if(window.top && window.top!==window.parent) window.top.postMessage(message, APP_ORIGIN);
    }catch(e){}
  }
  function play(){
    try{
      var promise=video.play();
      if(promise && typeof promise.catch==="function") promise.catch(function(){});
    }catch(e){}
  }
  function startNative(){
    video.src=source;
    video.addEventListener("loadedmetadata",function(){ setStatus("Ready","ready"); play(); },{once:true});
    video.addEventListener("error",function(){
      reportFailure("native",video.error && video.error.code);
      setStatus("Stream failed to load","error");
    });
  }
  function startHlsJs(){
    var hls=new window.Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:60});
    hls.on(window.Hls.Events.MEDIA_ATTACHED,function(){ hls.loadSource(source); });
    hls.on(window.Hls.Events.MANIFEST_PARSED,function(){ setStatus("Ready","ready"); play(); });
    hls.on(window.Hls.Events.ERROR,function(_event,data){
      if(!data || !data.fatal) return;
      reportFailure("hls",data.response && data.response.code);
      setStatus("Stream failed to load","error");
      hls.destroy();
    });
    hls.attachMedia(video);
  }
  var canNativeHls=!!video.canPlayType("application/vnd.apple.mpegurl");
  var hasMediaSource=typeof window.MediaSource!=="undefined";
  // iPhone (and pre-desktop-class iPad) WebKit ships native HLS but no full
  // MediaSource, so hls.js can't run there. Detecting the missing MediaSource
  // is the exact iPhone signature: every browser that works today (desktop,
  // Android Chrome, macOS/iPad Safari) has MediaSource and keeps the hls.js
  // path untouched; only Apple-mobile is routed to the native player.
  if(canNativeHls && !hasMediaSource){
    startNative();
    return;
  }
  if(window.Hls && window.Hls.isSupported()){
    startHlsJs();
    return;
  }
  if(canNativeHls){
    startNative();
    return;
  }
  reportFailure("unsupported",0);
  setStatus("HLS playback is not supported in this browser","error");
})();
</script>
</body>
</html>`;
}

type UrlClass = "media" | "blocked" | "embed" | "pass";

function classifyUrl(url: URL): UrlClass {
  if (isAllowedMediaUrl(url)) return "media";
  if (isBlockedUrl(url)) return "blocked";
  if (isAllowedEmbedUrl(url)) return "embed";
  return "pass";
}

function resolveMaybe(raw: string, base: URL): URL | null {
  const value = raw.trim();
  if (
    !value ||
    value.startsWith("#") ||
    /^(about|blob|data|javascript|mailto|tel):/i.test(value)
  ) {
    return null;
  }

  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function isAppProxyUrl(raw: string, appOrigin: string): boolean {
  if (raw.startsWith("/api/embed?") || raw.startsWith("/api/media?")) return true;
  try {
    const url = new URL(raw, appOrigin);
    return url.origin === appOrigin
      && (url.pathname === "/api/embed" || url.pathname === "/api/media")
      && url.searchParams.has("u");
  } catch {
    return false;
  }
}

function rewriteAttrValue(
  raw: string,
  base: URL,
  appOrigin: string,
  parentTarget?: string,
): string {
  if (isAppProxyUrl(raw, appOrigin)) return raw;
  const url = resolveMaybe(raw, base);
  if (!url) return raw;
  switch (classifyUrl(url)) {
    case "media":
      return proxiedMedia(url, appOrigin, base.origin);
    case "blocked":
      return "about:blank";
    case "embed":
      return proxied(url, appOrigin, base.origin, parentTarget);
    case "pass":
      return raw;
  }
}

function stripBlockedScripts(
  html: string,
  base: URL,
  appOrigin: string,
  parentTarget?: string,
): string {
  return html.replace(
    /<script\b([^>]*)\bsrc=(["'])(.*?)\2([^>]*)>\s*<\/script>/gi,
    (tag, before: string, _quote: string, src: string, after: string) => {
      const url = resolveMaybe(src, base);
      if (url && (isBlockedUrl(url) || !isTrustedScriptUrl(url))) return "";
      return `<script${before}src="${escapeAttr(rewriteAttrValue(src, base, appOrigin, parentTarget))}"${after}></script>`;
    },
  );
}

function sanitizeInlineScriptBody(body: string): string {
  return body
    .replace(/_tR3Vx\(\{'disableMenu':!\[\][\s\S]*?void 0;\}\}\);/g, "void 0")
    .replace(/\bdebugger\b/g, "void 0")
    .replace(/\bwindow\s*\[\s*(["'])location\1\s*\]\s*\[\s*(["'])href\2\s*\]\s*=\s*(["'])\/\3/g, "void 0")
    .replace(/\bwindow\.location\.href\s*=\s*(["'])\/\1/g, "void 0")
    .replace(/\blocation\.href\s*=\s*(["'])\/\1/g, "void 0")
    .replace(/\bwindow\.location\s*=\s*(["'])\/\1/g, "void 0")
    .replace(/\bwindow\.location\.replace\(\s*(["'])https?:\/\/google\.com\/?\1\s*\)/gi, "void 0");
}

function stripBlockedInlineScripts(html: string): string {
  return html.replace(
    /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
    (tag: string) => {
      const body = tag.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
      const small = body.length < 5000;
      const antiDebug = /disable-devtool|isDevToolOpened|DetectorType|while\\x20\(true\)|(?:debu|debug)[\s\S]{0,80}gger/i.test(body);
      if (body.length < 20000 && antiDebug) return "";
      if (small && /googletagmanager|gtm\.js|dataLayer/i.test(body)) return "";
      if (small && /window\.self\s*={2,3}\s*window\.top[\s\S]*google\.com/i.test(body)) return "";
      if (
        small &&
        /window\.top\s*={2,3}\s*window\.self/i.test(body) &&
        /Access Denied|Direct access prevented|only available when embedded/i.test(body)
      ) {
        return "";
      }
      if (
        small &&
        /frameElement[\s\S]*hasAttribute\(\s*(["'])sandbox\1\s*\)/i.test(body) &&
        /SANDBOX IFRAME NOT ALLOWED|window\.stop/i.test(body)
      ) {
        return "";
      }
      if (small && /\baclib\.runPop\s*\(/i.test(body)) return "";
      if (small && /(?:llvpn\.com|tag\.min\.js|dataset\.zone)/i.test(body)) return "";
      if (small && /(?:^|[^\w])zoneId\s*:/i.test(body)) return "";
      if (
        small &&
        /(?:insertAdjacentHTML|document\.write|document\.writeln|createElement)[\s\S]*(?:ad\.html|popunder|popads|popcash|adsterra|adcash|adexchangerapid|usrpubtrk|ntwkbc|ndcertainlywhen|histats)/i.test(body)
      ) {
        return "";
      }
      const sanitized = sanitizeInlineScriptBody(body);
      if (sanitized === body) return tag;
      const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? "<script>";
      return `${open}${sanitized}</script>`;
    },
  );
}

function rewriteUrlAttributes(
  html: string,
  base: URL,
  appOrigin: string,
  parentTarget?: string,
): string {
  return html.replace(
    /\s(src|href|action|poster)=(["'])(.*?)\2/gi,
    (attr, name: string, quote: string, value: string) => {
      const rewritten = rewriteAttrValue(value, base, appOrigin, parentTarget);
      if (rewritten === value) return attr;
      return ` ${name}=${quote}${escapeAttr(rewritten)}${quote}`;
    },
  );
}

function rewriteCssUrlText(
  css: string,
  base: URL,
  appOrigin: string,
  parentTarget?: string,
): string {
  return css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (match, quote: string, value: string) => {
      const rewritten = rewriteAttrValue(value, base, appOrigin, parentTarget);
      if (rewritten === value) return match;
      const nextQuote = quote || "'";
      return `url(${nextQuote}${escapeAttr(rewritten)}${nextQuote})`;
    },
  );
}

function rewriteCssUrls(
  html: string,
  base: URL,
  appOrigin: string,
  parentTarget?: string,
): string {
  return html
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (_tag, attrs: string, css: string) =>
        `<style${attrs}>${rewriteCssUrlText(css, base, appOrigin, parentTarget)}</style>`,
    )
    .replace(
      /\sstyle=(["'])(.*?)\1/gi,
      (attr, quote: string, css: string) => {
        const rewritten = rewriteCssUrlText(css, base, appOrigin, parentTarget);
        if (rewritten === css) return attr;
        return ` style=${quote}${escapeAttr(rewritten)}${quote}`;
      },
    );
}

function hardenIframes(html: string): string {
  return html.replace(/<iframe\b([^>]*)>/gi, (_tag, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+sandbox=(["'])(.*?)\1/gi, "")
      .replace(/\s+referrerpolicy=(["'])(.*?)\1/gi, "");
    return `<iframe${cleaned} sandbox="allow-scripts allow-presentation" referrerpolicy="no-referrer">`;
  });
}

function nestedStreamapiEmbed(html: string, target: URL): URL | null {
  if (target.hostname !== "embed.streamapi.cc") return null;

  const match = html.match(/<iframe\b[^>]*\bsrc=(["'])(.*?)\1/i);
  if (!match) return null;

  try {
    const nested = new URL(match[2], target);
    return isAllowedEmbedUrl(nested) ? nested : null;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(appOrigin: string): string {
  const self = "'self'";
  const inline = "'unsafe-inline'";
  const evalToken = "'unsafe-eval'";
  const embedHosts = embedHostsCsp();
  const mediaHosts = MEDIA_HOST_RULES
    .map((rule) => rule.includeSubdomains
      ? `https://${rule.hostname} https://*.${rule.hostname}`
      : `https://${rule.hostname}`)
    .join(" ");
  const playerAssetHosts = "https://cdn.jsdelivr.net https://vjs.zencdn.net https://cdnjs.cloudflare.com";
  return [
    `default-src ${self} blob: data:`,
    `script-src ${self} ${inline} ${evalToken} 'wasm-unsafe-eval' blob: ${playerAssetHosts} ${embedHosts}`,
    `worker-src ${self} blob:`,
    `connect-src ${self} blob: data: ${embedHosts} ${mediaHosts}`,
    `media-src ${self} blob: data: ${mediaHosts}`,
    `img-src ${self} blob: data: https://upload.wikimedia.org`,
    `style-src ${self} ${inline} ${playerAssetHosts}`,
    `font-src ${self} data: https://fonts.gstatic.com`,
    `frame-src ${self} blob:`,
    `child-src ${self} blob:`,
    "object-src 'none'",
    "form-action 'none'",
    `base-uri ${self} ${appOrigin} ${embedHosts}`,
    `navigate-to ${self} ${appOrigin}`,
  ].join("; ");
}

function rewriteHtml(html: string, target: URL, appOrigin: string, parentTarget?: string): string {
  const inject = shim(appOrigin, target, parentTarget) + autoBootstrap(target);
  const cleaned = stripBlockedInlineScripts(stripBlockedScripts(html, target, appOrigin, parentTarget));
  const rewritten = hardenIframes(
    rewriteCssUrls(
      rewriteUrlAttributes(cleaned, target, appOrigin, parentTarget),
      target,
      appOrigin,
      parentTarget,
    ),
  );
  // Inline <script> bodies are already sanitized inside stripBlockedInlineScripts;
  // re-running sanitizeInlineScriptBody over the whole document here would be
  // redundant and could corrupt non-script text that happens to match the patterns.
  if (/<head[^>]*>/i.test(rewritten)) {
    return rewritten.replace(/(<head[^>]*>)/i, `$1${inject}`);
  }
  if (/<html[^>]*>/i.test(rewritten)) {
    return rewritten.replace(/(<html[^>]*>)/i, `$1<head>${inject}</head>`);
  }
  return `<!doctype html><html><head>${inject}</head><body>${rewritten}</body></html>`;
}

async function proxyEmbed(request: Request) {
  const requestUrl = new URL(request.url);
  const appOrigin = publicRequestOrigin(request);
  const raw = requestUrl.searchParams.get("u");
  if (!raw) return corsResponse(request, "missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return corsResponse(request, "bad url", { status: 400 });
  }
  const parentTarget = allowedStreamTarget(requestUrl.searchParams.get("p")) ?? target.href;

  if (!isAllowedEmbedUrl(target)) {
    if (isHlsPlaylistUrl(target)) {
      return new NextResponse(hlsPlayerHtml(target, appOrigin, {
        refererOrigin: allowedEmbedOrigin(requestUrl.searchParams.get("r") ?? undefined),
        playerTarget: parentTarget,
      }), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": contentSecurityPolicy(appOrigin),
        },
      });
    }
    return corsResponse(request, "host not allowed", { status: 403 });
  }
  if (isBlockedUrl(target)) {
    return corsResponse(request, null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }

  const resolvedEsportexHls = await resolveEsportexHls(target, { signal: request.signal }).catch(
    () => null,
  );
  if (resolvedEsportexHls) {
    return new NextResponse(hlsPlayerHtml(resolvedEsportexHls.hlsUrl, appOrigin, {
      refererOrigin: resolvedEsportexHls.refererOrigin,
      playerTarget: parentTarget,
    }), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": contentSecurityPolicy(appOrigin),
      },
    });
  }

  const resolvedEsportexEmbed = await resolveEsportexEmbed(target, { signal: request.signal }).catch(
    () => null,
  );
  if (resolvedEsportexEmbed) {
    return NextResponse.redirect(
      proxied(resolvedEsportexEmbed.embedUrl, appOrigin, resolvedEsportexEmbed.embedUrl.origin, parentTarget),
      302,
    );
  }

  let upstream: Response;
  try {
    const upstreamOrigin = embedRefererOrigin(request, target.origin);
    const isEmbedindiaFetch = target.hostname === "embedindia.st" && target.pathname === "/fetch";
    const headers = new Headers(browserHeaders(target, upstreamOrigin));
    const accept = request.headers.get("accept");
    const contentType = request.headers.get("content-type");
    const indians = request.headers.get("indians");
    if (accept) headers.set("accept", accept);
    if (contentType) {
      headers.set("content-type", isEmbedindiaFetch ? "text/plain;charset=UTF-8" : contentType);
    }
    if (!isEmbedindiaFetch && indians && /^[A-Za-z0-9+/=_:.,-]+$/.test(indians)) {
      headers.set("indians", indians);
    }

    upstream = await fetchWithTimeout(target.href, {
      signal: request.signal,
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
      redirect: "follow",
      cache: "no-store",
      timeoutMs: PROXY_FETCH_TIMEOUT_MS,
    });
  } catch {
    return corsResponse(request, "upstream fetch failed", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    const nested = nestedStreamapiEmbed(html, target);
    if (nested) {
      return NextResponse.redirect(proxied(nested, appOrigin, target.origin, parentTarget), 302);
    }

    return new NextResponse(rewriteHtml(html, target, appOrigin, parentTarget), {
      status: upstream.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": contentSecurityPolicy(appOrigin),
      },
    });
  }

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", upstream.headers.get("cache-control") ?? "no-store");
  for (const [key, value] of corsHeaders(request, ["GET", "HEAD", "POST", "OPTIONS"])) {
    headers.set(key, value);
  }
  const exposedHeaders: string[] = [];
  for (const key of ["goat", "island"]) {
    const value = upstream.headers.get(key);
    if (!value) continue;
    headers.set(key, value);
    exposedHeaders.push(key);
  }
  if (exposedHeaders.length) {
    headers.set("access-control-expose-headers", exposedHeaders.join(", "));
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: Request) {
  return proxyEmbed(request);
}

export async function POST(request: Request) {
  return proxyEmbed(request);
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, ["GET", "HEAD", "POST", "OPTIONS"]),
  });
}
