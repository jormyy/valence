// Reproduce the sandboxed failure for a hostile embed and capture: console messages (incl.
// browser sandbox-violation warnings), the rendered frame HTML, and any inline gate script.
// Compares sandboxed vs unsandboxed. Saves blobs to /tmp/embedprobe for local grep.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || "https://embedindia.st/embed/mlb/2026-06-13/nyy-tor";
const OUT = "/tmp/embedprobe";
fs.mkdirSync(OUT, { recursive: true });
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock";

async function run(browser, sandboxed) {
  const tag = sandboxed ? "SANDBOXED" : "OPEN";
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  const console_ = [];
  const popups = [];
  page.on("console", (m) => console_.push(`[${m.type()}] ${m.text()}`.slice(0, 220)));
  page.on("pageerror", (e) => console_.push(`[pageerror] ${String(e).slice(0, 160)}`));
  ctx.on("page", (p) => popups.push(p.url()));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) popups.push("MAINNAV:" + f.url()); });

  const sbAttr = sandboxed ? `sandbox="${SANDBOX}"` : "";
  // about:blank top; inject an iframe pointing at the embed
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <iframe id="f" ${sbAttr} allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowfullscreen src="${URL}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe>
  </body></html>`, { waitUntil: "domcontentloaded" });

  await sleep(7000);
  // click center to provoke
  await page.mouse.click(600, 400);
  await sleep(4000);

  // collect each cross-origin frame's HTML + visible text
  console.log(`\n========== ${tag} ==========`);
  let i = 0;
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    let info = null;
    try {
      info = await f.evaluate(() => ({
        host: location.host,
        text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 200),
        nVideo: document.querySelectorAll("video").length,
        html: document.documentElement.outerHTML,
      }));
    } catch (e) { info = { host: "(x)", text: String(e).slice(0, 80), nVideo: 0, html: "" }; }
    if (info.html) fs.writeFileSync(`${OUT}/${tag}-frame${i}-${(info.host||"x").replace(/[^a-z0-9.]/gi,"_")}.html`, info.html);
    console.log(`  frame[${info.host}] video:${info.nVideo} text:"${info.text}"`);
    i++;
  }
  console.log(`  -- console (${console_.length}) --`);
  for (const c of console_.filter((c) => /sandbox|block|popup|navigat|denied|refus|Remove/i.test(c)).slice(0, 25)) {
    console.log("   ", c);
  }
  console.log(`  popups/navs: ${JSON.stringify(popups.slice(0, 8))}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  console.log("URL:", URL);
  await run(browser, false); // control: open
  await run(browser, true);  // ours: sandboxed
  await browser.close();
  console.log(`\nblobs in ${OUT}`);
  console.log("PROBE5 DONE");
})().catch((e) => { console.error("PROBE5 ERROR", e); process.exit(1); });
