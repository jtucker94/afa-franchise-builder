/* Every rated pool player can land on an AFA roster without being copied onto two teams.
 * node tests/roster-integration.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { console, window: {}, global: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(root + file, "utf8"), sandbox, { filename: file }); }
load("js/draft-engine.js", sandbox);
load("js/madden-nfl27-ea.js", sandbox);
load("js/rating-sources.js", sandbox);
load("js/players-nfl.js", sandbox);
load("js/prospects-college.js", sandbox);
load("js/data.js", sandbox);
load("js/team-theme.js", sandbox);

const D = sandbox.AFADraft;
const R = sandbox.AFARatings;
const Theme = sandbox.AFATheme;
const players = sandbox.AFA_NFL_PLAYERS.map((p) => Object.assign({}, p));
const byId = {};
players.forEach((p) => {
  const before = p.ovr;
  const applied = R.applyFresh(p);
  p.sourceOvr = applied.locked ? applied.src.ovr : before;
  byId[p.id] = p;
});
const prospects = (sandbox.AFA_COLLEGE_PROSPECTS || []).filter((p) => p && p.real !== false);
prospects.forEach((p) => { byId[p.id] = p; p.sourceOvr = p.ovr; });
const teams = sandbox.AFA.TEAMS;
const teamIds = teams.map((t) => t.id);
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const lb = players.find((p) => p.id === "espn_5150249");
const wr = players.find((p) => p.id === "nfl_6794");
check(lb && lb.pos === "LB" && lb.nflTeam === "CLE" && lb.sourceOvr === 67, "Browns LB Justin Jefferson did not stay on his own EA rating");
check(wr && wr.pos === "WR" && wr.nflTeam === "MIN" && wr.sourceOvr === 97, "Vikings WR Justin Jefferson did not stay on his own EA rating");
check(lb.sourceOvr !== wr.sourceOvr, "the two Justin Jeffersons were given the same rating");
check(R.lookup(Object.assign({}, wr, { nflTeam: "CLE" })) == null, "a Vikings receiver matched a Browns team");

const draft = D.runSnakeDraft({ seed: 2026, teamIds: teamIds, players: players, rounds: 53 });
const seen = new Set();
check(teamIds.length === 32, "team count " + teamIds.length);
teamIds.forEach((id) => {
  const roster = draft.draft.rosters[id] || [];
  check(roster.length === 53, id + " roster " + roster.length);
  roster.forEach((pid) => {
    check(!seen.has(pid), pid + " is on two teams");
    seen.add(pid);
    const p = byId[pid];
    check(p && p.real !== false, pid + " is not a real pool player");
    check(p && p.ovr === p.sourceOvr, (p && p.name) + " rating changed from " + (p && p.sourceOvr) + " to " + (p && p.ovr));
  });
});
check(seen.size === 32 * 53, "unique players " + seen.size);

const from = teamIds[0];
const to = teamIds[1];
const traded = draft.draft.rosters[from][0];
draft.draft.rosters[from] = draft.draft.rosters[from].filter((id) => id !== traded);
draft.draft.rosters[to].push(traded);
const afterTrade = new Set();
let tradeDup = false;
teamIds.forEach((id) => (draft.draft.rosters[id] || []).forEach((pid) => {
  if (afterTrade.has(pid)) tradeDup = true;
  afterTrade.add(pid);
}));
check(!tradeDup && draft.draft.rosters[to].includes(traded) && !draft.draft.rosters[from].includes(traded), "trade duplicated or failed");
check(byId[traded].ovr === byId[traded].sourceOvr, "trade changed the rating");

const left = players.filter((p) => !afterTrade.has(p.id));
const signed = D.pickFreeAgent(draft.draft.rosters[from].map((id) => byId[id]), left);
check(signed && !afterTrade.has(signed.id), "free agent was already rostered");
if (signed) {
  draft.draft.rosters[from].push(signed.id);
  check(byId[signed.id].ovr === byId[signed.id].sourceOvr, "signing changed the rating");
}

const realProspects = prospects.filter((p) => !afterTrade.has(p.id)).slice(0, 32);
let college = {
  year: 2027,
  idx: 0,
  order: teamIds.map((id, i) => ({ overall: i + 1, round: 1, pick: i + 1, ownerTeamId: id, originalTeamId: id })),
  board: realProspects.map((p) => p.id),
  picks: [],
  rosters: {}
};
teamIds.forEach((id) => { college.rosters[id] = (draft.draft.rosters[id] || []).slice(); });
realProspects.forEach((p) => {
  const placed = D.commitCollegePick(college, { playerId: p.id, lookup: (id) => byId[id] });
  check(placed.ok, "college pick failed for " + p.name + " " + (placed.reason || ""));
  college = placed.draft;
  check(p.ovr === p.sourceOvr, "college draft changed " + p.name);
});
const collegeSeen = new Set();
let collegeDup = false;
teamIds.forEach((id) => (college.rosters[id] || []).forEach((pid) => {
  if (collegeSeen.has(pid)) collegeDup = true;
  collegeSeen.add(pid);
}));
check(!collegeDup, "a college prospect or veteran is on two teams");
check(realProspects.every((p) => collegeSeen.has(p.id)), "a real prospect was not placed");

const missingArt = [];
teams.forEach((team) => {
  if (!team.primary || !team.secondary || !team.logo) missingArt.push(team.id + " missing color or logo field");
  else if (!fs.existsSync(root + "logos/" + team.logo)) missingArt.push(team.id + " logo file missing " + team.logo);
  const ink = Theme.inkFor(team.primary);
  check(Theme.contrast(team.primary, ink) >= 4.5, team.id + " primary contrast " + Theme.contrast(team.primary, ink));
});
check(missingArt.length === 0, missingArt.join("; "));
check(teams.length === 32, "logo pass did not see 32 teams");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.slice(0, 20).forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS 32x53 unique rated rosters, trade, signing, " + realProspects.length + " prospects, Jefferson LB " + lb.sourceOvr + " WR " + wr.sourceOvr);
