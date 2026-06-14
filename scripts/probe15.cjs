// Last lever: does the embed.st (Clappr) player accept postMessage control? If we can drive
// play/pause/volume via postMessage, we can block ALL clicks (no ads) and control via our own UI.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

async function vstate(page){
  for (const f of page.frames()){
    try { const v = await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),muted:v.muted,vol:v.volume,w:v.videoWidth}:null}); if(v&&v.w>200) return {...v,host:host(f.url())}; } catch {}
  }
  return null;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)) || streams[0].url;
  console.log("testing postMessage control on:", url);

  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:760} });
  const page = await ctx.newPage();
  ctx.on("page", async p=>{ try{await p.close()}catch{} }); // swallow ad popups
  await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe id=f
     allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
     src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`,{waitUntil:"domcontentloaded"});
  await sleep(5000);
  await page.mouse.click(640,380); await sleep(4000); // start playback
  let st = await vstate(page);
  console.log("initial video:", JSON.stringify(st));
  if (!st){ console.log("no video to control; abort"); await browser.close(); return; }

  // battery of postMessage command shapes covering common player APIs
  const cmds = [
    {method:"pause"}, {method:"play"},
    {event:"command",func:"pauseVideo",args:[]}, {event:"command",func:"playVideo",args:[]},
    {api:"pause"}, {api:"play"}, {type:"pause"}, {type:"play"},
    {command:"pause"}, {command:"play"}, {action:"pause"}, {action:"play"},
    {clappr:"pause"}, "pause","play", {method:"setVolume",value:0},{method:"mute"},{method:"unmute"},
    {jwplayer:"pause"},{do:"pause"},{message:"pause"},
  ];
  const send = (msg) => page.evaluate((m)=>{ const f=document.getElementById('f'); f.contentWindow.postMessage(m,"*"); }, msg);

  for (const c of cmds){
    const before = await vstate(page);
    await send(c); await sleep(1200);
    const after = await vstate(page);
    const changed = before && after && (before.paused!==after.paused || Math.abs((before.vol||0)-(after.vol||0))>0.05 || before.muted!==after.muted);
    if (changed) console.log(`  >>> RESPONDED to ${JSON.stringify(c)}: paused ${before.paused}->${after.paused} vol ${before.vol}->${after.vol} muted ${before.muted}->${after.muted}`);
  }
  console.log("final video:", JSON.stringify(await vstate(page)));
  console.log("(no '>>> RESPONDED' lines above = player ignores postMessage control)");
  await browser.close();
  console.log("PROBE15 DONE");
})().catch((e)=>{console.error("PROBE15 ERROR",e);process.exit(1)});
