// Can the video be STARTED via JW's keyboard shortcut (a keydown handler, not a click) with the
// iframe focused — firing ZERO Adcash pops (Adcash listens for clicks)? If so, that's the ad-free
// start. Try Space/k/Enter/ArrowUp with several focus strategies; measure start + pops precisely.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState,muted:v.muted}:null}); if(v) return v; } catch{} } return null; }

async function trial(ctx, url, focusHow){
  const page = await ctx.newPage(); let pops=0; const ph=(p)=>{ if(p===page)return; pops++; p.close().catch(()=>{}); }; ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(7000);
  const p0 = pops;
  // focus the iframe WITHOUT a body click (so Adcash's click handler isn't triggered)
  if (focusHow==="contentWindow") await page.evaluate(()=>{ const f=document.getElementById('__t'); try{f.contentWindow.focus()}catch(e){} f.focus(); });
  else if (focusHow==="tab") { await page.evaluate(()=>document.body.focus()); await page.keyboard.press('Tab'); await sleep(200); await page.keyboard.press('Tab'); }
  await sleep(400);
  const log = [];
  for (const k of ["Space","KeyK","Enter","ArrowUp","KeyK","Space"]){
    const b = await vstate(page);
    await page.keyboard.press(k); await sleep(1500);
    const a = await vstate(page);
    const started = a && (a.rs>=2 || a.w>200 || a.t>0.3);
    log.push(`${k}:${started?"PLAY":(a&&a.paused===false?"unpaused":"-")}`);
    if (started) break;
  }
  const v = await vstate(page);
  ctx.off("page", ph); await page.close();
  return { focusHow, started: !!(v&&(v.rs>=2||v.w>200)), rs:v&&v.rs, w:v&&v.w, pops:pops-p0, log:log.join(" ") };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const urls=[ streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u))||streams.map(x=>x.url).find(u=>/embed\.st/.test(u)), streams.map(x=>x.url).find(u=>/embedindia/.test(u)) ].filter(Boolean);
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  for (const url of urls){
    console.log("\n####", url.slice(0,55));
    for (const how of ["contentWindow","tab"]){
      try { const r=await trial(ctx, url, how); console.log(`  focus=${how.padEnd(13)} keys[${r.log}] -> started:${r.started?"YES":"no"} (rs${r.rs} w${r.w}) pops:${r.pops} ${r.started&&r.pops===0?"  <<< AD-FREE KEYBOARD START!":""}`); }
      catch(e){ console.log(`  ${how} ERR`, String(e).slice(0,50)); }
    }
  }
  await browser.close(); console.log("\nPROBE_KBD DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
