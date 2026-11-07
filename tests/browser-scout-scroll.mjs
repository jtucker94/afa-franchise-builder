/* Scroll the OGFFL scouting page and load public rosters. Writes new PNGs only. */
import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";
import fs from "fs";

const PORT = 9334;
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=" + PORT, "--user-data-dir=/tmp/chrome-afa-scroll", "--window-size=1280,800", "about:blank"
], { stdio: "ignore" });
const die = (msg) => { chrome.kill("SIGKILL"); console.error(msg); process.exit(1); };
async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}
let version = null;
for (let i = 0; i < 40 && !version; i++) {
  try { version = await json("http://127.0.0.1:" + PORT + "/json/version"); } catch (e) { await wait(250); }
}
if (!version) die("no devtools");
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
    const timer = setTimeout(() => { pending.delete(msgId); reject(new Error("CDP timeout " + method)); }, 8000);
    pending.set(msgId, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); }
    });
    browser.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}
await new Promise((resolve, reject) => {
  browser.addEventListener("open", resolve);
  browser.addEventListener("error", () => reject(new Error("ws")));
});
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: "http://127.0.0.1:8765/?screen=scouting" }, sessionId);
  await wait(1500);
  await send("Runtime.evaluate", { expression: "var b=document.querySelector('[data-lg=ogffl]'); if(b) b.click();", returnByValue: true }, sessionId);
  await wait(800);
  await send("Runtime.evaluate", { expression: "var n=[...document.querySelectorAll('h3')].find(el=>/Lineup fit/.test(el.textContent)); if(n) n.scrollIntoView({block:'start'});", returnByValue: true }, sessionId);
  await wait(400);
  const fit = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  fs.writeFileSync("/tmp/smoke-ready-lineup-desktop.png", Buffer.from(fit.data, "base64"));
  await send("Runtime.evaluate", { expression: "var b=document.getElementById('btn-load-rosters'); if(b) b.click();", returnByValue: true }, sessionId);
  await wait(2500);
  await send("Runtime.evaluate", { expression: "var n=[...document.querySelectorAll('h3')].find(el=>/Available in this league/.test(el.textContent)); if(n) n.scrollIntoView({block:'start'});", returnByValue: true }, sessionId);
  await wait(300);
  const fa = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  fs.writeFileSync("/tmp/smoke-ready-fa-desktop.png", Buffer.from(fa.data, "base64"));
  const textEv = await send("Runtime.evaluate", { expression: "(document.body&&document.body.innerText||'').slice(0,8000)", returnByValue: true }, sessionId);
  const text = (textEv.result && textEv.result.value) || "";
  console.log(JSON.stringify({
    lineup: /Lineup fit/.test(text),
    short: /short/.test(text),
    available: /Available in this league/.test(text),
    loaded: /api\.sleeper\.app/.test(text) && /not the AFA/.test(text),
    failed: /did not load/.test(text),
    sample: text.slice(text.indexOf("Lineup fit"), text.indexOf("Lineup fit") + 500)
  }, null, 2));
} catch (err) {
  console.error(String(err && err.stack || err));
  process.exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
}
