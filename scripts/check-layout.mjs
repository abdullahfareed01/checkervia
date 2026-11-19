// Layout check (development only, no dependencies): opens every screen and
// state of the app in a real browser (headless Edge or Chrome, driven over
// the DevTools protocol) at every size of the test matrix and reports what a
// player would see as broken:
//   - horizontal overflow of the page or of any element;
//   - content outside the window, or cut off by a box that does not scroll;
//   - more than one thing that scrolls at a time (nested or double scrolls,
//     or the page scrolling behind an open sheet or dialog);
//   - scrollbars that take room on touch screens, or thick ones on desktop;
//   - text under 12 px, tap targets under 44 px;
//   - overlapping buttons or text, and console errors;
//   - on the game screen on phones held upright: the board, both cards, the
//     turn pill, the AI's bubble and the action bar not all on screen at
//     once without scrolling, or the bubble behind the bar;
//   - text that a long press can select (only text fields, the Terms text
//     and the rules text may be selected, and they must stay selectable);
//   - the browser's tap highlight, or a pressable thing without a pressed
//     state of its own.
//
// Run the dev server first (npx vite --port 5180 --strictPort), then:
//   node scripts/check-layout.mjs [--sizes 390x844,1280x800] [--variants base,text130,text200]
//                                 [--screens home,board] [--part 1/2] [--shots <folder>] [--all-shots yes] [--port 5180]
// Screenshots go to --shots for the states with issues only, or for every
// state with --all-shots yes (to look the screens over).
// One browser per size, closed before the next, to keep memory low. The AI
// is answered by this script (a fixed legal move with a reason), so no key
// or network is needed. Exits with 1 when anything is found.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MATRIX = [
  // Phones, portrait
  "320x568", "360x640", "360x740", "375x667", "390x844", "393x852", "412x915", "430x932",
  // Phones, landscape
  "667x375", "844x390", "915x412",
  // Tablets and bigger
  "768x1024", "1024x768", "1280x800", "1440x900", "1920x1080",
];

// base: default text size and animations. text130 and text200: the browser's
// text size at 130% and 200% (the root font size, as the browser setting
// does), with the animation level Reduced and Off.
const VARIANTS = {
  base: { text: 100, anim: null },
  text130: { text: 130, anim: "reduced" },
  text200: { text: 200, anim: "off" },
};

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, index, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] ?? ""]);
    return pairs;
  }, []),
);
const port = Number(args.port ?? 5180);
const sizes = (args.sizes ? args.sizes.split(",") : MATRIX).map((size) => size.split("x").map(Number));
const variants = args.variants ? args.variants.split(",") : Object.keys(VARIANTS);
const shots = args.shots || null;
const allShots = args["all-shots"] === "yes";
if (shots) mkdirSync(shots, { recursive: true });

const BROWSERS = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browserPath = BROWSERS.find((path) => existsSync(path));
if (!browserPath) throw new Error("No Edge or Chrome found. Set BROWSER to its path.");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- The screens and states ----------
// Each one: the page to open, the steps to reach the state (run in the page),
// and the layer to check (the topmost open screen, sheet or dialog).

const find = (selector, ms = 4000) => `(await (async () => {
  const end = Date.now() + ${ms};
  while (Date.now() < end) { const el = document.querySelector(${JSON.stringify(selector)}); if (el && el.getClientRects().length) return el; await new Promise(r => setTimeout(r, 50)); }
  throw new Error("not found: " + ${JSON.stringify(selector)});
})())`;
const until = (selector, ms) => `${find(selector, ms)};`;
const click = (selector) => `${find(selector)}.click(); await new Promise(r => setTimeout(r, 250));`;
const clickText = (selector, text) => `await (async () => {
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.includes(${JSON.stringify(text)}) && e.getClientRects().length);
    if (el) { el.click(); await new Promise(r => setTimeout(r, 250)); return; }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("no " + ${JSON.stringify(selector)} + " with " + ${JSON.stringify(text)});
})();`;
// Plays the first legal move for Black: a piece, then a square it can go to.
const playMove = `await (async () => {
  for (const piece of document.querySelectorAll('.board button[aria-label*="black"]')) {
    piece.click();
    await new Promise(r => setTimeout(r, 150));
    const to = document.querySelector('.board button[aria-label*="move here"], .board button[aria-label*="capture here"]');
    if (to) { to.click(); return; }
  }
  throw new Error("no legal move");
})();`;
const openStrongest = `${click(".menu-card-ai")} ${click(".level-option:last-of-type")} ${clickText(".level-dialog .button-primary", "")}`;

const { marketplaceJourney } = await import("./marketplace-journey.mjs");
const SCREENS = {
  "shop-live-paused": { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace") + clickText(".shop-filters button", "Effects") + click(".shop-live-toggle"), layer: ".marketplace" },
  "shop-effects": { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace") + clickText(".shop-filters button", "Effects") + clickText(".shop-product", "Sapphire Comet") + click(".shop-replay"), layer: ".marketplace" },
  "shop-friend": { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace") + clickText(".shop-filters button", "Pieces") + clickText(".shop-product", "Amethyst") + clickText(".shop-preview-controls button", "You play White") + clickText(".shop-preview-controls button", "Friend") + click(".shop-replay"), layer: ".marketplace" },
  "shop-journey": { query: "?lb=populated", steps: `await (${marketplaceJourney.toString()})();`, layer: ".marketplace" },
  shop: { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace"), layer: ".marketplace" },
  "shop-pieces": { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace") + clickText(".shop-filters button", "Pieces"), layer: ".marketplace" },
  "shop-unlock": { query: "?lb=populated", steps: click(".home-shop") + until(".marketplace") + click(".shop-primary"), layer: ".marketplace" },
  "shop-game": { query: "?lb=populated&scenario=duel", steps: click(".menu > .bar-button") + clickText(".menu-tile", "Shop") + until(".marketplace"), layer: ".marketplace" },
  splash: { query: "?lb=populated", holdHealth: true, steps: until(".splash"), layer: ".splash" },
  home: { query: "?lb=populated", steps: until(".home"), layer: ".home" },
  "home-new": { query: "?lb=new", steps: until(".home"), layer: ".home" },
  "home-ai-off": { query: "?lb=populated", health: { ready: false }, steps: until(".home-help"), layer: ".home" },
  rules: { query: "?lb=populated", steps: clickText(".menu-card", "How to Play") + until(".rules"), layer: ".rules" },
  learn: { query: "?lb=populated", steps: click(".menu-card-learn") + until(".learn"), layer: ".learn" },
  level: { query: "?lb=populated", steps: click(".menu-card-ai") + until(".level-dialog"), layer: ".level-dialog" },
  consent: { query: "?lb=populated", steps: openStrongest + until(".consent-dialog"), layer: ".consent-dialog" },
  "profile-gate": { query: "?lb=new", steps: click(".menu-card-ai") + click(".level-dialog .button-primary") + until(".pf-backdrop"), layer: ".pf-backdrop" },
  terms: { query: "?lb=populated", steps: clickText(".home-link", "Terms") + until(".terms-dialog"), layer: ".terms-dialog" },
  settings: { query: "?lb=populated", steps: clickText(".home-link", "Settings") + until(".settings-dialog"), layer: ".settings-dialog" },
  // Each page a Settings tile opens; the voice list after turning the AI voice on.
  ...Object.fromEntries(["sound", "haptics", "voice", "animation", "board", "chat", "profile"].map((page) => [`settings-${page}`, { query: "?lb=populated", steps: clickText(".home-link", "Settings") + until(".settings-dialog") + click(`.settings-tile[data-opens="${page}"]`) + until(".settings-back") + `await new Promise(r => setTimeout(r, 300));`, layer: ".settings-dialog" }])),
  "settings-voices": { query: "?lb=populated", steps: clickText(".home-link", "Settings") + until(".settings-dialog") + click('.settings-tile[data-opens="voice"]') + until(".settings-back") + clickText(".settings-switch", "AI voice") + click('.settings-row-link[data-opens="voices"]') + until(".settings-voices") + `await new Promise(r => setTimeout(r, 300));`, layer: ".settings-dialog" },
  board: { query: "?lb=populated", steps: click(".menu-card-leaderboard") + until(".lb-row"), layer: ".lb-backdrop" },
  "board-empty": { query: "?lb=empty", steps: click(".menu-card-leaderboard") + until(".lb-board"), layer: ".lb-backdrop" },
  "board-error": { query: "?lb=error", steps: click(".menu-card-leaderboard") + until(".lb-board .lb-button, .lb-board .lb-state"), layer: ".lb-backdrop" },
  "board-info": { query: "?lb=populated", steps: click(".menu-card-leaderboard") + until(".lb-row") + click(".lb-board .lb-info-button") + until(".lb-info-backdrop"), layer: ".lb-info-backdrop" },
  "player-sheet": { query: "?lb=populated", steps: click(".menu-card-leaderboard") + clickText(".lb-period", "All time") + until(".lb-scroll .lb-row:not(.lb-mine)") + click(".lb-scroll .lb-row:not(.lb-mine)") + until(".lb-sheet-backdrop"), layer: ".lb-sheet-backdrop" },
  "profile-view": { query: "?lb=populated", steps: click(".home-profile") + until(".pf-id-edit"), layer: ".pf-backdrop" },
  "profile-levels": { query: "?lb=populated", steps: click(".home-profile") + until('.pf-row[data-opens="levels"]') + click('.pf-row[data-opens="levels"]') + until(".pf-levels"), layer: ".pf-backdrop" },
  "profile-edit": { query: "?lb=populated", steps: click(".home-profile") + click(".pf-id-edit") + until(".pf-edit-card"), layer: ".pf-backdrop" },
  "profile-rules": { query: "?lb=populated", steps: click(".home-profile") + click(".pf-id-edit") + click(".pf-edit-card .lb-info-button") + until(".lb-info-backdrop"), layer: ".lb-info-backdrop" },
  "country-picker": { query: "?lb=populated", steps: click(".home-profile") + click(".pf-id-edit") + click(".pf-edit-card .cp-button") + until(".cp-panel"), layer: ".cp-panel" },
  "profile-create": { query: "?lb=new", steps: click(".home-profile") + until(".pf-backdrop input"), layer: ".pf-backdrop" },
  result: { query: "?lb=populated&result=1", steps: until(".result-backdrop .dialog, .result-backdrop [role=dialog]"), layer: ".result-backdrop" },
  "game-ai": { query: "?lb=populated&scenario=react", steps: until(".board"), layer: ".app" },
  // After a move: the AI's reaction in the bubble, with its "Why?".
  "game-ai-moved": { query: "?lb=populated&scenario=react", steps: until(".board") + playMove + until(".speech-why", 8000), layer: ".app" },
  "game-ai-why": { query: "?lb=populated&scenario=react", steps: until(".board") + playMove + click(".speech-why") + until(".why-sheet"), layer: ".why-sheet" },
  // A whole recorded game, with its result panel closed: the long move list.
  "game-long": { query: "?lb=populated&testwin=strongest", steps: until(".result-backdrop") + `document.querySelector(".result-backdrop").click(); await new Promise(r => setTimeout(r, 500));` + until(".history-list"), layer: ".app" },
  "game-two": { query: "?lb=populated&scenario=duel", steps: until(".board"), layer: ".app" },
  "game-menu": { query: "?lb=populated&scenario=duel", steps: click(".menu > .bar-button") + until(".menu-sheet"), layer: ".menu-sheet" },
  "game-confirm": { query: "?lb=populated&scenario=react", steps: until(".board") + playMove + `await new Promise(r => setTimeout(r, 1500));` + click(".menu > .bar-button") + clickText(".menu-tile", "Main menu") + until(".confirm-dialog"), layer: ".confirm-dialog" },
  "game-language": { query: "?lb=populated&scenario=react-strong", steps: click(".chip-adult") + until(".language-info"), layer: ".language-info" },
  "game-ai-record": { query: "?lb=populated&scenario=react", steps: click(".coach-avatar-button") + until(".airec"), layer: ".airec" },
  // Focus mode (D88): the big board while playing, and once the game is over
  // (result panel closed) the hint beside the button that leaves it.
  "game-focus": { query: "?lb=populated&scenario=react", focus: true, steps: until(".app-focus .board"), layer: ".app" },
  "game-focus-over": { query: "?lb=populated&testwin=strongest", focus: true, steps: until(".result-backdrop") + `document.querySelector(".result-backdrop").click(); await new Promise(r => setTimeout(r, 500));` + until(".focus-hint"), layer: ".app" },
  "game-rules": { query: "?lb=populated&scenario=duel", steps: click(".menu > .bar-button") + clickText(".menu-tile", "How to play") + until(".rules-dialog"), layer: ".rules-dialog" },
  // Online rooms with a friend (D142, D143), on the ?online= preview with its scripted friend (D145).
  "online-sheet": { query: "?lb=populated", steps: clickText(".menu-card", "2 Players") + until(".online-sheet"), layer: ".online-backdrop" },
  "online-choice": { query: "?online=lobby", steps: clickText(".menu-card", "2 Players") + clickText(".menu-card", "Online with a friend") + until(".online-note"), layer: ".online-backdrop" },
  "online-join": { query: "?online=lobby", steps: clickText(".menu-card", "2 Players") + clickText(".menu-card", "Online with a friend") + clickText(".menu-card", "Join with a code") + until(".online-code-input"), layer: ".online-backdrop" },
  "online-waiting": { query: "?online=lobby", steps: clickText(".menu-card", "2 Players") + clickText(".menu-card", "Online with a friend") + clickText(".menu-card", "Create a room") + until(".online-code", 8000), layer: ".online-page" },
  "online-ready": { query: "?online=ready", steps: until(".ready-panel", 8000), layer: ".ready-backdrop" },
  "online-game": { query: "?online=game", steps: until(".app-online .board", 8000) + `await new Promise(r => setTimeout(r, 1500));`, layer: ".app" },
  "online-disconnected": { query: "?online=disconnected", steps: until(".status-pill-warn", 8000), layer: ".app" },
  "online-result": { query: "?online=result", steps: until(".result-backdrop .result", 10000), layer: ".result-backdrop" },
};
// --part 1/2 or 2/2: the first or second half of the screens (smaller runs).
const [partIndex, partCount] = (args.part ?? "1/1").split("/").map(Number);
const allNames = args.screens ? args.screens.split(",") : Object.keys(SCREENS);
const partSize = Math.ceil(allNames.length / partCount);
const screens = allNames.slice((partIndex - 1) * partSize, partIndex * partSize);

// ---------- The check, run inside the page ----------

const CHECK = (layerSelector, touch) => `(() => {
  const issues = [];
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const touch = ${touch};
  const name = (el) => {
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (text ? ' "' + text + '"' : '');
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'contents') return false;
    // Closed <details> content and other skipped content is not on screen.
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Screen reader only text (the usual 1px clip), or text inside it.
  const tiny = (el) => { const r = el.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; };
  const srOnly = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) if (tiny(a)) return true; return false; };
  // Decoration: hidden from assistive tech and holding no text.
  const decorative = (el) => !!el.closest('[aria-hidden="true"]') && !(el.textContent || '').trim();

  const layer = document.querySelector(${JSON.stringify(layerSelector)});
  if (!layer) return { issues: ['layer not found: ${layerSelector}'] };
  const all = [...document.body.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement && !(el instanceof SVGSVGElement)));
  const inLayer = [layer, ...layer.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement && !(el instanceof SVGSVGElement)) && visible(el));

  // 0. The game screen on phones held upright: the board, both cards, the
  // turn pill, the AI's row with its bubble and the action bar are all on
  // screen at once, the page not scrolled, and nothing hides behind the bar.
  if (layer.matches('.app:not(.learn)') && vw <= 599 && vh > vw) {
    window.scrollTo(0, 0);
    const bar = document.querySelector('.action-bar-inner');
    const barTop = bar ? bar.getBoundingClientRect().top : vh;
    // Focus mode (D88) has no turn pill (the cards say whose turn it is) and no action bar.
    const parts = layer.matches('.app-focus') ? ['.card-top', '.board-frame', '.card-bottom'] : ['.card-top', '.board-frame', '.card-bottom', '.status-pill', '.action-bar-inner'];
    if (layer.matches('.app-ai')) parts.push('.coach', '.speech');
    for (const sel of parts) {
      const el = document.querySelector(sel);
      if (!el) { if (sel !== '.speech') issues.push('game screen: no ' + sel); continue; }
      const r = el.getBoundingClientRect();
      const limit = el === bar ? vh : barTop;
      if (r.top < -0.5 || r.left < -0.5 || r.right > vw + 0.5 || r.bottom > limit + 0.5)
        issues.push('game screen: ' + sel + ' not on screen' + (el === bar ? '' : ' above the bar') + ' without scrolling (' + Math.round(r.top) + ' to ' + Math.round(r.bottom) + (el === bar ? '' : ', bar at ' + Math.round(barTop)) + ', window ' + vh + ')');
    }
  }

  // 1. The page never scrolls sideways.
  if (document.documentElement.scrollWidth > vw + 1) issues.push('page scrolls sideways: ' + document.documentElement.scrollWidth + 'px wide in ' + vw);
  if (document.body.scrollWidth > document.body.clientWidth + 1 && getComputedStyle(document.body).overflowX !== 'visible') issues.push('body scrolls sideways');

  // 2. What scrolls. Only one thing may scroll at a time, in the whole document.
  const scrollers = [];
  for (const el of [document.documentElement, ...all]) {
    if (el !== document.documentElement && !visible(el)) continue;
    if (el.matches('input, textarea, select')) continue;
    const cs = getComputedStyle(el);
    const isRoot = el === document.documentElement;
    const rootCs = getComputedStyle(document.body);
    const oy = isRoot ? (cs.overflowY === 'hidden' || rootCs.overflowY === 'hidden' ? 'hidden' : 'auto') : cs.overflowY;
    const ox = isRoot ? (cs.overflowX === 'hidden' || rootCs.overflowX === 'hidden' ? 'hidden' : 'auto') : cs.overflowX;
    const canY = /(auto|scroll)/.test(oy) && el.scrollHeight > el.clientHeight + 1;
    const canX = /(auto|scroll)/.test(ox) && el.scrollWidth > el.clientWidth + 1;
    if (canX) issues.push('scrolls sideways: ' + name(el) + ' (' + el.scrollWidth + ' in ' + el.clientWidth + ')');
    if (canY) scrollers.push(el);
    // A scrollbar's room: the box minus its inside, minus its borders.
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const gutter = isRoot ? innerWidth - document.documentElement.clientWidth : el.offsetWidth - el.clientWidth - bl - br;
    if (gutter > 0.5 && (isRoot || /(auto|scroll)/.test(cs.overflowY + cs.overflowX))) {
      if (!canY && !isRoot) issues.push('scrollbar shown with nothing to scroll: ' + name(el));
      else if (touch) issues.push('scrollbar takes room on a touch screen: ' + name(el) + ' (' + Math.round(gutter) + 'px)');
      else if (gutter > 12) issues.push('thick scrollbar: ' + name(el) + ' (' + Math.round(gutter) + 'px)');
    }
  }
  if (scrollers.length > 1) issues.push('more than one scroll: ' + scrollers.map(name).join(' + '));

  // The part of an element that is on screen: its box cut by every box
  // around it that clips or scrolls, and by the window. null when none is.
  const shown = (el) => {
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') { if (cs.position === 'fixed') break; continue; }
      const b = a.getBoundingClientRect();
      left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
      if (cs.position === 'fixed') break;
    }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, vw); bottom = Math.min(bottom, vh);
    return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
  };
  // 5. Tap targets: 44px or more, counting a hit area a pseudo element adds.
  // Left out: the board squares (the board is not changed) and links inside
  // a sentence (the inline exception of WCAG 2.5.8).
  // A radio or checkbox counts by its label, the thing a finger taps.
  const targets = [...new Set(inLayer.filter((el) => el.matches('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=radio], [role=option], [role=switch]'))
    .map((el) => (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) || el))];
  const area = (el) => {
    const r = el.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.position !== 'absolute') continue;
      const t = parseFloat(ps.top), b = parseFloat(ps.bottom), l = parseFloat(ps.left), rr = parseFloat(ps.right);
      if ([t, b, l, rr].some(Number.isNaN)) continue;
      left = Math.min(left, r.left + l); right = Math.max(right, r.right - rr);
      top = Math.min(top, r.top + t); bottom = Math.max(bottom, r.bottom - b);
    }
    return { width: right - left, height: bottom - top };
  };
  for (const el of targets) {
    if (el.closest('.board')) continue;
    const box = area(el);
    if (el.matches('.link-button') && getComputedStyle(el.parentElement).display !== 'flex' && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
    if (Math.min(box.width, box.height) < 43.5) issues.push('small target ' + Math.round(box.width) + 'x' + Math.round(box.height) + ': ' + name(el));
  }

  // 6. Overlaps: buttons over buttons, text over text.
  const overlap = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 2 && y > 2;
  };
  // A bar pinned to the window (fixed or sticky) may cover content that
  // scrolls, as long as that content can be scrolled clear of it.
  const pinnedBox = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) if (/(fixed|sticky)/.test(getComputedStyle(a).position)) return a;
    return null;
  };
  const scrollerOf = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 1) return a;
    return document.scrollingElement;
  };
  const canClear = (content, bar) => {
    const s = scrollerOf(content);
    const up = s.scrollHeight - s.clientHeight - s.scrollTop, down = s.scrollTop;
    const c = content.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return c.bottom - up <= b.top + 1 || c.top + down >= b.bottom - 1;
  };
  const checkPairs = (list, what) => {
    const rects = list.map(shown);
    const pins = list.map(pinnedBox);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (list[i].contains(list[j]) || list[j].contains(list[i])) continue;
      // One is on a pinned bar, the other is not.
      if (!!pins[i] !== !!pins[j] && rects[i] && rects[j] && overlap(rects[i], rects[j])) {
        const [bar, content] = pins[i] ? [list[i], list[j]] : [list[j], list[i]];
        if (canClear(content, bar)) continue;
      }
      if (rects[i] && rects[j] && overlap(rects[i], rects[j])) issues.push(what + ' overlap: ' + name(list[i]) + ' / ' + name(list[j]));
    }
  };
  checkPairs(targets.filter((el) => !el.closest('.board')), 'buttons');
  const texts = inLayer.filter((el) => !srOnly(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  checkPairs(texts, 'text');

  // Scroll everything to its end: the last things must be reachable.
  for (const el of scrollers) el.scrollTop = el.scrollHeight;

  // 3. Nothing cut off, nothing outside the window sideways.
  // Walks up from an element to the first box that clips or scrolls. A
  // fixed box escapes the boxes around it (none of them is transformed
  // here), so above it only the window counts.
  const reachable = (el, r) => {
    // A fixed element itself answers only to the window.
    let fixed = getComputedStyle(el).position === 'fixed';
    for (let a = fixed ? null : el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
        const box = a.getBoundingClientRect();
        const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0, brr = parseFloat(cs.borderRightWidth) || 0;
        const scrollsY = /(auto|scroll)/.test(cs.overflowY), scrollsX = /(auto|scroll)/.test(cs.overflowX);
        if (!scrollsY && (r.top < box.top + bt - 1 || r.bottom > box.bottom - bb + 1)) return 'cut off by ' + name(a);
        if (!scrollsX && (r.left < box.left + bl - 1 || r.right > box.right - brr + 1)) return 'cut off by ' + name(a);
        // Inside a scroll box: reachable there, as long as the box itself is.
        return reachable(a, box);
      }
      if (cs.position === 'fixed') { fixed = true; break; }
    }
    if (r.left < -1 || r.right > vw + 1) return 'outside the window sideways';
    const pageScrolls = scrollers.includes(document.documentElement);
    if ((fixed || !pageScrolls) && (r.top < -1 || r.bottom > vh + 1)) return 'below or above the window';
    return null;
  };
  for (const el of inLayer) {
    if (decorative(el) || srOnly(el)) continue;
    const r = el.getBoundingClientRect();
    const problem = reachable(el, r);
    if (problem) issues.push(name(el) + ' ' + problem);
  }

  // 4. Text size: nothing under 12px.
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    // The board's coordinates are left out: the board is not changed.
    if (!el || !visible(el) || srOnly(el) || el.closest('svg, .board')) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 11.95) issues.push('text ' + size.toFixed(1) + 'px: ' + name(el));
  }

  // 7. Text selection: a long press selects no text in the app, except in
  // text fields, the Terms text and the rules text, which must stay
  // selectable (to type, or to copy). The whole document is checked.
  const copyable = 'input, textarea, .terms-scroll, .rules-body, .rules-dialog-section';
  const selectable = [];
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || el.closest('script, style, noscript') || !visible(el)) continue;
    const select = getComputedStyle(el).userSelect;
    if (el.closest(copyable)) { if (select === 'none') issues.push('cannot be selected to copy: ' + name(el)); }
    else if (select !== 'none' && !selectable.includes(el)) selectable.push(el);
  }
  for (const el of selectable.slice(0, 5)) issues.push('text can be selected: ' + name(el));
  if (selectable.length > 5) issues.push('text can be selected: ' + (selectable.length - 5) + ' more');
  for (const el of document.querySelectorAll('input:not([type=hidden], [type=radio], [type=checkbox], [type=range]), textarea'))
    if (visible(el) && getComputedStyle(el).userSelect === 'none') issues.push('text field cannot be selected: ' + name(el));

  // 8. Taps: no browser tap highlight, and every pressable thing marked for
  // the pressed state check (run from outside, which can force :active).
  const pressable = targets.filter((el) => !el.matches('input, select, textarea, :disabled') && el.getAttribute('aria-disabled') !== 'true');
  for (const el of targets) if (getComputedStyle(el).webkitTapHighlightColor !== 'rgba(0, 0, 0, 0)') issues.push('tap highlight shown: ' + name(el));
  const look = (el) => { const cs = getComputedStyle(el); return ${JSON.stringify(PRESS_PROPS)}.map((p) => cs[p]).join('|'); };
  window.__press = pressable.map((el, i) => { el.dataset.lcPress = i; return { el, name: name(el), before: look(el) }; });
  window.__pressCompare = () => window.__press.filter((p) => look(p.el) === p.before).map((p) => 'no pressed state: ' + p.name);

  return { issues: [...new Set(issues)] };
})()`;
// What a pressed state may change.
const PRESS_PROPS = ["filter", "scale", "transform", "translate", "backgroundColor", "backgroundImage", "boxShadow", "borderTopColor", "color", "opacity", "outlineStyle"];

// ---------- The browser ----------

async function openBrowser(debugPort) {
  const profile = mkdtempSync(join(tmpdir(), "layout-check-"));
  const child = spawn(browserPath, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars=false", "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--renderer-process-limit=2", "about:blank"], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 80 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    } catch {
      await wait(250);
    }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) for (const listener of listeners) listener(msg);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
  const close = async () => {
    ws.close();
    child.kill();
    await wait(400);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // the browser may still hold a file; the temp folder is cleaned later
    }
  };
  return { send, listeners, close };
}

const AI_REPLY = { text: JSON.stringify({ move: 1, reason: "I keep my back row safe and build a strong center.", reaction: "Bold move." }) };

async function checkState(browser, [width, height], variantName, screenName) {
  const variant = VARIANTS[variantName];
  const screen = SCREENS[screenName];
  const touch = width < 1024 || height < 500;
  const { send, listeners } = browser;
  const { targetId } = (await send("Target.createTarget", { url: "about:blank" })).result;
  const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true })).result;
  const s = (method, params) => send(method, params, sessionId);
  const errors = [];
  let heldHealth = null;
  const onEvent = async (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") errors.push("exception: " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).split("\n")[0]);
    if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "assert")) errors.push("console error: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    // Interventions are left out: the script's clicks are not real taps, so
    // the browser blocks navigator.vibrate for them (a real tap allows it).
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error" && msg.params.entry.source !== "intervention") errors.push("log error: " + msg.params.entry.text.slice(0, 160) + " " + (msg.params.entry.url ?? ""));
    if (msg.method === "Fetch.requestPaused") {
      const { requestId, request } = msg.params;
      const json = (body) => s("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(body)).toString("base64") });
      if (request.url.includes("/.netlify/functions/game-presence")) await json({ ok: true });
      else if (request.method === "GET") {
        if (screen.holdHealth) heldHealth = () => json({ ready: true });
        else await json(screen.health ?? { ready: true });
      } else await json(AI_REPLY);
    }
  };
  listeners.add(onEvent);
  await s("Runtime.enable");
  await s("Log.enable");
  await s("Page.enable");
  await s("Fetch.enable", { patterns: [{ urlPattern: "*/.netlify/functions/ai-move*" }, { urlPattern: "*/.netlify/functions/game-presence*" }] });
  await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch, screenWidth: width, screenHeight: height });
  await s("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  if (variant.anim === "reduced") await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  // Before the app runs: the settings (the animation level, focus mode on
  // only for the focus screens: one browser serves every screen of a size),
  // the text size, the consent state.
  const settings = { version: 1, ...(variant.anim ? { animation: { level: variant.anim, speed: 1 } } : {}), view: { focus: !!screen.focus } };
  const setup = [
    screenName.startsWith("shop") ? `for (const key of Object.keys(localStorage)) if (key.startsWith("checkervia.marketplace.demo.v1")) localStorage.removeItem(key);` : "",
    `localStorage.setItem("checkervia.settings", ${JSON.stringify(JSON.stringify(settings))});`,
    // No online room from an earlier screen (?online= remembers one, D142).
    `localStorage.removeItem("checkervia.online.room");`,
    screenName === "consent" ? `for (const key of Object.keys(localStorage)) if (/consent/i.test(key)) localStorage.removeItem(key);` : "",
    variant.text !== 100 ? `document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "html{font-size:${variant.text}%}"; document.head.prepend(st); });` : "",
  ].join("\n");
  await s("Page.addScriptToEvaluateOnNewDocument", { source: setup });
  await s("Animation.enable");
  await s("Animation.setPlaybackRate", { playbackRate: 20 });
  // The steps run once the page has loaded (a cold browser can still be on
  // about:blank right after the navigation starts).
  const loaded = new Promise((resolve) => {
    const onLoad = (msg) => {
      if (msg.sessionId !== sessionId || msg.method !== "Page.loadEventFired") return;
      listeners.delete(onLoad);
      resolve();
    };
    listeners.add(onLoad);
  });
  await s("Page.navigate", { url: `http://localhost:${port}/${screen.query}` });
  await Promise.race([loaded, wait(20000)]);
  const result = { size: `${width}x${height}`, variant: variantName, screen: screenName, issues: [] };
  // Wait for the app (or the splash) to be there.
  const ready = screenName === "splash" ? ".splash" : screen.query.includes("result=1") ? ".result-backdrop" : ".home, .app";
  const steps = screenName === "splash" ? until(".splash", 15000) : `${until(ready, 20000)} ${ready === ".home, .app" ? `await (async () => { while (document.querySelector('.splash')) await new Promise(r => setTimeout(r, 50)); })();` : ""} ${screen.steps}`;
  const run = await s("Runtime.evaluate", { expression: `(async () => { ${steps}; await new Promise(r => setTimeout(r, 600)); })()`, awaitPromise: true });
  if (run.error || run.result?.exceptionDetails) {
    result.issues.push("could not open: " + (run.error?.message ?? run.result.exceptionDetails.exception?.description ?? run.result.exceptionDetails.text).split("\n")[0]);
  } else {
    // The screen as opened, kept only if the check finds something.
    const before = shots ? (await s("Page.captureScreenshot", { format: "png" })).result?.data : null;
    const checked = await s("Runtime.evaluate", { expression: CHECK(screen.layer, touch), returnByValue: true });
    const value = checked.result?.result?.value;
    if (!value) result.issues.push("check failed: " + JSON.stringify(checked.result?.exceptionDetails?.exception?.description ?? checked.result).slice(0, 300));
    else result.issues.push(...value.issues, ...(await pressedStates(s)));
    if (shots && before && (value?.issues?.length || allShots)) {
      writeFileSync(join(shots, `${width}x${height}-${variantName}-${screenName}.png`), Buffer.from(before, "base64"));
      // After the check every scroll box is at its end: show that too.
      const shot = await s("Page.captureScreenshot", { format: "png" });
      if (shot.result?.data) writeFileSync(join(shots, `${width}x${height}-${variantName}-${screenName}-end.png`), Buffer.from(shot.result.data, "base64"));
    }
  }
  if (heldHealth) await heldHealth();
  result.issues.push(...new Set(errors));
  listeners.delete(onEvent);
  await send("Target.closeTarget", { targetId });
  return result;
}

// Forces :active on every pressable thing the check marked, and reports
// the ones whose look does not change.
async function pressedStates(s) {
  await s("DOM.enable");
  await s("CSS.enable");
  const root = (await s("DOM.getDocument", { depth: 0 })).result.root.nodeId;
  const nodeIds = (await s("DOM.querySelectorAll", { nodeId: root, selector: "[data-lc-press]" })).result?.nodeIds ?? [];
  for (const nodeId of nodeIds) await s("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
  await wait(150);
  const found = (await s("Runtime.evaluate", { expression: "window.__pressCompare ? window.__pressCompare() : []", returnByValue: true })).result?.result?.value ?? [];
  for (const nodeId of nodeIds) await s("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
  await s("Runtime.evaluate", { expression: "document.querySelectorAll('[data-lc-press]').forEach((el) => el.removeAttribute('data-lc-press'))" });
  await s("CSS.disable");
  await s("DOM.disable");
  return found;
}

const results = [];
let debugPort = Number(args["debug-port"] ?? 9400);
for (const size of sizes) {
  const browser = await openBrowser(debugPort++);
  for (const variant of variants) {
    for (const screenName of screens) {
      const result = await checkState(browser, size, variant, screenName);
      results.push(result);
      console.log(`${result.size} ${result.variant} ${result.screen}: ${result.issues.length ? "\n    " + result.issues.join("\n    ") : "ok"}`);
    }
  }
  await browser.close();
}
const failed = results.filter((result) => result.issues.length);
console.log(`\n${results.length} states checked, ${failed.length} with issues, ${failed.reduce((sum, r) => sum + r.issues.length, 0)} issues in all.`);
if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
