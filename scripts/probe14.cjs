// Map sandbox tolerance across ALL stream tabs in the REAL APP (real-http top → popups reproduce).
// For a given AB mode, per tab report: embed host, real advancing video?, "remove sandbox" nag?,
// popups (auto-closed, invisible). Run strict + none to compare. HEADLESS — no windows on screen.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const APP = "http://localhost:3000";
const MODE = process.argv[2] || "strict";

async function scan(page) {
  const vids = []; let nag = "";
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate(() => ({
        v: Array.from(document.querySelectorAll("video")).map((v) => ({ w: v.videoWidth, h: v.videoHeight, t: v.currentTime })),
        nag: /remove sandbox|sandbox iframe not allowed|allow-popups to sandbox/i.test(document.body ? document.body.innerText : ""),
      }));
      for (const v of r.v) vids.push({ ...v, host: host(f.url()) });
      if (r.nag) nag = host(f.url());
    } catch {}
  }
  return { vids, nag };
}
function bestAdv(a, b) {
  let best = null;
  for (const v2 of b.vids) {
    const v1 = a.vids.find((x) => x.host === v2.host && x.w === v2.w && x.h === v2.h);
    const adv = v1 ? v2.t - v1.t : v2.t; const area = v2.w * v2.h;
    if (adv > 0.3 && area > 40000 && (!best || area > best.area)) best = { ...v2, adv: +adv.toFixed(2), area };
  }
  return best;
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  await ctx.addInitScript(`window.__AB_MODE=${JSON.stringify(MODE)};`);
  const page = await ctx.newPage();
  const popups = []; ctx.on("page", async (p) => { if (p === page) return; popups.push(host(p.url() || "blank")); try { await p.close(); } catch {} });
  let redirects = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith(APP) && f.url() !== "about:blank" && !f.url().startsWith("data:")) redirects++; });

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".player-iframe", { timeout: 20000 });
  const matchup = await page.$eval(".watch-matchup", (e) => e.textContent.trim()).catch(() => "?");
  // confirm mode applied
  const appliedSandbox = await page.$eval(".player-iframe", (e) => e.getAttribute("sandbox"));
  const nTabs = await page.$$eval(".stream-tab", (e) => e.length).catch(() => 1);
  console.log(`\n===== MODE=${MODE} (sandbox attr="${appliedSandbox}") — ${matchup} — ${nTabs} tabs =====`);

  let tolerant = 0;
  for (let i = 0; i < nTabs; i++) {
    const p0 = popups.length;
    const tabs = await page.$$(".stream-tab");
    if (tabs[i]) { await tabs[i].click(); await sleep(1600); }
    const src = await page.$eval(".player-iframe", (e) => e.getAttribute("src")).catch(() => "");
    const box = await (await page.$(".player")).boundingBox();
    const a = await scan(page);
    for (const [fx, fy] of [[0.5,0.5],[0.5,0.5],[0.35,0.4],[0.65,0.6],[0.5,0.8],[0.2,0.2],[0.8,0.25]]) { await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy); await sleep(1100); }
    await sleep(2200);
    const b = await scan(page);
    const vid = bestAdv(a, b);
    const dPop = popups.length - p0;
    const ok = vid && dPop === 0;
    if (ok) tolerant++;
    console.log(`  tab ${String(i).padStart(2)} | ${host(src).padEnd(20)} ${src.split("/").slice(3,5).join("/").slice(0,18).padEnd(18)} | ${vid?`PLAY ${vid.w}x${vid.h}`:"no-play"} | nag:${b.nag||"-"} | popups:${dPop} ${ok?"<= TOLERANT":""}`);
  }
  console.log(`\n  RESULT MODE=${MODE}: tolerant(play+0popups)=${tolerant}/${nTabs}  totalPopups=${popups.length}  redirects=${redirects}`);
  await ctx.close(); await browser.close();
  console.log("PROBE14 DONE");
})().catch((e) => { console.error("PROBE14 ERROR", e); process.exit(1); });
