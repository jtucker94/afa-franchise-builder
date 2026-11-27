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

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
console.log("PASS playtest hover and jersey guards");
