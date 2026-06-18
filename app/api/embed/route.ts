import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMBED_HOSTS = new Set([
  "embed.st",
  "embedindia.st",
  "embed.streamapi.cc",
]);

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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isEmbedUrl(url: URL): boolean {
  return url.protocol === "https:" && EMBED_HOSTS.has(url.hostname);
}

function isBlockedUrl(url: URL): boolean {
  return BLOCKED_HOST.test(url.hostname) || BLOCKED_URL.test(url.href);
}

function proxied(url: URL, appOrigin: string): string {
  return `${appOrigin}/api/embed?u=${encodeURIComponent(url.href)}`;
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

function rewriteAttrValue(raw: string, base: URL, appOrigin: string): string {
  const url = resolveMaybe(raw, base);
  if (!url) return raw;
  if (isBlockedUrl(url)) return "about:blank";
  if (isEmbedUrl(url)) return proxied(url, appOrigin);
  return raw;
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
  var EMBED_HOSTS=${JSON.stringify([...EMBED_HOSTS])};
  var BLOCKED_HOST=${BLOCKED_HOST.toString()};
  var BLOCKED_URL=${BLOCKED_URL.toString()};
  var PROXY=${JSON.stringify(`${appOrigin}/api/embed?u=`)};
  var MEDIA_PROXY=${JSON.stringify(`${appOrigin}/api/media?u=`)};
  var EMBED_ORIGIN=${JSON.stringify(target.origin)};
  var STRMD_HOST=/(^|\\.)strmd\\.st$/i;
  var TIKTOK_MEDIA_HOST=/(^|\\.)tiktokcdn\\.com$/i;

  function abs(input){
    try{
      if(!input || typeof input!=="string") return null;
      if(input.indexOf(PROXY)===0 || input.indexOf("/api/embed?u=")===0) return null;
      if(/^(about|blob|data|javascript|mailto|tel):/i.test(input) || input.charAt(0)==="#") return null;
      return new URL(input, document.baseURI);
    }catch(e){ return null; }
  }
  function isEmbed(u){ return u && u.protocol==="https:" && EMBED_HOSTS.indexOf(u.hostname)!==-1; }
  function isMedia(u){
    if(!u || !/^https?:$/.test(u.protocol)) return false;
    return STRMD_HOST.test(u.hostname) || (TIKTOK_MEDIA_HOST.test(u.hostname) && u.pathname.indexOf("/obj/")===0);
  }
  function isBlocked(u){ return !!u && (BLOCKED_HOST.test(u.hostname) || BLOCKED_URL.test(u.href)); }
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
    var u=abs(input);
    if(!u) return input;
    if(isMedia(u)){
      var mediaUrl=MEDIA_PROXY+encodeURIComponent(u.href);
      rememberMedia(u,mediaUrl);
      return mediaUrl;
    }
    if(isBlocked(u)) return "about:blank";
    if(u.origin===location.origin && (u.pathname.indexOf("/js/")===0 || u.pathname.indexOf("/jwp/")===0)){
      return PROXY+encodeURIComponent(EMBED_ORIGIN+u.pathname+u.search+u.hash);
    }
    if(u.origin===location.origin && u.pathname==="/fetch") return PROXY+encodeURIComponent(EMBED_ORIGIN+"/fetch");
    if(isEmbed(u) && u.pathname==="/fetch") return PROXY+encodeURIComponent(u.href);
    if(isEmbed(u)) return PROXY+encodeURIComponent(u.href);
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
      if(!u || isBlocked(u)) return null;
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
        return isBlocked(u) || isBlockedMarkup(node.outerHTML||"");
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
      if(/^_?blank$/i.test(a.getAttribute("target")||"") || isBlocked(u)){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }catch(err){}
  },true);
  document.addEventListener("submit",function(e){
    try{
      var form=e.target;
      var u=abs(form && form.getAttribute ? (form.getAttribute("action")||"") : "");
      if(/^_?blank$/i.test(form.getAttribute("target")||"") || isBlocked(u)){
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

function autoBootstrap(target: URL): string {
  const match = target.pathname.match(/^\/embed\/([^/]+)\/([^/]+)\/([^/?#]+)/);
  if (!match) return "";

  const [, source, slug, channel] = match;
  if (target.hostname === "embedindia.st") {
    return `<script>(function(){
  "use strict";
  var SOURCE=${JSON.stringify(decodeURIComponent(source))};
  var SLUG=${JSON.stringify(decodeURIComponent(slug))};
  var CHANNEL=${JSON.stringify(decodeURIComponent(channel))};
  var attempts=0;

  function hasPlayer(){
    try{
      return typeof window.jwplayer==="function" && !!document.getElementById("player");
    }catch(e){ return false; }
  }
  function playerConfigured(){
    try{
      if(document.querySelector("video")) return true;
      var player=window.jwplayer("player");
      var config=player && player.getConfig ? player.getConfig() : null;
      if(config && (config.file || config.playlist)) return true;
    }catch(e){}
    return false;
  }
  function setupResolvedPlayer(){
    try{
      if(playerConfigured()) return true;
      var urls=window.__valenceMediaUrls || [];
      var file=window.__valenceMediaUrl || urls[0];
      if(!file || typeof window.jwplayer!=="function") return false;
      var player=window.jwplayer("player");
      if(!player || typeof player.setup!=="function") return false;
      player.setup({
        file:file,
        width:"100%",
        height:"100%",
        controls:true,
        autostart:false,
        mute:false,
        stretching:"uniform"
      });
      window.__valencePlayerConfigured=true;
      return true;
    }catch(e){
      return false;
    }
  }
  function providerToken(){
    try{
      var scripts=document.scripts || [];
      for(var i=0;i<scripts.length;i++){
        var match=String(scripts[i].textContent||"").match(/window\\['ZpQw9XkLmN8c3vR3'\\]\\s*=\\s*'([^']+)'/);
        if(match) return match[1];
      }
    }catch(e){}
    return "";
  }
  function sleep(ms){
    return new Promise(function(resolve){ setTimeout(resolve,ms); });
  }
  function schedule(){
    if(attempts++<80) setTimeout(start,250);
  }
  async function tryCandidate(candidate){
    Promise.resolve(window.setStream(candidate)).catch(function(error){
      window.__valenceResolverError=String(error||"");
    });
    for(var i=0;i<32 && !setupResolvedPlayer();i++){
      await sleep(250);
    }
    if(playerConfigured()){
      window.__valencePlayerConfigured=true;
      return true;
    }
    return false;
  }
  async function start(){
    if(window.__valencePlayerStarted) return;
    if(!hasPlayer() || typeof window.setStream!=="function") return schedule();
    window.__valencePlayerStarted=true;
    try{
      var candidates=[];
      candidates.push(SOURCE+"/"+SLUG+"/"+CHANNEL);
      candidates.push("/embed/"+SOURCE+"/"+SLUG+"/"+CHANNEL);
      var token=providerToken();
      if(token) candidates.push(token);
      for(var i=0;i<candidates.length;i++){
        if(await tryCandidate(candidates[i])) return;
      }
      throw new Error(window.__valenceResolverError || "no playable media resolved");
    }catch(e){
      window.__valenceResolverError=String(e||"");
      window.__valencePlayerStarted=false;
      if(attempts<80) schedule();
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",start,{once:true});
  }else{
    start();
  }
})();</script>`;
  }

  return `<script>(function(){
  "use strict";
  var SOURCE=${JSON.stringify(decodeURIComponent(source))};
  var SLUG=${JSON.stringify(decodeURIComponent(slug))};
  var CHANNEL=${JSON.stringify(decodeURIComponent(channel))};
  var attempts=0;

  function hasPlayer(){
    try{
      return typeof window.jwplayer==="function" && !!document.getElementById("player");
    }catch(e){ return false; }
  }
  function playerConfigured(){
    try{
      if(document.querySelector("video")) return true;
      var player=window.jwplayer("player");
      var config=player && player.getConfig ? player.getConfig() : null;
      if(config && (config.file || config.playlist)) return true;
    }catch(e){}
    return false;
  }
  function setupResolvedPlayer(){
    try{
      if(playerConfigured()) return true;
      var urls=window.__valenceMediaUrls || [];
      var file=window.__valenceMediaUrl || urls[0];
      if(!file || typeof window.jwplayer!=="function") return false;
      var player=window.jwplayer("player");
      if(!player || typeof player.setup!=="function") return false;
      player.setup({
        file:file,
        width:"100%",
        height:"100%",
        controls:true,
        autostart:false,
        mute:false,
        stretching:"uniform"
      });
      window.__valencePlayerConfigured=true;
      return true;
    }catch(e){
      return false;
    }
  }
  function sleep(ms){
    return new Promise(function(resolve){ setTimeout(resolve,ms); });
  }
  function schedule(){
    if(attempts++<80) setTimeout(start,250);
  }
  async function start(){
    if(window.__valencePlayerStarted) return;
    if(!hasPlayer()) return schedule();
    window.__valencePlayerStarted=true;
    try{
      var module=await import("/js/wasm/lock.js");
      await module.default();
      var resolver=module.set_stream_jw(SOURCE,SLUG,CHANNEL).catch(function(error){
        window.__valenceResolverError=String(error||"");
      });
      for(var i=0;i<80 && !setupResolvedPlayer();i++){
        await sleep(250);
      }
      if(!playerConfigured()) await resolver;
      for(var j=0;j<20 && !setupResolvedPlayer();j++){
        await sleep(250);
      }
      if(!playerConfigured()) throw new Error("no playable media resolved");
    }catch(e){
      window.__valencePlayerStarted=false;
      if(attempts<80) schedule();
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",start,{once:true});
  }else{
    start();
  }
})();</script>`;
}

function contentSecurityPolicy(appOrigin: string): string {
  const self = "'self'";
  const inline = "'unsafe-inline'";
  const evalToken = "'unsafe-eval'";
  const embedHosts = "https://embed.st https://embedindia.st https://embed.streamapi.cc";
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
  if (!raw) return new NextResponse("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }

  if (!isEmbedUrl(target)) {
    return new NextResponse("host not allowed", { status: 403 });
  }
  if (isBlockedUrl(target)) {
    return new NextResponse(null, {
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

    upstream = await fetch(target.href, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return new NextResponse("upstream fetch failed", { status: 502 });
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
  headers.set("access-control-allow-origin", "*");
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
