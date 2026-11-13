/* Directory and league-separation checks. No network.
 * node tests/workspace.test.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { console, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/workspace-data.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/players-nfl.js", "utf8"), sandbox);
const D = sandbox.AFAWorkspaceData;
const players = sandbox.AFA_NFL_PLAYERS;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const rows = D.directoryRows(players, {}, null);
check(rows.length === players.length, "row count " + rows.length + " vs pool " + players.length);
const ids = {};
rows.forEach((r) => { ids[r.id] = (ids[r.id] || 0) + 1; });
check(Object.values(ids).every((n) => n === 1), "duplicate directory ids");
const positions = new Set(rows.map((r) => r.pos));
["QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S", "K", "P"].forEach((pos) => {
  check(positions.has(pos), "missing position " + pos);
});
check(rows.every((r) => r.nfl && r.nflLabel && !/Anchors|Whalers|Thoroughbreds/.test(r.nflLabel)), "an AFA nickname was used as the NFL team");
const page = D.pageSlice(rows, 0, 40);
check(page.rows.length === 40 && page.pages === Math.ceil(rows.length / 40), "pagination size");
const last = D.pageSlice(rows, 9999, 40);
check(last.page === page.pages - 1 && last.rows.length === rows.length % 40, "last page");

const qb = players.find((p) => p.pos === "QB");
const sheetMissing = D.statSheet(qb, null);
check(sheetMissing.cells.every((c) => c.cell.kind === "missing"), "missing season rendered as zero");
const zero = D.statSheet(qb, { season: 2025, passing_yards: 0, completions: 12 });
const yards = zero.cells.find((c) => c.key === "passing_yards");
const ints = zero.cells.find((c) => c.key === "passing_interceptions");
check(yards.cell.kind === "value" && yards.cell.text === "0", "a stored zero was hidden");
check(ints.cell.kind === "missing", "absent key was shown as zero");
const kicker = D.statSheet({ pos: "K" }, { season: 2025, passing_yards: 0, fg_made: 3 });
check(!kicker.cells.some((c) => c.key === "passing_yards"), "kicker was given passing yards");

const shot = D.headshot({ id: "x", name: "No Ids" });
check(shot.url == null, "invented a photo url");
const logo = D.teamLogo("FA");
check(logo == null, "invented a free-agent logo");
check(D.availability({ sleeperId: "1" }, { inj: null }, null).text === "Not listed", "null injury became healthy");
check(D.availability({ sleeperId: "1" }, { inj: "OUT" }, null, { stale: true }).text === "unknown", "stale snapshot still showed a current status");
const staleDir = D.directoryRows([{ id: "a", name: "A Player", pos: "QB" }], { a: { inj: "Questionable" } }, null, true);
check(staleDir.length === 1 && staleDir[0].status === "unknown" && staleDir[0].statusKind === "unknown", "stale directory still listed a health status");
const freshClock = D.dataAsOf({ fetchedAt: "2026-11-13T12:00:00.000Z" }, new Date("2026-11-13T18:00:00.000Z"));
check(freshClock.stale === false && /Data as of /.test(freshClock.label) && /E[DS]T/.test(freshClock.label) && freshClock.notice === "", "fresh snapshot was marked old");
const oldClock = D.dataAsOf({ fetchedAt: "2026-11-07T00:38:44.924Z" }, new Date("2026-11-13T12:00:00.000Z"));
check(oldClock.stale === true && oldClock.notice === "Real-NFL data may be out of date" && /E[DS]T/.test(oldClock.label), "week-old snapshot looked current");
const edgeClock = D.dataAsOf({ fetchedAt: "2026-11-12T00:00:00.000Z" }, new Date("2026-11-13T12:00:00.000Z"));
check(edgeClock.stale === false, "a snapshot exactly 36 hours old was treated as stale");
const missingClock = D.dataAsOf(null, new Date("2026-11-13T12:00:00.000Z"));
check(missingClock.stale === true && missingClock.label === "Data as of unknown", "missing status invented a time");
const badClock = D.dataAsOf({ fetchedAt: "not-a-date" }, new Date("2026-11-13T12:00:00.000Z"));
check(badClock.stale === true && badClock.label === "Data as of unknown", "unreadable time was treated as current");

const settings = JSON.parse(fs.readFileSync(root + "data/league-settings.json", "utf8"));
const byId = {};
players.forEach((p) => { byId[p.id] = p; });
const og = D.leagueSlice(settings.leagues.ogffl, byId);
const dd = D.leagueSlice(settings.leagues.dd, byId);
check(settings.leagues.ogffl.owner === "jtuck94" && settings.leagues.ogffl.rosterId === 1, "OGFFL owner/roster mismatch");
check(settings.leagues.dd.owner === "jtuck94" && settings.leagues.dd.rosterId === 7, "Dynasty roster mismatch");
check(settings.leagues.ogffl.teamName !== settings.leagues.dd.teamName, "league team names collapsed");
const ogIds = new Set(settings.leagues.ogffl.playerIds);
const ddOnly = settings.leagues.dd.playerIds.filter((id) => !ogIds.has(id));
check(ddOnly.length > 0, "expected some Dynasty-only players");
check(og.mine.length >= 20 && dd.mine.length >= 15, "league rosters did not match the pool: og " + og.mine.length + " dd " + dd.mine.length);
check(og.mine.every((p) => ogIds.has(p.id)), "OGFFL slice leaked");
check(!dd.mine.some((p) => ddOnly.indexOf(p.id) >= 0 && ogIds.has(p.id)), "isolation check inverted");
const ddMineIds = new Set(dd.mine.map((p) => p.id));
check(ddOnly.every((id) => !ogIds.has(id)), "dd-only filter broken");
check([...ddMineIds].every((id) => settings.leagues.dd.playerIds.indexOf(id) >= 0), "DD slice left the DD list");

const avail = JSON.parse(fs.readFileSync(root + "data/nfl-availability.json", "utf8"));
check(avail.note && /does not change GMFB/i.test(avail.note), "availability overlay claims to edit ratings");
check(avail.matched === 2492, "availability matched " + avail.matched);
const sample = players.find((p) => p.sleeperId && avail.bySleeperId[String(p.sleeperId)]);
const team = D.nflTeam(sample, { team: "OLD" }, avail);
check(team.abbr === avail.bySleeperId[String(sample.sleeperId)].team && team.source === "sleeper-live", "live team did not override the snapshot");
const afaName = "Providence Anchors";
check(team.label !== afaName, "live team became an AFA club");

const news = JSON.parse(fs.readFileSync(root + "data/news-cache.json", "utf8"));
check(news.items.some((n) => n.league === "NFL") && news.items.some((n) => n.league === "NCAAF"), "news cache missing a league");
check(news.items.every((n) => n.retrievedAt && n.publishedAt && n.sourceUrl), "a headline is missing timestamps or a source url");
check(/FBS-leaning/.test(news.sourceNote), "college coverage note missing");

const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");
check(app.includes('id === "directory" || id === "scouting"'), "study screens would overwrite the saved phase");
check(app.includes("liveDataEffects"), "live-data control missing");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS rows " + rows.length + " og " + og.mine.length + " dd " + dd.mine.length + " news " + news.items.length);
