// Which event does Adcash's window.open fire on (click vs pointerdown/mousedown/touchstart)? And
// does JW's play fire on an earlier event? If the pop is on 'click' but play is on 'pointerdown',
// a synthetic-or-staged delivery might start it without the pop. Instrument both in the iframe.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

const INIT = `(() => {
  try {
    // track the in-flight event type at any moment
    window.__evt = '(none)';
    const types = ['pointerdown','mousedown','touchstart','pointerup','mouseup','click','keydown','dblclick','auxclick'];
    for (const t of types) document.addEventListener(t, (e)=>{ window.__evt = t + (e.isTrusted?'':'#synth'); }, true);
    // window.open -> report the event in flight
    const o = window.open;
    window.open = function(u,t,f){ try{ window.__report(JSON.stringify({kind:'WOPEN', evt: window.__evt, url:String(u||'').slice(0,40), host:location.host})); }catch(e){} return o.apply(this, arguments); };
    // observe play() on any video -> report the event in flight
    const hook = () => { const v=document.querySelector('video'); if(v && !v.__hk){ v.__hk=1; const p=v.play.bind(v); v.play=function(){ try{ window.__report(JSON.stringify({kind:'PLAY', evt:window.__evt, host:location.host})); }catch(e){} return p(); }; } };
    setInterval(hook, 500);
  } catch(e){}
})();`;

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u));
  console.log("embed:", url, "\n");
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const reports = [];
  await ctx.exposeBinding("__report", (_s, d) => { try { reports.push(JSON.parse(d)); } catch {} });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); let pops=0; ctx.on("page", p=>{ if(p!==page){pops++; p.close().catch(()=>{});} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(6000);
  // a single real click at centre
  await page.mouse.click(640, 360); await sleep(2500);
  await page.mouse.click(640, 360); await sleep(2500);
  console.log("real popups:", pops);
  console.log("instrumented events:");
  const seen=new Set();
  for (const r of reports){ const k=r.kind+r.evt; if(seen.has(k))continue; seen.add(k); console.log(`  ${r.kind} fired during event: ${r.evt}  ${r.url?('-> '+r.url):''}`); }
  if (!reports.length) console.log("  (no WOPEN/PLAY captured — handlers may be in a nested ad frame)");
  await browser.close(); console.log("\nPROBE_ADCASH DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
