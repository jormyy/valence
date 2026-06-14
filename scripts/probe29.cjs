// Last lead: can a URL param make the embed AUTOPLAY (skipping the center ad-gate)? If it
// autoplays, shield-body + native-bottom-bar is a complete zero-pop solution. Try common params.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const base = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u));
  const variants = [
    base,
    base + (base.includes("?")?"&":"?") + "autoplay=1",
    base + (base.includes("?")?"&":"?") + "autostart=true",
    base + (base.includes("?")?"&":"?") + "auto=1&muted=1",
    base + (base.includes("?")?"&":"?") + "mute=1&autoplay=1",
  ];
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of variants){
    const page = await ctx.newPage(); let popups=0; const ph=(p)=>{ if(p===page)return; popups++; p.close().catch(()=>{}); }; ctx.on("page", ph);
    await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
    await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);
    // wait WITHOUT any click; check autoplay
    await sleep(11000);
    const v = await vstate(page);
    const auto = v && (v.rs>=2 || v.t>0.3 || v.w>200);
    console.log(`${(url.replace(base,'BASE')).slice(0,40).padEnd(40)} -> autoplay:${auto?"YES":"no "} (rs${v&&v.rs} t${v&&v.t} w${v&&v.w}) popups(no-click):${popups}`);
    ctx.off("page", ph); await page.close();
  }
  await browser.close();
  console.log("PROBE29 DONE");
})().catch((e)=>{console.error("PROBE29 ERROR",e);process.exit(1)});
