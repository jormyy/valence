// Map ad-free keyboard-start coverage + find the production-viable focus method. For each source,
// try focus methods × keys, measure (rs>=2 start, pops). Goal: which sources start ad-free via kbd,
// and can we trigger it with just iframe focus (no manual Tab)?
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
async function vstate(page){ for (const f of page.frames()){ try { const v=await f.evaluate(()=>{const v=document.querySelector("video"); return v?{paused:v.paused,t:+v.currentTime.toFixed(2),w:v.videoWidth,rs:v.readyState}:null}); if(v) return v; } catch{} } return null; }

async function trial(ctx, url, method){
  const page = await ctx.newPage(); let pops=0; const ph=(p)=>{ if(p===page)return; pops++; p.close().catch(()=>{}); }; ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate((u)=>{ const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0; f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true; f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:9;background:#000'; document.body.appendChild(f);}, url);
  await sleep(7000);
  const p0=pops;
  // focus strategy
  if (method.startsWith("ifocus")) await page.evaluate(()=>{ const f=document.getElementById('__t'); try{f.contentWindow.focus()}catch(e){} f.focus(); });
  if (method.includes("tab")){ await page.evaluate(()=>document.body.focus()); for(let i=0;i<(method.includes("tab2")?2:1);i++){ await page.keyboard.press('Tab'); await sleep(150);} }
  await sleep(300);
  // press keys until started
  let started=false;
  for (const k of ["Space","KeyK","Enter","Space","KeyK"]){
    await page.keyboard.press(k); await sleep(1600);
    const v=await vstate(page); if(v&&(v.rs>=2||v.w>200)){ started=true; break; }
  }
  const v=await vstate(page);
  ctx.off("page", ph); await page.close();
  return { method, started: !!(v&&(v.rs>=2||v.w>200)), rs:v&&v.rs, pops:pops-p0 };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  // unique-ish sources across hosts/servers
  const urls=[]; const seen=new Set();
  for (const st of streams){ const key=host(st.url)+st.url.split("/").slice(3,5).join("/"); if(!seen.has(key)){seen.add(key); urls.push(st.url);} if(urls.length>=8)break; }
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  let adFreeStarts=0; const hostsAdFree=new Set();
  for (const url of urls){
    let best=null;
    for (const method of ["tab2","ifocus+tab","ifocus"]){
      try { const r=await trial(ctx, url, method); if(r.started){ best=r; if(r.pops===0)break; } if(!best)best=r; }
      catch(e){ }
    }
    const adFree = best && best.started && best.pops===0;
    if (adFree){ adFreeStarts++; hostsAdFree.add(host(url)); }
    console.log(`${host(url).padEnd(20)} ${url.split("/").slice(3,5).join("/").slice(0,16).padEnd(16)} -> ${best&&best.started?"STARTS":"no   "} via ${best&&best.method||"-"} pops:${best&&best.pops} ${adFree?"  ✅ AD-FREE":""}`);
  }
  console.log(`\nad-free keyboard starts: ${adFreeStarts}/${urls.length}  | distinct hosts: ${[...hostsAdFree].join(", ")}`);
  await browser.close(); console.log("PROBE_KBD2 DONE");
})().catch((e)=>{console.error("ERR",e);process.exit(1)});
