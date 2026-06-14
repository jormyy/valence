// Instrument window.open + top-navigation in EVERY frame (addInitScript injects into cross-origin
// frames too) to capture the ad's real intent and trigger. Diagnostic only. Logs WOPEN/TOPSET calls.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

const INIT = `(() => {
  try {
    const log = (...a) => { try { console.log('ADHOOK', JSON.stringify(a)); } catch(e){ console.log('ADHOOK', a.join(' ')); } };
    const oOpen = window.open;
    window.open = function(u, t, f) { log('WOPEN', String(u||''), String(t||''), location.host); try { return oOpen.apply(this, arguments); } catch(e){ log('WOPEN_THREW', String(e)); return null; } };
    // detect attempts to navigate top
    try {
      const d = Object.getOwnPropertyDescriptor(Window.prototype, 'open'); // noop guard
    } catch(e){}
    // anchor clicks with target
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a) log('ACLICK', a.href.slice(0,80), a.target||'', location.host);
    }, true);
    // beforeunload = something is navigating this frame/top
    window.addEventListener('beforeunload', () => log('BEFOREUNLOAD', location.host));
    // try to observe top assignment via proxy on location is not possible; log when we are top
  } catch(e) {}
})();`;

(async () => {
  const ids = process.argv.slice(2);
  let id = ids[0];
  if (!id) { const g = await apiGet("/api/games"); const games = g.games||g; id = games.find(x=>x.status==="in"&&x.streamCount>0).id; }
  const s = await apiGet("/api/streams/" + id); const streams = s.streams||s;
  const urls = streams.map(x=>x.url);
  const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED, args: ["--autoplay-policy=no-user-gesture-required","--mute-audio"] });

  for (const url of urls.slice(0, Number(process.env.N||3))) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const hooks = []; const popups = []; const topnavs = [];
    page.on("console", (m) => { const t = m.text(); if (t.startsWith("ADHOOK")) hooks.push(t.replace("ADHOOK ","")); });
    ctx.on("page", async (p) => { popups.push(p.url()||"blank"); try{await p.close()}catch{} });
    page.on("framenavigated",(f)=>{ if(f===page.mainFrame() && !f.url().startsWith("data:") && f.url()!=="about:blank") topnavs.push(host(f.url())); });

    console.log(`\n######## ${host(url)} :: ${url.slice(0,64)}`);
    await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe
       allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
       src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, { waitUntil:"domcontentloaded" });
    await sleep(5000);
    const pts=[[640,380],[640,380],[300,200],[1000,600],[640,700],[1150,120],[640,380],[800,400],[400,500],[640,380]];
    for (const [x,y] of pts){ await page.mouse.click(x,y); await sleep(1700); }
    await sleep(2500);
    // dedupe hooks for readability
    const seen = new Set(); const uniq = [];
    for (const h of hooks){ const k=h.slice(0,60); if(!seen.has(k)){seen.add(k); uniq.push(h);} }
    console.log(`  WOPEN/ACLICK hooks (${hooks.length} total, ${uniq.length} uniq):`);
    for (const h of uniq.slice(0,25)) console.log("    ", h.slice(0,120));
    console.log(`  real popups opened: ${popups.length} ${popups.slice(0,5).join(", ")}`);
    console.log(`  top-frame redirects: ${topnavs.length} ${topnavs.slice(0,5).join(", ")}`);
    await ctx.close();
  }
  await browser.close();
  console.log("\nPROBE10 DONE");
})().catch((e)=>{console.error("PROBE10 ERROR",e);process.exit(1)});
