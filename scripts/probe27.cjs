// BREAKTHROUGH TEST: can we START + control entirely via JW's native control bar (bottom safe
// zone), never clicking the ad-catcher center? Load embed, do NOT click center; find JW's play
// button, click it; measure start + pops. Then test mute/fullscreen in the bar too.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs=require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const OUT="/tmp/jwbar"; fs.mkdirSync(OUT,{recursive:true});
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }
// find a control's center coords (in the iframe = full viewport) by aria-label
async function ctrlXY(page, label){
  for (const f of page.frames()){
    if (!/embed\.st|streamapi|embedindia/.test(host(f.url()))) continue;
    try { const xy=await f.evaluate((lab)=>{ const el=[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===lab); if(!el)return null; const r=el.getBoundingClientRect(); if(r.width<3)return null; return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; }, label); if(xy) return xy; } catch{}
  }
  return null;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls=[ streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u))||streams.map(x=>x.url).find(u=>/embed\.st/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u)) ].filter(Boolean);
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
    // reveal control bar via mousemove along the bottom (no click)
    for (const x of [0.3,0.5,0.7,0.2,0.5]) { await page.mouse.move(W*x, H*0.95); await sleep(350); }
    let play = await ctrlXY(page, "Play");
    console.log("   JW Play button found at:", JSON.stringify(play), "| popups so far:", popups);
    const v0 = await vstate(page);
    if (play){
      const p0=popups;
      await page.mouse.click(play.x, play.y); await sleep(3500);
      let v=await vstate(page);
      // may need a second nudge; re-reveal + click again if still not playing
      if (!(v&&v.rs>=2)){ for (const x of [0.4,0.6]){await page.mouse.move(W*x,H*0.95);await sleep(300);} const p2=await ctrlXY(page,"Play"); if(p2){await page.mouse.click(p2.x,p2.y); await sleep(3000); v=await vstate(page);} }
      console.log(`   clicked JW Play -> started:${v&&v.rs>=2?"YES":"no"} (rs${v&&v.rs} w${v&&v.w} t${v&&v.t}) popupsFromBar:${popups-p0} ${v&&v.rs>=2&&popups-p0===0?"  <<< ZERO-POP START VIA NATIVE BAR!":""}`);
      // test mute + fullscreen buttons (safe zone)
      for (const lab of ["Mute button","Fullscreen"]){
        for (const x of [0.4,0.6]){await page.mouse.move(W*x,H*0.95);await sleep(250);}
        const c=await ctrlXY(page,lab); const q0=popups; let before=await vstate(page);
        if(c){ await page.mouse.click(c.x,c.y); await sleep(1500); const after=await vstate(page); console.log(`   ${lab.padEnd(12)} @${c.x},${c.y} -> muted ${before&&before.muted}->${after&&after.muted} popups:${popups-q0}`);} else console.log(`   ${lab} not found`);
      }
    }
    await page.screenshot({ path:`${OUT}/${host(url)}.png` });
    ctx.off("page", ph); await page.close();
  }
  await browser.close();
  console.log(`\nshots ${OUT}\nPROBE27 DONE`);
})().catch((e)=>{console.error("PROBE27 ERROR",e);process.exit(1)});
