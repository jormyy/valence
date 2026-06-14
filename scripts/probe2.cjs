// Iterate every stream tab; for each, switch to it, click to start, and report whether a real
// <video> shows up + plays, plus any popups/navs. Finds which sources actually play.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = (u) => { try { return new URL(u).host; } catch { return "?"; } };

async function findVideo(page) {
  for (const f of page.frames()) {
    try {
      const info = await f.evaluate(() => {
        const v = document.querySelector("video");
        if (!v) return null;
        return { paused: v.paused, t: v.currentTime, rs: v.readyState, w: v.videoWidth, h: v.videoHeight };
      });
      if (info) return { host: dom(f.url()), info };
    } catch {}
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({
    channel: "chrome", headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  let popups = [];
  ctx.on("page", (p) => popups.push(p.url()));
  page.on("download", (d) => popups.push("dl:" + d.url()));

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".player-iframe", { timeout: 20000 });
  const matchup = await page.$eval(".watch-matchup", (el) => el.textContent.trim()).catch(() => "?");
  const nTabs = await page.$$eval(".stream-tab", (els) => els.length);
  console.log(`game: ${matchup}  tabs: ${nTabs}\n`);

  const results = [];
  for (let i = 0; i < nTabs; i++) {
    popups = [];
    // switch tab
    const tabs = await page.$$(".stream-tab");
    if (!tabs[i]) break;
    await tabs[i].click();
    await sleep(1500);
    const src = await page.$eval(".player-iframe", (el) => el.getAttribute("src")).catch(() => "");
    const host = dom(src);

    // click center up to 3x, hunting for video
    const box = await (await page.$(".player")).boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    let vid = null;
    for (let c = 0; c < 3 && !vid; c++) {
      await page.mouse.click(cx, cy);
      await sleep(3500);
      vid = await findVideo(page);
    }
    // confirm advancing
    let advancing = false;
    if (vid) {
      const t1 = vid.info.t;
      await sleep(2500);
      const v2 = await findVideo(page);
      advancing = v2 && v2.info.t > t1 + 0.05;
      vid.adv = advancing;
    }
    const mainUrl = page.url();
    const redirected = !mainUrl.startsWith(APP);
    results.push({ i, host, video: !!vid, advancing, popups: popups.length, redirected });
    console.log(
      `tab ${String(i).padStart(2)} | ${host.padEnd(22)} | video:${vid ? "YES" : "no "} ` +
      `adv:${advancing ? "YES" : "no "} | popups:${popups.length} redirect:${redirected ? "YES" : "no"} ` +
      `${vid ? "(" + vid.info.w + "x" + vid.info.h + " rs" + vid.info.rs + ")" : ""}`
    );
  }

  console.log("\n=== summary by host ===");
  const byHost = {};
  for (const r of results) {
    byHost[r.host] = byHost[r.host] || { plays: 0, total: 0, popups: 0, redirect: 0 };
    byHost[r.host].total++;
    if (r.advancing) byHost[r.host].plays++;
    byHost[r.host].popups += r.popups;
    if (r.redirected) byHost[r.host].redirect++;
  }
  for (const [h, s] of Object.entries(byHost)) {
    console.log(`  ${h.padEnd(24)} plays ${s.plays}/${s.total}  popups:${s.popups}  redirects:${s.redirect}`);
  }
  await browser.close();
  console.log("\nPROBE2 DONE");
})().catch((e) => { console.error("PROBE2 ERROR", e); process.exit(1); });
