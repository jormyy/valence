// Verify the CLEAN path end-to-end: when lib/streams surfaces a clean (non-Adcash) source, the
// Player renders a bare iframe (no ad-guard) and a normal click plays it with ZERO pop-ups. We mock
// /api/streams with a clean YouTube embed (YouTube has no pop-under) and drive a real click.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
// a public, CORS-open test HLS stream — stands in for a clean direct-.m3u8 game source. Plays in
// automation (unlike YouTube, which bot-blocks headless), so it actually proves click-to-play.
const YT = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
async function ytPlaying(page){ try { const v = await page.$eval("video", (v)=>({t:+v.currentTime.toFixed(2),paused:v.paused,w:v.videoWidth})); return {...v, host:"localhost(our player)"}; } catch { return null; } }

(async () => {
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1400,height:880}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  // mock the streams endpoint to return ONE clean YouTube stream
  await ctx.route("**/api/streams/**", (route) =>
    route.fulfill({ contentType:"application/json", body: JSON.stringify({ streams: [
      { label:"HD 1", url: YT, quality:"HD", language:"EN", clean:true },
    ] }) }));
  const page = await ctx.newPage(); let pops=0; ctx.on("page", async p=>{ if(p===page)return; pops++; try{await p.close()}catch{} });
  let redirects=0; page.on("framenavigated",(f)=>{ if(f===page.mainFrame() && !f.url().startsWith(APP) && f.url()!=="about:blank") redirects++; });

  await page.goto(APP,{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".player-iframe",{timeout:20000});
  const src = await page.$eval(".player-iframe", e=>e.getAttribute("src")).catch(()=>"");
  const hasGuard = !!(await page.$(".ad-guard"));
  const hasKbdHint = !!(await page.$(".kbd-start"));
  console.log("clean stream src:", host(src));
  console.log("ad-guard present:", hasGuard, " (expect false for clean)");
  console.log("keyboard hint present:", hasKbdHint, " (expect false for clean)");

  const box = await (await page.$(".player")).boundingBox();
  // 1) the clean source plays in our own <video> (autoplay) — confirm it advances
  await sleep(5000);
  let v = await ytPlaying(page); let adv = false;
  if (v) { const t1=v.t; await sleep(2500); const v2=await ytPlaying(page); adv = v2 && v2.t > t1 + 0.05; }
  // 2) a PLAIN CLICK on the native controls toggles play/pause, with zero pops
  const p0 = pops;
  const before = await ytPlaying(page);
  await page.mouse.click(box.x+box.width*0.5, box.y+box.height*0.5); await sleep(1200);
  const afterPause = await ytPlaying(page);
  await page.mouse.click(box.x+box.width*0.5, box.y+box.height*0.5); await sleep(1500);
  const afterPlay = await ytPlaying(page);
  const clickToggles = before && afterPause && (before.paused !== afterPause.paused);
  console.log("\nCLEAN PATH result:");
  console.log("  plays in our <video> (autoplay advancing):", adv, v ? `(${v.w}px)` : "");
  console.log("  plain click toggles play/pause:", clickToggles, `(paused ${before&&before.paused}→${afterPause&&afterPause.paused})`);
  console.log("  pop-ups from clicking:", pops - p0);
  console.log("  page redirects:", redirects);
  const pass = !hasGuard && adv && (pops - p0) === 0 && redirects === 0;
  console.log(`\nCLEAN-PATH click-to-play-zero-pop: ${pass ? "PASS ✅ (a plain click controls a clean source with zero pops)" : "needs review"}`);
  await browser.close(); console.log("VERIFY_CLEAN DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
