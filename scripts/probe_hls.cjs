// Front 1 (clean source): capture the actual HLS the embed loads, and test whether it's playable
// from OUR origin (CORS) — which would let us play it in our own ad-free <video>+hls.js. Also note
// how the m3u8 relates to the stream id (derivable client-side?).
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u));
  console.log("embed:", url, "\n");

  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  ctx.on("page", async p=>{ if(p!==page){try{await p.close()}catch{}} });
  const m3u8s = []; const responses = {};
  page.on("request", (r)=>{ const u=r.url(); if(/\.m3u8(\?|$)/i.test(u)) m3u8s.push(u); });
  page.on("response", async (r)=>{ const u=r.url(); if(/\.m3u8(\?|$)/i.test(u)){ try{ responses[u]={status:r.status(), acao:r.headers()["access-control-allow-origin"]||"(none)", ct:r.headers()["content-type"]}; }catch{} } });

  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(5000);
  for (let i=0;i<4;i++){ await page.mouse.click(640,360); await sleep(2500); } // start playback

  await sleep(3000);
  const uniq = [...new Set(m3u8s)];
  console.log("captured", uniq.length, "m3u8 URL(s):");
  for (const u of uniq.slice(0,6)){ const r=responses[u]||{}; console.log(`  ${u.slice(0,110)}`); console.log(`     host=${host(u)} status=${r.status} ACAO=${r.acao} ct=${r.ct}`); }

  // CORS test: can OUR localhost origin fetch the (first playlist) m3u8?
  const target = uniq.find(u=>!/\.ts/.test(u)) || uniq[0];
  if (target){
    const cors = await page.evaluate(async (u)=>{ try{ const r=await fetch(u,{mode:'cors'}); const t=await r.text(); return {ok:r.ok, status:r.status, len:t.length, head:t.slice(0,60)}; }catch(e){ return {err:String(e).slice(0,80)}; } }, target);
    console.log("\nCORS fetch from localhost origin ->", JSON.stringify(cors));
    console.log(cors.ok ? "  ✅ m3u8 is CORS-readable from our origin (playable in our own player)" : "  ❌ blocked (CORS/token) — can't fetch from our origin");
  } else {
    console.log("\nno m3u8 captured (player may use a different transport)");
  }
  await browser.close();
  console.log("\nPROBE_HLS DONE");
})().catch((e)=>{console.error("PROBE_HLS ERROR",e);process.exit(1)});
