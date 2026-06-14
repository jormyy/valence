// Sandbox-config matrix vs a hostile embed. For each config measure: does a <video> play
// (detector satisfied?), # popups opened, # top-frame navigations (redirects), and whether the
// embed frame self-navigates away (video replaced by ad). Clicks aggressively to provoke ads.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return "?"; } };
const URL = process.argv[2] || "https://embedindia.st/embed/mlb/2026-06-13/nyy-tor";

const CONFIGS = {
  "A none(control)":   null,
  "B scripts+sameorig":"allow-scripts allow-same-origin allow-forms allow-presentation",
  "C +popups":         "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups",
  "D +popups+topnavUA":"allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-top-navigation-by-user-activation",
};

async function findVideo(page) {
  for (const f of page.frames()) {
    try {
      const v = await f.evaluate(() => { const v = document.querySelector("video"); return v ? { t: v.currentTime, paused: v.paused, w: v.videoWidth } : null; });
      if (v) return { ...v, host: host(f.url()) };
    } catch {}
  }
  return null;
}

async function run(browser, name, sandbox) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  let popups = 0, topnavs = [], selfnav = [];
  const popupUrls = [];
  ctx.on("page", (p) => { popups++; popupUrls.push(host(p.url() || "blank")); });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) { if (!f.url().startsWith("data:") && f.url() !== "about:blank") topnavs.push(host(f.url())); }
    else { const h = host(f.url()); if (h.includes("embedindia") || h.includes("embed.st") || h.includes("streamapi")) {} else if (h && h !== "?" ) selfnav.push(h); }
  });

  const sbAttr = sandbox === null ? "" : `sandbox="${sandbox}"`;
  await page.setContent(`<!doctype html><body style="margin:0"><iframe ${sbAttr}
     allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
     src="${URL}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`,
    { waitUntil: "domcontentloaded" });

  await sleep(6000);
  // aggressive clicking to provoke ads (each click = a fresh user gesture)
  const pts = [[640,400],[300,200],[900,600],[640,400],[500,500],[800,300],[640,400],[200,650],[1100,150],[640,400]];
  for (const [x,y] of pts) { await page.mouse.click(x,y); await sleep(1400); }
  await sleep(3000);

  const vid = await findVideo(page);
  let adv = false;
  if (vid) { const t1 = vid.t; await sleep(2500); const v2 = await findVideo(page); adv = v2 && v2.t > t1 + 0.05; }

  // is the embed frame still showing the player, or a nag/ad? read its text
  let frameText = "";
  for (const f of page.frames()) {
    if (host(f.url()).match(/embedindia|embed\.st|streamapi/)) {
      try { frameText = (await f.evaluate(() => document.body ? document.body.innerText : "")).replace(/\s+/g," ").slice(0,70); } catch {}
    }
  }
  console.log(
    `${name.padEnd(20)} | play:${adv?"YES":(vid?"vid-noadv":"NO ")} | popups:${String(popups).padStart(2)} ${popupUrls.slice(0,4).join(",")} ` +
    `| topnav:${topnavs.length?topnavs.join(","):"-"} | frame:"${frameText}"`
  );
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  console.log("URL:", URL, "\n");
  for (const [name, sb] of Object.entries(CONFIGS)) {
    try { await run(browser, name, sb); } catch (e) { console.log(name, "ERR", String(e).slice(0,80)); }
  }
  await browser.close();
  console.log("\nPROBE6 DONE");
})().catch((e) => { console.error("PROBE6 ERROR", e); process.exit(1); });
