// Verify the REAL APP (now no-sandbox) across its stream tabs: real video plays + aggressive
// clicking yields zero popups/redirects. Includes a POSITIVE CONTROL proving popup detection works.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
const AD_HINT = /ndcertain|greensky|exposestrat|throughlnk|dtscout|vcommission|ljline|adjux|pa2373|echonver|ukuleqas|americascardroom|paramount|singleflirt/i;

async function scanVideos(page) {
  const out = [];
  for (const f of page.frames()) {
    try {
      const arr = await f.evaluate(() => Array.from(document.querySelectorAll("video")).map((v) => ({ w: v.videoWidth, h: v.videoHeight, t: v.currentTime, paused: v.paused })));
      for (const v of arr) out.push({ ...v, host: host(f.url()) });
    } catch {}
  }
  return out;
}
function bestAdvancing(a, b) {
  let best = null;
  for (const v2 of b) {
    const v1 = a.find((x) => x.host === v2.host && x.w === v2.w && x.h === v2.h);
    const adv = v1 ? v2.t - v1.t : v2.t;
    const area = v2.w * v2.h;
    if (adv > 0.3 && area > 40000 && (!best || area > best.area)) best = { ...v2, adv: +adv.toFixed(2), area };
  }
  return best;
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED,
    args: ["--disable-blink-features=AutomationControlled", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 880 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);

  const popups = []; const redirects = [];
  ctx.on("page", async (p) => { popups.push(host(p.url() || "blank")); });
  const page = await ctx.newPage();
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith(APP) && !f.url().startsWith("data:") && f.url() !== "about:blank") redirects.push(host(f.url())); });

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".player-iframe", { timeout: 20000 });
  const matchup = await page.$eval(".watch-matchup", (e) => e.textContent.trim()).catch(() => "?");
  const nTabs = await page.$$eval(".stream-tab", (e) => e.length).catch(() => 1);
  console.log(`REAL APP — game ${matchup} — ${nTabs} stream tabs\n`);

  const coveredHosts = new Set();
  const results = [];
  for (let i = 0; i < nTabs && coveredHosts.size < 6; i++) {
    const before = popups.length, beforeR = redirects.length;
    const tabs = await page.$$(".stream-tab");
    if (tabs[i]) { await tabs[i].click(); await sleep(1800); }
    const src = await page.$eval(".player-iframe", (e) => e.getAttribute("src")).catch(() => "");
    const h = host(src);
    // aggressive clicking across the player to provoke ads + start playback
    const box = await (await page.$(".player")).boundingBox();
    const pts = [[0.5,0.5],[0.5,0.5],[0.3,0.3],[0.7,0.7],[0.5,0.85],[0.15,0.15],[0.85,0.2],[0.5,0.5],[0.6,0.4]];
    const s1 = await scanVideos(page);
    for (const [fx,fy] of pts) { await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy); await sleep(1200); }
    await sleep(2500);
    const s2 = await scanVideos(page);
    const vid = bestAdvancing(s1, s2);
    const dPop = popups.slice(before), dRed = redirects.slice(beforeR);
    results.push({ i, h, vid, pop: dPop, red: dRed });
    console.log(`tab ${String(i).padStart(2)} | ${h.padEnd(20)} | play:${vid?`${vid.w}x${vid.h}@${vid.host}(+${vid.adv}s)`:"no"} | popups:${dPop.length}${dPop.length?("["+dPop+"]"):""} | redirects:${dRed.length||"-"}${dRed.length?("["+dRed+"]"):""}`);
    coveredHosts.add(h);
  }

  // POSITIVE CONTROL: confirm a popup WOULD be detected
  const pc0 = popups.length;
  await page.evaluate(() => { const w = window.open("about:blank", "_blank"); if (w) setTimeout(() => w.close(), 200); });
  await sleep(1200);
  const detected = popups.length > pc0;

  console.log(`\n=== SUMMARY ===`);
  const hosts = [...new Set(results.map(r=>r.h))];
  const played = results.filter(r=>r.vid);
  const playedHosts = [...new Set(played.map(r=>r.vid.host).concat(played.map(r=>r.h)))];
  console.log(`distinct embed hosts tested: ${hosts.length}  [${hosts.join(", ")}]`);
  console.log(`tabs with REAL advancing video: ${played.length}/${results.length}`);
  console.log(`TOTAL popups during ad-clicking: ${popups.length - (detected?1:0)}`);
  console.log(`TOTAL top redirects: ${redirects.length}`);
  console.log(`positive control (window.open detected?): ${detected ? "YES (detector works)" : "NO — detection broken!"}`);
  await ctx.close(); await browser.close();
  console.log("\nPROBE13 DONE");
})().catch((e) => { console.error("PROBE13 ERROR", e); process.exit(1); });
