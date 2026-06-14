// Control-scan: fetch fresh streams for live games, dedupe by host, and test each URL with NO
// sandbox (headless + headed) to learn which sources actually play here. Establishes valid subjects.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return "?"; } };
const GAME_IDS = process.argv.slice(2);

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get("http://localhost:3000" + path, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
async function findVideo(page) {
  for (const f of page.frames()) {
    try { const v = await f.evaluate(() => { const v = document.querySelector("video"); return v ? { t: v.currentTime } : null; }); if (v) return { ...v, host: host(f.url()) }; } catch {}
  }
  return null;
}

async function testPlay(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><body style="margin:0"><iframe
     allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
     src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  for (const [x,y] of [[640,400],[640,400],[500,300]]) { await page.mouse.click(x,y); await sleep(2500); }
  let vid = await findVideo(page); let adv = false;
  if (vid) { const t1 = vid.t; await sleep(2500); const v2 = await findVideo(page); adv = v2 && v2.t > t1 + 0.05; }
  await ctx.close();
  return { vid: !!vid, adv, vhost: vid && vid.host };
}

(async () => {
  let ids = GAME_IDS;
  if (!ids.length) {
    const g = await apiGet("/api/games");
    const games = g.games || g;
    ids = games.filter((x) => x.status === "in" && x.streamCount > 0).slice(0, 2).map((x) => x.id);
  }
  console.log("games:", ids.join(", "));
  const urls = [];
  const seenHostPath = new Set();
  for (const id of ids) {
    const s = await apiGet("/api/streams/" + id);
    const streams = s.streams || s;
    for (const st of streams) {
      const h = host(st.url);
      // keep up to 2 urls per host across the set
      const cnt = [...seenHostPath].filter((k) => k.startsWith(h)).length;
      if (cnt < 2) { seenHostPath.add(h + ":" + st.url); urls.push(st.url); }
    }
  }
  console.log("testing", urls.length, "urls\n");

  for (const headed of [false, true]) {
    const browser = await chromium.launch({ channel: "chrome", headless: !headed, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
    console.log(`===== ${headed ? "HEADED" : "HEADLESS"} (no sandbox) =====`);
    for (const u of urls) {
      try { const r = await testPlay(browser, u); console.log(`  ${host(u).padEnd(20)} play:${r.adv?"YES":(r.vid?"vid":"no ")} ${r.vhost?("@"+r.vhost):""}  ${u.slice(0,55)}`); }
      catch (e) { console.log(`  ${host(u).padEnd(20)} ERR ${String(e).slice(0,60)}`); }
    }
    await browser.close();
  }
  console.log("\nPROBE7 DONE");
})().catch((e) => { console.error("PROBE7 ERROR", e); process.exit(1); });
