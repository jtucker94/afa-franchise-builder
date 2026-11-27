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

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
console.log("PASS playtest hover and jersey guards");
