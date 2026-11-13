/* Simulated franchise rules. node tests/franchise-mode.test.mjs */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/franchise-mode.js", "utf8"), sandbox);
const F = sandbox.AFAFranchise;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const schedule = [
  [{ home: "a", away: "b", played: true, hs: 24, as: 17 }],
  [{ home: "b", away: "a", played: true, hs: 10, as: 20 }]
];
check(F.headToHead(schedule, "a", "b") === 2, "head to head");
const records = { a: { w: 8, l: 8, t: 0, pf: 300, pa: 300 }, b: { w: 8, l: 8, t: 0, pf: 300, pa: 300 } };
check(F.compareClubs({ id: "a" }, { id: "b" }, { records: records, schedule: schedule }) < 0, "winner of the series ranks first");

check(F.simTarget({ week: 6, seasonDone: false }, "deadline").weeks === 5, "weeks to the deadline");
check(F.simTarget({ week: 11, seasonDone: false }, "deadline").weeks === 0, "deadline already passed");
check(F.simTarget({ week: 15, seasonDone: false, seasonWeeks: 18 }, "playoffs").weeks === 4, "weeks to the postseason");

const rows = F.statRows([{ id: "p1", name: "Sim Back", pos: "RB", rushYd: 80, rushTd: 1 }]);
check(rows[0].simulated && rows[0].td === 1 && rows[0].rushYd === 80, "box row");

const young = F.weeklyChange({ age: 22, pos: "WR", ovr: 75 }, { snaps: 40, grade: 80, week: 3 });
check(young.delta > 0 && young.simulated, "young player with a good week rises");
const old = F.weeklyChange({ age: 34, pos: "RB", ovr: 80 }, { snaps: 4, grade: 40, week: 3 });
check(old.delta < 0, "old back with no snaps dips");
const guy = { id: "x", age: 23, pos: "QB", ovr: 70 };
F.applyWeekly(guy, { snaps: 50, grade: 85, week: 1 });
check(guy.progression.length === 1 && guy.ovr >= 70, "history stored");

check(F.deadMoney({ signingBonus: 8000000, yearsRemaining: 3, capHit: 10000000 }) > 0, "dead money");
check(F.room(200, [{ contract: { capHit: 80 } }], 30) === 90, "cap room includes dead money");

const shop = F.cpuOffer({ id: "hart", week: 9, wins: 8, needs: ["CB"], capRoom: 12000000 });
check(shop && shop.urgency >= 3 && shop.simulated, "contender shops harder near the deadline");
check(F.cpuOffer({ id: "far", week: 12, wins: 8, needs: ["CB"], capRoom: 12000000, offseason: false }) == null, "no shopping after the deadline");
const winner = F.faChoice({ id: "fa" }, [
  { teamId: "a", money: 5000000, capRoom: 9000000, contender: false, role: "backup" },
  { teamId: "b", money: 5000000, capRoom: 9000000, contender: true, role: "starter" }
]);
check(winner && winner.teamId === "b", "player picks the contender role");
check(F.faChoice({ id: "fa" }, [{ teamId: "c", money: 9000000, capRoom: 1000000, contender: true, role: "starter" }]) == null, "over-cap bid is ignored");

const news = F.headline({ kind: "trade", text: "Anchors deal for a corner.", week: 8 });
check(news.tag === "Simulated AFA" && news.simulated, "headline is marked simulated");
const low = F.approvalStep({ score: 22 }, "loss");
check(low.score === 19 && low.firing && low.warning, "owner can reach a firing warning");
const pick = F.gradePick({ ovr: 86, pos: "OT" }, "OT");
check(pick.grade === "A" && pick.fit, "need lifts the draft grade");

const oldSave = {};
F.defaults(oldSave);
check(oldSave.approval.score === 60 && Array.isArray(oldSave.leagueNews) && oldSave.deadCap, "old save defaults");

const snap = F.nextSnap({ down: 4, toGo: 2, yard: 40, quarter: 4, scoreOff: 17, scoreDef: 17 }, "go", 90, 70);
check(snap.simulated && snap.yard > 40, "text snap moves the ball");
check(F.traitNudge("diva").chemistry < 0 && F.schemeFit("outside zone", "outside zone").fit === "fit", "traits and scheme fit");
check(F.campWinner({ id: "a", ovr: 80, camp: 2 }, { id: "b", ovr: 80, camp: 0 }).id === "a", "camp winner");
check(F.waiverOrder([{ id: "z", wins: 9 }, { id: "a", wins: 2 }])[0].id === "a", "worse record claims first");
check(F.combineShift({ forty: 90, jump: 80 }).shift > 0 && F.combineShift({ forty: 90 }).note.indexOf("Simulated") >= 0, "combine is simulated");
check(F.awardBallot([{ id: "a", mvp: 10 }, { id: "b", mvp: 12 }], "mvp").winner.id === "b", "award ballot");
const ach = {};
check(F.achievementUnlock(ach, "first-win").fresh && !F.achievementUnlock(ach, "first-win").fresh, "achievement once");
check(F.rivalryBump({}, "prov", "hart", true).intensity === 2, "playoff rivalry");
const blob = F.exportLeague({ week: 3 });
check(F.importLeague(blob).week === 3, "league file round trip");
var threw = false;
try { F.importLeague("{}"); } catch (e) { threw = true; }
check(threw, "bad league file rejected");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS franchise rules");
