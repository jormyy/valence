import { EMBED_HOSTS, MEDIA_HOST_RULES, PLAYER_SCRIPT_HOSTS } from "@/lib/streams/providers";
import { BLOCKED_HOST, BLOCKED_URL } from "@/lib/embed-blocklist";

const GENERATED_MODULE_IMPORT = /await\s+import\(([^;\n]{1,512})\);return/g;

// Injected as the first <script> in every proxied embed document. Runs in the
// untrusted provider page context to re-route network/DOM access through the
// app proxy, strip ads/anti-debug behavior, and harden iframes.
function normalizedHash(target: URL): string {
  if (!target.hash) return "";
  try {
    return `#${decodeURIComponent(target.hash.slice(1))}`;
  } catch {
    return target.hash;
  }
}

export function playerAssetOrigin(target: URL): string | null {
  const hostname = `assets.${target.hostname}`;
  return PLAYER_SCRIPT_HOSTS.has(hostname) ? `https://${hostname}` : null;
}

export function rewritePlayerAssetOrigin(source: string, target: URL): string {
  const assetOrigin = playerAssetOrigin(target);
  if (!assetOrigin) return source;

  return source.replace(
    /location\.protocol\s*\+\s*(["'])\/\/assets\.\1\s*\+\s*location\.host/g,
    JSON.stringify(assetOrigin),
  );
}

export function rewriteGeneratedModuleImports(source: string): string {
  return source.replace(
    GENERATED_MODULE_IMPORT,
    (_match, expression: string) =>
      `await import(window.__valenceModuleUrl(${expression}));return`,
  );
}

export function rewriteGeneratedModuleUrl(input: string, appOrigin: string): string {
  const pathIndex = input.indexOf("/js/wasm/");
  if (pathIndex < 0 || !/^https?:\/\/assets\./i.test(input)) return input;
  return `${appOrigin}/api/wasm/${input.slice(pathIndex + "/js/wasm/".length)}`;
}

export function shim(
  appOrigin: string,
  target: URL,
  parentTarget?: string,
  messageOrigin = appOrigin,
): string {
  return `<script>(function(){
  "use strict";
  var EMBED_HOSTS=${JSON.stringify(EMBED_HOSTS.map((rule) => rule.hostname))};
  var MEDIA_RULES=${JSON.stringify(MEDIA_HOST_RULES)};
  var PLAYER_SCRIPT_HOSTS=${JSON.stringify([...PLAYER_SCRIPT_HOSTS])};
  var BLOCKED_HOST=${BLOCKED_HOST.toString()};
  var BLOCKED_URL=${BLOCKED_URL.toString()};
  var PROXY=${JSON.stringify(`${appOrigin}/api/embed?r=${encodeURIComponent(target.origin)}&p=${encodeURIComponent(parentTarget ?? target.href)}${messageOrigin === appOrigin ? "" : `&a=${encodeURIComponent(messageOrigin)}`}&u=`)};
  var MEDIA_PROXY=${JSON.stringify(`${appOrigin}/api/media?r=${encodeURIComponent(target.origin)}&u=`)};
  var APP_ORIGIN=${JSON.stringify(appOrigin)};
  var MESSAGE_ORIGIN=${JSON.stringify(messageOrigin)};
  var EMBED_ORIGIN=${JSON.stringify(target.origin)};
  var EMBED_TARGET=${JSON.stringify(target.href)};
  var PLAYER_TARGET=${JSON.stringify(parentTarget ?? target.href)};
  var EMBED_HASH=${JSON.stringify(normalizedHash(target))};
  var PLAYER_ASSET_ORIGIN=${JSON.stringify(playerAssetOrigin(target))};
  var PROVIDER_GOAT="";

  // Nested provider frames remain opaque-origin sandboxes. Their native
  // storage getters throw, so player initialization gets isolated memory-only
  // storage when it cannot use the browser implementation.
  function installMemoryStorage(name){
    try{ void window[name]; return; }catch(e){}
    try{
      var values=Object.create(null);
      var storage={
        getItem:function(key){ key=String(key); return Object.prototype.hasOwnProperty.call(values,key) ? values[key] : null; },
        setItem:function(key,value){ values[String(key)]=String(value); },
        removeItem:function(key){ delete values[String(key)]; },
        clear:function(){ values=Object.create(null); },
        key:function(index){ var keys=Object.keys(values); return keys[index]===undefined ? null : keys[index]; }
      };
      Object.defineProperty(storage,"length",{enumerable:true,get:function(){ return Object.keys(values).length; }});
      Object.defineProperty(window,name,{configurable:true,value:storage});
    }catch(e){}
  }
  installMemoryStorage("localStorage");
  installMemoryStorage("sessionStorage");

  function valenceModuleUrl(input){
    try{
      if(!PLAYER_ASSET_ORIGIN) return input;
      var raw=String(input);
      var wasmPathIndex=raw.indexOf("/js/wasm/");
      if(wasmPathIndex!==-1 && /^https?:\\/\\/assets\\./i.test(raw)){
        return APP_ORIGIN+"/api/wasm/"+raw.slice(wasmPathIndex+"/js/wasm/".length);
      }
      var candidate=new URL(input,EMBED_TARGET);
      if(candidate.hostname.indexOf("assets.")!==0 || candidate.pathname.indexOf("/js/wasm/")!==0) return input;
      return APP_ORIGIN+"/api/wasm/"+candidate.pathname.slice("/js/wasm/".length)+candidate.search;
    }catch(e){ return input; }
  }
  try{
    Object.defineProperty(window,"__valenceModuleUrl",{
      configurable:false,
      writable:false,
      value:valenceModuleUrl
    });
  }catch(e){}

  if(EMBED_ORIGIN==="https://embedindia.st"){
    try{
      var setStreamNative;
      var setStreamPromises=Object.create(null);
      var setStreamOnce=function(){
        var key=Array.prototype.join.call(arguments,"/");
        if(key==="embed") return Promise.resolve();
        if(setStreamPromises[key]) return setStreamPromises[key];
        if(typeof setStreamNative!=="function") return Promise.reject(new Error("stream resolver unavailable"));
        window.__valenceResolverActive=true;
        var result=setStreamNative.apply(this,arguments);
        setStreamPromises[key]=result;
        if(result && typeof result.catch==="function"){
          result.catch(function(){ delete setStreamPromises[key]; });
        }
        return result;
      };
      Object.defineProperty(window,"setStream",{
        configurable:true,
        enumerable:true,
        get:function(){ return typeof setStreamNative==="function" ? setStreamOnce : undefined; },
        set:function(value){ setStreamNative=typeof value==="function" ? value : undefined; }
      });
    }catch(e){}

    try{
      var jwplayerNative;
      function rewritePlayerFile(file){
        return typeof file==="string" ? proxify(file) : file;
      }
      function rewritePlayerItem(item){
        if(!item || typeof item!=="object") return item;
        var next=Object.assign({},item);
        if(next.file) next.file=rewritePlayerFile(next.file);
        if(Array.isArray(next.sources)){
          next.sources=next.sources.map(function(source){ return rewritePlayerItem(source); });
        }
        return next;
      }
      function rewritePlayerConfig(config){
        if(!config || typeof config!=="object") return config;
        var next=rewritePlayerItem(config);
        if(typeof next.base==="string"){
          var jwpPath=next.base.indexOf("/jwp/");
          if(jwpPath!==-1) next.base=APP_ORIGIN+next.base.slice(jwpPath);
        }
        if(Array.isArray(next.playlist)){
          next.playlist=next.playlist.map(function(item){ return rewritePlayerItem(item); });
        }
        return next;
      }
      function patchPlayer(player){
        if(!player || player.__valenceSetupPatched || typeof player.setup!=="function") return player;
        var setupNative=player.setup;
        player.setup=function(config){ return setupNative.call(this,rewritePlayerConfig(config)); };
        player.__valenceSetupPatched=true;
        return player;
      }
      var jwplayerFacade=new Proxy(function(){},{
        apply:function(target,thisArg,args){
          return patchPlayer(jwplayerNative.apply(thisArg,args));
        },
        get:function(target,property){
          return jwplayerNative ? jwplayerNative[property] : undefined;
        },
        set:function(target,property,value){
          if(jwplayerNative) jwplayerNative[property]=value;
          return true;
        }
      });
      Object.defineProperty(window,"jwplayer",{
        configurable:true,
        enumerable:true,
        get:function(){ return typeof jwplayerNative==="function" ? jwplayerFacade : undefined; },
        set:function(value){ jwplayerNative=typeof value==="function" ? value : undefined; }
      });
    }catch(e){}
  }

  try{
    var NativeFunction=window.Function;
    var generatedDebugger=/debugger|while\\s*\\(\\s*true\\s*\\)|while\\\\x20\\(true\\)|(?:debu|debug)[\\s\\S]{0,80}gger/i;
    var SafeFunction=function(){
      var body="";
      try{ body=String(arguments[arguments.length-1]||""); }catch(e){}
      if(generatedDebugger.test(body)) return function(){};
      if(PLAYER_ASSET_ORIGIN){
        body=body.replace(new RegExp(${JSON.stringify(GENERATED_MODULE_IMPORT.source)},"g"),function(match,expression){
          return "await import(window.__valenceModuleUrl("+expression+"));return";
        });
        arguments[arguments.length-1]=body;
      }
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
    return !!u && (isEmbed(u) || isAppPlayerScript(u) || (u.protocol==="https:" && PLAYER_SCRIPT_HOSTS.indexOf(u.hostname)!==-1));
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
      window.parent.postMessage(message, MESSAGE_ORIGIN);
      if(window.top && window.top!==window.parent) window.top.postMessage(message, MESSAGE_ORIGIN);
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
    if(u.origin===location.origin && u.pathname.indexOf("/jwp/")===0) return input;
    if(u.origin===location.origin && u.pathname.indexOf("/js/")===0){
      return PROXY+encodeURIComponent(EMBED_ORIGIN+u.pathname+u.search+u.hash);
    }
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
