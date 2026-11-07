/* Headless Chrome smoke via the DevTools protocol. No success is invented.
 * Requires the static server on 127.0.0.1:8765 and google-chrome.
 * node tests/browser-smoke.mjs
 */
import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";
import fs from "fs";

const PORT = 9333;
const chrome = spawn("google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=/tmp/chrome-afa-cdp",
  "--window-size=1280,800",
  "about:blank"
], { stdio: "ignore" });

function die(msg) {
  chrome.kill("SIGKILL");
  console.error(msg);
  process.exit(1);
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

let version = null;
for (let i = 0; i < 40; i++) {
  try { version = await json("http://127.0.0.1:" + PORT + "/json/version"); break; }
  catch (e) { await wait(250); }
}
if (!version) die("Chrome DevTools did not open on port " + PORT);

const browser = new WebSocket(version.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
browser.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
function send(method, params, sessionId) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(msgId);
      reject(new Error("CDP timeout: " + method));
    }, 8000);
    pending.set(msgId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); }
    });
    browser.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}
await new Promise((resolve, reject) => {
  browser.addEventListener("open", resolve);
  browser.addEventListener("error", () => reject(new Error("browser websocket failed")));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

async function open(url, width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 500
  }, sessionId);
  await send("Page.navigate", { url }, sessionId);
  const started = Date.now();
  let text = "";
  let probe = {};
  while (Date.now() - started < 20000) {
    await wait(400);
    const ev = await send("Runtime.evaluate", {
      expression: "JSON.stringify({text:(document.body&&document.body.innerText||'').slice(0,5000),renders:window.__tickerRenders||0,stopped:!!(window.AFANewsTicker&&AFANewsTicker.stopped&&AFANewsTicker.stopped()),rows:document.querySelectorAll('[data-dir]').length,photos:document.querySelectorAll('img.ws-photo,img.ws-logo').length})",
      returnByValue: true
    }, sessionId);
    let parsed = {};
    try { parsed = JSON.parse((ev.result && ev.result.value) || "{}"); } catch (e) { parsed = {}; }
    text = parsed.text || "";
    probe = parsed;
    if (url.indexOf("scouting") >= 0) {
      if (/pass_yd/.test(text) || (Date.now() - started > 6000 && text.includes("Scouting"))) break;
    } else if (parsed.rows > 0) break;
  }
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  return { text, shot: shot.data, probe };
}

let report;
try {
const off = await open("http://127.0.0.1:8765/?screen=players&ticker=off", 1280, 800);
const players = await open("http://127.0.0.1:8765/?screen=players", 1280, 800);
await send("Runtime.evaluate", {
  expression: "var b=document.querySelector('[data-dir]'); if(b) b.click();",
  returnByValue: true
}, sessionId);
await wait(600);
const detailEv = await send("Runtime.evaluate", {
  expression: "JSON.stringify({text:(document.getElementById('dir-detail')||{}).innerText||'', photos:document.querySelectorAll('#dir-detail img').length, stats:/Pass yds|Rec yds|Solo tkl|Not on record|n\\/a/.test((document.getElementById('dir-detail')||{}).innerText||'')})",
  returnByValue: true
}, sessionId);
const detailShot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
fs.writeFileSync("/tmp/smoke-ready-players-desktop.png", Buffer.from(detailShot.data, "base64"));
const phone = await open("http://127.0.0.1:8765/?screen=players", 390, 844);
fs.writeFileSync("/tmp/smoke-ready-players-phone.png", Buffer.from(phone.shot, "base64"));
const scout = await open("http://127.0.0.1:8765/?screen=scouting", 1280, 800);
await send("Runtime.evaluate", {
  expression: "var b=document.querySelector('[data-lg=ogffl]'); if(b) b.click();",
  returnByValue: true
}, sessionId);
await wait(1200);
const scoutTextEv = await send("Runtime.evaluate", {
  expression: "(document.body&&document.body.innerText||'').slice(0,6000)",
  returnByValue: true
}, sessionId);
scout.text = (scoutTextEv.result && scoutTextEv.result.value) || scout.text;
const scoutShot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
scout.shot = scoutShot.data;
fs.writeFileSync("/tmp/smoke-ready-scouting-desktop.png", Buffer.from(scout.shot, "base64"));
const scoutPhone = await open("http://127.0.0.1:8765/?screen=scouting", 390, 844);
await send("Runtime.evaluate", {
  expression: "var b=document.querySelector('[data-lg=ogffl]'); if(b) b.click();",
  returnByValue: true
}, sessionId);
await wait(1200);
const scoutPhoneTextEv = await send("Runtime.evaluate", {
  expression: "(document.body&&document.body.innerText||'').slice(0,7000)",
  returnByValue: true
}, sessionId);
scoutPhone.text = (scoutPhoneTextEv.result && scoutPhoneTextEv.result.value) || scoutPhone.text;
const scoutPhoneShot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
fs.writeFileSync("/tmp/smoke-ready-scouting-phone.png", Buffer.from(scoutPhoneShot.data, "base64"));
const report = {
  tickerOffRenders: off.probe.renders,
  tickerOffStopped: off.probe.stopped,
  tickerOnRenders: players.probe.renders,
  tickerOnStopped: players.probe.stopped,
  tickerOnRows: players.probe.rows,
  playersDesktopHasRows: players.probe.rows > 0,
  detail: JSON.parse((detailEv.result && detailEv.result.value) || "{}"),
  playersPhoneRows: phone.probe.rows,
  scoutHasOgffl: scout.text.includes("OGFFL"),
  scoutHasScoring: /pass_yd|Scoring settings/.test(scout.text),
  scoutHasLineupFit: /Lineup fit/.test(scout.text),
  scoutHasTypeNote: /do not define settings\.type/.test(scout.text),
  scoutHasProjections: /Unavailable/.test(scout.text),
  playersHasOptIn: /Apply verified availability/.test(players.text || ""),
  playersHasFreshness: /Snapshot|not a five-minute|freshness guarantee|Headline time/.test(players.text || ""),
  scoutPhone: /OGFFL|Lineup fit|pass_yd/.test(scoutPhone.text || ""),
  tickerVisible: (players.text || "").includes("Real news")
};
const tickerEv = await send("Runtime.evaluate", {
  expression: "var n=document.getElementById('real-news-ticker'); JSON.stringify({hidden:n?n.hidden:null, text:(n&&n.innerText||'').slice(0,240), renders:window.__tickerRenders||0, stopped:!!(window.AFANewsTicker&&AFANewsTicker.stopped&&AFANewsTicker.stopped())})",
  returnByValue: true
}, sessionId);
report.tickerDom = JSON.parse((tickerEv.result && tickerEv.result.value) || "{}");
console.log(JSON.stringify(report, null, 2));
console.log("--- players text head ---");
console.log(players.text.slice(0, 500));
console.log("--- scout text head ---");
console.log(scout.text.slice(0, 500));
} catch (err) {
  console.error("SMOKE_ERROR " + (err && err.stack || err));
  process.exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
}
