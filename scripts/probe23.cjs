// NOVEL: parent observes the iframe's `focus` (fires when user clicks into it) and consumes the
// gesture's popup allowance from the PARENT before the ad's click handler runs. If the popup
// allowance is per-TAB, the ad's window.open is then blocked. A/B: control vs consume-on-focus.
const PW = "/Users/michaelchen/valence/resolver/node_modules/playwright";
const { chromium } = require(PW);
const http = require("http");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => { try { return new URL(u).host; } catch { return u; } };
function apiGet(p){return new Promise((res,rej)=>http.get("http://localhost:3000"+p,(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on("error",rej))}
const isAd = (h)=>/zerodrift|betonline|bovada|rainbet|wildcasino|softonic|mynqel|vivint|wherewinds|roadster|fubo|betnow|slots|nn125|throughlnk|kettle|mysoftware|knowacalif|realization|ryfhya|spends|thebluedraw|singleflirt|paramount/i.test(h);

async function trial(ctx, url, consume){
  const page = await ctx.newPage();
  const popups=[]; const ph=(p)=>{ if(p===page)return; popups.push(host(p.url()||"blank")); p.close().catch(()=>{}); };
  ctx.on("page", ph);
  await page.goto("http://localhost:3000",{waitUntil:"domcontentloaded"});
  await page.evaluate(({u,consume})=>{
    const f=document.createElement('iframe'); f.id='__t'; f.src=u; f.tabIndex=0;
    f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture'); f.allowFullscreen=true;
    f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#000';
    document.body.appendChild(f);
    if (consume) {
      window.__mine=0;
      const burn=()=>{ try{ if(navigator.userActivation && navigator.userActivation.isActive){ const w=window.open('about:blank','_blank','width=1,height=1,left=-9999,top=-9999'); if(w){ window.__mine++; setTimeout(()=>{try{w.close()}catch(e){}},30);} } }catch(e){} };
      f.addEventListener('focus', burn, true);
      window.addEventListener('blur', ()=>{ setTimeout(burn,0); }, true);
      // also poll briefly: when activation appears, burn
      setInterval(burn, 120);
    }
  }, {u:url,consume});
  await sleep(6000);
  for (const [fx,fy] of [[0.5,0.45],[0.5,0.5],[0.5,0.45],[0.4,0.4],[0.6,0.55],[0.5,0.45],[0.45,0.5],[0.55,0.45]]) { await page.mouse.click(1280*fx,720*fy); await sleep(1400); }
  await sleep(2000);
  const mine = await page.evaluate(()=>window.__mine||0).catch(()=>0);
  ctx.off("page", ph);
  await page.close();
  const ads = popups.filter(isAd).length;
  const blank = popups.filter(h=>h==="blank"||h===""||h==="about:blank").length;
  return { ads, blank, mine, total: popups.length, sample: popups.filter(isAd).slice(0,4) };
}

(async () => {
  const g = await apiGet("/api/games"); const games=g.games||g;
  const id = games.find(x=>x.status==="in"&&x.streamCount>0).id;
  const s = await apiGet("/api/streams/"+id); const streams=s.streams||s;
  const url = streams.map(x=>x.url).find(u=>/embed\.st\/embed/.test(u));
  const browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled","--autoplay-policy=no-user-gesture-required","--mute-audio"] });
  const ctx = await browser.newContext({ viewport:{width:1280,height:720}, userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" });
  await ctx.addInitScript(`try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined})}catch(e){}`);
  console.log("url:", host(url), "\n");
  for (const consume of [false, true, false, true]){
    const r = await trial(ctx, url, consume);
    console.log(`consume-on-focus=${consume?"ON ":"OFF"} -> AD popups:${r.ads}  (myBlank:${r.blank}/${r.mine}, total:${r.total}) ${r.sample.length?("ads:"+r.sample):""}`);
  }
  await browser.close();
  console.log("\nPROBE23 DONE");
})().catch((e)=>{console.error("PROBE23 ERROR",e);process.exit(1)});
