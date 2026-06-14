// Decisive: investigate start + playing-state controls. Does it autoplay? Is there an ad-free
// bottom control bar (play/pause/volume/fullscreen)? Map the playing-state safe zone. Screenshots.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http"); const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
const OUT = "/tmp/safezone2"; fs.mkdirSync(OUT, { recursive: true });
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
// detect ANY video incl 0-width (not yet sized) + report muted/paused
async function vstate(page){
  let any=null;
  for (const f of page.frames()){
    try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,muted:v.muted,rs:v.readyState}:null}); if(v){ if(v.w>200) return {...v,host:host(f.url())}; any=any||{...v,host:host(f.url())}; } } catch{}
  }
  return any;
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed\/(delta|echo)/.test(u)) || streams.map(x=>x.url).find(u=>/embed\.st/.test(u));
  const W=1280,H=720;
  console.log("investigate:", url, "\n");
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; const pl=[]; ctx.on("page", async p=>{ if(p===page)return; popups++; pl.push(host(p.url()||"")); try{await p.close()}catch{} });
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000'; document.body.appendChild(f);}, url);

  // 1) autoplay? wait 13s, no clicks
  await sleep(13000);
  const auto = await vstate(page);
  console.log("AUTOPLAY check (no clicks, 13s):", JSON.stringify(auto), "popups:", popups);
  await page.screenshot({ path:`${OUT}/1-initial.png` });

  // 2) reveal controls via repeated hover near bottom (no clicks)
  for (const y of [0.97,0.9,0.97,0.93]) { await page.mouse.move(W*0.4, H*y); await sleep(400); await page.mouse.move(W*0.6, H*y); await sleep(400); }
  await page.screenshot({ path:`${OUT}/2-hovered-noclick.png` });
  console.log("after bottom-hover (no click): popups:", popups);

  // 3) start via CENTER (accept ad for analysis), confirm playing, screenshot playing state
  const p0=popups;
  await page.mouse.click(W*0.5,H*0.45); await sleep(4000);
  const afterStart = await vstate(page);
  console.log("after CENTER click:", JSON.stringify(afterStart), "popupsFromStart:", popups-p0);
  // reveal controls now that it's playing
  for (const y of [0.97,0.9,0.97]) { await page.mouse.move(W*0.45,H*y); await sleep(500); await page.mouse.move(W*0.55,H*y); await sleep(500); }
  await page.screenshot({ path:`${OUT}/3-playing-controls.png` });

  // 4) playing-state safe-zone map (does the bottom bar exist + is it ad-free + functional?)
  console.log("\nPLAYING-STATE control probes (after each: vid paused?, popups):");
  const probes = [["bar play/pause L",0.045,0.93],["bar vol",0.11,0.93],["bar center",0.5,0.93],["bar settings R",0.88,0.93],["bar fullscreen",0.965,0.93]];
  for (const [name,fx,fy] of probes){
    await page.mouse.move(W*0.5,H*0.9); await sleep(400); // keep controls alive
    const b=await vstate(page); const q0=popups;
    await page.mouse.click(W*fx,H*fy); await sleep(1600);
    const a=await vstate(page);
    console.log(`   ${name.padEnd(18)} paused ${b&&b.paused}->${a&&a.paused}  popups:${popups-q0}`);
  }
  await page.screenshot({ path:`${OUT}/4-after-probes.png` });
  console.log("\ntotal popups:", popups, pl.slice(0,8));
  await browser.close();
  console.log(`screenshots in ${OUT}\nPROBE19 DONE`);
})().catch((e)=>{console.error("PROBE19 ERROR",e);process.exit(1)});
