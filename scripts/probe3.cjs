// Deep-inspect specific stream tabs to learn what the non-playing players need.
// Usage: HEADED=1 node probe3.cjs 5 11
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = (u) => { try { return new URL(u).host; } catch { return "?"; } };
const tabIdxs = process.argv.slice(2).map(Number);
if (!tabIdxs.length) tabIdxs.push(5);

// runs in each frame: summarize media-relevant DOM, incl. shadow roots
function frameSummaryFn() {
  function allEls(root, acc) {
    acc = acc || [];
    const walk = (n) => {
      for (const el of n.querySelectorAll("*")) {
        acc.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return acc;
  }
  const els = allEls(document);
  const videos = els.filter((e) => e.tagName === "VIDEO");
  const playish = els.filter((e) => {
    const s = ((e.className && e.className.toString ? e.className.toString() : "") + " " +
      (e.id || "") + " " + (e.getAttribute && (e.getAttribute("aria-label") || "")) + " " +
      (e.getAttribute && (e.getAttribute("title") || ""))).toLowerCase();
    return /play|vjs-big|jw-icon|start|center/.test(s) && e.offsetParent !== null;
  }).slice(0, 6);
  return {
    nVideos: videos.length,
    vstate: videos.map((v) => ({ paused: v.paused, t: +v.currentTime.toFixed(2), rs: v.readyState, w: v.videoWidth, h: v.videoHeight })),
    nIframes: document.querySelectorAll("iframe").length,
    playish: playish.map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, cls: (e.className && e.className.toString ? e.className.toString() : "").slice(0, 40), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }),
    text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 120),
  };
}

async function dumpFrames(page, label) {
  console.log(`\n--- frames [${label}] (${page.frames().length}) ---`);
  for (const f of page.frames()) {
    let s = null;
    try { s = await f.evaluate(frameSummaryFn); } catch (e) { s = { err: String(e).slice(0, 40) }; }
    const host = dom(f.url());
    if (host === "localhost:3000") continue;
    console.log(`  [${host}] v:${s.nVideos || 0} if:${s.nIframes || 0} ${s.vstate ? JSON.stringify(s.vstate) : ""}`);
    if (s.playish && s.playish.length) console.log(`      playish:`, JSON.stringify(s.playish));
    if (s.text) console.log(`      text: "${s.text}"`);
    if (s.err) console.log(`      err: ${s.err}`);
  }
}

(async () => {
  const browser = await chromium.launch({
    channel: "chrome", headless: !process.env.HEADED,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  let popups = [];
  ctx.on("page", (p) => popups.push(p.url()));

  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".player-iframe", { timeout: 20000 });
  console.log("game:", await page.$eval(".watch-matchup", (el) => el.textContent.trim()).catch(() => "?"));

  for (const idx of tabIdxs) {
    popups = [];
    const tabs = await page.$$(".stream-tab");
    if (!tabs[idx]) { console.log(`\n### tab ${idx} missing`); continue; }
    await tabs[idx].click();
    await sleep(2000);
    const src = await page.$eval(".player-iframe", (el) => el.getAttribute("src"));
    console.log(`\n############ tab ${idx}: ${dom(src)} ############`);
    console.log("src:", src);

    const box = await (await page.$(".player")).boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    await sleep(4000);
    await dumpFrames(page, "loaded, pre-click");

    // click center, dump, click again, dump
    for (let c = 1; c <= 2; c++) {
      await page.mouse.click(cx, cy);
      await sleep(5000);
      await dumpFrames(page, `after click #${c}`);
    }
    console.log(`popups:${popups.length} mainUrl:${page.url()}`);
  }
  await browser.close();
  console.log("\nPROBE3 DONE");
})().catch((e) => { console.error("PROBE3 ERROR", e); process.exit(1); });
