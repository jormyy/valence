// Verify the native JW control bar responds through the exposed bottom strip while the ad-guard is
// armed: start the video, find the real play/mute/fullscreen buttons, click them, confirm state
// changes with ZERO popups.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }
async function jwBtn(page, label){
  for (const f of page.frames()){
    if (!/embed\.st|streamapi|embedindia/.test(host(f.url()))) continue;
    try { const r=await f.evaluate((lab)=>{ const el=[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===lab).map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height,w:r.width};}).filter(o=>o.w>3).sort((a,b)=>b.y-a.y)[0]; return el||null; }, label); if(r) return r; } catch{}
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".player-iframe",{timeout:20000});
  const box = await (await page.$(".player")).boundingBox();
  const at=(fx,fy)=>({x:box.x+box.width*fx,y:box.y+box.height*fy});

  // start: guard off, tap centre, guard on
  await page.click(".guard-toggle"); await sleep(300);
  for (let i=0;i<5 && !((await vstate(page))||{}).w;i++){ await page.mouse.click(at(0.5,0.5).x,at(0.5,0.5).y); await sleep(2500); }
  let v=await vstate(page); console.log("started:", v&&v.w>0?`YES (w${v.w})`:"no");
  await page.click(".guard-toggle"); await sleep(400); // re-arm guard
  console.log("guard re-armed:", !!(await page.$(".ad-guard")));

  // now test native controls through the exposed strip (guard ON)
  // band uncovered at bottom = max(52px, 11%): exposed if button's pageY is within that of the box bottom
  const bandPx = Math.max(52, box.height*0.11);
  const tests = [["Pause","paused"],["Play","paused"],["Mute button","muted"]];
  for (const [label,prop] of tests){
    // reveal controls by moving inside the exposed strip (page coords near bottom of the player)
    for (const fx of [0.5,0.3,0.6]) { await page.mouse.move(box.x+box.width*fx, box.y+box.height-10); await sleep(350); }
    const btn = await jwBtn(page, label);
    if (!btn){ console.log(`  ${label.padEnd(12)}: not found`); continue; }
    // btn.{x,y} are FRAME-relative; the iframe fills .player at (box.x, box.y) -> page coords:
    const px = box.x + btn.x, py = box.y + btn.y;
    const fromBottom = (box.y + box.height) - py;
    const exposed = fromBottom <= bandPx;
    const p0=popups; const before=await vstate(page);
    await page.mouse.click(px, py); await sleep(1600);
    const after=await vstate(page);
    const changed = before&&after && before[prop]!==after[prop];
    console.log(`  ${label.padEnd(12)} pageY=${Math.round(py)} (${Math.round(fromBottom)}px from bottom, band=${Math.round(bandPx)}px, exposed:${exposed}) -> ${prop} ${before&&before[prop]}→${after&&after[prop]} ${changed?"RESPONDED ✅":"no"} popups:${popups-p0}`);
  }
  console.log("\ntotal popups during native-control test:", popups, "(start excluded? no — includes start)");
  await browser.close();
  console.log("VERIFY2 DONE");
})().catch((e)=>{console.error("VERIFY2 ERROR",e);process.exit(1)});
