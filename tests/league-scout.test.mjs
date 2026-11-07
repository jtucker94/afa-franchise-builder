/* League scouting math. No network.
 * node tests/league-scout.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/real-status.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/league-scout.js", "utf8"), sandbox);
const S = sandbox.AFALeagueScout;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const dynastyName = S.formatLabel(1, "Dynasty Domination");
check(dynastyName.label == null && dynastyName.settingsType === 1, "settings.type was renamed");
check(/do not define settings\.type/.test(dynastyName.note) && /not the format/.test(dynastyName.note), "league name was used as the format");
check(dynastyName.nameIgnored === "Dynasty Domination", "the ignored name was dropped");

const pts = S.recordedPoints(
  { season: 2025, passing_yards: 100, passing_tds: 2, passing_interceptions: 1 },
  { pass_yd: 0.04, pass_td: 6, pass_int: -2, rec_yd: 0.1 }
);
check(pts.projection === false && pts.season === 2025 && pts.total === 14, "recorded points " + pts.total);
check(pts.omitted.indexOf("rec_yd") >= 0, "missing stat was treated as zero");

const idp = S.recordedPoints(
  { season: 2025, def_tackles_solo: 10, def_sacks: 1 },
  { idp_tkl_solo: 1, idp_sack: 2 }
);
check(idp.total === 12, "IDP scoring " + idp.total);

const lineup = S.analyzeLineup(
  ["QB", "RB", "RB", "WR", "WR", "FLEX", "DL", "LB", "DB", "IDP_FLEX", "BN"],
  [
    { pos: "QB" }, { pos: "RB" }, { pos: "RB" }, { pos: "RB" },
    { pos: "WR" }, { pos: "DE" }, { pos: "LB" }, { pos: "CB" }, { pos: "S" }
  ]
);
const bySlot = {};
lineup.slots.forEach((row) => { bySlot[row.slot] = row; });
check(bySlot.QB.short === 0 && bySlot.WR.short === 1, "dedicated holes wrong");
check(bySlot.FLEX.filled === 1 && bySlot.FLEX.short === 0, "FLEX did not use the extra RB");
check(bySlot.IDP_FLEX.filled === 1 && bySlot.DB.short === 0, "IDP flex or DB count wrong");

const closed = S.leagueFreeAgents([{ id: "nfl_1" }, { id: "nfl_2" }], null);
check(closed.loaded === false && closed.players.length === 0, "missing league rosters were labeled free agents");
const open = S.leagueFreeAgents(
  [{ id: "nfl_1", sleeperId: "1" }, { id: "nfl_2", sleeperId: "2" }],
  S.occupiedFromRosters([{ players: ["1", "99"] }])
);
check(open.loaded && open.players.length === 1 && open.players[0].id === "nfl_2", "rostered player was called a league free agent");
check(/not the AFA/.test(open.reason), "league availability was mixed with the game pool");
check(S.projections().available === false && /Unavailable/.test(S.projections().label), "a projection was offered");

const settings = JSON.parse(fs.readFileSync(root + "data/league-settings.json", "utf8"));
["ogffl", "dd"].forEach((key) => {
  const lg = settings.leagues[key];
  const label = S.formatLabel(lg.settingsType, lg.league);
  check(label.label == null && label.settingsType === lg.settingsType, key + " format was inferred");
});

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS og type " + settings.leagues.ogffl.settingsType + " dd type " + settings.leagues.dd.settingsType);
