// Decisive matrix: for real live stream URLs, compare sandbox configs none/strict/+popups.
// Per (config,url) measure: real stream play (largest advancing video + its frame host/size),
// sandbox-nag text, popups opened, top-frame redirects. Saves screenshots to /tmp/adblock-shots.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return "?"; } };
const OUT = "/tmp/adblock-shots"; fs.mkdirSync(OUT, { recursive: true });

const CONFIGS = {
  none:   null,
  strict: "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock",
  popups: "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-popups",
};

function apiGet(path) {
  return new Promise((res, rej) => http.get("http://localhost:3000" + path, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej));
}

// returns the largest <video> across all frames that has area>0, with its advance delta
async function scanVideos(page) {
  const vids = [];
  for (const f of page.frames()) {
    try {
      const arr = await f.evaluate(() => Array.from(document.querySelectorAll("video")).map((v) => ({
        w: v.videoWidth, h: v.videoHeight, t: v.currentTime, paused: v.paused, rs: v.readyState,
      })));
      for (const v of arr) vids.push({ ...v, host: host(f.url()) });
    } catch {}
  }
  return vids;
}
async function nagText(page) {
  let txt = "";
  for (const f of page.frames()) {
    try { const t = await f.evaluate(() => document.body ? document.body.innerText : ""); if (/sandbox|allow-popups|remove/i.test(t)) txt += " | " + t.replace(/\s+/g, " ").slice(0, 80); } catch {}
  }
  return txt.slice(0, 160);
}

async function testOne(browser, cfgName, sandbox, url, idx) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  let popups = []; const topnavs = [];
  ctx.on("page", (p) => popups.push(host(p.url() || "blank")));
  page.on("framenavigated", (f) => { if (f === page.mainFrame() && !f.url().startsWith("data:") && f.url() !== "about:blank") topnavs.push(host(f.url())); });
  const sb = sandbox === null ? "" : `sandbox="${sandbox}"`;
  await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe ${sb}
     allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
     src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, { waitUntil: "domcontentloaded" });

  await sleep(5000);
  // click center a few times to start playback / provoke ads
  for (let i = 0; i < 5; i++) { await page.mouse.click(640, 380); await sleep(1600); }
  // sample videos twice ~3s apart to find advancing ones
  const s1 = await scanVideos(page); await sleep(3500); const s2 = await scanVideos(page);
  // match by host+size, compute advance; pick largest-area advancing video
  let best = null;
  for (const v2 of s2) {
    const v1 = s1.find((a) => a.host === v2.host && a.w === v2.w && a.h === v2.h);
    const adv = v1 ? v2.t - v1.t : v2.t;
    const area = v2.w * v2.h;
    if (adv > 0.3 && area > 0 && (!best || area > best.area)) best = { host: v2.host, w: v2.w, h: v2.h, adv: +adv.toFixed(2), area };
  }
  const nag = await nagText(page);
  await page.screenshot({ path: `${OUT}/${cfgName}-${idx}-${host(url)}.png` }).catch(() => {});
  await ctx.close();
  return { play: best, nag, popups, topnavs };
}

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) { const g = await apiGet("/api/games"); const games = g.games || g; ids.push(...games.filter((x) => x.status === "in" && x.streamCount > 0).slice(0, 2).map((x) => x.id)); }
  // gather unique source URLs (1 per host per game, capped)
  const urls = []; const perHost = {};
  for (const id of ids) {
    const s = await apiGet("/api/streams/" + id); const streams = s.streams || s;
    for (const st of streams) { const h = host(st.url); perHost[h] = (perHost[h] || 0) + 1; if (perHost[h] <= 2) urls.push(st.url); }
  }
  console.log("games:", ids.join(","), "| testing", urls.length, "urls\n");
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });

  for (const [cfg, sb] of Object.entries(CONFIGS)) {
    console.log(`\n===== CONFIG: ${cfg} ${sb ? "[" + sb.replace("allow-","").replace(/allow-/g,"") + "]" : "(no sandbox)"} =====`);
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await testOne(browser, cfg, sb, urls[i], i);
        const p = r.play ? `PLAY ${r.play.w}x${r.play.h}@${r.play.host}(+${r.play.adv}s)` : "no-play";
        console.log(`  [${String(i).padStart(2)}] ${host(urls[i]).padEnd(20)} ${p.padEnd(42)} popups:${r.popups.length}${r.popups.length?("["+r.popups.slice(0,3)+"]"):""} topnav:${r.topnavs.length||"-"}${r.nag?(" NAG:"+r.nag.slice(0,50)):""}`);
      } catch (e) { console.log(`  [${i}] ${host(urls[i])} ERR ${String(e).slice(0,50)}`); }
    }
  }
  await browser.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log("PROBE8 DONE");
})().catch((e) => { console.error("PROBE8 ERROR", e); process.exit(1); });
