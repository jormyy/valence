import { NextResponse } from "next/server";
import {
  EMBED_HOSTS,
  MEDIA_HOST_RULES,
  embedHostsCsp,
  isAllowedEmbedUrl,
  isAllowedMediaUrl,
} from "@/lib/streams/providers";
import { PROXY_FETCH_TIMEOUT_MS, fetchWithTimeout } from "@/lib/upstream";
import { autoBootstrap } from "@/lib/embed-bootstrap";

export const dynamic = "force-dynamic";

const BLOCKED_HOST =
  /(^|\.)((adcash|popads|popcash|propellerads|adsterra|exoclick|dtscout|adspyglass|hilltopads|yllix|juicyads)\.com|enteringlacquergiant\.com|adexchangerapid\.com|usrpubtrk\.com|ntwkbc\d+\.com|ndcertainlywhen\.com|usasenioraid\.com|multiboardthe\.com|filenebuladrive\.com|wps\.com|wpscdn\.com|llvpn\.com|thewildernessclub\.com|therocketlanguages\.com|optimserve\.agency|cdn-lab\.shop|tiktokcdn\.com|tracking-source\.com|static\.cloudflareinsights\.com|sstatic\d*\.histats\.com|histats\.com)$/i;
const BLOCKED_URL =
  /((^|\/)ad\.html(?:$|[?#])|popunder|popads|popcash|propeller|adsterra|exoclick|adcash|adspyglass|dtscout|adexchange|usrpubtrk|ntwkbc|ndcertainlywhen|senioraid|multiboard|filenebula|wpscdn|wps\.com|wildernessclub|therocketlanguages|optimserve|swarmcloud|cdn-lab|tiktokcdn|tracking-source|cloudflareinsights|histats)/i;

const BROWSER_HEADERS = (target: URL) => ({
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  referer: `${target.origin}/`,
  origin: target.origin,
});

function corsHeaders(request: Request, methods: readonly string[]): Headers {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": methods.join(", "),
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ??
      "accept, content-type, goat, range",
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

function proxied(url: URL, appOrigin: string): string {
  return `${appOrigin}/api/embed?u=${encodeURIComponent(url.href)}`;
}

function proxiedMedia(url: URL, appOrigin: string): string {
  return `${appOrigin}/api/media?u=${encodeURIComponent(url.href)}`;
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
  if (raw.startsWith("/api/embed?u=") || raw.startsWith("/api/media?u=")) return true;
  try {
    const url = new URL(raw, appOrigin);
    return url.origin === appOrigin
      && (url.pathname === "/api/embed" || url.pathname === "/api/media")
      && url.searchParams.has("u");
  } catch {
    return false;
  }
}

function rewriteAttrValue(raw: string, base: URL, appOrigin: string): string {
  if (isAppProxyUrl(raw, appOrigin)) return raw;
  const url = resolveMaybe(raw, base);
  if (!url) return raw;
  switch (classifyUrl(url)) {
    case "media":
      return proxiedMedia(url, appOrigin);
    case "blocked":
      return "about:blank";
    case "embed":
      return proxied(url, appOrigin);
    case "pass":
      return raw;
  }
}

function stripBlockedScripts(html: string, base: URL, appOrigin: string): string {
  return html.replace(
    /<script\b([^>]*)\bsrc=(["'])(.*?)\2([^>]*)>\s*<\/script>/gi,
    (tag, before: string, _quote: string, src: string, after: string) => {
      const url = resolveMaybe(src, base);
      if (url && isBlockedUrl(url)) return "";
      return `<script${before}src="${escapeAttr(rewriteAttrValue(src, base, appOrigin))}"${after}></script>`;
    },
  );
}

function stripBlockedInlineScripts(html: string): string {
  return html.replace(
    /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
    (tag: string) => {
      const body = tag.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
      const small = body.length < 5000;
      if (small && /\baclib\.runPop\s*\(/i.test(body)) return "";
      if (small && /(?:^|[^\w])zoneId\s*:/i.test(body)) return "";
      if (
        small &&
        /(?:insertAdjacentHTML|document\.write|document\.writeln|createElement)[\s\S]*(?:ad\.html|popunder|popads|popcash|adsterra|adcash|adexchangerapid|usrpubtrk|ntwkbc|ndcertainlywhen|histats)/i.test(body)
      ) {
        return "";
      }
      return tag;
    },
  );
}

function rewriteUrlAttributes(html: string, base: URL, appOrigin: string): string {
  return html.replace(
    /\s(src|href|action|poster)=(["'])(.*?)\2/gi,
    (attr, name: string, quote: string, value: string) => {
      const rewritten = rewriteAttrValue(value, base, appOrigin);
      if (rewritten === value) return attr;
      return ` ${name}=${quote}${escapeAttr(rewritten)}${quote}`;
    },
  );
}

function shim(appOrigin: string, target: URL): string {
  return `<script>(function(){
  "use strict";
  var EMBED_HOSTS=${JSON.stringify(EMBED_HOSTS.map((rule) => rule.hostname))};
  var MEDIA_RULES=${JSON.stringify(MEDIA_HOST_RULES)};
  var BLOCKED_HOST=${BLOCKED_HOST.toString()};
  var BLOCKED_URL=${BLOCKED_URL.toString()};
  var PROXY=${JSON.stringify(`${appOrigin}/api/embed?u=`)};
  var MEDIA_PROXY=${JSON.stringify(`${appOrigin}/api/media?u=`)};
  var EMBED_ORIGIN=${JSON.stringify(target.origin)};

  function abs(input){
    try{
      if(!input || typeof input!=="string") return null;
      if(input.indexOf(PROXY)===0 || input.indexOf(MEDIA_PROXY)===0 || input.indexOf("/api/embed?u=")===0 || input.indexOf("/api/media?u=")===0) return null;
      if(/^(about|blob|data|javascript|mailto|tel):/i.test(input) || input.charAt(0)==="#") return null;
      return new URL(input, document.baseURI);
    }catch(e){ return null; }
  }
  function isProxyUrl(input){
    try{
      if(!input || typeof input!=="string") return false;
      if(input.indexOf(PROXY)===0 || input.indexOf(MEDIA_PROXY)===0 || input.indexOf("/api/embed?u=")===0 || input.indexOf("/api/media?u=")===0) return true;
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
  function classify(u){
    if(isMedia(u)) return "media";
    if(isBlocked(u)) return "blocked";
    if(isEmbed(u)) return "embed";
    return "pass";
  }
  function rememberMedia(u,proxyUrl){
    try{
      if(!/\\.m3u8(?:$|[?#])/i.test(u.pathname)) return;
      window.__valenceMediaUrls=window.__valenceMediaUrls||[];
      if(window.__valenceMediaUrls.indexOf(proxyUrl)===-1) window.__valenceMediaUrls.push(proxyUrl);
      if(!window.__valenceMediaUrl) window.__valenceMediaUrl=proxyUrl;
    }catch(e){}
  }
  function isBlockedMarkup(value){
    var text=String(value||"");
    return /Remove sandbox attributes on the iframe tag|ad\\/visit\\.php|\\/ad\\.html|popunder|popads|popcash|adsterra|adcash|adexchangerapid|usrpubtrk|ntwkbc|ndcertainlywhen|histats/i.test(text);
  }
  function proxify(input){
    if(isProxyUrl(input)) return input;
    var u=abs(input);
    if(!u) return input;
    var kind=classify(u);
    if(kind==="media"){
      var mediaUrl=MEDIA_PROXY+encodeURIComponent(u.href);
      rememberMedia(u,mediaUrl);
      return mediaUrl;
    }
    if(kind==="blocked") return "about:blank";
    if(u.origin===location.origin && (u.pathname.indexOf("/js/")===0 || u.pathname.indexOf("/jwp/")===0)){
      return PROXY+encodeURIComponent(EMBED_ORIGIN+u.pathname+u.search+u.hash);
    }
    if(u.origin===location.origin && u.pathname==="/fetch") return PROXY+encodeURIComponent(EMBED_ORIGIN+"/fetch");
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
    var EMBED_HOSTNAME=${JSON.stringify(target.hostname)};
    var instantiateNative=WebAssembly.instantiate;
    var instantiateStreamingNative=WebAssembly.instantiateStreaming;
    function wrapWasmImports(imports){
      try{
        var bg=imports && imports["./locked_bg.js"];
        if(!bg || bg.__valenceHostnameWrapped) return imports;
        var getNative=bg.__wbg_get_b3ed3ad4be2bc8ac;
        if(typeof getNative==="function"){
          bg.__wbg_get_b3ed3ad4be2bc8ac=function(object, property){
            try{
              if(object==null || (typeof object!=="object" && typeof object!=="function")) return undefined;
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
        }
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
    var openNative=window.open;
    window.open=function(url){
      var u=abs(String(url||""));
      if(!u || classify(u)==="blocked") return null;
      return openNative ? openNative.apply(window,arguments) : null;
    };
  }catch(e){}

  try{
    var writeNative=document.write;
    var writelnNative=document.writeln;
    document.write=function(){
      for(var i=0;i<arguments.length;i++) if(isBlockedMarkup(arguments[i])) return;
      return writeNative.apply(this,arguments);
    };
    document.writeln=function(){
      for(var i=0;i<arguments.length;i++) if(isBlockedMarkup(arguments[i])) return;
      return writelnNative.apply(this,arguments);
    };
    var insertAdjacentHTMLNative=Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML=function(position,text){
      if(isBlockedMarkup(text)) return;
      return insertAdjacentHTMLNative.call(this,position,text);
    };
    var innerHTMLDescriptor=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML") || Object.getOwnPropertyDescriptor(HTMLElement.prototype,"innerHTML");
    if(innerHTMLDescriptor && innerHTMLDescriptor.set && innerHTMLDescriptor.get){
      Object.defineProperty(Element.prototype,"innerHTML",{
        configurable:true,
        enumerable:innerHTMLDescriptor.enumerable,
        get:function(){ return innerHTMLDescriptor.get.call(this); },
        set:function(value){
          if((this===document.body || this===document.documentElement) && isBlockedMarkup(value)) return;
          return innerHTMLDescriptor.set.call(this,value);
        }
      });
    }
    function blockedElement(node){
      try{
        if(!node || node.nodeType!==1) return false;
        var tag=String(node.tagName||"").toLowerCase();
        var raw="";
        if(tag==="script" || tag==="iframe" || tag==="img" || tag==="source") raw=node.getAttribute("src")||"";
        if(tag==="a" || tag==="link") raw=node.getAttribute("href")||"";
        if(tag==="form") raw=node.getAttribute("action")||"";
        var u=raw ? abs(raw) : null;
        return (u && classify(u)==="blocked") || isBlockedMarkup(node.outerHTML||"");
      }catch(e){ return false; }
    }
    var setAttributeNative=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name,value){
      var attr=String(name||"").toLowerCase();
      if(attr==="src" || attr==="href" || attr==="action" || attr==="poster"){
        var next=proxify(String(value||""));
        value=next==="about:blank" ? "about:blank" : next;
      }
      return setAttributeNative.call(this,name,value);
    };
    var appendChildNative=Node.prototype.appendChild;
    Node.prototype.appendChild=function(node){
      if(blockedElement(node)) return node;
      return appendChildNative.call(this,node);
    };
    var insertBeforeNative=Node.prototype.insertBefore;
    Node.prototype.insertBefore=function(node,reference){
      if(blockedElement(node)) return node;
      return insertBeforeNative.call(this,node,reference);
    };
  }catch(e){}

  document.addEventListener("click",function(e){
    try{
      var a=e.target && e.target.closest ? e.target.closest("a") : null;
      if(!a) return;
      var href=a.getAttribute("href") || "";
      var u=abs(href);
      if(/^_?blank$/i.test(a.getAttribute("target")||"") || classify(u)==="blocked"){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }catch(err){}
  },true);
  document.addEventListener("submit",function(e){
    try{
      var form=e.target;
      var u=abs(form && form.getAttribute ? (form.getAttribute("action")||"") : "");
      if(/^_?blank$/i.test(form.getAttribute("target")||"") || classify(u)==="blocked"){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }catch(err){}
  },true);

  var fetchNative=window.fetch;
  if(fetchNative){
    window.fetch=function(input,init){
      try{
        var original=typeof input==="string" ? input : input && input.url;
        var next=proxify(original);
        if(next==="about:blank") return emptyFetch();
        if(next!==original){
          if(typeof input==="string"){
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
            if(method!=="GET" && method!=="HEAD"){
              return request.clone().arrayBuffer().then(function(body){
                requestInit.body=body;
                return fetchNative.call(window,next,requestInit);
              });
            }
            return fetchNative.call(window,next,requestInit);
          }else{
            input=next;
          }
        }
      }catch(e){}
      return fetchNative.call(this,input,init);
    };
  }
  var xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    try{
      var next=proxify(String(url));
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
  return [
    `default-src ${self} blob: data: https: http:`,
    `script-src ${self} ${inline} ${evalToken} 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net ${embedHosts}`,
    `worker-src ${self} blob:`,
    `connect-src ${self} blob: data: https: http:`,
    `media-src ${self} blob: data: https: http:`,
    `img-src ${self} blob: data: https: http:`,
    `style-src ${self} ${inline} https: http:`,
    `font-src ${self} data: https: http:`,
    `frame-src ${self} blob:`,
    `child-src ${self} blob:`,
    "object-src 'none'",
    "form-action 'none'",
    `base-uri ${self} ${appOrigin} ${embedHosts}`,
    `navigate-to ${self} ${appOrigin}`,
  ].join("; ");
}

function rewriteHtml(html: string, target: URL, appOrigin: string): string {
  const inject = shim(appOrigin, target) + autoBootstrap(target);
  const cleaned = stripBlockedInlineScripts(stripBlockedScripts(html, target, appOrigin));
  const rewritten = rewriteUrlAttributes(cleaned, target, appOrigin);

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
  const raw = requestUrl.searchParams.get("u");
  if (!raw) return corsResponse(request, "missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return corsResponse(request, "bad url", { status: 400 });
  }

  if (!isEmbedUrl(target)) {
    return corsResponse(request, "host not allowed", { status: 403 });
  }
  if (isBlockedUrl(target)) {
    return corsResponse(request, null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }

  let upstream: Response;
  try {
    const headers = new Headers(BROWSER_HEADERS(target));
    const accept = request.headers.get("accept");
    const contentType = request.headers.get("content-type");
    if (accept) headers.set("accept", accept);
    if (contentType) headers.set("content-type", contentType);

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
    return new NextResponse(rewriteHtml(html, target, requestUrl.origin), {
      status: upstream.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": contentSecurityPolicy(requestUrl.origin),
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
  const goat = upstream.headers.get("goat");
  if (goat) {
    headers.set("goat", goat);
    exposedHeaders.push("goat");
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
