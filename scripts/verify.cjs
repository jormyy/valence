// Verify the safe-zone ad-guard in the REAL app: (A) guard-on => center is the guard (absorbs) and
// aggressive body clicking yields ZERO popups; (B) bottom strip is the exposed iframe; (C) guard-off
// => tapping center starts the video (gate pop expected there); (D) guard-on + playing => the native
// bottom control bar still toggles play/pause with zero pops. Screenshots saved.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
const OUT = "/tmp/verify"; fs.mkdirSync(OUT, { recursive: true });
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".player-iframe",{timeout:20000});
  const matchup = await page.$eval(".watch-matchup",e=>e.textContent.trim()).catch(()=>"?");
  console.log("game:", matchup);

  const box = await (await page.$(".player")).boundingBox();
  const at = (fx,fy)=>({x: box.x+box.width*fx, y: box.y+box.height*fy});
  // hit-test helper (what element is topmost at a player-relative point)
  const hit = async (fx,fy)=> page.evaluate(({x,y})=>{ const el=document.elementFromPoint(x,y); return el? (el.tagName+"."+(el.className||"").toString().split(" ")[0]) : "(null)"; }, at(fx,fy));

  console.log("\n[guard present]", !!(await page.$(".ad-guard")), " [toggle present]", !!(await page.$(".guard-toggle")));
  console.log("[hit-test] center:", await hit(0.5,0.5), "| body-upper:", await hit(0.5,0.2), "| bottom-bar:", await hit(0.5,0.95));

  // (A) GUARD ON: aggressive body clicking -> expect 0 popups
  let p0=popups;
  for (const [fx,fy] of [[0.5,0.5],[0.3,0.3],[0.7,0.4],[0.5,0.6],[0.2,0.2],[0.8,0.25],[0.5,0.45],[0.6,0.55],[0.4,0.5],[0.5,0.5],[0.5,0.35],[0.5,0.7]]) { const p=at(fx,fy); await page.mouse.click(p.x,p.y); await sleep(700); }
  await sleep(1500);
  console.log(`\n(A) GUARD ON — aggressive body clicks (12) -> popups: ${popups-p0}  ${popups-p0===0?"PASS ✅":"FAIL ❌"}`);
  await page.screenshot({ path:`${OUT}/A-guard-on.png` });

  // (C) GUARD OFF: start the video
  await page.click(".guard-toggle"); await sleep(400);
  console.log("[after toggle] guard present:", !!(await page.$(".ad-guard")), "| center hit:", await hit(0.5,0.5));
  p0=popups;
  for (let i=0;i<4 && !((await vstate(page))||{}).rs;i++){ const p=at(0.5,0.5); await page.mouse.click(p.x,p.y); await sleep(2500); }
  let v = await vstate(page);
  console.log(`(C) GUARD OFF — tap centre to start -> started:${v&&v.rs>=2?"YES ✅":"no"} (rs${v&&v.rs} w${v&&v.w}) startGatePopups:${popups-p0}`);
  await page.screenshot({ path:`${OUT}/C-started.png` });

  // re-arm guard
  await page.click(".guard-toggle"); await sleep(500);
  // (D) GUARD ON + playing: native bottom control bar toggles play/pause, 0 pops
  p0=popups;
  // reveal + click the bottom-left play/pause (in exposed strip)
  await page.mouse.move(at(0.5,0.95).x, at(0.5,0.95).y); await sleep(600);
  const before = await vstate(page);
  await page.mouse.click(at(0.035,0.95).x, at(0.035,0.95).y); await sleep(1800);
  const after = await vstate(page);
  const toggled = before&&after && before.paused!==after.paused;
  console.log(`(D) GUARD ON + native bottom control -> play/pause toggled:${toggled?"YES ✅":"(paused "+(before&&before.paused)+"→"+(after&&after.paused)+")"} popups:${popups-p0}`);
  await page.screenshot({ path:`${OUT}/D-native-control.png` });

  console.log(`\nTOTAL popups across run: ${popups}`);
  await browser.close();
  console.log(`screenshots in ${OUT}\nVERIFY DONE`);
})().catch((e)=>{console.error("VERIFY ERROR",e);process.exit(1)});
