/* Headless systems check. Serves nothing itself.
 * Expects http://127.0.0.1:8765 and google-chrome.
 * node tests/systems-check.mjs
 */
import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";
import fs from "fs";

const PORT = 9334;
const BASE = "http://127.0.0.1:8765/?syscheck=1";
const OUT = process.env.SYSTEMS_CHECK_OUT || "/tmp/systems-check-status.json";
const SHOTS = process.env.SYSTEMS_CHECK_SHOTS || "/tmp";
const chrome = spawn("google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=/tmp/chrome-afa-syscheck",
  "--window-size=1280,900",
  "about:blank"
], { stdio: "ignore" });

const status = {
  ranAt: new Date().toISOString(),
  ok: false,
  steps: {},
  consoleErrors: [],
  screenshots: []
};

function finish(code) {
  try { fs.writeFileSync(OUT, JSON.stringify(status, null, 2)); } catch (e) { console.error(e); }
  chrome.kill("SIGKILL");
  process.exit(code);
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
if (!version) {
  status.steps.chrome = "devtools did not open";
  finish(1);
}

const browser = new WebSocket(version.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
browser.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Runtime.exceptionThrown") {
    const text = msg.params && msg.params.exceptionDetails && msg.params.exceptionDetails.text;
    if (text) status.consoleErrors.push(String(text));
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params && msg.params.type === "error") {
    const args = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
    if (args && !/favicon/i.test(args)) status.consoleErrors.push(args);
  }
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
    }, 12000);
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
await send("Console.enable", {}, sessionId);

async function evalJson(expression) {
  const ev = await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  const raw = ev.result && ev.result.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return { raw }; }
}
async function shot(name) {
  const image = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  const path = SHOTS + "/" + name + ".png";
  fs.writeFileSync(path, Buffer.from(image.data, "base64"));
  status.screenshots.push(path);
}
async function metrics(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 2, mobile: width < 500
  }, sessionId);
}

try {
  await metrics(1280, 900);
  await send("Page.navigate", { url: BASE }, sessionId);
  let pool = null;
  for (let i = 0; i < 40; i++) {
    await wait(400);
    pool = await evalJson("JSON.stringify({headers:document.querySelectorAll('.pool-sort-btn').length,rows:document.querySelectorAll('#player-body tr').length,sort:!!document.getElementById('board-sort'),name:(document.querySelector('#player-body tr td.name-col')||{}).innerText||''})");
    if (pool && pool.rows > 0 && pool.headers > 8) break;
  }
  status.steps.draftPool = pool;
  if (!pool || pool.rows < 1) throw new Error("draft pool did not render");

  await evalJson("JSON.stringify((function(){var b=document.querySelector('[data-sort=age]'); if(b) b.click(); return true;})())");
  await wait(300);
  const ages = await evalJson("JSON.stringify((function(){var rows=[].slice.call(document.querySelectorAll('#player-body tr')); var ages=rows.slice(0,8).map(function(r){var cells=r.querySelectorAll('td'); return Number(cells[3]&&cells[3].textContent);}); var arrow=(document.querySelector('[data-sort=age]')||{}).textContent||''; return {ages:ages, arrow:arrow};})())");
  status.steps.ageSort = ages;
  const sorted = ages && ages.ages && ages.ages.every((n, i, arr) => i === 0 || !(arr[i - 1] > n));
  if (!sorted || !/↑/.test(ages.arrow || "")) throw new Error("age sort did not go youngest to oldest");
  await evalJson("JSON.stringify((function(){var el=document.getElementById('pool-head'); if(el) el.scrollIntoView({block:'center'}); return true;})())");
  await wait(200);
  await shot("pool-sorted-desktop");

  await metrics(390, 844);
  await evalJson("JSON.stringify((function(){var el=document.getElementById('pool-head'); if(el) el.scrollIntoView({block:'center'}); return true;})())");
  await wait(300);
  const phonePool = await evalJson("JSON.stringify({scroll:!!document.querySelector('.pool-scroll'), sort:!!document.getElementById('board-sort'), sticky:!!document.querySelector('.name-col'), headers:[].map.call(document.querySelectorAll('.pool-sort-btn'), function(b){return b.textContent;}).slice(0,12)})");
  status.steps.phonePool = phonePool;
  await shot("pool-sorted-iphone");
  await metrics(360, 740);
  await evalJson("JSON.stringify((function(){var el=document.getElementById('pool-head'); if(el) el.scrollIntoView({block:'center'}); return true;})())");
  await wait(200);
  await shot("pool-sorted-360");

  await metrics(390, 844);
  await evalJson("JSON.stringify((function(){var b=document.getElementById('btn-sys-trades'); if(b) b.click(); return !!b;})())");
  let trade = null;
  for (let i = 0; i < 20; i++) {
    await wait(300);
    trade = await evalJson("JSON.stringify({propose:!!document.getElementById('btn-propose-trade'), label:(document.getElementById('btn-propose-trade')||{}).textContent||'', deadline:(document.querySelector('.trade-deadline')||{}).innerText||'', inbox:document.querySelectorAll('[data-inbox]').length})");
    if (trade && trade.propose) break;
  }
  status.steps.tradeScreen = trade;
  if (!trade || !trade.propose) throw new Error("Propose Trade was not visible");
  await shot("trade-iphone");
  await metrics(1280, 900);
  await shot("trade-desktop");
  await metrics(360, 740);
  await shot("trade-360");

  await metrics(390, 844);
  const proposed = await evalJson("JSON.stringify((function(){var o=document.querySelector('tr[data-offer]'); if(o) o.click(); return {offer:(document.getElementById('offer-sel')||{}).innerText||''};})())");
  await wait(200);
  const asked = await evalJson("JSON.stringify((function(){var a=document.querySelector('tr[data-ask]'); if(a) a.click(); return {ask:(document.getElementById('ask-sel')||{}).innerText||''};})())");
  await wait(200);
  const reply = await evalJson("JSON.stringify((function(){var b=document.getElementById('btn-propose-trade'); var before=b?b.disabled:true; if(b && !b.disabled) b.click(); var p=b?b.getBoundingClientRect():null; var acc=document.querySelector('[data-inbox=accept]'); var ar=acc?acc.getBoundingClientRect():null; var overlap=false; if(p&&ar){overlap=!(p.bottom<ar.top||p.top>ar.bottom||p.right<ar.left||p.left>ar.right);} return {disabledBefore:before, reply:(document.querySelector('.ta-status')||{}).textContent||'', reason:(document.querySelector('.ta-detail')||{}).textContent||'', overlap:overlap};})())");
  status.steps.cpuReply = { proposed, asked, reply };
  const words = ((reply && reply.reply) || "") + " " + ((reply && reply.reason) || "");
  if (!proposed || /No players or picks/.test(proposed.offer || "")) throw new Error("tapping your player did not add him to the offer");
  if (!asked || /No players or picks/.test(asked.ask || "")) throw new Error("tapping their player did not add him to the offer");
  if (!reply || reply.disabledBefore) throw new Error("Propose Trade stayed disabled after both sides were filled");
  if (!/Accept|Decline|Counter/.test(words)) throw new Error("CPU did not answer the offer");
  if (reply.overlap) throw new Error("Propose Trade covered an inbox button");
  await shot("trade-iphone-offered");

  const inbox = await evalJson("JSON.stringify((function(){var b=document.querySelector('[data-inbox=accept]'); if(b) b.click(); return {clicked:!!b, text:(document.querySelector('.trade-inbox')||{}).innerText||''};})())");
  await wait(300);
  const after = await evalJson("JSON.stringify({text:(document.querySelector('.trade-inbox')||{}).innerText||''})");
  status.steps.inbox = { inbox, after };
  if (!after || !/accepted/i.test(after.text || "")) throw new Error("inbound offer was not accepted");

  const saved = await evalJson("JSON.stringify({key:localStorage.getItem('afa-gm-franchise-builder-v029') ? 'present' : 'missing'})");
  status.steps.saveKey = saved;
  if (!saved || saved.key !== "present") throw new Error("save key was not written");

  await send("Page.navigate", { url: "http://127.0.0.1:8765/" }, sessionId);
  let resumed = null;
  for (let i = 0; i < 20; i++) {
    await wait(400);
    resumed = await evalJson("JSON.stringify((function(){var boot=document.getElementById('screen-boot'); if(boot && boot.className.indexOf('active')>=0){boot.click();} var cont=document.getElementById('btn-continue'); if(cont && cont.offsetParent){cont.click();} var tab=document.querySelector('#hub-nav [data-tab=trades]'); if(tab) tab.click(); return {inbox:(document.querySelector('.trade-inbox')||{}).innerText||''};})())");
    if (resumed && /accepted/i.test(resumed.inbox || "")) break;
  }
  status.steps.reload = resumed;
  if (!resumed || !/accepted/i.test(resumed.inbox || "")) throw new Error("reload did not restore the accepted trade");

  let live = { ok: false };
  try {
    const res = await fetch("https://jtucker94.github.io/afa-franchise-builder/");
    const text = await res.text();
    live = { ok: res.ok, version: (text.match(/0\.1\.\d+/) || [])[0] || null };
  } catch (e) {
    live = { ok: false, error: String(e.message || e) };
  }
  status.steps.liveSite = live;
  status.ok = status.consoleErrors.length === 0;
  if (!status.ok) throw new Error("console errors: " + status.consoleErrors.join(" | "));
  console.log("PASS systems check");
  finish(0);
} catch (err) {
  status.ok = false;
  status.error = String(err && err.message || err);
  console.error("FAIL " + status.error);
  try { await shot("systems-check-failure"); } catch (e) {}
  finish(1);
}
