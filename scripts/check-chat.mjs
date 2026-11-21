// Run Vite on port 5180 (or CHAT_PORT), then node scripts/check-chat.mjs. No real model calls.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('artifacts/chat-review');
mkdirSync(out, { recursive: true });
const executable = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(path => path && existsSync(path));
if (!executable) throw new Error('No installed browser available');
const profile = mkdtempSync(resolve(out, 'profile-'));
const browser = spawn(executable, ['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-extensions','--disable-background-networking','about:blank'], { stdio:'ignore',windowsHide:true });
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
let ws;
try {
  let version;
  for (let n=0;n<100;n++) {
    try { const port=Number(readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0]); version=await (await fetch(`http://localhost:${port}/json/version`)).json(); break; } catch { await wait(100); }
  }
  if (!version) throw new Error('Browser startup failed');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen=resolve);
  let nextId=0;
  const pending=new Map();
  ws.onmessage=event => {const msg=JSON.parse(event.data);if(msg.id){pending.get(msg.id)?.(msg);pending.delete(msg.id);}};
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>reject(new Error(`CDP timeout: ${method}`)),60000);pending.set(id,msg=>{clearTimeout(timer);msg.error?reject(new Error(msg.error.message)):resolve(msg.result);});ws.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const s=(method,params)=>send(method,params,sessionId);
  await s('Runtime.enable'); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await s('Page.navigate',{url:`http://localhost:${process.env.CHAT_PORT ?? 5180}/tests/fixtures/chat-flow.html`});
  const evaluate=async expression=>{const result=await s('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  for(let n=0;n<100;n++){if(await evaluate("typeof setChatScenario === 'function'"))break;await wait(100);}
  const checks=await evaluate(`(async()=>{
    const checks=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
    const text=()=>document.querySelector('.speech-line')?.textContent??null;
    const typing=()=>document.querySelectorAll('.speech-typing span').length===3;
    await wait(2600);
    check(chatRequests().calls===1,'StrictMode sends one request');
    check(parseFloat(getComputedStyle(document.querySelector('[aria-live]')).width)<=1,'screen reader mirror is visually hidden');
    for(const side of ['white','black']){
      setChatScenario('fast',side);await wait(150);
      check(text()!==null&&!text().includes('I came here to win'),'turn cue shown before remote remark for '+side);
      check(document.querySelector('[aria-live]').textContent==='','cue does not announce or speak');
      await wait(1400);check(typing(),'three animated dots after cue for '+side);
      check([...document.querySelectorAll('.speech-typing span')].every(dot=>getComputedStyle(dot).animationName==='typing'),'dots use animation');
      await wait(1100);check(text()?.includes('I came here to win'),'one final line after dots for '+side);
      check(chatRequests().calls===1,'one request per turn for '+side);
      check(chatRequests().contexts[0].player===(side==='white'?'black':'white'),'correct AI colour for '+side);
      const final=text();await wait(800);check(text()===final,'no half second replacement for '+side);
      reviewChat(true);await wait(100);check(!document.querySelector('.speech'),'review hides settled line for '+side);
      reviewChat(false);await wait(100);check(text()===final&&chatRequests().calls===1,'return from review retains one settled line for '+side);
    }
    for(const mode of ['invalid','sweet','turn-echo','offline']){
      setChatScenario(mode);await wait(2650);
      check(text()!==null&&!/black|white|clever|well played|your move/i.test(text()),mode+': safe sharp local fallback');
    }
    setChatScenario('great');await wait(2650);check(text()?.includes('Well played'),'praise requires the great verdict');
    setChatScenario('slow');await wait(4300);const fallback=text();check(fallback!==null,'slow request finishes locally');
    await wait(2700);check(text()===fallback,'late reply cannot overwrite fallback');
    setChatScenario('slow');await wait(100);setChatScenario('fast');await wait(7100);check(text()?.includes('I came here to win'),'new game ignores stale reply');
    setChatScenario('review');await wait(200);check(!document.querySelector('.speech'),'no live chat in history review');check(chatRequests().calls===0,'review makes no request');
    setChatScenario('thinking');await wait(100);check(/my|me|think|reply/i.test(text()??''),'AI gets its own turn cue');await wait(1500);check(typing(),'thinking cue changes to dots');check(chatRequests().calls===0,'thinking does not generate a competing taunt');
    setChatScenario('end');await wait(100);check(typing(),'result waits behind dots');await wait(1100);check(text()?.includes('I win'),'one correct outcome line');check(chatRequests().calls===1,'one request for result');
    await wait(700);check(chatRequests().calls===1,'result line remains sealed');
    return checks;
  })()`);
  const shot=await s('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(out,'chat-final.png'),Buffer.from(shot.data,'base64'));
  writeFileSync(resolve(out,'checks.json'),JSON.stringify({checks,count:checks.length},null,2));
  console.log(JSON.stringify({checksPassed:checks.length,viewport:'390x844',realProviderCalls:0}));
} finally {
  if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({id:0,method:'Browser.close'}));await wait(250);}
  ws?.close();browser.kill();
}
