// DECISIVE: can we START the video by clicking ONLY the bottom safe-zone (ad-catcher-free), with
// ZERO pops? If yes, the safe-zone shield is a complete solution. Compare bottom-only vs center.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

async function trial(ctx, url, label, pts){
  const page = await ctx.newPage();
  let popups=0; const ph=(p)=>{ if(p===page)return; popups++; p.close().catch(()=>{}); }; ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.referrerPolicy='no-referrer'; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);
  await sleep(6000);
  // click the given points repeatedly; check if video starts
  for (let r=0;r<4;r++){ for (const [fx,fy] of pts){ await page.mouse.click(1280*fx,720*fy); await sleep(1200);} const v=await vstate(page); if(v&&(v.rs>=2||v.w>200||v.t>0.3)) break; }
  await sleep(2500);
  const v=await vstate(page);
  ctx.off("page", ph); await page.close();
  const started = v&&(v.rs>=2||v.w>200||v.t>0.3);
  return { label, started, rs:v&&v.rs, w:v&&v.w, t:v&&v.t, popups };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls = [ streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)), streams.map(x=>x.url).find(u=>/streamapi/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u)) ].filter(Boolean);
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of urls){
    console.log(`\n#### ${host(url)}`);
    const bottomOnly = [[0.5,0.92],[0.4,0.94],[0.6,0.92],[0.5,0.95]];
    const centerOnly = [[0.5,0.5],[0.5,0.45]];
    const r1 = await trial(ctx, url, "BOTTOM-only", bottomOnly);
    console.log(`   BOTTOM-safe-zone clicks: started:${r1.started?"YES":"no"} (rs${r1.rs} w${r1.w} t${r1.t}) popups:${r1.popups} ${r1.started&&r1.popups===0?"  <<< ZERO-POP START!":""}`);
    const r2 = await trial(ctx, url, "CENTER", centerOnly);
    console.log(`   CENTER clicks:           started:${r2.started?"YES":"no"} (rs${r2.rs} w${r2.w} t${r2.t}) popups:${r2.popups}`);
  }
  await browser.close();
  console.log("\nPROBE25 DONE");
})().catch((e)=>{console.error("PROBE25 ERROR",e);process.exit(1)});
