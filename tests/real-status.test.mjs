/* Verified availability opt-in. No network.
 * node tests/real-status.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/real-status.js", "utf8"), sandbox);
const RS = sandbox.AFARealStatus;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const player = { id: "nfl_1", sleeperId: "1", ovr: 88, onIR: true, currentInjury: { out: true, note: "AFA week 3" } };
const avail = {
  fetchedAt: "2026-11-07T00:38:44.924Z",
  source: "https://api.sleeper.app/v1/players/nfl",
  bySleeperId: { "1": { injury: "Out", team: "NE" }, "2": { injury: "Questionable" }, "3": { injury: null } }
};

const old = { version: "0.1.23" };
RS.migrate(old);
check(old.realWorldStatus.enabled === false && old.realWorldStatus.scope == null, "old save turned the overlay on");

const refused = RS.confirmExisting(old, [player], avail, [], false, "2026-11-07T01:00:00Z");
check(refused.applied === false && refused.reason === "not confirmed", "unconfirmed save was overwritten");
check(player.ovr === 88 && player.currentInjury.note === "AFA week 3" && player.onIR === true, "refusal touched the AFA timeline");

const applied = RS.confirmExisting(old, [player], avail, [], true, "2026-11-07T01:00:00Z");
check(applied.applied === true && applied.talentUntouched && applied.timelineUntouched, "confirmed apply rewrote talent or the injury object");
check(player.ovr === 88 && player.currentInjury.note === "AFA week 3", "player record changed after confirm");
check(old.realWorldStatus.scope === "existing-save" && old.realWorldStatus.holds.nfl_1.unavailable, "Out did not become a hold");
check(old.realWorldStatus.holds.nfl_1.baseOvr === 88 && old.realWorldStatus.form.delta == null, "form or base rating was invented");
check(RS.blocks(old.realWorldStatus, player) && !RS.blocks(RS.blank(), player), "hold did not follow the on/off switch");

check(!RS.fromInjury("Questionable").unavailable && !RS.fromInjury("Doubtful").unavailable && !RS.fromInjury(null).unavailable, "soft or blank status became unavailable");
check(RS.fromInjury("IR").unavailable && RS.fromInjury("PUP").unavailable && RS.fromInjury("Suspended").unavailable, "confirmed statuses were ignored");

const news = JSON.parse(fs.readFileSync(root + "data/news-cache.json", "utf8"));
check(news.items.length > 0 && news.items.every((item) => RS.evidenceFromNews(item).apply === false), "current headlines were treated as status evidence");
check(RS.evidenceFromNews({ flag: "rumor", playerId: "nfl_9", title: "He is ruled out" }).reason === "rumor", "rumor applied");
check(RS.evidenceFromNews({ flag: "verified", title: "Ruled out", playerId: null }).reason === "no status evidence", "headline without a player id applied");

const named = { id: "nfl_9", sleeperId: "9", ovr: 77 };
const fromHeadline = RS.buildOverlay([named], { fetchedAt: "t", bySleeperId: { "9": { injury: null } } }, [
  { flag: "verified", playerId: "nfl_9", title: "Club says he is ruled out" }
]);
check(fromHeadline.holds.nfl_9 && fromHeadline.holds.nfl_9.evidence === "verified-headline" && named.ovr === 77, "verified headline with an id did not stay off the rating");

const fresh = {};
const off = RS.enableNew(fresh, [player], avail, [], false);
check(off.applied === false && fresh.realWorldStatus.enabled === false, "new franchise opt-in defaulted on");
const on = RS.enableNew(fresh, [player], avail, [], true, "2026-11-07T01:00:00Z");
check(on.applied === true && on.talentUntouched && fresh.realWorldStatus.scope === "new-franchise", "new franchise opt-in missed");

const kept = RS.retainImportIds(["a", "a", "missing", "b"], (id) => {
  if (id === "a") return { id: "a", ovr: 90, injury: "Out" };
  if (id === "b") return { id: "b", ovr: 70, injury: "IR" };
  return null;
});
check(kept.ids.join(",") === "a,b" && kept.droppedForInjury === 0 && kept.droppedDuplicate === 1 && kept.droppedMissing === 1, "import dropped an injured player or kept a duplicate");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS holds " + Object.keys(old.realWorldStatus.holds).length + " news " + news.items.length);
