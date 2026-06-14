// Pin down the safe-zone boundary + confirm the native control bar RESPONDS there (play/pause
// toggles the real video) + verify zero popups when shielding the body. Across multiple sources.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

async function vstate(page){
  for (const f of page.frames()){
    try { const v = await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth}:null}); if(v&&v.w>200) return v; } catch {}
  }
  return null;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const W=1280,H=720;
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});

  async function freshIframe(url){
    await page.evaluate((u)=>{ const o=document.getElementById('__t'); if(o)o.remove();
      const f=document.createElement('iframe'); f.id='__t'; f.src=u;
      f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true;
      f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000';
      document.body.appendChild(f); }, url);
    await sleep(6000);
  }

  // PART 1: vertical boundary on an embed.st url (x=0.5), fresh iframe each y
  const url0 = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)) || streams[0].url;
  console.log("PART 1 — vertical popup boundary (x=0.5) on", host(url0));
  for (const fy of [0.45,0.60,0.70,0.78,0.84,0.88,0.91,0.94,0.97]){
    await freshIframe(url0);
    const p0=popups; for(let i=0;i<5;i++){ await page.mouse.click(W*0.5,H*fy); await sleep(1200);} await sleep(1000);
    console.log(`   y=${fy.toFixed(2)} (px ${Math.round(H*fy)}) -> popups:${popups-p0} ${popups-p0===0?"SAFE":""}`);
  }

  // PART 2: does the control bar RESPOND in the safe zone? toggle play/pause via bottom-bar play btn (left).
  console.log("\nPART 2 — native control bar responds in safe zone?");
  for (const url of [url0, streams.map(x=>x.url).find(u=>/streamapi/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u))].filter(Boolean)){
    await freshIframe(url);
    // hover bottom to reveal controls, then click the play/pause (bottom-left) and watch paused flip
    await page.mouse.move(W*0.5,H*0.93); await sleep(800);
    const a = await vstate(page);
    const p0=popups;
    await page.mouse.click(W*0.06,H*0.93); await sleep(1800);  // play/pause button area
    const b = await vstate(page);
    await page.mouse.click(W*0.06,H*0.93); await sleep(1800);  // toggle back
    const c = await vstate(page);
    const toggled = a&&b&&c && (a.paused!==b.paused || b.paused!==c.paused);
    console.log(`   ${host(url).padEnd(20)} vid:${a?`${a.w}px`:"none"} play/pause-toggled:${toggled?"YES":"no"} popups@bar:${popups-p0} states:[${a&&a.paused},${b&&b.paused},${c&&c.paused}]`);
  }
  await browser.close();
  console.log("\nPROBE17 DONE");
})().catch((e)=>{console.error("PROBE17 ERROR",e);process.exit(1)});
