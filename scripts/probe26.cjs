// What controls exist once PLAYING? Start the video (center, accept the gate pop), confirm rs4,
// reveal controls, screenshot, and probe whether the bottom bar has working volume/fullscreen
// without popping. Determines whether ANY native controls exist to expose.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs=require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const OUT="/tmp/playing"; fs.mkdirSync(OUT,{recursive:true});
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted,vol:+(v.volume||0).toFixed(2)}:null}); if(v) return v; } catch{} } return null; }

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u))||streams.map(x=>x.url).find(u=>/embed\.st/.test(u));
  const W=1280,H=720;
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage(); let popups=0; ctx.on("page", async p=>{ if(p===page)return; popups++; try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);
  await sleep(6000);
  // start: click center until playing (rs>=2)
  let v=null;
  for (let i=0;i<6;i++){ await page.mouse.click(W*0.5,H*0.5); await sleep(2500); v=await vstate(page); if(v&&v.rs>=2) break; }
  console.log("playing state:", JSON.stringify(v), "popupsToStart:", popups);
  if (!v || v.rs<2){ console.log("could not start; screenshot anyway"); }
  // reveal controls: move mouse across player
  for (const p of [[0.5,0.5],[0.5,0.9],[0.5,0.95],[0.3,0.92],[0.7,0.92]]) { await page.mouse.move(W*p[0],H*p[1]); await sleep(500); }
  await page.screenshot({ path:`${OUT}/playing.png` });
  // enumerate clickable control-ish elements inside the player frames
  for (const f of page.frames()){
    if (!/embed\.st/.test(host(f.url()))) continue;
    try {
      const ctrls = await f.evaluate(()=>{
        const out=[];
        for (const el of document.querySelectorAll('button,[class*="control"],[class*="volume"],[class*="fullscreen"],[class*="play"],[aria-label],svg,.media-control-button')){
          const r=el.getBoundingClientRect(); if(r.width<4||r.height<4) continue;
          out.push({tag:el.tagName, cls:(el.className&&el.className.toString?el.className.toString():'').slice(0,30), al:el.getAttribute&&el.getAttribute('aria-label')||'', x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)});
        }
        return out.slice(0,20);
      });
      if (ctrls.length) { console.log(`controls in ${host(f.url())}:`); ctrls.forEach(c=>console.log("   ",JSON.stringify(c))); }
    } catch {}
  }
  await browser.close();
  console.log(`\nscreenshot ${OUT}/playing.png\nPROBE26 DONE`);
})().catch((e)=>{console.error("PROBE26 ERROR",e);process.exit(1)});
