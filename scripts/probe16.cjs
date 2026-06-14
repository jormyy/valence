// Spatial popup map: does the ad click-catcher cover the WHOLE player, or is there a safe zone
// (e.g., the native control bar)? Inject a fresh embed iframe on a real-HTTP top (localhost) per
// position, click that spot N times, count popups. Reveals whether a targeted shield is possible.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}

const POSITIONS = [
  ["center",        0.50, 0.45],
  ["upper-left",    0.20, 0.20],
  ["upper-right",   0.80, 0.20],
  ["lower-left",    0.15, 0.92],   // control bar left (play)
  ["bar-center",    0.50, 0.92],   // control bar center
  ["bar-rightmost", 0.96, 0.92],   // fullscreen corner
  ["bottom-strip",  0.50, 0.97],
  ["dead-bottom-r", 0.92, 0.96],
];

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u)) || streams[0].url;
  console.log("spatial popup map on:", url, "\n");

  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720},
    userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups = 0; ctx.on("page", async p=>{ if(p===page) return; popups++; try{await p.close()}catch{} });
  // real http top
  await page.goto("http://localhost:3000", { waitUntil:"domcontentloaded" });

  async function freshIframe(){
    await page.evaluate((u)=>{
      const old=document.getElementById('__t'); if(old) old.remove();
      const f=document.createElement('iframe'); f.id='__t'; f.src=u;
      f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true;
      f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000';
      document.body.appendChild(f);
    }, url);
    await sleep(5500);
  }

  for (const [name,fx,fy] of POSITIONS){
    await freshIframe();
    const x = 1280*fx, y = 720*fy;
    const p0 = popups;
    for (let i=0;i<5;i++){ await page.mouse.click(x,y); await sleep(1300); }
    await sleep(1500);
    const d = popups - p0;
    console.log(`  ${name.padEnd(14)} (${Math.round(x)},${Math.round(y)}) clicks:5 -> popups:${d} ${d===0?"  <= SAFE ZONE":""}`);
  }
  await browser.close();
  console.log("\nPROBE16 DONE");
})().catch((e)=>{console.error("PROBE16 ERROR",e);process.exit(1)});
