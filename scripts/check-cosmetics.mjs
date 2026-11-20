// Real Board/MoveAnimation nodes, both perspectives and separate profiles.
// Start Vite on 5180. No live backend, payment or room calls are made.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const out = resolve("artifacts/cosmetics");
mkdirSync(out, { recursive: true });
const browserPath = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(path => path && existsSync(path));
if (!browserPath) throw new Error("Edge or Chrome is required.");
const profile = mkdtempSync(resolve(out, "profile-"));
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let version;
  for (let i = 0; i < 100; i++) {
    try {
      const port = Number(readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      version = await (await fetch(`http://localhost:${port}/json/version`)).json(); break;
    } catch { await wait(100); }
  }
  if (!version) throw new Error("Browser did not start.");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => { const msg = JSON.parse(event.data); if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); } };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const key = ++id;
    const timeout = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 20000);
    pending.set(key, msg => { clearTimeout(timeout); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); });
    ws.send(JSON.stringify({ id: key, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  const evaluate = async source => {
    const result = await s("Runtime.evaluate", { expression: `(async()=>{${source}})()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setCPUThrottlingRate", { rate: 4 });
  await s("Emulation.setDeviceMetricsOverride", { width: 800, height: 1100, deviceScaleFactor: 1, mobile: true });
  await s("Page.navigate", { url: "http://localhost:5180/tests/fixtures/cosmetic-duel.html" });
  await evaluate(`for(let n=0;n<150&&!window.cosmeticHarness;n++) await new Promise(r=>setTimeout(r,100)); if(!window.cosmeticHarness)throw new Error('Fixture did not load'); window.cosmeticChecks=[]; window.check=(ok,name)=>{if(!ok)throw new Error(name);cosmeticChecks.push(name)};`);
  for (const owner of ["black", "white"]) {
    await evaluate(`cosmeticHarness.owner('${owner}'); check(document.querySelectorAll('.board').length===2,'two boards ${owner}'); for(const viewer of ['black','white']) {const stage=document.querySelector('[data-viewer='+viewer+']');const own=stage.querySelectorAll('.board-row .piece-${owner}');const other=stage.querySelectorAll('.board-row .piece-${owner === "black" ? "white" : "black"}');check([...own].every(p=>p.dataset.pieceFinish==='amethyst'),'own variant ${owner} seen by '+viewer);check([...other].every(p=>p.dataset.pieceFinish==='classic'&&p.dataset.pieceEffect==='classic'),'rival keeps originals ${owner} seen by '+viewer);check(stage.querySelector('.board-frame').dataset.shopBoard===(viewer==='${owner}'?'jade':'classic'),'personal board '+viewer+' owner ${owner}');} `);
    await evaluate(`const mine=document.querySelector('[data-viewer=${owner}] .board-frame'), friend=document.querySelector('[data-viewer=${owner === "black" ? "white" : "black"}] .board-frame');check(getComputedStyle(mine).backgroundColor!==getComputedStyle(friend).backgroundColor,'no frame theme leak ${owner}');`);
    for (const mover of ["black", "white"]) {
      await evaluate(`cosmeticHarness.advance(); const ghosts=[...document.querySelectorAll('.ghost-mover .piece')];check(ghosts.length===2,'two moving ghosts ${owner}/${mover}');check(ghosts.every(p=>p.dataset.pieceFinish==='${mover === owner ? "amethyst" : "classic"}'),'moving finish ${owner}/${mover}');check(ghosts.every(p=>p.dataset.pieceEffect==='${mover === owner ? "comet" : "classic"}'),'moving effect ${owner}/${mover}');`);
      await wait(750);
      await evaluate(`check(!document.querySelector('.ghost-mover'),'ghost cleanup ${owner}/${mover}');`);
    }
  }
  for (const effect of ["silk", "coronation", "comet", "petal", "ember"]) {
    await evaluate(`cosmeticHarness.effect('${effect}'); cosmeticHarness.owner('black');cosmeticHarness.advance();const fx=[...document.querySelectorAll('.ghost-mover .cosmetic-fx')];check(fx.length===2,'owned effect nodes ${effect}');check(fx.every(n=>getComputedStyle(n).animationName!=='none'),'working animation ${effect}');`);
    await wait(850);
    await evaluate(`check(!document.querySelector('.ghost-mover'),'effect cleanup ${effect}');`);
  }
  await evaluate(`cosmeticHarness.motion('off');cosmeticHarness.owner('black');cosmeticHarness.advance();check([...document.querySelectorAll('.cosmetic-fx')].every(n=>n.getAnimations().length===0),'Off disables cosmetic animations');cosmeticHarness.motion('standard');`);
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate(`cosmeticHarness.owner('black');cosmeticHarness.advance();check([...document.querySelectorAll('.cosmetic-fx')].every(n=>n.getAnimations().length===0),'system reduced motion disables cosmetics');`);
  await wait(750);
  await s("Emulation.setEmulatedMedia", { features: [] });
  await evaluate(`cosmeticHarness.profile('A');cosmeticHarness.shop();`);
  await evaluate(`for(let n=0;n<80&&document.querySelector('.marketplace').dataset.collectionScope==='loading';n++)await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('.shop-filters button')].find(n=>n.textContent==='Pieces').click();`);
  await wait(100);
  await evaluate(`[...document.querySelectorAll('.shop-product')].find(n=>n.textContent.includes('Amethyst')).click();`);
  await wait(100);
  await evaluate(`document.querySelector('.shop-primary').click();`); await wait(100);
  await evaluate(`document.querySelector('.shop-primary').click();`); await wait(100);
  await evaluate(`document.querySelector('.shop-primary').click();`); await wait(100);
  await evaluate(`check(document.querySelector('.shop-primary').textContent==='Equipped','profile A equips its pack');cosmeticHarness.profile('B');check([...document.querySelectorAll('[data-viewer] .piece')].every(n=>n.dataset.pieceFinish==='classic'),'no old inventory flash on profile switch');`);
  await evaluate(`for(let n=0;n<80&&document.querySelector('.marketplace').dataset.collectionScope==='loading';n++)await new Promise(r=>setTimeout(r,50));check(document.querySelector('.shop-primary').textContent==='Try demo unlock','profile B cannot equip A pack');cosmeticHarness.profile('A');`);
  await wait(150);
  await evaluate(`check(document.querySelector('.shop-primary').textContent==='Equipped','profile A keeps its own collection');[...document.querySelectorAll('.shop-filters button')].find(n=>n.textContent==='Effects').click();`);
  await wait(100);
  await evaluate(`for(let n=0;n<80&&!document.querySelector('.shop-asset-display[data-card-live=true]');n++)await new Promise(r=>setTimeout(r,50));check(!!document.querySelector('.shop-asset-display[data-card-live=true] .cosmetic-fx'),'effect card starts without a click');check([...document.querySelectorAll('.shop-asset-display[data-card-live=true] .cosmetic-fx')].every(n=>n.getAnimations().some(a=>a.effect.getTiming().iterations===Infinity)),'visible effect cards loop automatically');check(document.querySelector('.shop-look-large').dataset.previewActive==='true','large preview also starts automatically');`);
  await evaluate(`for(const card of document.querySelectorAll('.shop-product')){const ring=card.querySelector('.shop-effect-emblem');if(!ring||!ring.getClientRects().length)continue;const tag=card.querySelector('.shop-product-tag').getBoundingClientRect(),circle=ring.getBoundingClientRect(),art=card.querySelector('.shop-product-art').getBoundingClientRect(),style=getComputedStyle(ring);check(tag.bottom+8<=circle.top,'tag has its own row '+card.querySelector('h3').textContent);check(circle.top>=art.top&&circle.bottom<=art.bottom,'circle fits inside card '+card.querySelector('h3').textContent);check([style.borderTopColor,style.borderRightColor,style.borderBottomColor,style.borderLeftColor].every(c=>c!=='transparent'&&c!=='rgba(0, 0, 0, 0)'),'circle has no missing segment '+card.querySelector('h3').textContent);}`);
  await evaluate(`document.querySelector('.shop-live-toggle').click();`); await wait(150);
  await evaluate(`check([...document.querySelectorAll('.shop-asset-display .cosmetic-fx,.shop-look-large .cosmetic-fx,.shop-look-large .shop-disc-wrap')].every(n=>n.getAnimations().length===0),'pause stops all automatic previews');check(document.querySelector('.shop-live-toggle').textContent==='Resume live previews','pause control offers resume');document.querySelector('.shop-live-toggle').click();`);
  await wait(200);
  await evaluate(`for(let n=0;n<80&&!document.querySelector('.shop-asset-display[data-card-live=true] .cosmetic-fx')?.getAnimations().length;n++)await new Promise(r=>setTimeout(r,50));check(!!document.querySelector('.shop-asset-display[data-card-live=true] .cosmetic-fx')?.getAnimations().length,'resume restores automatic cards');Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));`); await wait(150);
  await evaluate(`check(!document.querySelector('.shop-asset-display[data-card-live=true]'),'hidden page stops effect cards');check(document.querySelector('.shop-look-large').dataset.previewActive==='false','hidden page stops large preview');delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));`); await wait(150);
  await s("Emulation.setDeviceMetricsOverride", { width: 800, height: 500, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('.shop-content').scrollTop=document.querySelector('.shop-content').scrollHeight;`); await wait(250);
  await evaluate(`const first=document.querySelector('.shop-asset-display');check(first.getBoundingClientRect().bottom<85,'first effect card is outside scroll viewport');check(first.dataset.cardLive==='false'&&[...first.querySelectorAll('.cosmetic-fx')].every(n=>n.getAnimations().length===0),'offscreen card does no animation work');document.querySelector('.shop-content').scrollTop=0;`);
  await s("Emulation.setDeviceMetricsOverride", { width: 800, height: 1100, deviceScaleFactor: 1, mobile: true }); await wait(150);
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); await wait(150);
  await evaluate(`check([...document.querySelectorAll('.marketplace .cosmetic-fx,.marketplace .shop-disc-wrap')].every(n=>n.getAnimations().length===0),'system reduced motion stops all automatic previews');check(document.querySelector('.shop-live-toggle').disabled,'reduced motion explains disabled autoplay control');`);
  await s("Emulation.setEmulatedMedia", { features: [] }); await wait(150);
  await evaluate(`check(document.querySelector('.shop-detail h2').textContent==='Silk Sweep','Category selects a relevant item');check(getComputedStyle(document.querySelector('.shop-effect-classic-effect')).display==='none','Quiet Play has no paid effect emblem');check(getComputedStyle(document.querySelector('.shop-effect-silk')).borderTopStyle!==getComputedStyle(document.querySelector('.shop-effect-coronation')).borderTopStyle,'Satin and seal emblems are distinct');[...document.querySelectorAll('.shop-product')].find(n=>n.textContent.includes('Sapphire Comet')).click();`);
  await wait(100);
  await evaluate(`document.querySelector('.shop-replay').click();`); await wait(100);
  await evaluate(`check(document.querySelector('.shop-look-large .shop-preview-mover .cosmetic-fx').getAnimations().length>0,'Replay starts the effect');check(!document.querySelector('.shop-look-large .piece-white .cosmetic-fx'),'Preview never gives effect to rival');`);
  await evaluate(`[...document.querySelectorAll('.shop-preview-controls button')].find(n=>n.textContent==='You play White').click();`); await wait(100);
  await evaluate(`check(getComputedStyle(document.querySelector('.shop-look-large .shop-preview-board')).rotate==='180deg','White buyer faces their own pieces');check(!document.querySelector('.shop-look-large .piece-black .cosmetic-fx'),'White owner never styles Black rival');[...document.querySelectorAll('.shop-preview-controls button')].find(n=>n.textContent.includes('Friend')).click();`); await wait(100);
  await evaluate(`check(getComputedStyle(document.querySelector('.shop-look-large .shop-preview-board')).rotate!=='180deg','Black rival sees White owner on far side');check(document.querySelector('.shop-look-large .piece-white').dataset.pieceFinish==='amethyst','Rival sees light variant of owner pack');`);
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await evaluate(`[...document.querySelectorAll('.shop-filters button')].find(n=>n.textContent==='Bundles').click();`); await wait(100);
  await evaluate(`document.querySelector('.shop-product').click();`); await wait(250);
  await evaluate(`const h=document.querySelector('.shop-header').getBoundingClientRect();for(const selector of ['.shop-detail h2','.shop-detail .shop-price','.shop-detail .shop-description','.shop-detail .shop-primary','.shop-replay','.shop-look-large']){const r=document.querySelector(selector).getBoundingClientRect();check(r.top>=h.bottom&&r.bottom<=innerHeight,'core inspector is on screen '+selector);}check(!document.querySelector('.shop-more-details').open,'secondary details start collapsed');check(!/(auto|scroll)/.test(getComputedStyle(document.querySelector('.shop-detail')).overflowY),'inspector has no nested scroller');`);
  await evaluate(`window.waitReplay=async test=>{for(let n=0;n<80&&!test();n++)await new Promise(r=>setTimeout(r,50));check(!!test(),'requested replay reaches expected state')};document.querySelector('.shop-replay').click();await waitReplay(()=>document.querySelector('.shop-look-large').dataset.previewMode==='replay'&&document.querySelector('.shop-look-large .shop-preview-mover .shop-disc-wrap')?.getAnimations().length);const a=document.querySelector('.shop-look-large .shop-preview-mover .shop-disc-wrap').getAnimations()[0];check(a.effect.getTiming().iterations===1,'Replay is one cycle rather than autoplay');check(a.animationName==='shop-replay-move','Replay starts its own immediate timeline');a.currentTime=250;check(getComputedStyle(a.effect.target).transform!=='matrix(1, 0, 0, 1, 0, 0)','Replay actually moves the piece');window.previousReplay=a;document.querySelector('.shop-replay').click();await waitReplay(()=>document.querySelector('.shop-look-large .shop-preview-mover .shop-disc-wrap')?.getAnimations()[0]!==previousReplay);check(document.querySelector('.shop-look-large').dataset.previewMode==='replay','repeated Replay restarts the single cycle');await waitReplay(()=>document.querySelector('.shop-look-large').dataset.previewMode==='auto');`);
  await evaluate(`document.querySelector('.shop-more-details').open=true;`); await wait(150);
  await evaluate(`const d=document.querySelector('.shop-detail'),c=document.querySelector('.shop-content');check((d.dataset.fits==='true')===(d.offsetHeight<=c.clientHeight-32),'expanded details use measured fit');check(document.querySelector('.shop-includes').checkVisibility(),'bundle contents remain available');document.documentElement.style.fontSize='200%';`); await wait(150);
  await evaluate(`check(document.querySelector('.shop-detail').dataset.fits==='false','large text releases a tall inspector');check(getComputedStyle(document.querySelector('.shop-detail')).position!=='sticky','tall details cannot become a sticky scroll trap');document.documentElement.style.fontSize='100%';document.querySelector('.shop-more-details').open=false;`);
  for(const level of ['off','reduced']) {
    await evaluate(`cosmeticHarness.motion('${level}');`); await wait(150);
    await evaluate(`check(document.querySelector('.shop-replay').textContent.includes('Play once'),'clear one-shot action in ${level} mode');window.savedMotion=localStorage.getItem('checkervia.settings');document.querySelector('.shop-replay').click();await waitReplay(()=>document.querySelector('.shop-look-large .shop-preview-mover .cosmetic-fx')?.getAnimations().length);check(document.querySelector('.shop-look-large').dataset.previewExplicit==='true','explicit opt-in is scoped in ${level} mode');check([...document.querySelectorAll('.shop-asset-display .cosmetic-fx')].every(n=>n.getAnimations().length===0),'card previews stay still in ${level} mode');check([...document.querySelectorAll('[data-viewer] .cosmetic-fx')].every(n=>n.getAnimations().length===0),'game effects stay still in ${level} mode');await waitReplay(()=>document.querySelector('.shop-look-large').dataset.previewMode==='still');check(localStorage.getItem('checkervia.settings')===savedMotion,'one-shot never changes saved ${level} settings');check([...document.querySelectorAll('.marketplace .cosmetic-fx,.marketplace .shop-disc-wrap')].every(n=>n.getAnimations().length===0),'one-shot returns to stillness in ${level} mode');`);
  }
  await evaluate(`cosmeticHarness.motion('standard');`); await wait(150);
  const screenshot = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(out, "owner-preview.png"), Buffer.from(screenshot.data, "base64"));
  for (const [width, text] of [[390, "100%"], [320, "200%"]]) {
    await s("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.documentElement.style.fontSize='${text}';document.querySelector('.shop-product').scrollIntoView({block:'center'});`); await wait(200);
    await evaluate(`const panel=document.querySelector('.shop-detail').getBoundingClientRect();for(const selector of ['.shop-detail h2','.shop-detail .shop-price strong','.shop-detail .shop-price span']){const r=document.querySelector(selector).getBoundingClientRect();check(r.left>=panel.left&&r.right<=panel.right,'inspector title and price fit ${width} ${text} '+selector);}const brand=document.querySelector('.shop-brand h1').getBoundingClientRect(),close=document.querySelector('.shop-header-actions').getBoundingClientRect();check(brand.right<=close.left,'enlarged shop title leaves close control clear ${width} ${text}');`);
    await evaluate(`for(const card of document.querySelectorAll('.shop-product')){const ring=card.querySelector('.shop-effect-emblem');if(!ring||!ring.getClientRects().length)continue;const tag=card.querySelector('.shop-product-tag').getBoundingClientRect(),circle=ring.getBoundingClientRect(),art=card.querySelector('.shop-product-art').getBoundingClientRect();check(tag.bottom+8<=circle.top,'mobile tag clears full circle ${width} ${text} '+card.querySelector('h3').textContent);check(circle.left>=art.left&&circle.right<=art.right&&circle.top>=art.top&&circle.bottom<=art.bottom,'mobile full circle fits ${width} ${text} '+card.querySelector('h3').textContent);}`);
    const bounds = await evaluate(`const r=document.querySelector('.shop-product').getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1};`);
    const card = await s("Page.captureScreenshot", { format: "png", clip: bounds });
    writeFileSync(resolve(out, `live-card-${width}.png`), Buffer.from(card.data, "base64"));
  }
  const checks = await evaluate("return cosmeticChecks;");
  writeFileSync(resolve(out, "checks.json"), JSON.stringify({ throttle: 4, checks }, null, 2));
  console.log(`${checks.length} cosmetic browser assertions passed at four times CPU throttling.`);
  await send("Browser.close");
} finally { ws?.close(); browser.kill(); }
