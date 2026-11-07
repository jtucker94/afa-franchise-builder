/* Canonical team marks. No network. node tests/team-logos.test.mjs */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, URL: URL };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/team-logos.js", "utf8"), sandbox);
const L = sandbox.AFATeamLogos;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const kc = L.currentNfl("KC");
check(kc && kc.role === "current" && kc.url.indexOf("/nfl/500/kc.png") > 0, "Chiefs current logo missing");
check(L.currentNfl("WAS").url.indexOf("/wsh.png") > 0, "Washington should use the ESPN wsh slug");
check(L.currentNfl("WSH").abbr === "WAS", "WSH was not folded into the Commanders");
check(L.currentNfl("prov") == null && L.currentNfl("FA") == null, "AFA or free-agent abbr got a logo");

const brown = L.storyTeams("Brown is questionable for Sunday");
check(brown.length === 0, "surname Brown was treated as the Browns");
const ny = L.storyTeams("New York hosts a game");
check(ny.length === 0, "bare New York matched a team");
const la = L.storyTeams("Los Angeles announced a signing");
check(la.length === 0, "bare Los Angeles matched a team");
const wash = L.storyTeams("Washington announced a signing");
check(wash.length === 0, "bare Washington matched Commanders or Huskies");

const trade = L.storyTeams("Chiefs trade for a Cowboys defender");
check(trade.length === 2 && trade.every((t) => t.role === "mentioned" && t.league === "NFL"), "trade did not keep both mentioned teams");
check(trade.map((t) => t.abbr).sort().join(",") === "DAL,KC", "trade teams " + trade.map((t) => t.abbr).join(","));

const portal = L.storyTeams("Quarterback commits to Ohio State after leaving Texas");
check(portal.length === 2 && portal.every((t) => t.league === "COLLEGE" && t.role === "mentioned"), "transfer schools missing");
const tech = L.storyTeams("Georgia Tech beat a ranked opponent");
check(!tech.some((t) => t.label === "Georgia"), "Georgia Tech was marked as Georgia");
const dolphins = L.storyTeams("Miami Dolphins sign a tackle");
check(dolphins.some((t) => t.abbr === "MIA") && !dolphins.some((t) => t.league === "COLLEGE"), "Dolphins story also got the Miami college logo");

const prepared = L.prepareHeadlines([
  { title: "Chiefs trade for a Cowboys defender", sourceUrl: "https://www.espn.com/nfl/story/1", league: "NFL", publishedAt: "Fri, 6 Nov 2026", retrievedAt: "2026-11-07T00:00:00Z", flag: "rumor" },
  { title: "Same story again", sourceUrl: "https://www.espn.com/nfl/story/1", league: "NFL", flag: "verified" },
  { title: "javascript:alert(1)", sourceUrl: "javascript:alert(1)", league: "NFL" },
  { title: "No source", league: "NFL" },
  { title: "Campus note", sourceUrl: "https://www.espn.com/college-football/story/2", league: "NCAAF", flag: "unknown", publishedAt: "Sat, 7 Nov 2026", retrievedAt: "2026-11-07T00:00:00Z" }
]);
check(prepared.length === 2, "headline filter count " + prepared.length);
check(prepared[0].flag === "rumor" && prepared[0].category === "NFL", "rumor was relabeled");
check(prepared[1].category === "COLLEGE", "college category missing");
check(prepared[0].teams.length === 2, "prepared trade lost a logo");
check(L.safeHref("http://example.com") == null && L.safeHref("javascript:alert(1)") == null, "unsafe URL accepted");

const css = fs.readFileSync(root + "css/style.css", "utf8") + fs.readFileSync(root + "css/mobile.css", "utf8");
check(css.includes("prefers-reduced-motion") && css.includes("--rnt-bottom"), "ticker motion or mobile offset missing");
check(css.includes("screen-hub-active") && css.includes("--mobile-tab-h"), "ticker is not lifted above the phone tab bar");
check(!/aria-live/.test(fs.readFileSync(root + "js/news-ticker.js", "utf8")), "ticker announces continuously");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS logos");
