// Probe the live app: open it, find the watch panel, enumerate stream tabs + iframe srcs,
// dump the frame tree, and see whether a <video> shows up and starts playing on click.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);

const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const popups = [];
  ctx.on("page", (p) => popups.push(p.url()));
  page.on("popup", (p) => popups.push("popup:" + p.url()));
  page.on("download", (d) => popups.push("download:" + d.url()));

  console.log("opening", APP);
  await page.goto(APP, { waitUntil: "domcontentloaded" });

  // watch panel auto-opens on first live game
  await page.waitForSelector(".player-iframe", { timeout: 20000 }).catch(() => {});
  const haveIframe = await page.$(".player-iframe");
  console.log("player-iframe present:", !!haveIframe);

  // active game heading
  const matchup = await page.$eval(".watch-matchup", (el) => el.textContent).catch(() => "(none)");
  console.log("watch matchup:", matchup);

  // enumerate stream tabs
  const tabs = await page.$$eval(".stream-tab", (els) =>
    els.map((e) => e.textContent.trim())
  ).catch(() => []);
  console.log("stream tabs (" + tabs.length + "):", tabs);

  // iframe src + sandbox
  const meta = await page.$eval(".player-iframe", (el) => ({
    src: el.getAttribute("src"),
    sandbox: el.getAttribute("sandbox"),
    allow: el.getAttribute("allow"),
  })).catch(() => null);
  console.log("iframe meta:", JSON.stringify(meta, null, 2));

  // hit-test: what element is at the center of the player? (proves no overlay shield)
  const hit = await page.evaluate(() => {
    const p = document.querySelector(".player");
    if (!p) return "(no .player)";
    const r = p.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el ? el.tagName + "." + (el.className || "") : "(null)";
  });
  console.log("element at player center:", hit);

  // give the embed time to boot and load nested frames
  await sleep(6000);

  // dump frame tree
  function dumpFrames(label) {
    const frames = page.frames();
    console.log(`\n[${label}] ${frames.length} frames:`);
    for (const f of frames) {
      console.log("  -", (f.url() || "(blank)").slice(0, 100));
    }
    return frames;
  }
  let frames = dumpFrames("after 6s");

  // search all frames for a <video>
  async function findVideo() {
    for (const f of page.frames()) {
      try {
        const info = await f.evaluate(() => {
          const v = document.querySelector("video");
          if (!v) return null;
          return {
            paused: v.paused, currentTime: v.currentTime, readyState: v.readyState,
            muted: v.muted, volume: v.volume,
            w: v.videoWidth, h: v.videoHeight,
            src: (v.currentSrc || v.src || "").slice(0, 80),
          };
        });
        if (info) return { frameUrl: f.url(), info };
      } catch (e) { /* frame detached or cross-origin race */ }
    }
    return null;
  }

  let vid = await findVideo();
  console.log("\nvideo before click:", JSON.stringify(vid));

  // click the center of the player to start playback (natural interaction)
  const box = await (await page.$(".player")).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  console.log("\nclicking player center", Math.round(cx), Math.round(cy));
  await page.mouse.click(cx, cy);
  await sleep(4000);

  frames = dumpFrames("after click");
  vid = await findVideo();
  console.log("\nvideo after click #1:", JSON.stringify(vid));

  // sample currentTime twice to see if it advances
  if (vid) {
    const t1 = vid.info.currentTime;
    await sleep(3000);
    const vid2 = await findVideo();
    const t2 = vid2 ? vid2.info.currentTime : null;
    console.log(`currentTime: ${t1} -> ${t2}  (advancing: ${t2 > t1})`);
  }

  console.log("\npopups/navs captured:", JSON.stringify(popups));
  console.log("main url:", page.url());

  await browser.close();
  console.log("\nPROBE DONE");
})().catch((e) => { console.error("PROBE ERROR", e); process.exit(1); });
