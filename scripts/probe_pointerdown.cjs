// Adcash pops on pointerdown. Test guards that ABSORB pointerdown but deliver the later gesture
// events to the iframe — so JW can start (on mouseup/click) while Adcash (pointerdown) never fires.
// Strategies vs control. Measure: does the video start? do pops fire?
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{rs:v.readyState,w:v.videoWidth}:null}); if(v) return v; } catch{} } return null; }

// strategies installed in the page over the iframe (#__t)
const STRATS = {
  control: ``, // no guard
  absorbPD_then_transparent: `
    const g=document.createElement('div'); g.id='__g'; g.style.cssText='position:fixed;inset:0;z-index:50';
    g.addEventListener('pointerdown',(e)=>{ e.preventDefault(); e.stopPropagation(); g.style.pointerEvents='none'; setTimeout(()=>{g.style.pointerEvents='auto';},800); }, true);
    document.body.appendChild(g);`,
  absorbPD_release_capture: `
    const g=document.createElement('div'); g.id='__g'; g.style.cssText='position:fixed;inset:0;z-index:50';
    g.addEventListener('pointerdown',(e)=>{ try{g.releasePointerCapture(e.pointerId)}catch(_){} e.preventDefault(); e.stopPropagation(); g.style.pointerEvents='none'; setTimeout(()=>{g.style.pointerEvents='auto';},800); }, true);
    document.body.appendChild(g);`,
};

async function trial(ctx, url, strat){
  const page = await ctx.newPage(); let pops=0; const ph=(p)=>{ if(p===page)return; pops++; p.close().catch(()=>{}); }; ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(6000);
  await page.evaluate(STRATS[strat]);
  const p0=pops;
  // a few taps to try to start
  for (let i=0;i<4;i++){ await page.mouse.click(640,360); await sleep(1800); const v=await vstate(page); if(v&&(v.rs>=2||v.w>200))break; }
  await sleep(2000);
  const v=await vstate(page);
  ctx.off("page", ph); await page.close();
  return { strat, started:!!(v&&(v.rs>=2||v.w>200)), rs:v&&v.rs, pops:pops-p0 };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u));
  console.log("embed:", url, "\n");
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const strat of Object.keys(STRATS)){
    try { const r=await trial(ctx, url, strat); console.log(`${strat.padEnd(28)} -> started:${r.started?"YES":"no"} (rs${r.rs}) pops:${r.pops} ${r.started&&r.pops===0?"  <<< AD-FREE TAP START!":""}`); }
    catch(e){ console.log(`${strat} ERR`, String(e).slice(0,50)); }
  }
  await browser.close(); console.log("\nPROBE_PD DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
