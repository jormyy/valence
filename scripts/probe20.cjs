// Does a PRECISE click on the center play triangle start the video, and does it pop? Try several
// strategies across fresh iframes on a real-http top. Decides if a "shield + play-hole" can start
// playback ad-free.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls = streams.map(x=>x.url).filter(u=>/embed\.st\/embed\/(delta|echo)/.test(u)).slice(0,2);
  if(!urls.length) urls.push(streams.map(x=>x.url).find(u=>/embed\.st/.test(u)));
  const W=1280,H=720;
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  async function fresh(url){ await page.evaluate((u)=>{ const o=document.getElementById('__t'); if(o)o.remove(); const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url); await sleep(6500); }

  // strategy: precise center click(s); measure start (rs>=2 or t advancing) + popups, twice per url
  for (const url of urls){
    for (const strat of ["single@center","double@center","two-clicks-1.5s"]){
      await fresh(url);
      const p0=popups;
      if (strat==="single@center"){ await page.mouse.click(W*0.5,H*0.5); }
      else if (strat==="double@center"){ await page.mouse.dblclick(W*0.5,H*0.5); }
      else { await page.mouse.click(W*0.5,H*0.5); await sleep(1500); await page.mouse.click(W*0.5,H*0.5); }
      await sleep(5000);
      const v=await vstate(page);
      const started = v && (v.rs>=2 || v.t>0.3 || v.w>200);
      console.log(`${host(url).slice(0,12)} ${strat.padEnd(16)} -> started:${started?"YES":"no"} (rs${v&&v.rs} t${v&&v.t} w${v&&v.w}) popups:${popups-p0}`);
    }
  }
  await browser.close();
  console.log("PROBE20 DONE");
})().catch((e)=>{console.error("PROBE20 ERROR",e);process.exit(1)});
