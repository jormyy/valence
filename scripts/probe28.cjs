// THE test: start the video by clicking JW's CONTROL-BAR play button (bottom-left, ad-free zone),
// NOT the center display button. If it starts with zero pops, the full solution exists.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }
// find the BOTTOM-most control matching any of the labels (the control-bar one, not center display)
async function barCtrl(page, labels){
  for (const f of page.frames()){
    if (!/embed\.st|streamapi|embedindia/.test(host(f.url()))) continue;
    try { const xy=await f.evaluate((labs)=>{ let best=null; for (const el of document.querySelectorAll('[aria-label]')){ const lab=el.getAttribute('aria-label'); if(!labs.includes(lab))continue; const r=el.getBoundingClientRect(); if(r.width<3||r.height<3)continue; const cy=r.y+r.height/2; if(cy < window.innerHeight*0.80) continue; /* must be in bottom strip */ if(!best||cy>best.cy) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),cy,lab}; } return best; }, labels); if(xy) return xy; } catch{}
  }
  return null;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls=[ streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u))||streams.map(x=>x.url).find(u=>/embed\.st/.test(u)), streams.map(x=>x.url).find(u=>/streamapi/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u)) ].filter(Boolean);
  const W=1280,H=720;
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of urls){
    const page = await ctx.newPage(); let popups=0; const ph=(p)=>{ if(p===page)return; popups++; p.close().catch(()=>{}); }; ctx.on("page", ph);
    await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
    await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.referrerPolicy='no-referrer'; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);
    await sleep(8000);
    console.log(`\n#### ${host(url)}`);
    // reveal bottom control bar with mousemoves (no click), then find bottom play button
    for (const x of [0.3,0.5,0.7,0.4,0.6]) { await page.mouse.move(W*x, H*0.96); await sleep(350); }
    let pb = await barCtrl(page, ["Play","Pause"]);
    console.log("   bottom-bar play/pause:", JSON.stringify(pb), "popupsSoFar:", popups);
    if (pb){
      const p0=popups;
      await page.mouse.click(pb.x, pb.y); await sleep(4000);
      let v = await vstate(page);
      if (!(v&&v.rs>=2)) { for (const x of [0.4,0.55,0.6]){await page.mouse.move(W*x,H*0.96);await sleep(300);} const pb2=await barCtrl(page,["Play","Pause"]); if(pb2){await page.mouse.click(pb2.x,pb2.y); await sleep(3500); v=await vstate(page);} }
      console.log(`   click bar-play -> started:${v&&v.rs>=2?"YES":"no"} (rs${v&&v.rs} w${v&&v.w} t${v&&v.t}) popupsFromBar:${popups-p0} ${v&&v.rs>=2&&popups-p0===0?"  <<<<< ZERO-POP START VIA NATIVE BAR!":""}`);
    } else {
      console.log("   no bottom-bar play button found before start");
    }
    ctx.off("page", ph); await page.close();
  }
  await browser.close();
  console.log("\nPROBE28 DONE");
})().catch((e)=>{console.error("PROBE28 ERROR",e);process.exit(1)});
