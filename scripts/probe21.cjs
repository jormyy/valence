// INNOVATION TEST: drive the cross-origin player via KEYBOARD (parent focuses the iframe; physical
// keys route into it natively). Ads listen for CLICKS, not keys — so keyboard control may be ad-free.
// Measure: does each key change video state? Does any key fire a popup?
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,muted:v.muted,vol:+(v.volume||0).toFixed(2),rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls = [
    streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u)) || streams.map(x=>x.url).find(u=>/embed\.st/.test(u)),
    streams.map(x=>x.url).find(u=>/streamapi/.test(u)),
    streams.map(x=>x.url).find(u=>/embedindia/.test(u)),
  ].filter(Boolean);
  const W=1280,H=720;
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});

  for (const url of urls){
    await page.evaluate((u)=>{ const o=document.getElementById('__t'); if(o)o.remove(); const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);
    await sleep(6500);
    console.log(`\n#### ${host(url)}`);
    // focus the iframe WITHOUT clicking it
    await page.evaluate(()=>{ const f=document.getElementById('__t'); f.focus(); try{f.contentWindow.focus()}catch(e){} });
    await sleep(500);
    const keys = ["Space","KeyK","Enter","KeyF","KeyM","ArrowUp","ArrowRight","KeyC"];
    let last = await vstate(page);
    console.log(`   focused. initial: ${JSON.stringify(last)} popups:${popups}`);
    for (const k of keys){
      const p0 = popups; const b = await vstate(page);
      // re-focus the iframe each time (focus may move), then press the key
      await page.evaluate(()=>{ const f=document.getElementById('__t'); f.focus(); try{f.contentWindow.focus()}catch(e){} });
      await page.keyboard.press(k); await sleep(1800);
      const a = await vstate(page);
      const changed = b&&a && (b.paused!==a.paused || Math.abs((b.vol||0)-(a.vol||0))>0.03 || b.muted!==a.muted || (a.t>b.t+0.5 && b.paused) || (b.rs<2&&a.rs>=2));
      console.log(`   key ${k.padEnd(10)} -> ${changed?"RESPONDED":"no-change"}  paused ${b&&b.paused}->${a&&a.paused} t ${b&&b.t}->${a&&a.t} vol ${b&&b.vol}->${a&&a.vol} muted ${b&&b.muted}->${a&&a.muted} rs${a&&a.rs} | popups:${popups-p0}`);
    }
  }
  await browser.close();
  console.log("\nPROBE21 DONE");
})().catch((e)=>{console.error("PROBE21 ERROR",e);process.exit(1)});
