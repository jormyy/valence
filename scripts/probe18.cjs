// Verify the shield-body solution: (1) does the embed autoplay? (2) is the native control bar
// usable in the safe zone (play/pause toggles, fullscreen btn present)? (3) zero popups when only
// the bottom strip is used. Screenshots saved so we can SEE the control bar layout.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const OUT = "/tmp/safezone"; fs.mkdirSync(OUT, { recursive: true });
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video");return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,muted:v.muted}:null}); if(v&&v.w>200)return v; } catch{} } return null; }

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const W=1280,H=720;
  // pick real-player urls (skip admin/ppv gateway)
  const urls = [];
  for (const re of [/embed\.st\/embed\/(delta|echo)/, /streamapi/, /embedindia/]) { const u = streams.map(x=>x.url).find(u=>re.test(u)); if(u) urls.push(u); }
  if (!urls.length) urls.push(streams[0].url);

  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  async function fresh(url){ await page.evaluate((u)=>{ const o=document.getElementById('__t'); if(o)o.remove(); const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url); await sleep(6500); }

  for (const url of urls){
    const tag = host(url)+"-"+url.slice(-6).replace(/\W/g,"");
    await fresh(url);
    const auto = await vstate(page);  // no interaction yet
    await page.mouse.move(W*0.5,H*0.92); await sleep(700); await page.mouse.move(W*0.5,H*0.9); await sleep(500);
    await page.screenshot({ path:`${OUT}/${tag}-bar.png` });
    // try play/pause toggle via bottom-left control
    const p0=popups; const a=await vstate(page);
    await page.mouse.click(W*0.045,H*0.92); await sleep(1800); const b=await vstate(page);
    await page.mouse.click(W*0.045,H*0.92); await sleep(1800); const c=await vstate(page);
    const toggled = [a,b,c].every(Boolean) && (a.paused!==b.paused || b.paused!==c.paused);
    // aggressive body clicks (should be shielded in real impl; here measure they DO pop = need shield)
    console.log(`${host(url).padEnd(20)} autoplay:${auto?(auto.paused?"loaded-paused":"PLAYING"):"none"} barToggle:${toggled?"YES":"no"} popups@bar:${popups-p0} states[${a&&a.paused},${b&&b.paused},${c&&c.paused}] vid:${(c||a||{}).w||"-"}`);
  }
  await browser.close();
  console.log(`\nscreenshots in ${OUT}\nPROBE18 DONE`);
})().catch((e)=>{console.error("PROBE18 ERROR",e);process.exit(1)});
