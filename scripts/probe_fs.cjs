// Does starting via requestFullscreen (a gesture on OUR page, none inside the iframe) start the
// video WITHOUT arming Adcash's first-gesture pop? Headed (real fullscreen). Fresh browser per trial.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }

async function trial(url, how){
  const browser = await chromium.launch({ channel:"chrome", headless:false, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:760}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage(); let pops=0; ctx.on("page", p=>{ if(p!==page){pops++; p.close().catch(()=>{});} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate(({u,h})=>{
    window.__how=h;
    const b=document.createElement('button'); b.id='__go'; b.textContent='GO'; b.style.cssText='position:fixed;z-index:2147483647;top:0;left:0;width:100vw;height:38px';
    b.onclick=()=>{ const f=document.getElementById('__t'); if(h==='fs'){ (f.requestFullscreen||f.webkitRequestFullscreen).call(f); } else if(h==='fs+space'){ (f.requestFullscreen||f.webkitRequestFullscreen).call(f); } };
    document.body.appendChild(b);
    const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;top:38px;left:0;right:0;bottom:0;width:100vw;border:0;background:#000'; document.body.appendChild(f);
  }, {u:url,h:how});
  await sleep(6500);
  const p0=pops;
  await page.click('#__go'); await sleep(2500);
  if (how==='fs+space'){ await page.keyboard.press('Space'); await sleep(1500); await page.keyboard.press('KeyK'); await sleep(1500); }
  await sleep(3000);
  let v=await vstate(page);
  await page.keyboard.press('Escape').catch(()=>{});
  const r = { how, started:!!(v&&v.rs>=2), rs:v&&v.rs, w:v&&v.w, muted:v&&v.muted, pops:pops-p0 };
  await browser.close();
  return r;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u)) || streams.map(x=>x.url).find(u=>/embed\.st/.test(u));
  console.log("url:", url, "\n");
  for (const how of ["fs","fs+space"]){
    try { const r=await trial(url, how); console.log(`start via ${how.padEnd(9)} -> started:${r.started?"YES":"no"} (rs${r.rs} w${r.w} muted=${r.muted}) pops:${r.pops} ${r.started&&r.pops===0?"  <<< AD-FREE START!":""}`); }
    catch(e){ console.log(`${how} ERR`, String(e).slice(0,60)); }
  }
  console.log("\nPROBE_FS DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
