import type { BootstrapStrategy } from "./streams/types";
import { bootstrapStrategyFor } from "./streams/providers";

function commonPlayerBootstrap(): string {
  return `
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
  }`;
}

function wasmLockBootstrap(): string {
  return `
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
  }`;
}

function wasmGasmBootstrap(): string {
  return `
  async function start(){
    if(window.__valencePlayerStarted) return;
    if(!hasPlayer()) return schedule();
    window.__valencePlayerStarted=true;
    try{
      for(var k=0;k<160 && typeof window.setStream!=="function";k++){
        await sleep(125);
      }
      if(typeof window.setStream!=="function"){
        throw new Error("stream resolver unavailable");
      }
      var providerResolverActive=window.__valenceResolverActive===true;
      var resolver=providerResolverActive ? null : window.setStream(SOURCE+"/"+SLUG+"/"+CHANNEL).catch(function(error){
        window.__valenceResolverError=String(error||"");
      });
      for(var i=0;i<80 && !setupResolvedPlayer();i++){
        await sleep(250);
      }
      if(!playerConfigured() && resolver) await resolver;
      for(var j=0;j<20 && !setupResolvedPlayer();j++){
        await sleep(250);
      }
      if(!playerConfigured()){
        if(providerResolverActive) window.__valenceResolverActive=false;
        throw new Error("no playable media resolved");
      }
    }catch(e){
      window.__valenceResolverError=String(e||"");
      window.__valencePlayerStarted=false;
      if(attempts<80) schedule();
    }
  }`;
}

function strategyBootstrap(strategy: BootstrapStrategy): string {
  switch (strategy) {
    case "wasm-lock":
      return wasmLockBootstrap();
    case "wasm-gasm":
      return wasmGasmBootstrap();
    case "none":
      return "";
  }
}

export function autoBootstrap(target: URL): string {
  const match = target.pathname.match(/^\/embed\/([^/]+)\/([^/]+)\/([^/?#]+)/);
  if (!match) return "";
  const strategy = bootstrapStrategyFor(target.hostname);
  if (!strategy || strategy === "none") return "";

  const [, source, slug, channel] = match;
  return `<script>(function(){
  "use strict";
  var SOURCE=${JSON.stringify(decodeURIComponent(source))};
  var SLUG=${JSON.stringify(decodeURIComponent(slug))};
  var CHANNEL=${JSON.stringify(decodeURIComponent(channel))};
  var attempts=0;
${commonPlayerBootstrap()}
${strategyBootstrap(strategy)}

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",start,{once:true});
  }else{
    start();
  }
})();</script>`;
}
