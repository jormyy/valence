// Load an embed top-level and capture all its JS, then grep for sandbox-detection logic.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URLS = process.argv.slice(2);
if (!URLS.length) URLS.push("https://embedindia.st/embed/mlb/2026-06-13/nyy-tor");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] });
  for (const url of URLS) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const scripts = [];
    page.on("response", async (res) => {
      const ct = (res.headers()["content-type"] || "");
      if (/javascript|ecmascript/.test(ct) || res.url().endsWith(".js")) {
        try { scripts.push({ url: res.url(), body: await res.text() }); } catch {}
      }
    });
    console.log("\n############", url);
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }); } catch (e) { console.log("goto:", String(e).slice(0,80)); }
    await sleep(6000);
    // inline scripts + page HTML
    const html = await page.content().catch(() => "");
    scripts.push({ url: "(inline-doc)", body: html });

    const keys = ["sandbox", "document.domain", "frameElement", "Remove sandbox", "allow-scripts", "top.location", "window.top"];
    for (const s of scripts) {
      for (const k of keys) {
        let idx = s.body.indexOf(k);
        while (idx !== -1) {
          const snip = s.body.slice(Math.max(0, idx - 90), idx + 110).replace(/\s+/g, " ");
          console.log(`  [${k}] @${s.url.slice(-40)}: …${snip}…`);
          idx = s.body.indexOf(k, idx + 1);
          if (idx > 200000) break; // safety
        }
      }
    }
    console.log(`  (captured ${scripts.length} script/doc blobs)`);
    await ctx.close();
  }
  await browser.close();
  console.log("\nPROBE4 DONE");
})().catch((e) => { console.error("PROBE4 ERROR", e); process.exit(1); });
