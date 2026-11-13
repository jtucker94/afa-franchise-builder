/* Regression for founding and seasonal draft logic.
 * Run: node tests/draft-regression.mjs
 * Uses js/draft-engine.js (the same recommend / commitPick / identity / class policy
 * the app calls). Does not invent passing results.
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
function loadScript(file, sandbox) {
  vm.runInContext(fs.readFileSync(root + file, "utf8"), sandbox, { filename: file });
}
const sandbox = { console, window: {}, global: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
loadScript("js/draft-engine.js", sandbox);
loadScript("js/players-nfl.js", sandbox);
loadScript("js/prospects-college.js", sandbox);
loadScript("js/sleeper-leagues.js", sandbox);
loadScript("js/data.js", sandbox);

const D = sandbox.AFADraft;
const PLAYERS = sandbox.AFA_NFL_PLAYERS;
const PROSPECTS = sandbox.AFA_COLLEGE_PROSPECTS;
const TEAMS = sandbox.AFA.TEAMS.map((t) => t.id);
const LEAGUES = sandbox.AFA_SLEEPER_LEAGUES.leagues;
const appSrc = fs.readFileSync(root + "js/app.js", "utf8");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

function posCounts(roster) {
  const c = {};
  roster.forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; });
  return c;
}
function noDupes(players, label) {
  const ix = { ids: new Set(), sleeper: new Set(), espn: new Set(), npc: new Set(), groups: new Set() };
  // Reuse the engine's peopleClash rather than a second definition.
  for (let i = 0; i < players.length; i++) {
    for (let j = 0; j < i; j++) {
      if (D.peopleClash(players[i], players[j])) {
        failures.push(label + " duplicate " + players[i].name + " / " + players[j].name + " (" + players[i].id + " vs " + players[j].id + ")");
        return;
      }
    }
  }
  void ix;
}
function metrics(result) {
  const byTeam = {};
  const lookup = result.lookup;
  TEAMS.forEach((id) => { byTeam[id] = (result.draft.rosters[id] || []).map(lookup).filter(Boolean); });
  const summary = {};
  Object.keys(D.STARTER_NEED).forEach((pos) => {
    const counts = TEAMS.map((id) => posCounts(byTeam[id])[pos] || 0);
    summary[pos] = {
      min: Math.min(...counts),
      max: Math.max(...counts),
      avg: +(counts.reduce((s, n) => s + n, 0) / counts.length).toFixed(2),
      underStarter: counts.filter((n) => n < D.STARTER_NEED[pos]).length,
      underDepth: counts.filter((n) => n < D.DEPTH_NEED[pos]).length
    };
  });
  const sizes = TEAMS.map((id) => byTeam[id].length);
  const all = TEAMS.flatMap((id) => byTeam[id]);
  return { byTeam, summary, sizes, all, picks: result.draft.picks.length, left: result.draft.board.length, stopped: result.stopped };
}

const supply = {};
PLAYERS.forEach((p) => { supply[p.pos] = (supply[p.pos] || 0) + 1; });

check(appSrc.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");
check(appSrc.includes('version: "0.1.38"'), "display version not 0.1.38");
check(appSrc.includes('"0.1.35"'), "load no longer accepts 0.1.35 saves");
check(appSrc.includes('"0.1.24"'), "load no longer accepts 0.1.24 saves");
check(appSrc.includes('"0.1.23"'), "load no longer accepts 0.1.23 saves");
check(appSrc.includes("AFADraft.commitPick"), "app makePick does not call commitPick");
check(appSrc.includes("AFADraft.recommend("), "app recommend does not call the engine");
check(!appSrc.includes("playerId = k[0].id"), "keeper click still silently replaces the chosen player");
check(fs.readFileSync(root + "sw.js", "utf8").includes("afa-shell-${SW_VERSION}") && fs.readFileSync(root + "sw.js", "utf8").includes('const SW_VERSION = "v048"'), "service worker cache not v048");

// Identity: same-name different humans stay apart. Verified listing dupes collapse.
const byId = Object.create(null);
PLAYERS.forEach((p) => { byId[p.id] = p; });
PROSPECTS.forEach((p) => { byId[p.id] = p; });
const jeff = PLAYERS.filter((p) => D.foldName(p.name) === "justin jefferson");
check(jeff.length === 2 && !D.peopleClash(jeff[0], jeff[1]), "Justin Jefferson WR and LB were collapsed");
const murphys = PLAYERS.filter((p) => D.foldName(p.name) === "byron murphy");
check(murphys.length === 2 && !D.peopleClash(murphys[0], murphys[1]), "Byron Murphy Jr and II were collapsed");
const jaylon = PLAYERS.filter((p) => D.foldName(p.name) === "jaylon jones");
check(jaylon.length === 2 && !D.peopleClash(jaylon[0], jaylon[1]), "the two Jaylon Joneses were collapsed");
const millers = [byId.nfl_13984, PROSPECTS.find((p) => p.name === "Tyler Miller")].filter(Boolean);
check(millers.length === 2 && !D.peopleClash(millers[0], millers[1]), "Tyler Miller OT LSU and OT Iowa State were collapsed");
const kellyListing = { id: "col_2027_kelly_jones", name: "Kelly Jones", pos: "CB", college: "Mississippi State" };
const ojListing = { id: "col_2027_oj_frederique_jr", name: "OJ Frederique Jr.", pos: "CB", college: "Miami" };
check(!PROSPECTS.some((p) => p.id === "col_2027_kelly_jones" || p.id === "col_2027_oj_frederique_jr"), "duplicate prospect listings are still in the compiled pool");
check(D.peopleClash(byId.col_2027_kelley_jones, kellyListing), "Kelley/Kelly Jones listing duplicate was not linked");
check(D.isDuplicateListing("col_2027_kelly_jones") && !D.isDuplicateListing("col_2027_kelley_jones"), "Kelly Jones was not the dropped listing");
check(D.peopleClash(byId.col_2027_romanas_oj_frederique_jr, ojListing), "OJ Frederique listing duplicate was not linked");

const realYears = D.realClassYears(PROSPECTS);
check(realYears.indexOf(2027) >= 0 && realYears.indexOf(2028) >= 0, "2027/2028 not detected as real classes: " + realYears.join(","));
check(D.classPolicy(2027, PROSPECTS) === "real", "2027 policy is not real");
check(D.classPolicy(2028, PROSPECTS) === "real", "2028 policy is not real");
check(D.classPolicy(2029, PROSPECTS) === "unavailable", "2029 was not left as an uncompiled near-term gap");
check(D.classPolicy(2030, PROSPECTS) === "generated", "2030 was not a generated class");
check(D.classPolicy(2035, PROSPECTS) === "generated", "2035 was not a generated class");
const fictionalInReal = PROSPECTS.filter((p) => (p.year === 2027 || p.year === 2028) && (p.fictional || p.generated || p.real === false));
check(fictionalInReal.length === 0, "compiled real class contains fictional rows: " + fictionalInReal.length);

const prosNpc = new Set(PLAYERS.map((p) => D.foldName(p.name) + "|" + p.pos + "|" + D.schoolKey(p.college)));
const vetAsRookie = PROSPECTS.filter((p) => prosNpc.has(D.foldName(p.name) + "|" + p.pos + "|" + D.schoolKey(p.college)) && D.schoolKey(p.college));
check(vetAsRookie.length === 0, "current NFL player also listed as a college rookie: " + vetAsRookie.map((p) => p.name).join(", "));

// A later class must not be able to redraft someone already in the league under a new id.
const clone = Object.assign({}, byId.col_2027_jeremiah_smith, { id: "col_2028_jeremiah_smith_clone", year: 2028, draftClass: 2028 });
check(D.peopleClash(clone, byId.col_2027_jeremiah_smith), "same prospect under a new id was treated as a different person");

const genA = D.generateProspectClass(2030, PLAYERS.concat(PROSPECTS));
const genB = D.generateProspectClass(2030, PLAYERS.concat(PROSPECTS));
check(JSON.stringify(genA) === JSON.stringify(genB), "2030 fictional class is not stable");
const gen31 = D.generateProspectClass(2031, PLAYERS.concat(PROSPECTS).concat(genA));
check(genA.length >= 224, "generated class shorter than a 7-round draft: " + genA.length);
check(genA.every((p) => p.fictional === true && p.generated === true && p.real === false && p.bio == null && p.stats == null && p.label === "Fictional prospect"), "generated prospect missing fictional label or carries a biography/stats");
check(genA.every((p) => p.college == null), "generated prospect was given a college biography");
const genNames = new Set();
let genNameClash = 0;
genA.forEach((p) => {
  const n = D.foldName(p.name);
  if (genNames.has(n)) genNameClash++;
  genNames.add(n);
  if (PLAYERS.some((q) => D.peopleClash(p, q)) || PROSPECTS.some((q) => D.peopleClash(p, q))) genNameClash++;
});
check(genNameClash === 0, "generated class collided with a real identity or itself");
check(gen31.some((p) => p.id.indexOf("gen_2031_") === 0) && gen31.every((p) => genA.every((g) => g.id !== p.id)), "2031 class reused 2030 ids");
check(genA.some((p) => p.pos === "K") && genA.some((p) => p.pos === "P"), "generated class has no kickers or punters");
const genPos = {};
genA.forEach((p) => { genPos[p.pos] = (genPos[p.pos] || 0) + 1; });

function draftableReal(year) {
  return PROSPECTS.filter((p) => Number(p.year) === year && !p.generated && !p.fictional && p.real !== false && !D.isDuplicateListing(p.id) && !vetAsRookie.some((v) => v.id === p.id));
}

const seeds = [1, 7, 42, 2026];
const seedReports = [];
seeds.forEach((seed) => {
  const result = D.runSnakeDraft({ seed: seed, teamIds: TEAMS, players: PLAYERS, rounds: 53 });
  const m = metrics(result);
  seedReports.push({ seed: seed, summary: m.summary, sizes: [Math.min(...m.sizes), Math.max(...m.sizes)], picks: m.picks, left: m.left, stopped: m.stopped });
  check(m.stopped == null, "seed " + seed + " stopped early: " + m.stopped);
  check(m.picks === 53 * 32, "seed " + seed + " pick count " + m.picks);
  check(Math.min(...m.sizes) === 53 && Math.max(...m.sizes) === 53, "seed " + seed + " roster sizes " + Math.min(...m.sizes) + "-" + Math.max(...m.sizes));
  noDupes(m.all, "seed " + seed);
  const fake = m.all.filter((p) => p.fictional || p.generated || String(p.id).indexOf("gen_") === 0);
  check(fake.length === 0, "seed " + seed + " invented " + fake.length + " players in the founding draft");
  Object.keys(D.STARTER_NEED).forEach((pos) => {
    const need = 32 * D.STARTER_NEED[pos];
    if (supply[pos] >= need) check(m.summary[pos].underStarter === 0, "seed " + seed + " short starters at " + pos + " min " + m.summary[pos].min + " (supply " + supply[pos] + ")");
    const depthNeed = 32 * D.DEPTH_NEED[pos];
    if (supply[pos] >= depthNeed) check(m.summary[pos].underDepth === 0, "seed " + seed + " short depth at " + pos + " min " + m.summary[pos].min + " avg " + m.summary[pos].avg + " (supply " + supply[pos] + ")");
  });
});

// Round sim, sim-to-user, manual choice, idempotence, resume.
const order = TEAMS.slice();
const round = D.runSnakeDraft({ seed: 3, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order, maxPicks: 32 });
check(round.draft.picks.length === 32, "sim round picked " + round.draft.picks.length);
check(TEAMS.every((id) => round.draft.rosters[id].length === 1), "sim round did not give every club one player");

const userTeam = order[5];
const simTo = D.runSnakeDraft({
  seed: 3, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order,
  userTeamId: userTeam, userMode: "manual", simToManual: true,
  desk: Object.fromEntries(TEAMS.map((id) => [id, id === userTeam ? "manual" : "auto"]))
});
check(simTo.stopped === "manual", "sim-to-user stopped for " + simTo.stopped);
check(simTo.draft.picks.length === 5, "sim-to-user made " + simTo.draft.picks.length + " picks before the user");
check((simTo.draft.rosters[userTeam] || []).length === 0, "sim-to-user drafted for the user");

const held = PLAYERS.filter((p) => p.pos === "C" && p.ovr >= 66 && p.ovr <= 72)[0];
const manual = D.runSnakeDraft({
  seed: 9, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order,
  userTeamId: userTeam, userMode: "manual", maxPicks: 6,
  desk: Object.fromEntries(TEAMS.map((id) => [id, id === userTeam ? "manual" : "auto"])),
  manualPicker: ({ board }) => board.find((p) => p.id === held.id) || board[0]
});
const userPicks = manual.draft.picks.filter((pk) => pk.teamId === userTeam);
check(userPicks.length === 1 && userPicks[0].playerId === held.id, "manual pick was overridden (wanted " + held.id + " " + held.name + ")");

const first = D.recommend({ board: PLAYERS, roster: [], teamId: order[0], pickIndex: 0, leagueRosters: Object.fromEntries(TEAMS.map((id) => [id, []])) });
const autoOpen = D.runSnakeDraft({ seed: 1, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order, maxPicks: 1 });
check(autoOpen.draft.picks[0].playerId === first.id, "autopick/assist diverged from recommend");

const idemBase = { draftPick: 0, board: PLAYERS.slice(0, 30).map((p) => p.id), rosters: Object.fromEntries(TEAMS.map((id) => [id, []])), picks: [] };
const idem1 = D.commitPick(idemBase, { teamId: TEAMS[0], playerId: PLAYERS[0].id, expectedTeamId: TEAMS[0], totalPicks: 1696, lookup: (id) => byId[id] });
const idem2 = D.commitPick(idem1.draft, { teamId: TEAMS[0], playerId: PLAYERS[0].id, expectedTeamId: TEAMS[0], totalPicks: 1696, lookup: (id) => byId[id] });
check(idem1.ok && idem2.ok && idem2.reason === "idempotent" && idem2.draft.rosters[TEAMS[0]].length === 1, "repeat pick was not idempotent");
const refused = D.commitPick(idemBase, { teamId: TEAMS[0], playerId: PLAYERS[3].id, expectedTeamId: TEAMS[0], totalPicks: 1696, requiredPlayerId: PLAYERS[0].id, lookup: (id) => byId[id] });
check(!refused.ok && refused.reason === "keeper" && refused.draft.draftPick === 0 && refused.draft.board.length === idemBase.board.length, "keeper mismatch mutated the draft");

const full = D.runSnakeDraft({ seed: 11, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order, maxPicks: 64 });
const snap = JSON.parse(JSON.stringify(full.draft));
let resumed = snap;
const resumeLookup = (id) => byId[id];
while (resumed.draftPick < 96) {
  const tid = D.snakeTeamId(resumed.draftPick, order);
  const roster = (resumed.rosters[tid] || []).map(resumeLookup).filter(Boolean);
  const board = resumed.board.map(resumeLookup).filter(Boolean);
  const league = {};
  TEAMS.forEach((id) => { league[id] = (resumed.rosters[id] || []).map(resumeLookup).filter(Boolean); });
  const rec = D.recommend({ board: board, roster: roster, teamId: tid, pickIndex: resumed.draftPick, leagueRosters: league });
  const res = D.commitPick(resumed, { teamId: tid, playerId: rec.id, expectedTeamId: tid, totalPicks: 1696, lookup: resumeLookup });
  if (!res.ok) { failures.push("resume commit failed " + res.reason); break; }
  resumed = res.draft;
}
const straight = D.runSnakeDraft({ seed: 11, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order, maxPicks: 96 });
check(JSON.stringify(resumed.picks) === JSON.stringify(straight.draft.picks), "save/load resume diverged from a straight sim");

const tiny = D.runSnakeDraft({ seed: 4, teamIds: TEAMS, players: PLAYERS.slice(0, 80), rounds: 53 });
check(tiny.stopped === "empty", "exhausted pool did not stop (" + tiny.stopped + ")");
check(tiny.draft.picks.length === 80, "exhausted pool invented picks: " + tiny.draft.picks.length);
check(tiny.draft.picks.every((pk) => String(pk.playerId).indexOf("gen_") !== 0), "exhausted pool added fictional ids");
check(Math.min(...TEAMS.map((id) => tiny.draft.rosters[id].length)) < 53, "exhausted pool still filled every roster");

// Fantasy import. OGFFL and Dynasty Domination stay apart.
function onlyIn(a, b) { const bs = new Set(b); return a.filter((id) => !bs.has(id) && byId[id]); }
const og = LEAGUES.ogffl.ids.filter((id) => byId[id]);
const dd = LEAGUES.dd.ids.filter((id) => byId[id]);
const ogOnly = onlyIn(og, dd);
const ddOnly = onlyIn(dd, og);
check(og.length >= 20 && dd.length >= 15, "fantasy import fixtures missing players");
check(LEAGUES.ogffl.league !== LEAGUES.dd.league, "league labels collided");
const imported = D.runSnakeDraft({
  seed: 21, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order,
  userTeamId: userTeam, importIds: og
});
const userRoster = new Set(imported.draft.rosters[userTeam]);
check(og.every((id) => userRoster.has(id)), "OGFFL import did not land entirely on the user club");
check(ddOnly.every((id) => !userRoster.has(id) || og.indexOf(id) >= 0), "Dynasty Domination-only player landed on an OGFFL import");
const elsewhere = TEAMS.filter((id) => id !== userTeam).some((id) => (imported.draft.rosters[id] || []).some((pid) => og.indexOf(pid) >= 0));
check(!elsewhere, "an imported OGFFL player was drafted by a CPU club");
const impMetrics = metrics(imported);
check(Math.min(...impMetrics.sizes) === 53, "import draft shortened a club");
noDupes(impMetrics.all, "import draft");
Object.keys(D.STARTER_NEED).forEach((pos) => {
  if ((supply[pos] || 0) >= 32 * D.STARTER_NEED[pos]) {
    check(impMetrics.summary[pos].underStarter === 0, "import draft short starters at " + pos);
  }
});

// Seasonal draft: real 2027 class only, then a 2030 fictional class. No redraft.
function runCollege(year, players, priorRosters, priorPeople) {
  const slotOrder = TEAMS.slice();
  const orderC = [];
  for (let r = 1; r <= 7; r++) slotOrder.forEach((orig, k) => orderC.push({ overall: orderC.length + 1, round: r, pick: k + 1, originalTeamId: orig, ownerTeamId: orig }));
  let cd = { year: year, order: orderC, idx: 0, board: players.map((p) => p.id), picks: [], rosters: {} };
  TEAMS.forEach((id) => { cd.rosters[id] = (priorRosters[id] || []).slice(); });
  const lookup = (id) => byId[id];
  let guard = 0;
  while (cd.idx < cd.order.length && cd.board.length && guard++ < 300) {
    const slot = cd.order[cd.idx];
    const roster = (cd.rosters[slot.ownerTeamId] || []).map(lookup).filter(Boolean);
    const board = cd.board.map(lookup).filter(Boolean);
    const rec = D.recommendProspect({ board: board, roster: roster, teamId: slot.ownerTeamId, round: slot.round });
    if (!rec) break;
    const res = D.commitCollegePick(cd, { playerId: rec.id, expectedTeamId: slot.ownerTeamId, lookup: lookup, ownedPlayers: priorPeople });
    if (!res.ok) { cd.board = res.draft.board; if (res.reason !== "owned") break; continue; }
    cd = res.draft;
    priorPeople.push(lookup(rec.id));
  }
  const trimmed = {};
  TEAMS.forEach((id) => {
    const playersOn = (cd.rosters[id] || []).map(lookup).filter(Boolean);
    trimmed[id] = D.trimRoster(playersOn, 53);
  });
  return { cd: cd, trimmed: trimmed, unfilled: cd.order.length - cd.picks.length };
}

const base = seedReports.length ? D.runSnakeDraft({ seed: 1, teamIds: TEAMS, players: PLAYERS, rounds: 53, order: order }) : null;
const priorRosters = {};
const priorPeople = [];
TEAMS.forEach((id) => {
  priorRosters[id] = base.draft.rosters[id].slice();
  priorRosters[id].forEach((pid) => priorPeople.push(byId[pid]));
});
const class2027 = draftableReal(2027);
const seasonal = runCollege(2027, class2027, priorRosters, priorPeople.slice());
check(seasonal.cd.picks.length === Math.min(224, class2027.length), "2027 draft pick count " + seasonal.cd.picks.length + " class " + class2027.length);
check(seasonal.unfilled === 224 - class2027.length, "2027 exhaustion not reported (" + seasonal.unfilled + " unfilled, class " + class2027.length + ")");
check(seasonal.cd.picks.every((pk) => class2027.some((p) => p.id === pk.playerId)), "2027 draft used someone outside the real class");
check(seasonal.cd.picks.every((pk) => !byId[pk.playerId].fictional && !byId[pk.playerId].generated), "2027 draft included a fictional prospect");
const drafted2027 = seasonal.cd.picks.map((pk) => byId[pk.playerId]);
noDupes(drafted2027.concat(priorPeople), "2027 draft vs existing league");
TEAMS.forEach((id) => {
  check(seasonal.trimmed[id].keep.length <= 53, id + " roster above 53 after the college draft");
  const c = posCounts(seasonal.trimmed[id].keep);
  ["QB", "K", "P"].forEach((pos) => {
    if ((supply[pos] || 0) >= 32) check((c[pos] || 0) >= 1, "college trim removed the last " + pos + " from " + id);
  });
});

// Needs: a team with no center should prefer a 68 center over a luxury receiver.
const holeRoster = [{ id: "wr1", pos: "WR", ovr: 90, age: 26 }, { id: "wr2", pos: "WR", ovr: 88, age: 25 }, { id: "wr3", pos: "WR", ovr: 84, age: 24 }, { id: "wr4", pos: "WR", ovr: 80, age: 23 }, { id: "wr5", pos: "WR", ovr: 78, age: 23 }];
const center = { id: "c68", pos: "C", ovr: 68, age: 22 };
const luxury = { id: "wr99", pos: "WR", ovr: 92, age: 24 };
const counts = D.countPositions(holeRoster);
check(D.scorePlayer(center, { counts: counts, round: 4, roster: holeRoster }) > D.scorePlayer(luxury, { counts: counts, round: 4, roster: holeRoster }), "round 4 did not let a 68 center start over a surplus receiver");

const power = { offScheme: "Power Run", defScheme: "Wide-9 Pressure", offKeys: { RB: 1.2, OG: 1.2, OT: 1.0, TE: 1.0 }, defKeys: { DE: 1.4, DT: 1.0, LB: 0.8 } };
const air = { offScheme: "Air Raid", defScheme: "Man Press", offKeys: { QB: 1.3, WR: 1.3, OT: 0.8 }, defKeys: { CB: 1.4, S: 1.0, DE: 0.8 } };
const guard = { id: "og", pos: "OG", ovr: 80, age: 26, weight: 310 };
check(D.scorePlayer(guard, { counts: { OG: 1 }, round: 8, scheme: power, roster: [] }) > D.scorePlayer(guard, { counts: { OG: 1 }, round: 8, scheme: air, roster: [] }), "Power Run did not tilt toward a guard");
const rbHeavy = { id: "rbA", pos: "RB", ovr: 86, age: 24, weight: 230 };
const rbChange = { id: "rbB", pos: "RB", ovr: 84, age: 23, weight: 200 };
const rbClone = { id: "rbC", pos: "RB", ovr: 84, age: 23, weight: 228 };
const haveRb = [{ id: "rb1", pos: "RB", ovr: 90, age: 25, weight: 232 }];
check(D.scoreProspect(rbChange, haveRb, 3, power) > D.scoreProspect(rbClone, haveRb, 3, power), "complementary back did not outrank a clone");
void rbHeavy;

// 2030 fictional seasonal draft, globally unique and labeled.
genA.forEach((p) => { byId[p.id] = p; });
const emptyRosters = {};
TEAMS.forEach((id) => { emptyRosters[id] = []; });
const future = runCollege(2030, genA, priorRosters, priorPeople.slice());
check(future.cd.picks.length === 224, "2030 fictional draft did not finish 7 rounds (" + future.cd.picks.length + ")");
check(future.cd.picks.every((pk) => byId[pk.playerId] && byId[pk.playerId].fictional && byId[pk.playerId].bio == null), "2030 pick was not a labeled fictional prospect");
noDupes(future.cd.picks.map((pk) => byId[pk.playerId]).concat(priorPeople), "2030 draft duplicated a person");
check(future.unfilled === 0, "2030 class ran out early");

const report = {
  supply: supply,
  realClassYears: realYears,
  class2027: class2027.length,
  class2028: draftableReal(2028).length,
  duplicateListingsDropped: ["col_2027_kelly_jones", "col_2027_oj_frederique_jr"],
  vetAsRookie: vetAsRookie.map((p) => p.name),
  seeds: seedReports,
  import: { og: og.length, dd: dd.length, ogOnly: ogOnly.length, ddOnly: ddOnly.length, userSize: imported.draft.rosters[userTeam].length },
  college2027: { picks: seasonal.cd.picks.length, unfilled: seasonal.unfilled, class: class2027.length },
  generated2030: { count: genA.length, positions: genPos, ovr: [Math.min(...genA.map((p) => p.ovr)), Math.max(...genA.map((p) => p.ovr))] },
  exhausted: { picks: tiny.draft.picks.length, pool: 80, minRoster: Math.min(...TEAMS.map((id) => tiny.draft.rosters[id].length)), maxRoster: Math.max(...TEAMS.map((id) => tiny.draft.rosters[id].length)) },
  failures: failures
};
fs.writeFileSync(root + "tests/draft-regression-results.json", JSON.stringify(report, null, 2));
if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS");
console.log(JSON.stringify({
  seeds: seedReports.map((s) => ({ seed: s.seed, sizes: s.sizes, picks: s.picks, left: s.left, under: Object.keys(s.summary).filter((p) => s.summary[p].underStarter || s.summary[p].underDepth).map((p) => p + " starterShort " + s.summary[p].underStarter + " depthShort " + s.summary[p].underDepth + " min " + s.summary[p].min) })),
  college2027: report.college2027,
  generated2030: report.generated2030,
  exhausted: report.exhausted,
  import: report.import
}, null, 2));
