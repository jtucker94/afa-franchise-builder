/* AFA culture design. node tests/team-cultures.test.mjs */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console, global: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/team-cultures.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/data.js", "utf8"), sandbox);
const C = sandbox.AFACultures;
const teams = sandbox.AFA.TEAMS;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

check(teams.length === 32, "team count");
check(Object.keys(C.CLUBS).length === 32, "culture count");
const tags = new Set();
const rituals = new Set();
teams.forEach((team) => {
  const club = C.culture(team.id);
  check(club, "missing culture " + team.id);
  if (!club) return;
  check(!tags.has(club.tagline), "duplicate tagline " + club.tagline);
  check(!rituals.has(club.ritual), "duplicate ritual " + club.ritual);
  tags.add(club.tagline);
  rituals.add(club.ritual);
  check(club.rivals.length > 0, team.id + " has no rival");
  club.rivals.forEach((id) => check(C.culture(id), team.id + " rival missing " + id));
});
const doc = fs.readFileSync(root + "docs/team-cultures.md", "utf8");
check(doc.includes("Charter Cup") && doc.includes("Anchor Week"), "league identity missing from the doc");
tags.forEach((tag) => check(doc.includes(tag), "doc missing " + tag));
check(C.cultureFit("diva", C.culture("wilm")).fit === "clash", "diva should clash with a frugal defense");
check(C.cultureFit("film junkie", C.culture("ral")).fit === "fit", "film junkie should fit analytics");
check(C.simulatedTrait("nfl_6794") && C.cultureFit(C.simulatedTrait("nfl_6794"), C.culture("prov")).simulated, "trait is simulated");
const evolved = C.evolve({ seasons: 0, patienceShift: 0 }, { w: 12 }, false);
check(evolved.patienceShift === 1 && evolved.simulated, "winning season nudges patience");
check(C.cpuBias(C.culture("hart")).urgency === 1, "aggressive trader shops harder");
check(C.faAppeal(C.culture("eug")) > C.faAppeal(C.culture("anc")), "welcoming market appeals more than a remote one");
check(C.approvalTarget(C.culture("syr")) === 70 && C.approvalTarget(C.culture("prov")) === 50, "owner targets");
const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS 32 cultures");
