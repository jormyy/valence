import { NextResponse } from "next/server";
import { browserHeaders } from "@/lib/embed-request";
import {
  EMBED_HOSTS,
  MEDIA_HOST_RULES,
  embedHostsCsp,
  isAllowedEmbedUrl,
  isAllowedMediaUrl,
  originFromEmbedReferer,
} from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";
import { autoBootstrap } from "@/lib/embed-bootstrap";
import { publicRequestOrigin } from "@/lib/request-origin";
import { resolveEsportexEmbed, resolveEsportexHls } from "@/lib/streams/esportex-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BLOCKED_HOST =
  /(^|\.)((adcash|popads|popcash|propellerads|adsterra|exoclick|dtscout|adspyglass|hilltopads|yllix|juicyads)\.com|acscdn\.com|enteringlacquergiant\.com|drawerexperienceletting\.com|adexchangerapid\.com|usrpubtrk\.com|ntwkbc\d+\.com|ndcertainlywhen\.com|usasenioraid\.com|multiboardthe\.com|filenebuladrive\.com|wps\.com|wpscdn\.com|llvpn\.com|thewildernessclub\.com|therocketlanguages\.com|optimserve\.agency|cdn-lab\.shop|tiktokcdn\.com|tracking-source\.com|tonicgoverness\.com|googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|stats\.embedhd\.org|static\.cloudflareinsights\.com|sstatic\d*\.histats\.com|histats\.com)$/i;
const BLOCKED_URL =
  /((^|\/)ads?\.html(?:$|[?#])|popunder|popads|popcash|propeller|adsterra|exoclick|adcash|adspyglass|dtscout|adexchange|drawerexperienceletting|usrpubtrk|ntwkbc|ndcertainlywhen|senioraid|multiboard|filenebula|wpscdn|wps\.com|wildernessclub|therocketlanguages|optimserve|swarmcloud|cdn-lab|tiktokcdn|tracking-source|cloudflareinsights|histats|googletagmanager|google-analytics|disable-devtool)/i;
const PLAYER_SCRIPT_HOSTS = new Set(["cdn.jsdelivr.net", "vjs.zencdn.net", "cdnjs.cloudflare.com"]);

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

function isEmbedUrl(url: URL): boolean {
  return isAllowedEmbedUrl(url);
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
  if (isEmbedUrl(url)) return "embed";
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

function normalizedHash(target: URL): string {
  if (!target.hash) return "";
  try {
    return `#${decodeURIComponent(target.hash.slice(1))}`;
  } catch {
    return target.hash;
  }
}

function shim(appOrigin: string, target: URL, parentTarget?: string): string {
  return `<script>(function(){
  "use strict";
  var EMBED_HOSTS=${JSON.stringify(EMBED_HOSTS.map((rule) => rule.hostname))};
  var MEDIA_RULES=${JSON.stringify(MEDIA_HOST_RULES)};
  var PLAYER_SCRIPT_HOSTS=${JSON.stringify([...PLAYER_SCRIPT_HOSTS])};
  var BLOCKED_HOST=${BLOCKED_HOST.toString()};
  var BLOCKED_URL=${BLOCKED_URL.toString()};
  var PROXY=${JSON.stringify(`${appOrigin}/api/embed?r=${encodeURIComponent(target.origin)}&p=${encodeURIComponent(parentTarget ?? target.href)}&u=`)};
  var MEDIA_PROXY=${JSON.stringify(`${appOrigin}/api/media?r=${encodeURIComponent(target.origin)}&u=`)};
  var APP_ORIGIN=${JSON.stringify(appOrigin)};
  var EMBED_ORIGIN=${JSON.stringify(target.origin)};
  var EMBED_TARGET=${JSON.stringify(target.href)};
  var PLAYER_TARGET=${JSON.stringify(parentTarget ?? target.href)};
  var EMBED_HASH=${JSON.stringify(normalizedHash(target))};
  var PROVIDER_GOAT="";

  try{
    var NativeFunction=window.Function;
    var generatedDebugger=/debugger|while\\s*\\(\\s*true\\s*\\)|while\\\\x20\\(true\\)|(?:debu|debug)[\\s\\S]{0,80}gger/i;
    var SafeFunction=function(){
      var body="";
      try{ body=String(arguments[arguments.length-1]||""); }catch(e){}
      if(generatedDebugger.test(body)) return function(){};
      return NativeFunction.apply(this,arguments);
    };
    SafeFunction.prototype=NativeFunction.prototype;
    Object.defineProperty(window,"Function",{configurable:true,writable:true,value:SafeFunction});
    try{
      Object.defineProperty(NativeFunction.prototype,"constructor",{configurable:true,writable:true,value:SafeFunction});
    }catch(e){}
  }catch(e){}

  try{
    if(EMBED_HASH && location.hash!==EMBED_HASH){
      history.replaceState(null,"",location.pathname+location.search+EMBED_HASH);
    }
  }catch(e){}

  function abs(input){
    try{
      if(!input || typeof input!=="string") return null;
      if(input.indexOf(PROXY)===0 || input.indexOf(MEDIA_PROXY)===0 || input.indexOf("/api/embed?")===0 || input.indexOf("/api/media?")===0) return null;
      if(/^(about|blob|data|javascript|mailto|tel):/i.test(input) || input.charAt(0)==="#") return null;
      return new URL(input, document.baseURI);
    }catch(e){ return null; }
  }
  function isProxyUrl(input){
    try{
      if(!input || typeof input!=="string") return false;
      if(input.indexOf(PROXY)===0 || input.indexOf(MEDIA_PROXY)===0 || input.indexOf("/api/embed?")===0 || input.indexOf("/api/media?")===0) return true;
      var u=new URL(input, document.baseURI);
      return u.origin===location.origin && (u.pathname==="/api/embed" || u.pathname==="/api/media") && u.search.indexOf("u=")!==-1;
    }catch(e){ return false; }
  }
  function isEmbed(u){ return u && u.protocol==="https:" && EMBED_HOSTS.indexOf(u.hostname)!==-1; }
  function mediaHostMatches(rule,hostname){
    return hostname===rule.hostname || (rule.includeSubdomains===true && hostname.slice(-(rule.hostname.length+1))==="."+rule.hostname);
  }
  function isMedia(u){
    if(!u || !/^https?:$/.test(u.protocol)) return false;
    for(var i=0;i<MEDIA_RULES.length;i++){
      var rule=MEDIA_RULES[i];
      if(mediaHostMatches(rule,u.hostname) && (!rule.pathPrefix || u.pathname.indexOf(rule.pathPrefix)===0)) return true;
    }
    return false;
  }
  function isBlocked(u){ return !!u && (BLOCKED_HOST.test(u.hostname) || BLOCKED_URL.test(u.href)); }
  function isAppPlayerScript(u){
    return !!u && u.origin===location.origin && (
      u.pathname.indexOf("/js/")===0 ||
      u.pathname.indexOf("/jwp/")===0 ||
      u.pathname==="/api/embed"
    );
  }
  function isTrustedScript(u){
    return !!u && (isEmbed(u) || isAppPlayerScript(u) || PLAYER_SCRIPT_HOSTS.indexOf(u.hostname)!==-1);
  }
  function requestUrl(input){
    try{
      if(typeof input==="string") return input;
      if(typeof URL!=="undefined" && input instanceof URL) return input.href;
      return input && input.url;
    }catch(e){ return input && input.url; }
  }
  function classify(u){
    if(isMedia(u)) return "media";
    if(isBlocked(u)) return "blocked";
    if(isEmbed(u)) return "embed";
    return "pass";
  }
  function directEmbedindiaFetchUrl(u){
    return false;
  }
  function directEmbedindiaMedia(u){
    return EMBED_ORIGIN==="https://embedindia.st" && isMedia(u) && (
      mediaHostMatches({hostname:"indianservers.st",includeSubdomains:true},u.hostname) ||
      mediaHostMatches({hostname:"tiktokcdn.com",includeSubdomains:true},u.hostname)
    );
  }
  function rememberMedia(u,proxyUrl){
    try{
      if(!/\\.m3u8(?:$|[?#])/i.test(u.pathname)) return;
      window.__valenceMediaUrls=window.__valenceMediaUrls||[];
      if(window.__valenceMediaUrls.indexOf(proxyUrl)===-1) window.__valenceMediaUrls.push(proxyUrl);
      if(!window.__valenceMediaUrl) window.__valenceMediaUrl=proxyUrl;
    }catch(e){}
  }
  function safeGoat(value){
    try{
      value=String(value||"").trim();
      if(!value || value.length>2048) return "";
      return /^[A-Za-z0-9+/=_:.,-]+$/.test(value) ? value : "";
    }catch(e){ return ""; }
  }
  function rememberGoat(response){
    try{
      if(!response || !response.headers || typeof response.headers.get!=="function") return;
      var goat=safeGoat(response.headers.get("goat"));
      if(!goat) return;
      PROVIDER_GOAT=goat;
      window.__valenceGoat=goat;
    }catch(e){}
  }
  function rememberRequest(kind,original,next){
    try{
      window.__valenceRequests=window.__valenceRequests||[];
      window.__valenceRequests.push({kind:kind,original:String(original||""),next:String(next||""),at:Date.now()});
      if(window.__valenceRequests.length>80) window.__valenceRequests.shift();
    }catch(e){}
  }
  function isMediaProxyUrl(input){
    try{
      if(!input || typeof input!=="string") return false;
      if(input.indexOf(MEDIA_PROXY)===0 || input.indexOf("/api/media?")===0) return true;
      var u=new URL(input, document.baseURI);
      return u.origin===location.origin && u.pathname==="/api/media" && u.search.indexOf("u=")!==-1;
    }catch(e){ return false; }
  }
  function reportMediaFailure(kind,original,next,status){
    try{
      if(!isMediaProxyUrl(next)) return;
      var message={
        source:"valence-player",
        type:"media-error",
        kind:kind,
        status:status || 0,
        original:String(original||""),
        proxied:String(next||""),
        target:PLAYER_TARGET,
        embedTarget:EMBED_TARGET
      };
      window.parent.postMessage(message, APP_ORIGIN);
      if(window.top && window.top!==window.parent) window.top.postMessage(message, APP_ORIGIN);
    }catch(e){}
  }
  function observeMediaFetch(promise,original,next){
    return promise.then(function(response){
      try{
        rememberGoat(response);
        if(isMediaProxyUrl(next) && response && response.status>=400) reportMediaFailure("fetch",original,next,response.status);
      }catch(e){}
      return response;
    },function(error){
      if(isMediaProxyUrl(next)) reportMediaFailure("fetch",original,next,0);
      throw error;
    });
  }
  function isBlockedMarkup(value){
    var text=String(value||"");
    return /Remove sandbox attributes on the iframe tag|ad\\/visit\\.php|\\/ads?\\.html|popunder|popads|popcash|adsterra|adcash|adexchangerapid|usrpubtrk|ntwkbc|ndcertainlywhen|histats/i.test(text);
  }
  function rewriteMarkup(value){
    var text=String(value||"").replace(/\\s(src|href|action|poster)=(["'])(.*?)\\2/gi,function(attr,name,quote,raw){
      var next=proxify(raw);
      if(next===raw) return attr;
      return " "+name+"="+quote+(next==="about:blank" ? "about:blank" : next)+quote;
    });
    return text.replace(/url\\(\\s*(["']?)([^"')]+)\\1\\s*\\)/gi,function(match,quote,raw){
      var next=proxify(raw);
      if(next===raw) return match;
      var q=quote||"'";
      return "url("+q+(next==="about:blank" ? "about:blank" : next)+q+")";
    });
  }
  function proxify(input){
    if(isProxyUrl(input)) return input;
    var u=abs(input);
    if(!u) return input;
    var kind=classify(u);
    if(kind==="media"){
      if(directEmbedindiaMedia(u)){
        var embedindiaMediaUrl=MEDIA_PROXY+encodeURIComponent(u.href);
        rememberMedia(u,embedindiaMediaUrl);
        return embedindiaMediaUrl;
      }
      var mediaUrl=MEDIA_PROXY+encodeURIComponent(u.href);
      if(PROVIDER_GOAT) mediaUrl+="&g="+encodeURIComponent(PROVIDER_GOAT);
      rememberMedia(u,mediaUrl);
      return mediaUrl;
    }
    if(kind==="blocked") return "about:blank";
    if(u.origin===location.origin && u.pathname.indexOf("/api/wasm/")===0) return input;
    if(u.origin===location.origin && (u.pathname.indexOf("/js/")===0 || u.pathname.indexOf("/jwp/")===0)){
      return PROXY+encodeURIComponent(EMBED_ORIGIN+u.pathname+u.search+u.hash);
    }
    if(directEmbedindiaFetchUrl(u)) return EMBED_ORIGIN+"/fetch";
    if(u.origin===location.origin && u.pathname==="/fetch") return PROXY+encodeURIComponent(EMBED_ORIGIN+"/fetch");
    if(u.origin===location.origin){
      return PROXY+encodeURIComponent(EMBED_ORIGIN+u.pathname+u.search+u.hash);
    }
    if(kind==="embed" && u.pathname==="/fetch") return PROXY+encodeURIComponent(u.href);
    if(kind==="embed") return PROXY+encodeURIComponent(u.href);
    return input;
  }
  function emptyFetch(){
    return Promise.resolve(new Response("",{status:204}));
  }

  try{
    window.aclib=window.aclib||{};
    window.aclib.runPop=function(){};
  }catch(e){}

  try{
    window.P2PEngineHls=window.P2PEngineHls||function(){};
    window.P2PEngineHls.tryRegisterServiceWorker=window.P2PEngineHls.tryRegisterServiceWorker||function(){
      return Promise.resolve();
    };
  }catch(e){}

  try{
    var EMBED_HOSTNAME=${JSON.stringify(target.hostname)};
    var instantiateNative=WebAssembly.instantiate;
    var instantiateStreamingNative=WebAssembly.instantiateStreaming;
    function wrapWasmImports(imports){
      try{
        if(!imports || typeof imports!=="object") return imports;
        Object.keys(imports).forEach(function(key){
          var bg=imports[key];
          if(!bg || bg.__valenceHostnameWrapped) return;
          var getNative=bg.__wbg_get_b3ed3ad4be2bc8ac;
          if(typeof getNative!=="function") return;
          bg.__wbg_get_b3ed3ad4be2bc8ac=function(object, property){
            try{
              if(object==null || (typeof object!=="object" && typeof object!=="function")){
                if(property==="hostname") return EMBED_HOSTNAME;
                return undefined;
              }
              if(property==="hostname" && object===location) return EMBED_HOSTNAME;
              var value=getNative.apply(this,arguments);
              if(property==="hostname" && value===location.hostname) return EMBED_HOSTNAME;
              return value;
            }catch(e){
              if(property==="hostname") return EMBED_HOSTNAME;
              return undefined;
            }
          };
          bg.__valenceHostnameWrapped=true;
        });
      }catch(e){}
      return imports;
    }
    WebAssembly.instantiate=function(bytes,imports){
      return instantiateNative.call(this,bytes,wrapWasmImports(imports));
    };
    if(instantiateStreamingNative){
      WebAssembly.instantiateStreaming=function(source,imports){
        return instantiateStreamingNative.call(this,source,wrapWasmImports(imports));
      };
    }
  }catch(e){}

  try{
    var blockWindowOpen=function(){ return null; };
    try{
      Object.defineProperty(window,"open",{
        configurable:false,
        writable:false,
        value:blockWindowOpen
      });
    }catch(e){
      window.open=blockWindowOpen;
    }
  }catch(e){}

  try{
    var writeNative=document.write;
    var writelnNative=document.writeln;
    document.write=function(){
      for(var i=0;i<arguments.length;i++) if(isBlockedMarkup(arguments[i])) return;
      var args=Array.prototype.map.call(arguments,rewriteMarkup);
      return writeNative.apply(this,args);
    };
    document.writeln=function(){
      for(var i=0;i<arguments.length;i++) if(isBlockedMarkup(arguments[i])) return;
      var args=Array.prototype.map.call(arguments,rewriteMarkup);
      return writelnNative.apply(this,args);
    };
    var insertAdjacentHTMLNative=Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML=function(position,text){
      if(isBlockedMarkup(text)) return;
      return insertAdjacentHTMLNative.call(this,position,rewriteMarkup(text));
    };
    var innerHTMLDescriptor=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML") || Object.getOwnPropertyDescriptor(HTMLElement.prototype,"innerHTML");
    if(innerHTMLDescriptor && innerHTMLDescriptor.set && innerHTMLDescriptor.get){
      Object.defineProperty(Element.prototype,"innerHTML",{
        configurable:true,
        enumerable:innerHTMLDescriptor.enumerable,
        get:function(){ return innerHTMLDescriptor.get.call(this); },
        set:function(value){
          if((this===document.body || this===document.documentElement) && isBlockedMarkup(value)) return;
          return innerHTMLDescriptor.set.call(this,rewriteMarkup(value));
        }
      });
    }
    function patchUrlProperty(proto,property){
      try{
        if(!proto) return;
        var descriptor=Object.getOwnPropertyDescriptor(proto,property);
        if(!descriptor || !descriptor.set || !descriptor.get || descriptor.__valencePatched) return;
        Object.defineProperty(proto,property,{
          configurable:true,
          enumerable:descriptor.enumerable,
          get:function(){ return descriptor.get.call(this); },
          set:function(value){
            var next=proxify(String(value||""));
            try{
              var tag=String(this.tagName||"").toLowerCase();
              var u=abs(String(value||""));
              if(tag==="script" && u && !isTrustedScript(u)) next="about:blank";
            }catch(e){}
            return descriptor.set.call(this,next==="about:blank" ? "about:blank" : next);
          }
        });
      }catch(e){}
    }
    patchUrlProperty(window.HTMLIFrameElement && HTMLIFrameElement.prototype,"src");
    patchUrlProperty(window.HTMLImageElement && HTMLImageElement.prototype,"src");
    patchUrlProperty(window.HTMLScriptElement && HTMLScriptElement.prototype,"src");
    patchUrlProperty(window.HTMLMediaElement && HTMLMediaElement.prototype,"src");
    patchUrlProperty(window.HTMLSourceElement && HTMLSourceElement.prototype,"src");
    patchUrlProperty(window.HTMLLinkElement && HTMLLinkElement.prototype,"href");
    patchUrlProperty(window.HTMLAnchorElement && HTMLAnchorElement.prototype,"href");
    patchUrlProperty(window.HTMLFormElement && HTMLFormElement.prototype,"action");
    function blockedElement(node){
      try{
        if(!node || node.nodeType!==1) return false;
        var tag=String(node.tagName||"").toLowerCase();
        var raw="";
        if(tag==="script" || tag==="iframe" || tag==="img" || tag==="source") raw=node.getAttribute("src")||"";
        if(tag==="a" || tag==="link") raw=node.getAttribute("href")||"";
        if(tag==="form") raw=node.getAttribute("action")||"";
        var u=raw ? abs(raw) : null;
        if(tag==="script" && u && !isTrustedScript(u)) return true;
        if(tag==="iframe" && u && classify(u)!=="embed") return true;
        return (u && classify(u)==="blocked") || isBlockedMarkup(node.outerHTML||"");
      }catch(e){ return false; }
    }
    var setAttributeNative=Element.prototype.setAttribute;
    var removeAttributeNative=Element.prototype.removeAttribute;
    function hardenIframeElement(node){
      try{
        if(!node || node.nodeType!==1 || String(node.tagName||"").toLowerCase()!=="iframe") return;
        setAttributeNative.call(node,"sandbox","allow-scripts allow-presentation");
        setAttributeNative.call(node,"referrerpolicy","no-referrer");
      }catch(e){}
    }
    Element.prototype.setAttribute=function(name,value){
      var attr=String(name||"").toLowerCase();
      if(String(this.tagName||"").toLowerCase()==="iframe" && (attr==="sandbox" || attr==="referrerpolicy")){
        return setAttributeNative.call(this,name,attr==="sandbox" ? "allow-scripts allow-presentation" : "no-referrer");
      }
      if(attr==="src" || attr==="href" || attr==="action" || attr==="poster"){
        var next=proxify(String(value||""));
        try{
          var tag=String(this.tagName||"").toLowerCase();
          var u=abs(String(value||""));
          if(attr==="src" && tag==="script" && u && !isTrustedScript(u)) next="about:blank";
          if(attr==="src" && tag==="iframe" && u && classify(u)!=="embed") next="about:blank";
        }catch(e){}
        value=next==="about:blank" ? "about:blank" : next;
      }
      return setAttributeNative.call(this,name,value);
    };
    Element.prototype.removeAttribute=function(name){
      var attr=String(name||"").toLowerCase();
      if(String(this.tagName||"").toLowerCase()==="iframe" && (attr==="sandbox" || attr==="referrerpolicy")){
        hardenIframeElement(this);
        return;
      }
      return removeAttributeNative.call(this,name);
    };
    var appendChildNative=Node.prototype.appendChild;
    Node.prototype.appendChild=function(node){
      if(blockedElement(node)) return node;
      hardenIframeElement(node);
      return appendChildNative.call(this,node);
    };
    var insertBeforeNative=Node.prototype.insertBefore;
    Node.prototype.insertBefore=function(node,reference){
      if(blockedElement(node)) return node;
      hardenIframeElement(node);
      return insertBeforeNative.call(this,node,reference);
    };
  }catch(e){}

  document.addEventListener("click",function(e){
    try{
      var a=e.target && e.target.closest ? e.target.closest("a") : null;
      if(!a) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }catch(err){}
  },true);
  document.addEventListener("submit",function(e){
    try{
      e.preventDefault();
      e.stopImmediatePropagation();
    }catch(err){}
  },true);

  var fetchNative=window.fetch;
  if(fetchNative){
    function normalizeDirectEmbedindiaFetch(next,requestInit){
      try{
        if(EMBED_ORIGIN!=="https://embedindia.st" || next!==EMBED_ORIGIN+"/fetch") return;
        var headers=new Headers(requestInit.headers);
        headers.delete("indians");
        headers.set("content-type","text/plain;charset=UTF-8");
        requestInit.headers=headers;
        requestInit.credentials="omit";
      }catch(e){}
    }
    window.fetch=function(input,init){
      var original=null;
      var next=null;
      try{
        original=requestUrl(input);
        next=proxify(original);
        rememberRequest("fetch",original,next);
        if(next==="about:blank") return emptyFetch();
        if(next!==original){
          if(typeof input==="string"){
            input=next;
          }else if(typeof URL!=="undefined" && input instanceof URL){
            input=next;
          }else if(input instanceof Request){
            var request=input;
            var method=request.method || "GET";
            var requestInit={
              method:method,
              headers:new Headers(request.headers),
              mode:"cors",
              credentials:"same-origin",
              cache:request.cache,
              redirect:request.redirect,
              referrerPolicy:request.referrerPolicy
            };
            if(init){
              for(var key in init) requestInit[key]=init[key];
            }
            normalizeDirectEmbedindiaFetch(next,requestInit);
            if(method!=="GET" && method!=="HEAD"){
              return request.clone().arrayBuffer().then(function(body){
                requestInit.body=body;
                return observeMediaFetch(fetchNative.call(window,next,requestInit),original,next);
              });
            }
            return observeMediaFetch(fetchNative.call(window,next,requestInit),original,next);
          }else{
            input=next;
          }
        }
      }catch(e){}
      return observeMediaFetch(fetchNative.call(this,input,init),original,next);
    };
  }
  var xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    try{
      var original=requestUrl(url);
      var next=proxify(original);
      rememberRequest("xhr",original,next);
      if(isMediaProxyUrl(next)){
        var xhr=this;
        xhr.addEventListener("loadend",function(){
          try{
            if(xhr.status>=400) reportMediaFailure("xhr",original,next,xhr.status);
          }catch(e){}
        },{once:true});
        xhr.addEventListener("error",function(){
          reportMediaFailure("xhr",original,next,0);
        },{once:true});
      }
      arguments[1]=next==="about:blank" ? "data:text/plain," : next;
    }catch(e){}
    return xhrOpen.apply(this,arguments);
  };

  try{
    var beaconNative=navigator.sendBeacon;
    if(beaconNative){
      navigator.sendBeacon=function(url,data){
        var next=proxify(String(url));
        if(next==="about:blank") return true;
        return beaconNative.call(this,next,data);
      };
    }
  }catch(e){}
})();</script>`;
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
  const sanitized = sanitizeInlineScriptBody(rewritten);

  if (/<head[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/(<head[^>]*>)/i, `$1${inject}`);
  }
  if (/<html[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/(<html[^>]*>)/i, `$1<head>${inject}</head>`);
  }
  return `<!doctype html><html><head>${inject}</head><body>${sanitized}</body></html>`;
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

  if (!isEmbedUrl(target)) {
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
