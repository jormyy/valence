// 3+ source verification in the REAL app: for several stream tabs, confirm (1) the embed plays
// when tapped, and (2) with the guard armed, aggressive clicking over the video body opens ZERO
// pop-ups. The guard absorbs body clicks before they reach the embed, so the pop-block is structural
// and source-agnostic; this confirms it across the distinct players (embed.st / streamapi / embedindia).
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
  const page = await ctx.newPage(); let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto(APP,{waitUntil:"domcontentloaded"}); await page.waitForSelector(".player-iframe",{timeout:20000});
  const nTabs = await page.$$eval(".stream-tab",e=>e.length).catch(()=>1);
  console.log("game:", await page.$eval(".watch-matchup",e=>e.textContent.trim()).catch(()=>"?"), "| tabs:", nTabs, "\n");

  const seenHosts = new Set(); let verified = 0;
  for (let i=0; i<nTabs && verified<4; i++){
    const tabs = await page.$$(".stream-tab"); if(tabs[i]){ await tabs[i].click(); await sleep(1500); }
    const src = await page.$eval(".player-iframe",e=>e.getAttribute("src")).catch(()=>""); const h=host(src);
    const box = await (await page.$(".player")).boundingBox();
    const C=()=>({x:box.x+box.width/2, y:box.y+box.height*0.45});
    // (1) PLAY: drop guard, tap centre to start
    if (await page.$(".guard-toggle .off")===null && (await page.$eval(".guard-toggle",e=>e.textContent)).includes("tap")) { await page.click(".guard-toggle"); await sleep(300); }
    for (let k=0;k<4 && !((await vstate(page))||{}).w;k++){ await page.mouse.click(C().x, C().y); await sleep(2300); }
    const v = await vstate(page); const plays = !!(v&&v.w>0);
    // re-arm guard
    if ((await page.$eval(".guard-toggle",e=>e.textContent)).includes("off")) { await page.click(".guard-toggle"); await sleep(400); }
    const guardOn = !!(await page.$(".ad-guard"));
    // (2) AD TEST: aggressive body clicks with guard armed
    const p0=popups;
    for (const [fx,fy] of [[0.5,0.45],[0.3,0.3],[0.7,0.5],[0.5,0.6],[0.5,0.4],[0.2,0.25],[0.8,0.3],[0.5,0.5]]) { await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy); await sleep(600); }
    await sleep(1000);
    const adPops = popups-p0;
    const ok = plays && guardOn && adPops===0;
    if (ok && !seenHosts.has(h)) { seenHosts.add(h); verified++; }
    console.log(`tab ${String(i).padStart(2)} | ${h.padEnd(20)} | plays:${plays?"YES":"no "} guardArmed:${guardOn} | aggressive-body-clicks(8)->popups:${adPops} | ${ok?"PASS ✅":"--"}`);
  }
  console.log(`\nDistinct sources passing (plays + 0 body pops): ${seenHosts.size}  [${[...seenHosts].join(", ")}]`);
  console.log(seenHosts.size>=3 ? "\n>=3 SOURCES VERIFIED ✅" : "\n<3 sources");
  await browser.close(); console.log("VERIFY_SOURCES DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
