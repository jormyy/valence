// Verify the FULL goal on the REAL app: for 3+ sources, start the video AD-FREE via the keyboard
// (Tab into the focused frame + Space) with ZERO pops, then aggressive body clicking (guard armed)
// also yields ZERO pops. Net: zero pop-ups including the start.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage(); let pops=0; ctx.on("page", async p=>{ if(p===page)return; pops++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"}); await page.waitForSelector(".player-iframe",{timeout:20000});
  const matchup = await page.$eval(".watch-matchup",e=>e.textContent.trim()).catch(()=>"?");
  const nTabs = await page.$$eval(".stream-tab",e=>e.length).catch(()=>1);
  console.log("game:", matchup, "| tabs:", nTabs, "\n");

  const passedHosts = new Set();
  for (let i=0; i<nTabs && passedHosts.size<4; i++){
    const tabs = await page.$$(".stream-tab"); if(tabs[i]){ await tabs[i].click(); await sleep(2000); }
    const src = await page.$eval(".player-iframe",e=>e.getAttribute("src")).catch(()=>""); const h=host(src);
    const box = await (await page.$(".player")).boundingBox();
    // (1) AD-FREE KEYBOARD START: frame is auto-focused by Player; Tab into content + Space
    const startPop0 = pops;
    let v=null;
    for (const seq of [["Space"],["Tab","Space"],["Tab","KeyK"],["Tab","Tab","Space"]]){
      for (const k of seq){ await page.keyboard.press(k); await sleep(900); }
      await sleep(2500); v=await vstate(page);
      if (v&&(v.rs>=2||v.w>200)) break;
    }
    const started = !!(v&&(v.rs>=2||v.w>200));
    const startPops = pops - startPop0;
    // (2) GUARD: aggressive body clicking → 0 pops
    const bodyPop0 = pops;
    for (const [fx,fy] of [[0.5,0.45],[0.3,0.3],[0.7,0.5],[0.5,0.6],[0.5,0.4],[0.2,0.25],[0.8,0.3],[0.5,0.5]]) { await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy); await sleep(550); }
    await sleep(1000);
    const bodyPops = pops - bodyPop0;
    const full = started && startPops===0 && bodyPops===0;
    if (full) passedHosts.add(h);
    console.log(`tab ${String(i).padStart(2)} | ${h.padEnd(20)} | kbd-start:${started?"YES":"no "} startPops:${startPops} | aggressive-body-pops:${bodyPops} | ${full?"ZERO-POP (incl. start) ✅":"--"}`);
  }
  console.log(`\nSources with ZERO pops INCLUDING the start: ${passedHosts.size}  [${[...passedHosts].join(", ")}]`);
  console.log(passedHosts.size>=3 ? "\n>=3 SOURCES: literal-zero achieved ✅✅✅" : "\n<3 sources at literal-zero");
  await browser.close(); console.log("VERIFY_KBD DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
