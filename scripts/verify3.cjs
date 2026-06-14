// Final responsiveness proof: with the guard ARMED, the embed's native controls in the exposed
// bottom strip respond. Start the video, then (keeping JW's auto-hiding bar alive) click play/pause
// and the embed's fullscreen — confirm state changes with ZERO pops.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }
async function jwBtn(page, labels){ for (const f of page.frames()){ if(!/embed\.st|streamapi|embedindia/.test(host(f.url())))continue; try{ const r=await f.evaluate((labs)=>{ let best=null; for(const e of document.querySelectorAll('[aria-label]')){ if(!labs.includes(e.getAttribute('aria-label')))continue; const r=e.getBoundingClientRect(); if(r.width<3)continue; const cy=r.y+r.height/2; if(cy<window.innerHeight*0.7)continue; if(!best||cy>best.cy)best={x:r.x+r.width/2,y:r.y+r.height/2,cy};} return best;},labels); if(r)return r;}catch{} } return null; }

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage(); let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"}); await page.waitForSelector(".player-iframe",{timeout:20000});
  const box = await (await page.$(".player")).boundingBox();
  const P=(bx,by)=>({x:box.x+bx, y:box.y+by});  // frame->page

  // start
  await page.click(".guard-toggle"); await sleep(300);
  for(let i=0;i<5 && !((await vstate(page))||{}).w;i++){ await page.mouse.click(box.x+box.width/2, box.y+box.height/2); await sleep(2500); }
  let v=await vstate(page); console.log("started:", v&&v.w>0?`YES w${v.w}`:"NO");
  await page.click(".guard-toggle"); await sleep(400);          // re-arm guard
  console.log("guard armed:", !!(await page.$(".ad-guard")));

  async function keepAliveClick(labels){
    // hover the exposed strip, grab button, click immediately (within JW's visible window)
    await page.mouse.move(box.x+box.width*0.5, box.y+box.height-6); await sleep(150);
    await page.mouse.move(box.x+box.width*0.45, box.y+box.height-6); await sleep(150);
    const b = await jwBtn(page, labels); if(!b) return null;
    const pt=P(b.x,b.y); await page.mouse.move(pt.x, pt.y); await sleep(80); await page.mouse.click(pt.x, pt.y);
    return pt;
  }

  // (1) play/pause toggle
  let p0=popups; let before=await vstate(page);
  const pt1=await keepAliveClick(["Pause","Play"]); await sleep(1600); let after=await vstate(page);
  console.log(`native play/pause @${pt1?Math.round(pt1.y):'?'} -> paused ${before&&before.paused}→${after&&after.paused} ${before&&after&&before.paused!==after.paused?"RESPONDED ✅":"(no toggle)"} pops:${popups-p0}`);

  // (2) embed fullscreen -> parent sees the iframe become fullscreenElement
  p0=popups;
  const pt2=await keepAliveClick(["Fullscreen","Exit Fullscreen"]); await sleep(1500);
  const fsTag = await page.evaluate(()=>document.fullscreenElement?document.fullscreenElement.tagName:"none");
  console.log(`native fullscreen @${pt2?Math.round(pt2.y):'?'} -> document.fullscreenElement=${fsTag} ${fsTag==="IFRAME"?"RESPONDED ✅":""} pops:${popups-p0}`);
  if(fsTag==="IFRAME"){ await page.evaluate(()=>document.exitFullscreen().catch(()=>{})); }

  console.log(`\nTOTAL popups (incl. the start gate): ${popups}`);
  await browser.close(); console.log("VERIFY3 DONE");
})().catch((e)=>{console.error("VERIFY3 ERROR",e);process.exit(1)});
