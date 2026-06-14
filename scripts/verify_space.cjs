// After the Player auto-focuses the frame, does pressing JUST Space (no manual Tab) start the video
// ad-free? Measures Space-alone coverage per source vs needing Tab — to settle the affordance UX.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage(); let pops=0; ctx.on("page", async p=>{ if(p===page)return; pops++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"}); await page.waitForSelector(".player-iframe",{timeout:20000});
  const nTabs = await page.$$eval(".stream-tab",e=>e.length).catch(()=>1);
  let spaceAlone=0, needTab=0, none=0;
  const hostsSpace=new Set();
  for (let i=0;i<nTabs;i++){
    const tabs=await page.$$(".stream-tab"); if(tabs[i]){ await tabs[i].click(); await sleep(2200); }
    const src=await page.$eval(".player-iframe",e=>e.getAttribute("src")).catch(()=>""); const h=host(src);
    const p0=pops;
    // Space only (rely on Player auto-focus)
    await page.keyboard.press("Space"); await sleep(1800); await page.keyboard.press("Space"); await sleep(2500);
    let v=await vstate(page); let mode="none";
    if (v&&(v.rs>=2||v.w>200)){ mode="space"; spaceAlone++; hostsSpace.add(h); }
    else { // try Tab then Space
      await page.keyboard.press("Tab"); await sleep(300); await page.keyboard.press("Space"); await sleep(2500);
      v=await vstate(page);
      if (v&&(v.rs>=2||v.w>200)){ mode="tab+space"; needTab++; } else none++;
    }
    console.log(`tab ${String(i).padStart(2)} | ${h.padEnd(20)} | start:${mode.padEnd(9)} pops:${pops-p0}`);
  }
  console.log(`\nSpace-alone: ${spaceAlone}  | needed Tab: ${needTab}  | none: ${none}  | Space-alone hosts: ${[...hostsSpace].join(", ")}`);
  await browser.close(); console.log("VERIFY_SPACE DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
