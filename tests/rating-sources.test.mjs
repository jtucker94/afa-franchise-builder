/* Sourced Madden list vs AFA pool. No network.
 * node tests/rating-sources.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-lists.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-ea.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/rating-sources.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/players-nfl.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/grading.js", "utf8"), sandbox);
const R = sandbox.AFARatings;
const players = sandbox.AFA_NFL_PLAYERS;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const bucky = players.find((p) => p.name === "Bucky Irving");
check(bucky && bucky.ovr === 95 && bucky.pos === "RB", "pool Bucky was not the 95 RB prior");
const src = R.lookup(bucky);
check(src && src.ovr === 87 && src.edition === "Madden NFL 27" && src.retrievedAt === "2026-11-11", "Bucky EA match " + JSON.stringify(src && { ovr: src.ovr, at: src.retrievedAt }));
check(src && src.sourceUrl === "https://www.ea.com/games/madden-nfl/ratings/positions-ratings/halfback/HB", "Bucky source URL");
check(src && src.attrs && src.attrs.SPD === 89 && src.attrs.ACC === 91, "Bucky speed was not the EA value");
check(src.pff == null, "PFF was invented for Bucky");
const oldList = sandbox.AFA_MADDEN_LISTS.players.find((row) => row.name === "Jalen Hurts" && row.pos === "QB");
const hurts = players.find((p) => p.name === "Jalen Hurts" && p.pos === "QB");
const hurtsSrc = R.lookup(hurts);
check(oldList && oldList.ovr === 79, "compiler list Hurts was not 79");
check(hurtsSrc && hurtsSrc.ovr === 79 && hurtsSrc.attrs && hurtsSrc.attrs.THP === 86, "EA Hurts was not 79");

const copy = Object.assign({}, bucky);
R.applyFresh(copy);
check(copy.ovr === 87 && copy.ovrBase === 87 && copy.ratingBasis === "madden-nfl27-ea", "fresh franchise did not take the EA overall");
const statsText = fs.readFileSync(root + "js/stats-2025.js", "utf8");
const line = JSON.parse(statsText.match(/"nfl_11584":(\[\{.*?\}\])/)[1]);
const graded = sandbox.AFAGrading.gradePlayer({ pos: "RB", age: 24, ovr: 95 }, line, { applyAge: false });
check(graded.overall === 71 && graded.confidence > 0, "counting-stat grade was not 71, got " + graded.overall);
check(copy.ovr === 87, "counting-stat grade replaced the sourced overall");

const progressed = { id: bucky.id, name: bucky.name, pos: "RB", ovr: 71, ovrBase: 95, grade: { overall: 71 } };
check(R.lookup(progressed).ovr === 87, "lookup failed on a progressed save");
check(progressed.ovr === 71, "lookup rewrote a progressed overall");

check(R.lookup(players.find((p) => p.id === "espn_5150249")).ovr === 67, "Browns LB Jefferson borrowed the receiver rating");
check(R.lookup(players.find((p) => p.id === "nfl_6794")).ovr === 97, "Vikings WR Jefferson was not 97");
check(R.lookup(Object.assign({}, players.find((p) => p.id === "nfl_6794"), { nflTeam: "CLE" })) == null, "team mismatch still matched");
const unknown = { name: "Not A Real Person", pos: "QB" };
check(R.lookup(unknown) == null, "an unknown quarterback was given a grade");

const matched = players.filter((p) => R.lookup(p));
check(matched.length > 400, "too few list matches: " + matched.length);
const ids = {};
let dup = 0;
matched.forEach((p) => { if (ids[p.id]) dup++; ids[p.id] = 1; });
check(dup === 0, "one player received two list rows");

const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");
check(app.includes("applied.locked") && app.includes("const fresh = !!force"), "existing saves can be recalibrated on load");
check(app.includes("PFF grades are not stored"), "scout card still prints an estimated PFF number");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS bucky pool 95 EA 87 stat " + graded.overall + " matches " + matched.length);
