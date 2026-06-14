// INNOVATION TEST: does referrerPolicy="no-referrer" suppress the pop-ads? (setContent w/ empty
// referrer never popped; real localhost referrer floods.) A/B on real-http top: default vs
// no-referrer. Measure popups + whether video still plays. Also try a fake referrer via meta.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth}:null}); if(v&&v.w>200) return v; } catch{} } return null; }

async function trial(ctx, url, refpol){
  const page = await ctx.newPage();
  let popups=0; const ph=(p)=>{ if(p===page)return; popups++; p.close().catch(()=>{}); };
  ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate(({u,rp})=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; if(rp) f.referrerPolicy=rp; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, {u:url,rp:refpol});
  await sleep(6000);
  const box={x:0,y:0,w:1280,h:720};
  const pts=[[0.5,0.45],[0.5,0.45],[0.3,0.3],[0.7,0.6],[0.5,0.5],[0.4,0.4],[0.6,0.5],[0.5,0.45]];
  const v0=await vstate(page);
  for (const [fx,fy] of pts){ await page.mouse.click(1280*fx,720*fy); await sleep(1300); }
  await sleep(2000);
  const v=await vstate(page);
  ctx.off("page", ph);
  await page.close();
  return { refpol: refpol||"(default)", popups, play: v?`${v.w}x${v.h}`:(v0?"started-then?":"no") };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls = [ streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)), streams.map(x=>x.url).find(u=>/streamapi/.test(u)) ].filter(Boolean);
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of urls){
    console.log(`\n#### ${host(url)} ${url.slice(-10)}`);
    for (const rp of [null, "no-referrer", "origin"]){
      try { const r = await trial(ctx, url, rp); console.log(`   referrerPolicy=${(r.refpol).padEnd(12)} -> popups:${String(r.popups).padStart(2)}  play:${r.play}`); }
      catch(e){ console.log(`   referrerPolicy=${rp} ERR ${String(e).slice(0,50)}`); }
    }
  }
  await browser.close();
  console.log("\nPROBE22 DONE");
})().catch((e)=>{console.error("PROBE22 ERROR",e);process.exit(1)});
