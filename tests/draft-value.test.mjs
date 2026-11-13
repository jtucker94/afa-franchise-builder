/* CPU draft stays near the consensus board. node tests/draft-value.test.mjs
 *
 * Reach is consensus rank minus pick number. Positive means the player was
 * taken early. The window is the most spots a club may look past the best
 * player still available: 12 in round 1, 16 in rounds 2–3, 24 in rounds 4–10,
 * 32 in rounds 11–30, and 40 from round 31 on. That is wide enough for a
 * starter need or a scheme lean, and tight enough that a first-round pick
 * cannot be someone the board has 13 spots lower.
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { console, window: {}, global: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(root + file, "utf8"), sandbox, { filename: file }); }
load("js/draft-engine.js");
load("js/players-nfl.js");
load("js/prospects-college.js");
load("js/data.js");

const D = sandbox.AFADraft;
const PLAYERS = sandbox.AFA_NFL_PLAYERS;
const TEAMS = sandbox.AFA.TEAMS.map((t) => t.id);
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

function rankMap(list) {
  const ordered = list.slice().sort((a, b) => D.consensusValue(b) - D.consensusValue(a) || String(a.name || "").localeCompare(String(b.name || "")) || String(a.id).localeCompare(String(b.id)));
  const rank = {};
  ordered.forEach((p, i) => { rank[p.id] = i + 1; });
  return rank;
}

function measure(picks, rank) {
  const by = {};
  picks.forEach((pk) => {
    const early = rank[pk.playerId] - pk.overall;
    (by[pk.round] || (by[pk.round] = [])).push(early);
  });
  return by;
}

const rank = rankMap(PLAYERS);
const seeds = [1, 7, 42, 2026, 99, 2027];
const summary = {};
const seenIds = new Set();
seeds.forEach((seed) => {
  const res = D.runSnakeDraft({ seed: seed, teamIds: TEAMS, players: PLAYERS, rounds: 53 });
  const ids = res.draft.picks.map((pk) => pk.playerId);
  check(new Set(ids).size === ids.length, "seed " + seed + " drafted a duplicate");
  const sizes = {};
  TEAMS.forEach((id) => { sizes[id] = (res.draft.rosters[id] || []).length; });
  check(Object.values(sizes).every((n) => n === 53), "seed " + seed + " roster was not 53");
  const by = measure(res.draft.picks, rank);
  for (let round = 1; round <= 53; round++) {
    const arr = by[round] || [];
    const early = arr.map((n) => Math.max(0, n));
    const maxEarly = early.length ? Math.max(...early) : 0;
    const avgEarly = early.reduce((s, n) => s + n, 0) / early.length;
    const cap = D.reachWindow(round);
    check(maxEarly <= cap, "seed " + seed + " round " + round + " reach " + maxEarly + " over window " + cap);
    check(avgEarly <= cap, "seed " + seed + " round " + round + " average reach " + avgEarly.toFixed(1));
    if (!summary[round]) summary[round] = { maxEarly: 0, avgEarly: 0, n: 0 };
    summary[round].maxEarly = Math.max(summary[round].maxEarly, maxEarly);
    summary[round].avgEarly += avgEarly;
    summary[round].n += 1;
  }
  const top = Object.keys(rank).filter((id) => rank[id] <= 24);
  top.forEach((id) => {
    const pk = res.draft.picks.find((p) => p.playerId === id);
    const slide = pk ? pk.overall - rank[id] : 999;
    check(slide <= 20, "seed " + seed + " top player " + id + " slid " + slide);
  });
  ids.forEach((id) => seenIds.add(id));
});

const class2027 = (sandbox.AFA_COLLEGE_PROSPECTS || []).filter((p) => p && p.year === 2027 && p.real !== false && !p.generated && !p.fictional);
const crank = rankMap(class2027);
const order = TEAMS.slice();
let board = class2027.map((p) => p);
const rosters = {};
TEAMS.forEach((id) => { rosters[id] = []; });
const collegePicks = [];
for (let n = 0; n < 7 * 32 && board.length; n++) {
  const spot = D.pickSpot(n + 1, 32);
  const tid = order[(spot.round % 2 === 1) ? (n % 32) : (31 - (n % 32))];
  const roster = rosters[tid].map((id) => class2027.find((p) => p.id === id)).filter(Boolean);
  const rec = D.recommendProspect({ board: board, roster: roster, teamId: tid, round: spot.round });
  if (!rec) break;
  collegePicks.push({ playerId: rec.id, overall: spot.overall, round: spot.round });
  rosters[tid].push(rec.id);
  board = board.filter((p) => p.id !== rec.id);
}
check(new Set(collegePicks.map((p) => p.playerId)).size === collegePicks.length, "college draft duplicated a prospect");
const collegeBy = measure(collegePicks, crank);
for (let round = 1; round <= 7; round++) {
  const arr = collegeBy[round] || [];
  if (!arr.length) continue;
  const maxEarly = Math.max(...arr.map((n) => Math.max(0, n)));
  check(maxEarly <= D.reachWindow(round), "college round " + round + " reach " + maxEarly);
}
const collegeTop = Object.keys(crank).filter((id) => crank[id] <= 16);
collegeTop.forEach((id) => {
  const pk = collegePicks.find((p) => p.playerId === id);
  if (!pk) return;
  check(pk.overall - crank[id] <= 16, "college top prospect slid to " + pk.overall);
});

const appSrc = fs.readFileSync(root + "js/app.js", "utf8");
check(appSrc.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");
check(appSrc.includes("strategy: draftStrategy(teamId)"), "simulate path does not use the value window");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.slice(0, 30).forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
const line = [];
for (let round = 1; round <= 53; round++) {
  const row = summary[round];
  line.push(round + ":" + row.maxEarly + "/" + (row.avgEarly / row.n).toFixed(1));
}
console.log("PASS value window " + line.join(" "));
