/* Draft sort and trade-window rules. No network.
 * node tests/pool-and-trades.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/player-attrs.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-ea.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/rating-sources.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/sortable-tables.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/trade-desk.js", "utf8"), sandbox);
const A = sandbox.AFAAttrs;
const T = sandbox.AFATradeDesk;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const players = [
  { id: "b", name: "Bea", pos: "QB", age: 30, ovr: 80 },
  { id: "a", name: "Ann", pos: "QB", age: 22, ovr: 80 },
  { id: "c", name: "Cy", pos: "WR", age: 22, ovr: 90 }
];
const byAge = players.slice().sort((x, y) => A.comparePlayers(x, y, "age", "asc"));
check(byAge.map((p) => p.id).join(",") === "a,c,b", "age sort tie-break was " + byAge.map((p) => p.id).join(","));
const byAgeDesc = players.slice().sort((x, y) => A.comparePlayers(x, y, "age", "desc"));
check(byAgeDesc[0].id === "b", "oldest first failed");
const attrs = A.attrsFor(players[0]);
check(attrs.estimate === true && attrs.source === "estimate-from-overall", "attribute was not flagged as an estimate");
check(/not an ea attribute/i.test(attrs.note), "attribute note did not say it is not an EA number");
const sourced = A.attrsFor({ id: "x", name: "Bucky Irving", pos: "RB", ovr: 87 });
check(sourced.sourced && sourced.sourced.SPD === true && sourced.SPD === 89, "Bucky speed stayed an estimate");
const hurtsAttrs = A.attrsFor({ id: "h", name: "Jalen Hurts", pos: "QB", ovr: 97 });
check(hurtsAttrs.sourced && hurtsAttrs.sourced.THP === true && hurtsAttrs.THP === 86, "Hurts throw power was not the EA value");
check(hurtsAttrs.estimated && hurtsAttrs.estimated.THA === true, "throw accuracy was invented from split EA ratings");
const S = sandbox.AFASort;
const rows = [{ id: "b", name: "Bea", ovr: 80 }, { id: "a", name: "Ann", ovr: 90 }, { id: "c", name: "Cy", ovr: 80 }];
S.set("unit", "ovr", "desc");
check(S.sort(rows, "unit").map((p) => p.id).join(",") === "a,b,c", "shared sort tie-break failed");
S.toggle("unit", "ovr");
check(S.get("unit").dir === "asc" && S.sort(rows, "unit")[0].id === "b", "toggle did not flip direction");
check(attrs.SPD >= 40 && attrs.SPD <= 99 && attrs.THP >= 40, "QB attributes missing");
check(A.shows(players[2], "THP") === false && A.shows(players[2], "SPD") === true, "WR showed a quarterback attribute");
check(A.COLUMNS.some((col) => col[0] === "SPD") && A.COLUMNS.some((col) => col[0] === "RBK"), "columns missing");

const open = T.tradeWindow({ seasonStarted: true, seasonDone: false, week: 10 });
const locked = T.tradeWindow({ seasonStarted: true, seasonDone: false, week: 11 });
const off = T.tradeWindow({ seasonStarted: false, week: 12 });
const done = T.tradeWindow({ seasonStarted: true, seasonDone: true, week: 18 });
check(open.open === true && open.weeksLeft === 1, "week 10 should still be open");
check(locked.open === false, "week 11 should be locked");
check(off.open === true && done.open === true, "offseason should be open");
check(/Nov 10, 2026/.test(T.DEADLINE_NOTE), "deadline note missing");
check(T.cpuReply({ accepted: true, primary: {} }).decision === "Accept", "accept missing");
check(T.cpuReply({ accepted: false, primary: { status: "close" } }).decision === "Counter", "counter missing");
check(T.cpuReply({ accepted: false, primary: { status: "no", detail: "cap" } }).reason === "not enough value", "decline reason");
check(T.cpuReply({ accepted: false, primary: { status: "no", detail: "positional need" } }).reason === "positional need", "need reason");

const app = fs.readFileSync(root + "js/app.js", "utf8");
const html = fs.readFileSync(root + "index.html", "utf8");
check(app.includes("btn-propose-trade"), "propose button missing");
check(app.includes("playerTable("), "player tables are not using the shared sorter");
check(app.includes("tradeInbox"), "inbox missing");
check(html.includes("board-sort") && html.includes("pool-scroll"), "phone sort controls missing");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS sort, attributes, deadline, propose");
