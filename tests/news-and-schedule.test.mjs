/* Schedule and news-delta tests. No network.
 * node tests/news-and-schedule.test.mjs
 */
import fs from "fs";
import vm from "vm";
import { spawnSync } from "child_process";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { console, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/refresh-clock.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/news-feed.js", "utf8"), sandbox);
const Clock = sandbox.AFARefreshClock;
const News = sandbox.AFANews;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

function eastern(iso) {
  return Clock.parts(new Date(iso));
}

check(Clock.isDailyRefreshInstant(new Date("2026-01-15T10:00:00Z")), "5:00 AM EST (10:00 UTC) should be the daily refresh");
check(Clock.isDailyRefreshInstant(new Date("2026-07-15T09:00:00Z")), "5:00 AM EDT (09:00 UTC) should be the daily refresh");
check(!Clock.isDailyRefreshInstant(new Date("2026-01-15T05:00:00Z")), "05:00 UTC must not count as 5:00 AM Eastern");
check(!Clock.isDailyRefreshInstant(new Date("2026-07-15T10:00:00Z")), "10:00 UTC in July is 6:00 AM EDT, not the daily slot");
check(!Clock.isDailyRefreshInstant(new Date("2026-01-15T09:00:00Z")), "09:00 UTC in January is 4:00 AM EST, not the daily slot");
check(eastern("2026-01-17T13:00:00Z").weekday === "Sat", "Saturday sample was not Saturday in Eastern time");
check(eastern("2026-07-20T02:55:00Z").weekday === "Sun", "Sunday sample was not Sunday in Eastern time");
check(Clock.inNewsWindow(new Date("2026-01-17T13:00:00Z")), "Saturday 8:00 AM Eastern is inside the news window");
check(Clock.inNewsWindow(new Date("2026-07-20T02:55:00Z")), "Sunday 10:55 PM Eastern is inside the news window");
check(!Clock.inNewsWindow(new Date("2026-01-17T12:59:00Z")), "7:59 AM Eastern is before the news window");
check(!Clock.inNewsWindow(new Date("2026-07-20T03:00:00Z")), "11:00 PM Eastern is after the news window");
check(!Clock.inNewsWindow(new Date("2026-01-15T10:00:00Z")), "5:00 AM daily refresh is not a news check");

const yaml = fs.readFileSync(root + ".github/workflows/players-data-refresh.yml", "utf8");
check(yaml.includes('cron: "0 9 * * *"') && yaml.includes('cron: "0 10 * * *"'), "workflow is missing the EDT and EST UTC slots");
check(!/cron:\s*"0 5 /.test(yaml), "workflow must not schedule 05:00 UTC");
check(yaml.includes("* * *"), "workflow must run all seven days, including weekends");
check(/America\/New_York/.test(yaml), "workflow must name America/New_York");

function gate(iso) {
  const res = spawnSync("node", ["scripts/refresh-clock.mjs", "daily-gate"], {
    cwd: root,
    env: Object.assign({}, process.env, { REFRESH_NOW: iso }),
    encoding: "utf8"
  });
  check(res.status === 0, "gate failed for " + iso + " " + res.stderr);
  return res.stdout;
}
check(gate("2026-01-15T10:00:00Z").includes("run=true"), "January 10:00 UTC gate should run");
check(gate("2026-07-15T09:00:00Z").includes("run=true"), "July 09:00 UTC gate should run");
check(gate("2026-01-15T05:00:00Z").includes("run=false"), "05:00 UTC gate must not run");
check(gate("2026-11-07T14:00:00Z").includes("run=false"), "a Saturday afternoon Eastern gate must not run the daily job");

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>Team places Alex Smith on IR</title><link>https://example.com/ir</link><pubDate>Sat, 07 Nov 2026 12:00:00 GMT</pubDate><description>Official move.</description></item>
<item><title>Beat writer hearing that Alex Smith could return</title><link>https://example.com/rumor</link><pubDate>Sat, 07 Nov 2026 12:05:00 GMT</pubDate><description>Reportedly.</description></item>
<item><title>Alex Smith questionable for Sunday</title><link>https://example.com/q</link><pubDate>Sat, 07 Nov 2026 12:06:00 GMT</pubDate><description>Game-time decision.</description></item>
</channel></rss>`;
const parsed = News.parseRss(rss, News.FEEDS[0]);
check(parsed.length === 3, "RSS parse count " + parsed.length);
const first = News.ingest(parsed, News.blankCursor(), { retrievedAt: "2026-11-07T15:00:00Z", feedId: "espn-nfl-rss", league: "NFL", source: "ESPN public NFL RSS" });
check(first.added.length === 3 && first.duplicates === 0, "first ingest should add 3");
check(first.added[0].flag === "verified" && first.added[0].publishedAt && first.added[0].retrievedAt, "verified item needs both timestamps");
check(first.added[1].flag === "rumor", "rumor was classified as " + first.added[1].flag);
check(first.added[2].flag !== "verified" && first.added[2].availability === "listed-questionable" && first.added[2].flag !== "out", "questionable must not become out or verified");
const again = News.ingest(parsed, first.cursor, { retrievedAt: "2026-11-07T15:05:00Z" });
check(again.added.length === 0 && again.duplicates === 3, "cursor did not suppress the same URLs");
const withPlayer = News.ingest([{ title: "Team places Alex Smith on IR", url: "https://example.com/ir", player: "Alex Smith", event: "Team places Alex Smith on IR", publishedAt: "2026-11-07T12:00:00Z" }], News.blankCursor(), { retrievedAt: "2026-11-07T15:00:00Z" });
const sameEventNewUrl = News.ingest([{ title: "Team places Alex Smith on IR", url: "https://example.com/ir-copy", player: "Alex Smith", event: "Team places Alex Smith on IR" }], withPlayer.cursor, { retrievedAt: "2026-11-07T15:05:00Z" });
check(withPlayer.added.length === 1 && sameEventNewUrl.added.length === 0, "same player event with a new URL was not deduped");

const player = { id: "nfl_1", ovr: 80, name: "Alex Smith" };
const talent = News.refuseTalentWrite(player);
check(talent.applied === false && player.ovr === 80, "headline path changed overall");

const outside = News.tick({ now: new Date("2026-01-15T10:00:00Z"), fetchFeed: function () { throw new Error("should not fetch"); } });
check(outside.skipped && outside.reason === "outside-news-window", "5 AM tick fetched news");
let fetches = 0;
const inside = News.tick({
  now: new Date("2026-01-17T13:00:00Z"),
  cursor: News.blankCursor(),
  fetchFeed: function (feed) {
    fetches++;
    if (feed.league === "NCAAF") return { ok: false, error: "HTTP 503" };
    return { ok: true, items: [{ title: "Local note", url: "https://example.com/local", publishedAt: "2026-11-07T13:00:00Z" }] };
  }
});
check(fetches === 2, "Saturday window should ask both feeds, got " + fetches);
check(inside.added.length === 1 && inside.outages.length === 1 && inside.outages[0].league === "NCAAF", "NCAAF outage was not recorded separately from the NFL item");
check(inside.cursor.lastError && inside.cursor.lastError.message === "HTTP 503", "outage cursor missing");
check(/not every player/i.test(News.coverage().notGuaranteed), "coverage copy claims a complete feed");
check(/FCS/.test(News.coverage().ncaaf) && News.coverage().divisionsNotClaimed.indexOf("NCAA Division II") >= 0, "NCAA coverage overclaims divisions");
check(/5:00 AM America\/New_York/.test(News.coverage().dailySeparated), "news copy must keep the daily job separate");
check(News.CURSOR_KEY !== "afa-gm-franchise-builder-v029", "news cursor uses the franchise save key");

const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "franchise save key changed");

const fresh = News.freshness({ snapshotAt: "2026-11-07T00:38:44Z", lastError: "CORS or network" });
check(fresh.guaranteedFiveMinute === false, "freshness claims a five-minute guarantee");
check(/Snapshot 2026-11-07T00:38:44Z/.test(fresh.banner) && /not a freshness guarantee/.test(fresh.banner), "banner hid the snapshot or overclaimed freshness");
check(News.backoffMs(0) === 300000 && News.backoffMs(1) === 600000 && News.backoffMs(8) === 30 * 60 * 1000, "backoff is not capped");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS");
