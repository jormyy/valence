// Observe real ad firing: load ad-heavy embeds with NO protection (headed), interact like a user,
// and log EVERY popup + EVERY frame navigation (top-nav redirects AND embed self-nav). Goal: learn
// the actual trigger so we can block it. Screenshots to /tmp/adblock-obs.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const OUT = "/tmp/adblock-obs"; fs.mkdirSync(OUT, { recursive: true });
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

(async () => {
  // gather a few ad-heavy URLs from a live game (prefer admin/ppv + streamapi)
  const ids = process.argv.slice(2);
  let id = ids[0];
  if (!id) { const g = await apiGet("/api/games"); const games = g.games||g; id = games.find(x=>x.status==="in"&&x.streamCount>0).id; }
  const s = await apiGet("/api/streams/" + id); const streams = s.streams||s;
  const urls = streams.map(x=>x.url).slice(0, 12);
  console.log("game", id, "->", urls.length, "streams");

  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED ? true : false, args: ["--autoplay-policy=no-user-gesture-required","--mute-audio"] });

  for (const url of urls.slice(0, Number(process.env.N||4))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const page = await ctx.newPage();
    const events = [];
    ctx.on("page", async (p) => { events.push("POPUP -> " + (p.url()||"about:blank")); try{ await p.close(); }catch{} });
    page.on("framenavigated", (f) => {
      const tag = f === page.mainFrame() ? "TOPNAV" : "framenav";
      const h = host(f.url());
      if (h === "about:blank" || f.url().startsWith("data:")) return;
      events.push(`${tag} [${f === page.mainFrame() ? "MAIN" : host(f.parentFrame()?f.parentFrame().url():"")}] -> ${h}`);
    });
    page.on("download", (d) => events.push("DOWNLOAD -> " + d.url()));

    console.log(`\n######## ${host(url)} :: ${url.slice(0,70)}`);
    await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe id=f
       allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
       src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, { waitUntil: "domcontentloaded" });
    await sleep(5000);
    // human-like: click many distinct spots over time (ad catchers, fake play btns, video)
    const pts = [[640,380],[640,380],[300,200],[1000,600],[640,700],[120,120],[1150,120],[640,380],[800,400],[400,500],[640,380],[950,250]];
    for (let i=0;i<pts.length;i++){ await page.mouse.click(pts[i][0],pts[i][1]); await sleep(1800); }
    await sleep(3000);
    await page.screenshot({ path: `${OUT}/${host(url)}-${url.slice(-6)}.png` }).catch(()=>{});
    console.log("  events (" + events.length + "):");
    for (const e of events.slice(0, 30)) console.log("   ", e);
    await ctx.close();
  }
  await browser.close();
  console.log(`\nshots in ${OUT}\nPROBE9 DONE`);
})().catch((e)=>{console.error("PROBE9 ERROR",e);process.exit(1)});
