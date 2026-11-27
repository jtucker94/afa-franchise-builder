/* Guards for Jordan's playtest bugs. node tests/playtest-fixes.test.mjs */
import fs from "fs";

const root = new URL("..", import.meta.url).pathname;
const app = fs.readFileSync(root + "js/app.js", "utf8");
const css = fs.readFileSync(root + "css/style.css", "utf8");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

check(app.includes("function scrollSnapshots") && app.includes("function restoreScrollSnapshots"), "hover scout does not preserve scroll");
check(app.includes("restoreScrollSnapshots(snaps)"), "scout card can reveal before scroll is restored");
check(css.includes("overflow-anchor: none"), "pool scroll can jump when the scout card appears");
const jersey = app.slice(app.indexOf("function jerseyNum"), app.indexOf("function attrTone"));
check(jersey.includes("Number.isFinite(n)"), "jersey 0 is not kept as a number");
check(!jersey.includes('=== 0) return "—"'), "jersey 0 still renders as a dash");
const pool = fs.readFileSync(root + "js/players-nfl.js", "utf8");
const lb = pool.slice(pool.indexOf('"id": "espn_5150249"'), pool.indexOf('"id": "espn_5150249"') + 400);
const wr = pool.slice(pool.indexOf('"id": "nfl_6794"'), pool.indexOf('"id": "nfl_6794"') + 400);
check(/"ovr": 67/.test(lb), "Browns LB Jefferson still has the receiver overall");
check(lb.includes('"pos": "LB"') && wr.includes('"pos": "WR"'), "Jefferson records lost their positions");
check(!/"ovr": 98/.test(lb), "LB Jefferson overall still matches the old shared 98");
check(app.includes("function removeFromAllRosters") && app.includes("ensureRoster(teamId).push(pid)"), "signings do not write the live roster");
check(app.includes("state.depthOrders") && app.includes("function moveDepth"), "depth chart edits are not saved");
check(app.includes("data-slate-week") && app.includes("function slateWeekNumber"), "schedule cannot browse weeks");
check(app.includes("ui.slateWeek = n") && !app.includes("state.week = n"), "browsing a week simulates or changes the league week");

import vm from "vm";
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "gameday/engine.js", "utf8"), sandbox);
const settle = sandbox.AFAGameDay.settleTiedScore;
let ties = 0;
const rnd = (() => { let s = 2026; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
for (let i = 0; i < 2720; i++) {
  const out = settle(20, 20, rnd, 0);
  if (out.stayedTied) ties++;
  else if (out.home === out.away) ties++;
}
check(ties >= 10 && ties <= 120, "tie rate " + ties + " over 2720 tied arrivals is outside about 0-2 per season");
check(settle(24, 17, rnd, 0).stayedTied === false, "a decided game was turned into a tie");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
console.log("PASS playtest hover and jersey guards");
