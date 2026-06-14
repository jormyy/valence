// Stealth observation: mask automation so real popup/redirect ads fire, and capture window.open +
// anchor-target + top-nav intent reliably across out-of-process frames via exposeBinding.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

const STEALTH = `(() => {
  try { Object.defineProperty(navigator,'webdriver',{get:()=>undefined}); } catch(e){}
  try { window.chrome = window.chrome || { runtime: {} }; } catch(e){}
  try { Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]}); } catch(e){}
  try { Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']}); } catch(e){}
})();`;

const HOOK = `(() => {
  try {
    const report = (kind, a, b) => { try { window.__adhook(JSON.stringify({kind, a:String(a||'').slice(0,90), b:String(b||''), host:location.host})); } catch(e){} };
    const oOpen = window.open;
    window.open = function(u,t,f){ report('WOPEN', u, t); try { return oOpen.apply(this, arguments); } catch(e){ report('WOPEN_THREW', e.message); return null; } };
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a && (a.target==='_blank'||a.target==='_top'||a.target==='_parent')) report('ACLICK', a.href, a.target);
    }, true);
  } catch(e){}
})();`;

(async () => {
  const ids = process.argv.slice(2);
  let id = ids[0];
  if (!id) { const g = await apiGet("/api/games"); const games=g.games||g; id = games.find(x=>x.status==="in"&&x.streamCount>0).id; }
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls = streams.map(x=>x.url);
  const browser = await chromium.launch({ channel:"chrome", headless:!process.env.HEADED,
    args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });

  for (const url of urls.slice(0, Number(process.env.N||3))) {
    const ctx = await browser.newContext({ viewport:{width:1280,height:760},
      userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
    const intents = []; const popups = []; const topnavs = [];
    await ctx.exposeBinding("__adhook", (_src, payload) => { try { intents.push(JSON.parse(payload)); } catch(e){} });
    await ctx.addInitScript(STEALTH);
    await ctx.addInitScript(HOOK);
    const page = await ctx.newPage();
    ctx.on("page", async (p)=>{ popups.push(p.url()||"blank"); try{await p.close()}catch{} });
    page.on("framenavigated",(f)=>{ if(f===page.mainFrame() && !f.url().startsWith("data:") && f.url()!=="about:blank") topnavs.push(host(f.url())); });

    console.log(`\n######## ${host(url)} :: ${url.slice(0,60)}`);
    await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe
       allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen
       src="${url}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, { waitUntil:"domcontentloaded" });
    await sleep(5000);
    const pts=[[640,380],[640,380],[300,200],[1000,600],[640,700],[1150,120],[640,380],[800,400],[400,500],[640,380],[700,300],[500,450]];
    for (const [x,y] of pts){ await page.mouse.click(x,y); await sleep(1700); }
    await sleep(2500);
    const seen=new Set(); const uniq=intents.filter(i=>{const k=i.kind+i.a.slice(0,50); if(seen.has(k))return false; seen.add(k); return true;});
    console.log(`  window.open / anchor-target INTENTS (${intents.length} total, ${uniq.length} uniq):`);
    for (const i of uniq.slice(0,20)) console.log(`     ${i.kind} from[${i.host}] -> ${i.a} ${i.b}`);
    console.log(`  ACTUAL popups opened: ${popups.length}  ${popups.slice(0,6).map(host).join(", ")}`);
    console.log(`  ACTUAL top redirects: ${topnavs.length}  ${topnavs.slice(0,6).join(", ")}`);
    await ctx.close();
  }
  await browser.close();
  console.log("\nPROBE11 DONE");
})().catch((e)=>{console.error("PROBE11 ERROR",e);process.exit(1)});
