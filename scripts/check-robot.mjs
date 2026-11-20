// Start Vite on 5180, then run: node scripts/check-robot.mjs
// Uses the browser's animation timeline so busy CI machines and CPU
// throttling cannot turn a mid-transition assertion into a timing race.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const out = resolve("artifacts/avatar-review");
mkdirSync(out, { recursive: true });
const browserPath = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path));
if (!browserPath) throw new Error("No browser found; set BROWSER to the Edge or Chrome executable.");
// Each run owns its profile and port, so parallel checks cannot attach to
// another browser or race a previous browser's profile lock on shutdown.
const profile = mkdtempSync(resolve(out, "profile-"));
const browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--disable-background-networking", "about:blank"], { stdio: "ignore", windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let version;
  for (let n = 0; n < 100; n++) {
    try {
      const port = Number(readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      version = await (await fetch(`http://localhost:${port}/json/version`)).json();
      break;
    } catch { await wait(100); }
  }
  if (!version) throw new Error("Browser did not start");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
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
  await s("Runtime.enable");
  await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
  await s("Emulation.setCPUThrottlingRate", { rate: 4 });
  await s("Page.navigate", { url: "http://localhost:5180/tests/fixtures/robot-face.html" });
  async function evaluate(expression) {
    const answer = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    return answer.result.value;
  }
  for (let n = 0; n < 60; n++) { if (await evaluate("typeof setRobotMood === 'function'")) break; await wait(100); }
  const results = await evaluate(`(async () => {
    const results = [];
    const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const face = document.querySelector('.robot-face');
    const shell = face.querySelector('.robot-head');
    const expression = face.querySelector('.robot-expression');
    const keys = ['leftEye', 'rightEye', 'leftBrow', 'rightBrow', 'mouth', 'leftPupil', 'rightPupil'];
    const paths = Object.fromEntries(keys.map(key => [key, face.querySelector('[data-morph="' + key + '"]')]));
    const samples = path => {
      const length = path.getTotalLength();
      return Array.from({ length: 12 }, (_, i) => {
        const point = path.getPointAtLength(length * i / 11);
        return [point.x, point.y];
      });
    };
    const distance = (a, b) => Math.max(...a.map((point, i) => Math.hypot(point[0] - b[i][0], point[1] - b[i][1])));
    const targetSamples = path => {
      const target = path.cloneNode(false);
      target.removeAttribute('class'); target.setAttribute('opacity', '0');
      face.append(target);
      const value = samples(target);
      target.remove();
      return value;
    };
    face.pauseAnimations();
    const clocks = face.getAnimations({ subtree: true }).filter(a => a.animationName);
    clocks.forEach(a => a.pause());
    for (const mood of ['angry', 'happy', 'laughing', 'shocked', 'alarmed', 'neutral']) {
      const before = Object.fromEntries(keys.map(key => [key, samples(paths[key])]));
      setRobotMood(mood);
      const begun = face.getCurrentTime();
      face.setCurrentTime(begun);
      check(face.querySelector('.robot-expression') === expression, mood + ': same expression node');
      check(face.querySelectorAll('.robot-expression').length === 1, mood + ': exactly one face');
      for (const key of keys) {
        check(face.querySelector('[data-morph="' + key + '"]') === paths[key], mood + ': keeps ' + key);
        check(distance(before[key], samples(paths[key])) < 0.035, mood + ': ' + key + ' starts where it was displayed');
      }
      check(getComputedStyle(expression).opacity === '1', mood + ': no face fade');
      face.setCurrentTime(begun + 0.21);
      for (const key of ['leftEye', 'rightEye', 'mouth']) {
        const mid = samples(paths[key]), target = targetSamples(paths[key]);
        check(distance(before[key], mid) > 0.02, mood + ': ' + key + ' bends through intermediate geometry');
        check(distance(target, mid) > 0.02, mood + ': ' + key + ' has not jumped to its target');
        check(getComputedStyle(paths[key]).opacity === '1', mood + ': ' + key + ' stays visible');
      }
      face.setCurrentTime(begun + 0.43);
      for (const key of keys) check(distance(samples(paths[key]), targetSamples(paths[key])) < 0.035, mood + ': ' + key + ' arrives without a final snap');
      check(face.querySelector('.robot-head') === shell, mood + ': preserves shell');
      const current = face.getAnimations({ subtree: true });
      check(clocks.every(clock => current.includes(clock)), mood + ': idle animation clocks are not restarted');
    }
    for (let i = 0; i < 24; i++) {
      face.setCurrentTime(face.getCurrentTime() + 0.06);
      const before = Object.fromEntries(keys.map(key => [key, samples(paths[key])]));
      setRobotMood(i % 2 ? 'happy' : 'angry');
      face.setCurrentTime(face.getCurrentTime());
      for (const key of ['leftEye', 'rightEye', 'mouth']) check(distance(before[key], samples(paths[key])) < 0.035, 'rapid reversal ' + i + ': continues ' + key);
      check(face.querySelectorAll('.robot-expression').length === 1, 'rapid reversal ' + i + ': no replacement layer');
    }
    // A wink is a temporal action, not just an asymmetric static smile.
    setRobotMood('wink');
    let winkStart = face.getCurrentTime();
    check(!!paths.leftEye.querySelector('[data-wink]'), 'wink: one persistent native eye cycle');
    check(!paths.rightEye.querySelector('[data-wink]'), 'wink: other eye has no closing cycle');
    face.setCurrentTime(winkStart + 0.43);
    check(paths.leftEye.getBBox().height > 5, 'wink: starts fully open');
    check(paths.rightEye.getBBox().height > 5, 'wink: other eye stays open');
    face.setCurrentTime(winkStart + 0.42 + 2.6 * 0.14);
    check(paths.leftEye.getBBox().height < 0.8, 'wink: closes to a clear narrow lid');
    check(paths.rightEye.getBBox().height > 5, 'wink: holds the other eye open during closure');
    face.setCurrentTime(winkStart + 0.42 + 2.6 * 0.4);
    check(paths.leftEye.getBBox().height > 5, 'wink: reopens');
    face.setCurrentTime(winkStart + 0.42 + 2.6 * 1.14);
    check(paths.leftEye.getBBox().height < 0.8, 'wink: repeats after the open rest');
    const heldWink = samples(paths.leftEye);
    setRobotMood('angry');
    face.setCurrentTime(face.getCurrentTime());
    check(distance(heldWink, samples(paths.leftEye)) < 0.035, 'wink: interruption starts at the closed eye without jumping');
    setRobotMood('wink'); winkStart = face.getCurrentTime();
    face.setCurrentTime(winkStart + 0.43);
    document.documentElement.dataset.anim = 'off'; await wait(0);
    check(paths.leftEye.getBBox().height < 0.8 && paths.rightEye.getBBox().height > 5, 'wink: motion off keeps a recognizable static wink');
    face.setCurrentTime(face.getCurrentTime() + 4);
    check(paths.leftEye.getBBox().height < 0.8, 'wink: motion off stops the repeating cycle');
    document.documentElement.dataset.anim = 'standard'; await wait(0);
    winkStart = face.getCurrentTime();
    face.setCurrentTime(winkStart + 0.43);
    check(paths.leftEye.getBBox().height > 5, 'wink: restoring motion reopens the eye');
    face.setCurrentTime(winkStart + 0.42 + 2.6 * 0.14);
    check(paths.leftEye.getBBox().height < 0.8, 'wink: restoring motion resumes the wink');
    for (const level of ['off', 'reduced']) {
      document.documentElement.dataset.anim = level;
      setRobotMood('alarmed');
      await wait(0);
      const nodes = [...face.querySelectorAll('*')];
      check(nodes.every(el => getComputedStyle(el).animationName === 'none'), level + ': no animation');
      check(nodes.every(el => parseFloat(getComputedStyle(el).transitionDuration) === 0), level + ': no transition');
      for (const key of keys) check(distance(samples(paths[key]), targetSamples(paths[key])) < 0.035, level + ': ' + key + ' is immediately final');
      face.setCurrentTime(face.getCurrentTime() + 0.2);
      for (const key of keys) check(distance(samples(paths[key]), targetSamples(paths[key])) < 0.035, level + ': ' + key + ' does not resume a hidden morph');
      setRobotMood('happy'); await wait(0);
    }
    document.documentElement.dataset.anim = 'standard';
    setRobotMood('angry');
    face.setCurrentTime(face.getCurrentTime() + 0.15);
    document.documentElement.dataset.anim = 'off';
    await wait(0);
    for (const key of keys) check(distance(samples(paths[key]), targetSamples(paths[key])) < 0.035, 'disabling motion during a morph settles ' + key);
    document.documentElement.dataset.anim = 'standard';
    face.unpauseAnimations();
    clocks.forEach(a => a.play());
    setRobotMood('defeated'); await wait(600);
    const held = getComputedStyle(shell).transform;
    check(held !== 'none', 'sad head eases into its drooped pose');
    setRobotMood('happy');
    check(getComputedStyle(shell).transform === held, 'leaving sadness starts at the current head pose');
    await wait(500);
    check(getComputedStyle(shell).transform === 'none', 'head returns smoothly to rest');
    setRobotMood('defeated'); await wait(500);
    check(face.getAnimations({ subtree: true }).some(a => a.animationName === 'robot-sulk' && a.playState === 'running'), 'sad idle keeps playing after losing');
    check(document.documentElement.scrollWidth <= innerWidth, 'fits narrow phone');
    return results;
  })()`);
  console.log(`${results.length} avatar browser assertions passed at 360x640 with 4x CPU throttling.`);
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const still = await evaluate("[...document.querySelectorAll('.robot-face *')].every(el => getComputedStyle(el).animationName === 'none' && parseFloat(getComputedStyle(el).transitionDuration) === 0)");
  if (!still) throw new Error("System reduced motion is not respected");
  console.log("System reduced motion assertion passed.");
  await s("Emulation.setEmulatedMedia", { features: [] });
  const frames = await evaluate(`(async () => {
    const gaps = [];
    let previous = performance.now(), began = previous, lastMood = -1;
    return await new Promise(resolve => {
      function sample(now) {
        gaps.push(now - previous); previous = now;
        const mood = Math.floor((now - began) / 500);
        if (mood !== lastMood) { setRobotMood(mood % 2 ? 'happy' : 'angry'); lastMood = mood; }
        if (now - began < 2500) requestAnimationFrame(sample);
        else { gaps.shift(); gaps.sort((a, b) => a - b); resolve({ frames: gaps.length, p95GapMs: gaps[Math.floor(gaps.length * .95)], maxGapMs: gaps.at(-1), cpuThrottle: 4 }); }
      }
      requestAnimationFrame(sample);
    });
  })()`);
  writeFileSync(resolve(out, "frame-sample.json"), JSON.stringify(frames, null, 2));
  console.log("Throttled preview frame sample: " + JSON.stringify(frames));
  await s("Emulation.setDeviceMetricsOverride", { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
  for (const mood of ["happy", "angry", "laughing", "alarmed", "wink"]) {
    await evaluate(`setRobotMood('${mood}')`);
    await wait(650);
    if (mood === "wink") await evaluate(`document.querySelectorAll('.robot-face').forEach(face => {
      face.pauseAnimations();
      const cycle = face.querySelector('[data-wink]');
      face.setCurrentTime(parseFloat(cycle.getAttribute('begin')) + 2.6 * .14);
      face.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 0; });
    })`);
    const shot = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(out, `${mood}.png`), Buffer.from(shot.data, "base64"));
  }
  writeFileSync(resolve(out, "checks.json"), JSON.stringify(results, null, 2));
} finally {
  // Edge can hand off to another process on Windows; ask the browser
  // itself to close before releasing the launcher and websocket.
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 0, method: "Browser.close" }));
    await wait(250);
  }
  ws?.close();
  browser.kill();
}
