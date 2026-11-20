// Local development samples only. Run Vite on 5190, then node scripts/check-admin.mjs.
// Uses the installed browser and native CDP, with no added dependency or live writes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const out = resolve("artifacts/admin-d113");
mkdirSync(out, { recursive: true });
const executable = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find((path) => path && existsSync(path));
if (!executable) throw new Error("No installed browser available");
const port = Number(process.argv[2] ?? 5190);
// The browser profile lives outside the project: Vite watches the project
// and reloads the page whenever the browser writes its profile files.
const profile = mkdtempSync(resolve(tmpdir(), "checkervia-admin-check-"));
const browser = spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [], errors = [], failures = [];
process.on("exit", () => { if (failures.length) { console.log(`${failures.length} checks failed`); process.exitCode = 1; } });
// D111: every section of the owner's mockup.
const SECTIONS = ["overview", "players", "live", "winners", "ai-games", "results", "activity", "reports", "suspensions", "resigned", "countries", "audit", "settings"];
// D112: every visible piece of text in the page against the colour behind
// it: 4.5:1, or 3:1 for large text (24px, or 18.66px bold); disabled
// controls are exempt. D113: the side bar and top bar too, and text over a
// gradient (the primary button, the side bar) against each of its solid
// colours, the worst one counting.
const CONTRAST = `(() => {
  const parse = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = (c) => { const [r, g, b] = parse(c).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const solid = (c) => { const a = parse(c)[3]; return a === undefined || a === 1; };
  const behind = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n);
    if (cs.backgroundImage !== 'none') { const stops = (cs.backgroundImage.match(/rgba?\\([^)]*\\)/g) || []).filter(solid); return stops.length && !/url\\(/.test(cs.backgroundImage) ? stops : null; }
    const a = parse(cs.backgroundColor)[3]; if (a === undefined || a === 1) return [cs.backgroundColor]; if (a > 0) return null; } return [getComputedStyle(document.documentElement).backgroundColor]; };
  const bad = [];
  for (const el of document.querySelectorAll('main *, .adm-side *, .adm-top *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest('svg, .adm-sr, [hidden], :disabled') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.visibility !== 'visible' || r.width <= 1 || r.height <= 1) continue;
    const bgs = behind(el); if (!bgs) continue;
    const ratio = Math.min(...bgs.map((bg) => { const [a, b] = [lum(cs.color), lum(bg)]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5) - 0.01) bad.push(el.textContent.trim().slice(0, 24) + ' ' + ratio.toFixed(2));
  }
  return [...new Set(bad)].slice(0, 6);
})()`;
// D113: text is never cut off, never spills out of its box and never
// overlaps other text. Each text run is measured with a Range: it must lie
// inside the first ancestor that clips (a box that scrolls may hold it out
// of view only along the way it scrolls), not end in an ellipsis, stay
// inside its tile, cell, button or badge, and not cross another run. Text
// that is not on screen (a closed details, a visually hidden label, a row
// scrolled out of its table box) is left out. Runs are compared by their
// glyphs' em box, not the font's taller content area.
const TEXT_FIT = `(() => {
  const boxes = 'th, td, .adm-stat, .adm-hero, .adm-nav-link, .adm-button, .adm-badge, .adm-nav-badge, .adm-attention a, .adm-donut-legend li, .adm-split li, .adm-breakdown-list li, .adm-page-heading, .adm-card-head, .adm-chart-heading, .adm-empty-state';
  const bad = [], runs = [];
  const label = (n) => JSON.stringify(n.textContent.trim().slice(0, 28));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('.adm-sr, svg, script, style, select, option, .adm-skip, .adm-chart-tooltip, .adm-sheet-backdrop, .adm-account-panel, details:not([open]) > :not(summary)')) continue;
    const cs = getComputedStyle(el), own = el.getBoundingClientRect();
    if (cs.visibility !== 'visible' || own.width <= 1 || own.height <= 1) continue;
    let hidden = false;
    for (let a = el; a && !hidden; a = a.parentElement) { const r = a.getBoundingClientRect(); hidden = (r.width <= 1 || r.height <= 1) && getComputedStyle(a).overflow !== 'visible'; }
    if (hidden) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const fs = parseFloat(cs.fontSize), inset = (r) => { const cut = Math.max(0, (r.height - fs) / 2); return { left: r.left, right: r.right, top: r.top + cut, bottom: r.bottom - cut }; };
    let rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map(inset);
    if (!rects.length) continue;
    const outside = (b) => rects.some((r) => r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1);
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const b = a.getBoundingClientRect(), scrollsX = /auto|scroll/.test(s.overflowX), scrollsY = /auto|scroll/.test(s.overflowY);
      if (scrollsX || scrollsY) {
        if ((!scrollsX && rects.some((r) => r.left < b.left - 1 || r.right > b.right + 1)) || (!scrollsY && rects.some((r) => r.top < b.top - 1 || r.bottom > b.bottom + 1))) bad.push('cut off ' + label(n));
        rects = rects.map((r) => ({ left: Math.max(r.left, b.left), right: Math.min(r.right, b.right), top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) })).filter((r) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5);
        if (!rects.length) break;
        continue;
      }
      if (outside(b)) bad.push('cut off ' + label(n));
      break;
    }
    if (!rects.length) continue;
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) bad.push('ellipsis ' + label(n));
    const box = el.closest(boxes);
    if (box && outside(box.getBoundingClientRect())) bad.push('outside its box ' + label(n));
    runs.push({ n, rects });
  }
  runs.sort((a, b) => a.rects[0].top - b.rects[0].top);
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    if (runs[j].rects[0].top > Math.max(...runs[i].rects.map((r) => r.bottom))) break;
    const hit = runs[i].rects.some((a) => runs[j].rects.some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2));
    if (hit) bad.push('overlap ' + label(runs[i].n) + ' and ' + label(runs[j].n));
  }
  return [...new Set(bad)].slice(0, 6);
})()`;
// D113: the type scale at 100% text: nothing under 13px (labels, headers,
// axis ticks, badges), body text 15px or more, page titles clearly larger,
// key numbers 32 to 40px with tabular figures.
const TYPE_SCALE = `(() => {
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('.adm-sr, svg, script, style, option, .adm-skip') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el); if (cs.visibility !== 'visible' || el.getBoundingClientRect().width <= 1) continue;
    if (parseFloat(cs.fontSize) < 12.95) bad.push(n.textContent.trim().slice(0, 24) + ' ' + cs.fontSize);
  }
  if (parseFloat(getComputedStyle(document.body).fontSize) < 15) bad.push('body ' + getComputedStyle(document.body).fontSize);
  const title = document.querySelector('h1.adm-title');
  if (title && parseFloat(getComputedStyle(title).fontSize) < 28) bad.push('title ' + getComputedStyle(title).fontSize);
  for (const el of document.querySelectorAll('.adm-stat-value, .adm-hero-value')) { const cs = getComputedStyle(el), size = parseFloat(cs.fontSize);
    if (size < 31.9 || size > 40.1 || !cs.fontVariantNumeric.includes('tabular-nums') || Number(cs.fontWeight) < 700) bad.push('key number ' + el.textContent + ' ' + cs.fontSize + ' ' + cs.fontWeight); }
  return [...new Set(bad)].slice(0, 6);
})()`;
// D113: every admin table is the shared one: a header in sentence case of
// 13px or more, rows of 44px, numbers right aligned with tabular figures;
// a table that does not fit its box becomes cards instead (or, on a wide
// box, scrolls with its first column pinned).
const TABLES = `(() => {
  const bad = [];
  for (const table of document.querySelectorAll('main table')) {
    if (table.closest('.adm-sr') || !table.getClientRects().length) continue;
    if (!table.classList.contains('adm-data-table') || !table.parentElement.classList.contains('adm-table-scroll')) { bad.push('not the shared table'); continue; }
    if (table.classList.contains('adm-stacked')) continue;
    for (const th of table.querySelectorAll('thead th')) { const cs = getComputedStyle(th);
      if (cs.textTransform !== 'none' || parseFloat(cs.fontSize) < 12.95 || cs.position !== 'sticky') bad.push('header ' + th.textContent + ' ' + cs.textTransform + ' ' + cs.fontSize + ' ' + cs.position); }
    for (const tr of table.querySelectorAll('tbody tr')) if (tr.getBoundingClientRect().height < 43.5) bad.push('row ' + tr.textContent.slice(0, 20) + ' ' + Math.round(tr.getBoundingClientRect().height));
    for (const td of table.querySelectorAll('tbody td')) { const text = td.textContent.trim();
      if (/^[+\u2212-]?[\\d,.]+%?$/.test(text)) { const cs = getComputedStyle(td); if (cs.textAlign !== 'right' || !cs.fontVariantNumeric.includes('tabular-nums')) bad.push('number ' + text + ' ' + cs.textAlign); } }
    const wrap = table.parentElement;
    if (table.scrollWidth > wrap.clientWidth + 1 && getComputedStyle(table.querySelector('tbody > tr > :first-child')).position !== 'sticky') bad.push('scrolls without a pinned first column');
  }
  return [...new Set(bad)].slice(0, 6);
})()`;
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
    // A cold Vite start can hold the first page while it prepares dependencies.
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), method === "Page.navigate" ? 90000 : 20000);
    pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Runtime.enable"); await s("Page.enable");
  // The browser follows the computer's own light or dark setting: pin light
  // for the main matrix (D112 checks dark separately).
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
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
  // CHECK_COLLECT=1 lists every failure before failing, instead of stopping at the first.
  const check = (ok, label) => { if (!ok) { if (!process.env.CHECK_COLLECT) throw new Error(label); failures.push(label); console.log(`FAILED ${label}`); return; } results.push(label); };
  // D113: the widths asked for (1440, 1280, 1024, 768, 390) beside the earlier
  // 320 and 844 by 390, each at 100, 130 and 200% text. CHECK_WIDTHS (for
  // example "1440,390") runs part of the matrix.
  const only = process.env.CHECK_WIDTHS?.split(",").map(Number);
  const MATRIX = [[320, 568], [390, 844], [768, 1024], [844, 390], [1024, 768], [1280, 800], [1440, 900]].filter(([width]) => !only || only.includes(width));
  for (const [width, height] of MATRIX) {
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
    for (const text of [100, 130, 200]) for (const section of SECTIONS) {
      await open(section); await finish();
      await evaluate(`document.documentElement.style.fontSize = '${text}%'`);
      await wait(250);
      const fit = await evaluate(TEXT_FIT);
      check(fit.length === 0, `${section} ${width}x${height} text${text}: no text cut off or overlapping ${JSON.stringify(fit)}`);
      const tables = await evaluate(TABLES);
      check(tables.length === 0, `${section} ${width}x${height} text${text}: shared tables ${JSON.stringify(tables)}`);
      if (text === 100) { const type = await evaluate(TYPE_SCALE); check(type.length === 0, `${section} ${width}x${height}: type scale ${JSON.stringify(type)}`); }
      // On a failure, name the elements that reach past the window.
      const wide = await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(-4).map((el) => `${el.tagName}.${el.className?.baseVal ?? el.className} ${Math.round(el.getBoundingClientRect().right)}`).concat(['page ' + document.documentElement.scrollWidth])");
      check(wide.length === 0, `${section} ${width}x${height} text${text}: no page overflow ${JSON.stringify(wide)}`);
      check(await evaluate("document.querySelector('.adm-source-label').textContent === 'Sample data'"), `${section}: sample label`);
      check(await evaluate("!document.querySelector('.adm-empty')"), `${section}: implemented`);
      // D109: controls look compact, but every tap target keeps 44px (with its invisible hit area).
      const small = await evaluate(`[...document.querySelectorAll('main button, main a[href], main select, main input, main summary, nav a')].filter((el) => el.getClientRects().length).map((el) => {
        const r = el.getBoundingClientRect(), b = getComputedStyle(el, '::before');
        const extra = b.content !== 'none' && b.position === 'absolute' ? Math.max(0, -parseFloat(b.top) || 0) + Math.max(0, -parseFloat(b.bottom) || 0) : 0;
        return r.height + extra >= 43.5 ? null : (el.textContent || el.name || el.tagName).trim().slice(0, 30) + ' ' + Math.round(r.height + extra);
      }).filter(Boolean)`);
      check(small.length === 0, `${section} ${width}x${height} text${text}: tap targets of 44px ${JSON.stringify(small)}`);
      if (text === 100) { const low = await evaluate(CONTRAST); check(low.length === 0, `${section} ${width}x${height}: text contrast in light ${JSON.stringify(low)}`); }
      if (text !== 130) { const shot = await s("Page.captureScreenshot", { format: "png" });
        writeFileSync(resolve(out, `${section}-${width}-${text}.png`), Buffer.from(shot.data, "base64")); }
      console.log(`${section} ${width}x${height} text${text}: passed`);
    }
  }
  if (process.env.CHECK_WIDTHS) { console.log(JSON.stringify({ checksPassed: results.length, partial: process.env.CHECK_WIDTHS, layoutStates: SECTIONS.length * MATRIX.length * 3 })); process.exit(errors.length ? 1 : 0); }
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("countries"); await finish();
  await evaluate("document.querySelector('.adm-side a[href*=winners]').click()"); await finish();
  check(await evaluate("location.pathname === '/admin/winners' && new URLSearchParams(location.search).get('demo') === 'app'"), "navigation retains removable sample mode");
  await s("Page.reload"); await ready(".adm-app"); await finish();
  check(await evaluate("document.querySelector('h1').textContent === 'Leaderboard' && document.querySelector('.adm-source-label').textContent === 'Sample data'"), "sample navigation reload retains section and sample data");
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
    check(await evaluate(state === "error" ? "!!document.querySelector('[role=alert]') && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('again'))" : "!document.querySelector('[role=alert]') && /No (country records|ranked wins|resignations|audit entries)/.test(document.body.textContent) && [...document.querySelectorAll('.adm-empty-state')].every((e) => e.querySelector('.adm-empty-title') && e.querySelector('.adm-empty-text').textContent.length > 20) && !!document.querySelector('.adm-empty-state')"), `${section}: ${state} with clear feedback`);
  }
  // ---------- D109 charts and D110 moderation flows (sample data only) ----------
  const type = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
  const click = (text, scope = "document") => evaluate(`(() => { const b = [...${scope}.querySelectorAll('button')].find((el) => el.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ${text}'); b.click(); })()`);
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("overview"); await finish();
  check(await evaluate("document.querySelectorAll('.adm-chart-reveal').length === 1 && [...document.querySelectorAll('.adm-chart-line')].every((p) => p.getAttribute('d').startsWith('M0.0,') && p.getAttribute('d').includes(' C'))"), "charts are smooth curves that start at the left edge");
  check(await evaluate("[...document.querySelectorAll('.adm-chart-line')].every((p) => / 500\\.0,[\\d.]+$/.test(p.getAttribute('d')))"), "charts end at the right edge");
  check(await evaluate("getComputedStyle(document.querySelector('.adm-chart-reveal')).animationName === 'adm-chart-draw'"), "charts draw in from the left");
  for (const at of [0.02, 0.5, 0.98]) {
    await evaluate(`(() => { const svg = document.querySelectorAll('.adm-chart-svg')[0]; const r = svg.getBoundingClientRect(); svg.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * ${at}, clientY: r.top + 30, bubbles: true })); })()`);
    await wait(80);
    check(await evaluate(`(() => { const tip = document.querySelector('.adm-chart-tooltip'), plot = tip.parentElement.getBoundingClientRect(), r = tip.getBoundingClientRect();
      return r.left >= plot.left - 1 && r.right <= plot.right + 1 && /^\\d+ [A-Z][a-z]{2}$/.test(tip.querySelector('.adm-tip-date').textContent) && tip.querySelectorAll('.adm-tip-row').length === 2 && document.querySelectorAll('.adm-chart-hole').length === 2; })()`), `chart card shows the date and both series inside the plot at ${at * 100}%`);
  }
  // ---------- D111: the owner's mockup ----------
  check(await evaluate("(() => { const cards = [...document.querySelectorAll('.adm-stat')]; return cards.length === 6 && new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size === 1; })()"), "six headline cards in one row at 1280px");
  check(await evaluate("(() => { const chart = document.querySelector('.adm-chart').getBoundingClientRect(), donut = document.querySelector('.adm-donut').closest('.adm-panel').getBoundingClientRect(); return Math.abs(chart.top - donut.top) < 2 && chart.width > donut.width; })()"), "Players & Visitors sits beside a narrower AI Game Results");
  check(await evaluate("document.querySelectorAll('.adm-chart-y span').length >= 3 && document.querySelectorAll('.adm-chart-x span').length === 11 && document.querySelectorAll('.adm-chart-legend li').length >= 2"), "chart has ticks, 11 dates and a legend");
  check(await evaluate("[...document.querySelectorAll('.adm-chart-x span')].every((s) => { const r = s.getBoundingClientRect(), p = s.closest('.adm-panel').getBoundingClientRect(); return r.left >= p.left && r.right <= p.right; })"), "chart dates stay inside the panel");
  check(await evaluate("document.querySelectorAll('.adm-column').length === 7 && [...document.querySelectorAll('.adm-column')].every((c) => c.getBoundingClientRect().height > 1) && document.querySelectorAll('.adm-split-left').length === 4 && [...document.querySelectorAll('.adm-split-left')].every((b) => b.getBoundingClientRect().width > 0)"), "weekly columns and level bars take their sizes from the data");
  check(await evaluate("document.querySelectorAll('.adm-donut-part').length === 3 && document.querySelector('.adm-donut-centre').textContent.includes('Games')"), "donut shows wins, losses and draws around the total");
  check(await evaluate("(() => { const names = [...document.querySelectorAll('.adm-side .adm-nav-heading')].map((h) => h.textContent); return names.join() === 'Players,Game Analytics,Moderation,System' && document.querySelectorAll('.adm-side .adm-nav-link').length === 13; })()"), "side bar groups the 13 sections like the mockup");
  check(await evaluate("(() => { const b = [...document.querySelectorAll('.adm-side .adm-nav-badge')].map((n) => n.textContent); return b.length === 3 && b[0].startsWith('12') && b[1].startsWith('8') && b[2].startsWith('5'); })()"), "side bar badges show online players, open reports and suspensions");
  check(await evaluate("[...document.querySelectorAll('.adm-stats .adm-change')].some((n) => /[+\u2212]\\d/.test(n.textContent)) && /\\([+\u2212]\\d+%\\)/.test(document.querySelector('.adm-stats').textContent)"), "headline cards show the change on the previous period");
  check(await evaluate("(() => { const o = document.querySelector('.adm-open-game'); return o.getAttribute('href') === '/' && o.target === '_blank' && o.rel.includes('noopener') && !!document.querySelector('.adm-bell-dot'); })()"), "Open Game opens the game; the bell marks open reports");
  await type(".adm-select-button select", "7"); await wait(200); await finish(); await wait(200);
  check(await evaluate("document.querySelectorAll('.adm-chart-x span').length === 7 && document.querySelector('.adm-select-button select').value === '7' && document.body.textContent.includes('compared with the previous 7 days')"), "the period select reloads the overview for 7 days");
  await evaluate("document.querySelector('.adm-avatar').click()"); await wait(80);
  check(await evaluate("document.querySelector('.adm-avatar').getAttribute('aria-expanded') === 'true' && document.querySelector('.adm-account-panel').textContent.includes('Sign out')"), "the crown opens the account menu");
  await click("Settings", "document.querySelector('.adm-account-panel')"); await finish();
  check(await evaluate("location.pathname === '/admin/settings' && document.querySelector('h1').textContent === 'Settings' && !document.querySelector('.adm-account-panel')"), "Settings opens from the account menu");
  await evaluate("document.querySelector('.adm-bell').click()"); await finish();
  check(await evaluate("location.pathname === '/admin/reports' && document.querySelector('h1').textContent === 'Reports'"), "the bell opens Reports");
  await evaluate("document.querySelector('.adm-source-close').click()"); await wait(50);
  check(await evaluate("!document.querySelector('.adm-source-bar')"), "the sample data note can be closed");
  for (const section of ["ai-games", "results", "activity"]) {
    await open(section); await finish();
    check(await evaluate("document.querySelectorAll('.adm-chart-svg').length >= 1 && !!document.querySelector('.adm-select-button select') && !document.querySelector('[role=alert]')"), `${section}: charts with the shared period`);
  }
  await open("overview", "&stats=error"); await finish();
  check(await evaluate("!!document.querySelector('[role=alert]') && [...document.querySelectorAll('button')].some((b) => b.textContent === 'Try statistics again')"), "overview: error with a retry");
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
  // ---------- D113: Live Players and the shared components ----------
  for (const [width, columns] of [[1440, 3], [768, 2], [390, 2], [320, 1]]) {
    await s("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 900 });
    await open("live"); await finish(); await wait(150);
    const live = await evaluate(`(() => { const tiles = [...document.querySelectorAll('.adm-tiles > .adm-stat')], tops = tiles.map((t) => Math.round(t.getBoundingClientRect().top)), ai = tiles[0];
      return { tiles: tiles.length, rows: new Set(tops).size, hero: document.querySelector('.adm-hero .adm-hero-value')?.textContent, note: document.querySelector('.adm-hero-note')?.textContent,
        levels: [...ai.querySelectorAll('.adm-breakdown-list li')].map((li) => li.querySelector('.adm-breakdown-name').textContent + '=' + li.querySelector('strong').textContent),
        bar: ai.querySelectorAll('.adm-breakdown-part').length, heroBig: parseFloat(getComputedStyle(document.querySelector('.adm-hero-value')).fontSize) > parseFloat(getComputedStyle(ai.querySelector('.adm-stat-value')).fontSize) }; })()`);
    check(live.tiles === 3 && live.hero === "12" && live.note === "12 devices, last seen within 75 seconds" && live.heroBig, `live ${width}: one hero tile with a spaced line ${JSON.stringify(live)}`);
    check(live.levels.join() === "Easy=3,Medium=2,Hard=2,Strongest=1" && live.bar === 4, `live ${width}: the four AI levels inside the Against the AI tile ${JSON.stringify(live.levels)}`);
    check(live.rows === (columns === 3 ? 1 : columns === 2 ? 2 : 3), `live ${width}: mode tiles in ${columns === 3 ? "one row" : columns === 2 ? "two columns" : "one column"} (${live.rows} rows)`);
  }
  await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await open("live"); await finish(); await wait(400);
  check(await evaluate("(() => { const img = document.querySelector('.adm-table-scroll img.adm-flag'); return !!img && img.complete && img.naturalWidth > 0 && img.closest('.adm-flag-name').textContent === 'Pakistan' && !!document.querySelector('.adm-flag-none'); })()"), "live: real flag images beside the country names");
  check(await evaluate("/^(Just now|\\d+ min ago|\\d+ hours? ago|Yesterday|\\d+ days ago)$/.test(document.querySelector('time.adm-when').textContent) && !!document.querySelector('time.adm-when').title"), "live: room games say when they started in words, the exact time on hover");
  check(await evaluate(`(() => { const links = [...document.querySelectorAll('.adm-side .adm-nav-link')], current = links.find((a) => a.getAttribute('aria-current') === 'page'), other = links.find((a) => a !== current);
    const badge = document.querySelector('.adm-side .adm-nav-badge');
    return current.textContent.startsWith('Live Players') && getComputedStyle(current).backgroundImage + getComputedStyle(current).backgroundColor !== getComputedStyle(other).backgroundImage + getComputedStyle(other).backgroundColor
      && getComputedStyle(current).boxShadow.includes('inset') && parseFloat(getComputedStyle(other).fontSize) >= 16 && parseFloat(getComputedStyle(badge).fontSize) >= 14 && badge.getBoundingClientRect().height >= 20; })()`), "side bar: larger text and badges, and a clear current section");
  check(await evaluate("document.querySelector('.adm-bell-dot').textContent === '8' && document.querySelector('.adm-bell').getAttribute('aria-label') === 'Open reports: 8'"), "the bell shows the number of open reports, not a colour alone");
  await open("players"); await finish(); await wait(300);
  check(await evaluate("(() => { const t = document.querySelector('main table'); const th = t.querySelector('thead th'); return getComputedStyle(th).position === 'sticky' && getComputedStyle(t.querySelector('tbody td.adm-cell-num')).textAlign === 'right' && [...t.querySelectorAll('tbody td .adm-badge, tbody th .adm-badge')].every((b) => b.textContent.trim().length > 2); })()"), "players: sticky header, numbers right aligned, statuses in words");
  await open("reports", "&moderation=refuse"); await finish();
  await click("Dismiss", "document.querySelectorAll('.adm-list-table')[1]");
  await type("dialog textarea", "Disconnected, not abandoned");
  await evaluate("document.querySelector('dialog form').requestSubmit()"); await wait(400);
  check(await evaluate("document.querySelector('dialog').open && document.querySelector('dialog [role=alert]').textContent.includes('Too many attempts')"), "a refused action stays open and explains why");
  for (const state of ["empty", "error"]) for (const section of ["reports", "live"]) {
    await open(section, `&moderation=${state}`); await finish();
    check(await evaluate(state === "error" ? "!!document.querySelector('[role=alert]')" : "/No (players with reports|one is in a game)/.test(document.body.textContent) && !!document.querySelector('.adm-empty-state .adm-empty-text')"), `${section}: ${state} with clear feedback`);
  }
  // ---------- D112: dark mode and the theme choice ----------
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 900 });
    for (const section of SECTIONS) {
      await open(section); await finish(); await wait(150);
      check(await evaluate("getComputedStyle(document.body).colorScheme === 'dark' && getComputedStyle(document.body).backgroundColor === 'rgb(14, 19, 17)'"), `${section} ${width}: dark follows the device`);
      check(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${section} ${width}: dark, no page overflow`);
      const low = await evaluate(CONTRAST);
      check(low.length === 0, `${section} ${width}: text contrast in dark ${JSON.stringify(low)}`);
      const shot = await s("Page.captureScreenshot", { format: "png" });
      writeFileSync(resolve(out, `${section}-${width}-dark.png`), Buffer.from(shot.data, "base64"));
    }
  }
  await open("settings"); await finish();
  await click("Light", "document.querySelector('main')"); await wait(80);
  check(await evaluate("document.documentElement.dataset.theme === 'light' && getComputedStyle(document.body).backgroundColor === 'rgb(246, 240, 228)'"), "Light overrides a dark device");
  // Wait for the reloaded page's own switch: the old page can still answer a readiness check.
  await s("Page.reload"); await wait(300); await ready("main .adm-theme-switch [aria-pressed=true]"); await finish();
  const kept = await evaluate("JSON.stringify([document.documentElement.dataset.theme, document.querySelector('main .adm-theme-switch [aria-pressed=true]')?.textContent, localStorage.getItem('checkervia-admin-theme')])");
  check(kept === JSON.stringify(["light", "Light", "light"]), `the theme choice survives a reload ${kept}`);
  await click("System", "document.querySelector('main')"); await wait(80);
  check(await evaluate("!document.documentElement.dataset.theme && getComputedStyle(document.body).backgroundColor === 'rgb(14, 19, 17)'"), "System follows the device again");
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await click("Dark", "document.querySelector('main')"); await wait(80);
  check(await evaluate("document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.body).backgroundColor === 'rgb(14, 19, 17)'"), "Dark overrides a light device");
  await click("System", "document.querySelector('main')"); await wait(80);
  check(errors.length === 0, "no uncaught browser errors");
  writeFileSync(resolve(out, "checks.json"), JSON.stringify({ count: results.length, results, errors, liveWrites: 0 }, null, 2));
  console.log(JSON.stringify({ checksPassed: results.length, layoutStates: SECTIONS.length * (MATRIX.length * 3 + 2), liveWrites: 0 }));
} finally {
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ id: 0, method: "Browser.close" })); await wait(250); }
  ws?.close(); browser.kill();
}
