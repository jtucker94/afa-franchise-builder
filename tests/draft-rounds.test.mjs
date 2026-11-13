/* Every draft round is 32 picks. node tests/draft-rounds.test.mjs */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/draft-engine.js", "utf8"), sandbox);
const D = sandbox.AFADraft;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const PER = 32;
const FOUNDING = 53 * PER;
const COLLEGE = 7 * PER;

function expectSpot(overall, totalName) {
  const spot = D.pickSpot(overall, PER);
  const round = Math.ceil(overall / PER);
  const pick = ((overall - 1) % PER) + 1;
  check(spot.round === round && spot.pick === pick && spot.overall === overall, totalName + " pick " + overall + " became round " + spot.round + " pick " + spot.pick);
}

for (let overall = 1; overall <= FOUNDING; overall++) expectSpot(overall, "founding");
for (let overall = 1; overall <= COLLEGE; overall++) expectSpot(overall, "college");

check(D.pickSpot(1, PER).round === 1 && D.pickSpot(1, PER).pick === 1, "pick 1");
check(D.pickSpot(32, PER).round === 1 && D.pickSpot(32, PER).pick === 32, "pick 32");
check(D.pickSpot(33, PER).round === 2 && D.pickSpot(33, PER).pick === 1, "pick 33");
check(D.pickSpot(64, PER).round === 2 && D.pickSpot(64, PER).pick === 32, "pick 64");
check(D.pickSpot(65, PER).round === 3 && D.pickSpot(65, PER).pick === 1, "pick 65");
check(D.pickSpot(1665, PER).round === 53 && D.pickSpot(1665, PER).pick === 1, "first pick of round 53");
check(D.pickSpot(FOUNDING, PER).round === 53 && D.pickSpot(FOUNDING, PER).pick === 32, "last founding pick");
check(D.pickSpot(COLLEGE, PER).round === 7 && D.pickSpot(COLLEGE, PER).pick === 32, "last college pick");
check(D.pickSpotLabel(33, PER) === "Round 2, Pick 1 (33rd overall)", "label " + D.pickSpotLabel(33, PER));
check(D.pickSpotLabel(32, PER) === "Round 1, Pick 32 (32nd overall)", "label " + D.pickSpotLabel(32, PER));
check(D.pickSpotLabel(1665, PER) === "Round 53, Pick 1 (1665th overall)", "label " + D.pickSpotLabel(1665, PER));
check(D.pickSpotLabel(FOUNDING, PER) === "Round 53, Pick 32 (1696th overall)", "label " + D.pickSpotLabel(FOUNDING, PER));
check(D.ordinalWord(1) === "1st" && D.ordinalWord(2) === "2nd" && D.ordinalWord(3) === "3rd" && D.ordinalWord(11) === "11th" && D.ordinalWord(12) === "12th" && D.ordinalWord(13) === "13th", "ordinals");

const teams = [];
for (let i = 0; i < 32; i++) teams.push("t" + i);
const snakeEarly = D.snakeTeamId(0, teams);
const snakeRound2 = D.snakeTeamId(32, teams);
check(snakeEarly === "t0" && snakeRound2 === "t31", "snake still flips at the start of round 2");

function blankDraft(index) {
  const rosters = {};
  teams.forEach((id) => { rosters[id] = []; });
  return { draftPick: index, board: ["p" + index], rosters: rosters, picks: [] };
}
const late = D.commitPick(blankDraft(1664), { teamId: "t0", playerId: "p1664", totalPicks: FOUNDING, lookup: function (id) { return { id: id, name: id, pos: "QB" }; } });
check(late.ok && late.draft.picks[0].overall === 1665 && late.draft.picks[0].round === 53 && late.draft.picks[0].pickInRound === 1, "commit of the first pick in round 53");
const last = D.commitPick(blankDraft(1695), { teamId: "t0", playerId: "p1695", totalPicks: FOUNDING, lookup: function (id) { return { id: id, name: id, pos: "QB" }; } });
check(last.ok && last.draft.picks[0].overall === 1696 && last.draft.picks[0].round === 53 && last.draft.picks[0].pickInRound === 32, "commit of the last founding pick");

const oldPicks = [];
for (let i = 1; i <= 32; i++) oldPicks.push({ pick: i, teamId: "t0", playerId: "old" + i });
const ids = oldPicks.map((pk) => pk.playerId);
oldPicks.forEach((pk) => D.normalizePickRecord(pk, PER));
check(oldPicks.length === 32 && oldPicks.map((pk) => pk.playerId).join() === ids.join(), "old mid-draft picks were dropped");
check(oldPicks[0].round === 1 && oldPicks[0].pickInRound === 1 && oldPicks[0].overall === 1, "old pick 1");
check(oldPicks[31].round === 1 && oldPicks[31].pickInRound === 32 && oldPicks[31].overall === 32, "old pick 32");
const clock = D.pickSpot(32 + 1, PER);
check(clock.round === 2 && clock.pick === 1 && clock.overall === 33, "saved draft index 32 is the first pick of round 2");

const collegeOld = { overall: 33, pick: 1, round: 1, playerId: "c33" };
D.normalizePickRecord(collegeOld, PER);
check(collegeOld.playerId === "c33" && collegeOld.pick === 1 && collegeOld.round === 2 && collegeOld.pickInRound === 1 && collegeOld.overall === 33, "college slot was rewritten into an overall");

const appSrc = fs.readFileSync(root + "js/app.js", "utf8");
check(appSrc.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
console.log("PASS draft rounds founding " + FOUNDING + " college " + COLLEGE);
