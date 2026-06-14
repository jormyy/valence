// Untested start-triggers that AVOID tapping the ad-catcher: (1) requestFullscreen on the iframe
// (our gesture, our page) — does JW auto-play on fullscreenchange? (2) iframe.contentWindow.focus().
// If the video starts (rs>=2) with ZERO pops, we have an ad-free start.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }

async function trial(ctx, url, how){
  const page = await ctx.newPage(); let popups=0; const ph=(p)=>{ if(p===page)return; popups++; p.close().catch(()=>{}); }; ctx.on("page", ph);
  for (let a=0;a<3;a++){ try{ await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"}); break; }catch(e){ await sleep(800); } }
  await page.evaluate((u)=>{
    const b=document.createElement('button'); b.id='__fs'; b.textContent='START'; b.style.cssText='position:fixed;z-index:99999;top:0;left:0;width:100vw;height:40px;font-size:18px';
    b.onclick=()=>{ const f=document.getElementById('__t'); if(window.__how==='fs'){ (f.requestFullscreen?f.requestFullscreen():f.webkitRequestFullscreen&&f.webkitRequestFullscreen()); } else if(window.__how==='focus'){ try{f.contentWindow.focus()}catch(e){} f.focus(); } };
    document.body.appendChild(b);
    const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;top:40px;left:0;right:0;bottom:0;width:100vw;border:0;z-index:9;background:#000'; document.body.appendChild(f);
  }, url);
  await page.evaluate((h)=>{ window.__how=h; }, how);
  await sleep(6000);
  const p0=popups;
  // user gesture -> triggers the chosen start mechanism (NOT a body tap)
  await page.click('#__fs'); await sleep(4000);
  let v=await vstate(page);
  if(!(v&&v.rs>=2)){ await page.click('#__fs'); await sleep(3500); v=await vstate(page); }  // try twice
  await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen().catch(()=>{}));
  ctx.off("page", ph); await page.close();
  return { how, started: !!(v&&v.rs>=2), rs:v&&v.rs, w:v&&v.w, muted:v&&v.muted, pops:popups-p0 };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls=[ streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u)) ].filter(Boolean);
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of urls){
    console.log("\n####", url.slice(0,60));
    for (const how of ["fs","focus"]){
      try { const r=await trial(ctx, url, how); console.log(`   start via ${how.padEnd(6)} -> started:${r.started?"YES":"no"} (rs${r.rs} w${r.w} muted=${r.muted}) pops:${r.pops} ${r.started&&r.pops===0?"  <<< AD-FREE START!":""}`); }
      catch(e){ console.log(`   ${how} ERR`, String(e).slice(0,50)); }
    }
  }
  await browser.close(); console.log("\nPROBE_START DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
