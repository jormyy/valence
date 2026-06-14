// PIVOTAL TEST: can we defeat the sandbox-detector by priming its 1h "not sandboxed" cache?
// In one context (shared storage partition): mount the embed UNSANDBOXED briefly (prime), then
// mount the SAME url SANDBOXED and see if it plays (detector skips re-check) without the nag.
// Variants of priming: none / hidden-no-click / hidden-1click. Measure play + nag + popups.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock";

async function scan(page){
  let best=null, nag="";
  for (const f of page.frames()){
    try {
      const r = await f.evaluate(()=>{ const vs=[...document.querySelectorAll("video")].map(v=>({w:v.videoWidth,h:v.videoHeight,t:v.currentTime})); const tx=document.body?document.body.innerText:""; return {vs,tx}; });
      for (const v of r.vs){ const area=v.w*v.h; if(area>0 && (!best||area>best.area)) best={...v,area,host:host(f.url())}; }
      if(/sandbox|allow-popups|remove sandbox/i.test(r.tx)) nag += r.tx.replace(/\s+/g," ").slice(0,60)+" | ";
    } catch {}
  }
  return {best,nag};
}

async function trial(browser, url, mode){
  const ctx = await browser.newContext({ viewport:{width:1280,height:760},
    userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  const page = await ctx.newPage();
  let popups=0; ctx.on("page", async p=>{popups++; try{await p.close()}catch{}});

  // PRIME (optional): mount unsandboxed in a hidden iframe in the same partition
  if (mode !== "none") {
    await page.setContent(`<!doctype html><body style="margin:0"><iframe id=p src="${url}"
      style="position:fixed;left:-9999px;width:1000px;height:700px;border:0"></iframe></body>`, {waitUntil:"domcontentloaded"});
    await sleep(5500);
    if (mode === "click") { // give the hidden frame a gesture so window.open-based detector runs
      try { const b=await page.$("#p"); const bb=await b.boundingBox(); /* offscreen: click via JS focus + dispatch is not a real gesture; use mouse on a temp onscreen */ } catch {}
      // bring onscreen briefly, click once, then we proceed
      await page.evaluate(()=>{ const f=document.getElementById('p'); f.style.left='0px'; });
      await sleep(500); await page.mouse.click(500,350); await sleep(2500);
    }
  }

  // REAL: mount sandboxed (same url, same partition)
  await page.setContent(`<!doctype html><body style="margin:0;background:#000"><iframe sandbox="${SANDBOX}"
     allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen src="${url}"
     style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body>`, {waitUntil:"domcontentloaded"});
  await sleep(5000);
  for (let i=0;i<4;i++){ await page.mouse.click(640,380); await sleep(1500); }
  const a = await scan(page); await sleep(3000); const b = await scan(page);
  const adv = a.best && b.best && b.best.host===a.best.host ? (b.best.t - a.best.t) : (b.best?b.best.t:0);
  await ctx.close();
  return { play: b.best && adv>0.3 ? `${b.best.w}x${b.best.h}@${b.best.host}(+${adv.toFixed(2)})` : (b.best?`vid-noadv@${b.best.host}`:"NO"), nag:b.nag.slice(0,50), popups };
}

(async () => {
  const ids = process.argv.slice(2);
  let id = ids[0]; if(!id){ const g=await apiGet("/api/games"); const games=g.games||g; id=games.find(x=>x.status==="in"&&x.streamCount>0).id; }
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  // pick embed.st + streamapi urls (the hostile family)
  const urls = streams.map(x=>x.url).filter(u=>/embed\.st|streamapi/.test(host(u))).slice(0,3);
  console.log("game",id,"urls:",urls.map(host).join(","),"\n");
  const browser = await chromium.launch({ channel:"chrome", headless:!process.env.HEADED,
    args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  for (const url of urls){
    console.log(`URL ${host(url)} ${url.slice(-8)}`);
    for (const mode of ["none","noclick","click"]){
      try { const r = await trial(browser, url, mode); console.log(`   prime=${mode.padEnd(8)} -> play:${r.play.padEnd(28)} popupsDuring:${r.popups} ${r.nag?("NAG:"+r.nag):""}`); }
      catch(e){ console.log(`   prime=${mode} ERR ${String(e).slice(0,50)}`); }
    }
  }
  await browser.close();
  console.log("\nPROBE12 DONE");
})().catch((e)=>{console.error("PROBE12 ERROR",e);process.exit(1)});
