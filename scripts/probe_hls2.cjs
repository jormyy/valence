// Trace where the tokenized m3u8 URL comes from: capture every response in the embed's frame tree,
// find the JSON/API that yields the lb*.strmd.st URL, and test whether that source-API + the m3u8
// are callable/readable from OUR origin (with various referrer policies). Determines if a clean
// own-player path exists.
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

  // capture responses whose BODY contains the strmd token URL (the source API)
  const apiHits = [];
  page.on("response", async (r)=>{
    const u=r.url(); const ct=(r.headers()["content-type"]||"");
    if (/embed\.st|strmd|streamapi|\.json|api/i.test(u) && !/\.(js|css|png|jpg|svg|woff|m3u8|ts)(\?|$)/i.test(u)){
      try { const t=await r.text(); if (/strmd\.st|\.m3u8|secure\//i.test(t)) apiHits.push({url:u, status:r.status(), ct, acao:r.headers()["access-control-allow-origin"]||"(none)", snippet:t.replace(/\s+/g,"").slice(0,160)}); } catch {}
    }
  });

  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(5000);
  for (let i=0;i<4;i++){ await page.mouse.click(640,360); await sleep(2500); }
  await sleep(2000);

  console.log("API responses that contain the stream URL/token (" + apiHits.length + "):");
  for (const h of [...new Map(apiHits.map(x=>[x.url,x])).values()].slice(0,8)){
    console.log(`  [${host(h.url)}] ${h.url.slice(0,90)}`);
    console.log(`     status=${h.status} ct=${h.ct} ACAO=${h.acao}`);
    console.log(`     body: ${h.snippet}`);
  }
  // try to call the source API from OUR origin (the first embed.st api hit)
  const apiUrl = (apiHits.find(h=>/embed\.st|streamapi/.test(host(h.url)))||apiHits[0]||{}).url;
  if (apiUrl){
    const r = await page.evaluate(async (u)=>{ try{ const res=await fetch(u,{mode:'cors'}); const t=await res.text(); return {ok:res.ok,status:res.status,len:t.length,head:t.slice(0,80)};}catch(e){return {err:String(e).slice(0,80)};} }, apiUrl);
    console.log(`\ncall source-API from our origin (${host(apiUrl)}): ${JSON.stringify(r)}`);
  }
  await browser.close();
  console.log("\nPROBE_HLS2 DONE");
})().catch((e)=>{console.error("PROBE_HLS2 ERROR",e);process.exit(1)});
