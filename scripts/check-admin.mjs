// Local development samples only. Run Vite on 5190, then node scripts/check-admin.mjs.
// Uses the installed browser and native CDP, with no added dependency or live writes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const out = resolve("artifacts/admin-phase3");
mkdirSync(out, { recursive: true });
const executable = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find((path) => path && existsSync(path));
if (!executable) throw new Error("No installed browser available");
const port = Number(process.argv[2] ?? 5190);
const profile = mkdtempSync(resolve(out, "profile-"));
const browser = spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [], errors = [];
let ws;
try {
  let version;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const debug = Number(readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); version = await (await fetch(`http://127.0.0.1:${debug}/json/version`)).json(); break; } catch { await wait(100); }
  }
  if (!version) throw new Error("Browser startup failed");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Runtime.enable"); await s("Page.enable");
  const evaluate = async (expression) => {
    const answer = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    return answer.result.value;
  };
  async function ready(selector, expectedUrl = null) {
    for (let attempt = 0; attempt < 600; attempt++) {
      if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && ${expectedUrl ? `location.href === ${JSON.stringify(expectedUrl)}` : "true"}`)) return;
      await wait(100);
    }
    throw new Error(`Missing ${selector}: ${JSON.stringify(await evaluate("({url:location.href,text:document.body?.innerText?.slice(0,600)})"))}; errors ${JSON.stringify(errors)}`);
  }
  let navigation = 0;
  async function open(section, query = "") {
    // Unique destinations keep an old rendered page from satisfying the
    // readiness check while a repeated navigation is still committing.
    const url = `http://127.0.0.1:${port}/admin/${section}?demo=app${query}&review=${++navigation}`;
    await s("Page.navigate", { url });
    await ready(".adm-app", url);
  }
  const settled = "!document.querySelector('[aria-busy=true]')";
  async function finish() {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(settled)) return; await wait(100); }
    throw new Error("Report did not finish");
  }
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
  for (const [width, height] of [[320, 568], [844, 390], [1280, 800]]) {
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
    for (const text of [100, 200]) for (const section of ["overview", "players", "reports", "suspensions", "live", "countries", "winners", "resigned", "audit"]) {
      await open(section); await finish();
      await evaluate(`document.documentElement.style.fontSize = '${text}%'`);
      await wait(150);
      check(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${section} ${width}x${height} text${text}: no page overflow`);
      check(await evaluate("document.querySelector('.adm-source-label').textContent === 'Sample data'"), `${section}: sample label`);
      check(await evaluate("!document.querySelector('.adm-empty')"), `${section}: implemented`);
      // D109: controls look compact, but every tap target keeps 44px (with its invisible hit area).
      const small = await evaluate(`[...document.querySelectorAll('main button, main a[href], main select, main input, main summary, nav a')].filter((el) => el.getClientRects().length).map((el) => {
        const r = el.getBoundingClientRect(), b = getComputedStyle(el, '::before');
        const extra = b.content !== 'none' && b.position === 'absolute' ? Math.max(0, -parseFloat(b.top) || 0) + Math.max(0, -parseFloat(b.bottom) || 0) : 0;
        return r.height + extra >= 43.5 ? null : (el.textContent || el.name || el.tagName).trim().slice(0, 30) + ' ' + Math.round(r.height + extra);
      }).filter(Boolean)`);
      check(small.length === 0, `${section} ${width}x${height} text${text}: tap targets of 44px ${JSON.stringify(small)}`);
      const shot = await s("Page.captureScreenshot", { format: "png" });
      writeFileSync(resolve(out, `${section}-${width}-${text}.png`), Buffer.from(shot.data, "base64"));
      console.log(`${section} ${width}x${height} text${text}: passed`);
    }
  }
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("countries"); await finish();
  await evaluate("document.querySelector('.adm-side a[href*=winners]').click()"); await finish();
  check(await evaluate("location.pathname === '/admin/winners' && new URLSearchParams(location.search).get('demo') === 'app'"), "navigation retains removable sample mode");
  await s("Page.reload"); await ready(".adm-app"); await finish();
  check(await evaluate("document.querySelector('h1').textContent === 'Who is winning' && document.querySelector('.adm-source-label').textContent === 'Sample data'"), "sample navigation reload retains section and sample data");
  await open("countries", "&report=race"); await finish();
  await evaluate("[...document.querySelectorAll('.adm-periods button')].find(b=>b.textContent==='7 days').click()"); await wait(50);
  await evaluate("[...document.querySelectorAll('.adm-periods button')].find(b=>b.textContent==='90 days').click()"); await wait(1300);
  check(await evaluate("document.querySelector('[aria-pressed=true]').textContent==='90 days' && !document.querySelector('[aria-busy=true]') && document.body.textContent.includes('including today')"), "late period reply does not replace the selected report");
  await open("audit"); await finish();
  const first = await evaluate("document.querySelector('.adm-records li').textContent.match(/Entry \\d+/)[0]");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Older entries').click()"); await finish();
  check(await evaluate("document.querySelector('.adm-pagination').textContent.includes('Page 2')"), "audit advances by cursor");
  check(first !== await evaluate("document.querySelector('.adm-records li').textContent.match(/Entry \\d+/)[0]"), "audit page contains older records");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Previous entries').click()"); await finish();
  check(first === await evaluate("document.querySelector('.adm-records li').textContent.match(/Entry \\d+/)[0]"), "audit previous returns to its original page");
  await evaluate(`(() => {const input=document.querySelector('input[name=action]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'player.view');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(50); await evaluate("document.querySelector('form').requestSubmit()"); await finish();
  check(await evaluate("document.querySelectorAll('.adm-records li').length>0 && [...document.querySelectorAll('.adm-records h2')].every(el=>el.textContent==='Viewed player')"), "audit exact action filter applies");
  for (const section of ["countries", "winners", "resigned", "audit"]) for (const state of ["empty", "error"]) {
    await open(section, `&report=${state}`); await finish();
    check(await evaluate(state === "error" ? "!!document.querySelector('[role=alert]') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('again'))" : "!document.querySelector('[role=alert]') && /No (country records|ranked wins|resignations|audit entries)/.test(document.body.textContent)"), `${section}: ${state} with clear feedback`);
  }
  // ---------- D109 charts and D110 moderation flows (sample data only) ----------
  const type = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
  const click = (text, scope = "document") => evaluate(`(() => { const b = [...${scope}.querySelectorAll('button')].find((el) => el.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ${text}'); b.click(); })()`);
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("overview"); await finish();
  check(await evaluate("document.querySelectorAll('.adm-chart-reveal').length === 5 && [...document.querySelectorAll('.adm-chart-line')].every((p) => p.getAttribute('d').startsWith('M0.0,') && p.getAttribute('d').includes(' C'))"), "charts are smooth curves that start at the left edge");
  check(await evaluate("[...document.querySelectorAll('.adm-chart-line')].every((p) => / 500\\.0,[\\d.]+$/.test(p.getAttribute('d')))"), "charts end at the right edge");
  check(await evaluate("getComputedStyle(document.querySelector('.adm-chart-reveal')).animationName === 'adm-chart-draw'"), "charts draw in from the left");
  for (const at of [0.02, 0.5, 0.98]) {
    await evaluate(`(() => { const svg = document.querySelectorAll('.adm-chart-svg')[1]; const r = svg.getBoundingClientRect(); svg.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * ${at}, clientY: r.top + 30, bubbles: true })); })()`);
    await wait(80);
    check(await evaluate(`(() => { const tip = document.querySelector('.adm-chart-tooltip'), plot = tip.parentElement.getBoundingClientRect(), r = tip.getBoundingClientRect();
      return r.left >= plot.left - 1 && r.right <= plot.right + 1 && /\\d/.test(tip.textContent) && /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d+ [A-Z][a-z]{2}/.test(tip.textContent); })()`), `chart pill shows value and day inside the plot at ${at * 100}%`);
  }
  await open("players"); await finish();
  await evaluate("document.querySelector('.adm-player-name').click()"); await finish();
  await click("Suspend");
  check(await evaluate("document.querySelector('dialog.adm-dialog').open && document.querySelector('dialog [type=submit]').disabled"), "an action waits for its reason");
  await type("dialog textarea", "Abandoned four games in a row"); await type("dialog select", "14");
  await evaluate("document.querySelector('dialog form').requestSubmit()"); await wait(400); await finish();
  check(await evaluate("!document.querySelector('dialog') && /Suspended until \\d{4}-\\d{2}-\\d{2}/.test(document.querySelector('.adm-notice').textContent) && document.body.textContent.includes('Change suspension')"), "suspending updates the player and says what was done");
  await click("Delete player");
  await type("dialog textarea", "Asked to remove the account");
  await type("dialog input[name=typed]", "wrong name");
  check(await evaluate("document.querySelector('dialog [type=submit]').disabled"), "delete waits for the exact username");
  await evaluate("document.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))"); await wait(100);
  check(await evaluate("!document.querySelector('dialog')"), "Escape closes the dialog without acting");
  await open("reports"); await finish();
  const openBefore = await evaluate("document.querySelectorAll('.adm-list-table')[1].querySelectorAll('tbody tr').length");
  await click("Dismiss", "document.querySelectorAll('.adm-list-table')[1]");
  await type("dialog textarea", "Disconnected, not abandoned");
  await evaluate("document.querySelector('dialog form').requestSubmit()"); await wait(400); await finish();
  check(await evaluate(`document.querySelector('.adm-notice').textContent === 'Report updated.' && document.querySelectorAll('.adm-list-table')[1].querySelectorAll('tbody tr').length === ${openBefore} - 1`), "dismissing a report takes it out of the open queue");
  await open("suspensions"); await finish();
  check(await evaluate("document.querySelectorAll('.adm-list-table tbody tr').length > 0 && document.body.textContent.includes('Days left')"), "suspensions list days left");
  await open("live"); await finish();
  check(await evaluate("document.body.textContent.includes('In a game now') && document.body.textContent.includes('Online room games')"), "live shows play by mode, level, flag and rooms");
  await open("reports", "&moderation=refuse"); await finish();
  await click("Dismiss", "document.querySelectorAll('.adm-list-table')[1]");
  await type("dialog textarea", "Disconnected, not abandoned");
  await evaluate("document.querySelector('dialog form').requestSubmit()"); await wait(400);
  check(await evaluate("document.querySelector('dialog').open && document.querySelector('dialog [role=alert]').textContent.includes('Too many attempts')"), "a refused action stays open and explains why");
  for (const state of ["empty", "error"]) for (const section of ["reports", "live"]) {
    await open(section, `&moderation=${state}`); await finish();
    check(await evaluate(state === "error" ? "!!document.querySelector('[role=alert]')" : "/No (players with reports|one is in a game)/.test(document.body.textContent)"), `${section}: ${state} with clear feedback`);
  }
  check(errors.length === 0, "no uncaught browser errors");
  writeFileSync(resolve(out, "checks.json"), JSON.stringify({ count: results.length, results, errors, liveWrites: 0 }, null, 2));
  console.log(JSON.stringify({ checksPassed: results.length, layoutStates: 54, liveWrites: 0 }));
} finally {
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ id: 0, method: "Browser.close" })); await wait(250); }
  ws?.close(); browser.kill();
}
