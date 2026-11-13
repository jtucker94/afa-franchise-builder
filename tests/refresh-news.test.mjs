/* News-refresh decisions. No network.
 * node tests/refresh-news.test.mjs
 */
import fs from "fs";
import {
  parseRss,
  parseSiteNews,
  emptyFeedError,
  mergeNewsCache,
  coreReady,
  exitCode
} from "../scripts/players-data-refresh.mjs";

const root = new URL("..", import.meta.url).pathname;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>Team places Alex Smith on IR</title><link>https://www.espn.com/nfl/story/1</link><pubDate>Sat, 07 Nov 2026 12:00:00 GMT</pubDate><description>Official move.</description></item>
</channel></rss>`;
const parsed = parseRss(rss, { league: "NFL", division: "NFL", rssSource: "ESPN public NFL RSS" });
check(parsed.length === 1 && parsed[0].flag === "verified" && parsed[0].sourceUrl.startsWith("https://"), "RSS item was dropped");

const html = "<html><title>Access denied</title><body>no feed</body></html>";
const empty = parseRss(html, { league: "NFL", division: "NFL", rssSource: "ESPN public NFL RSS" });
check(empty.length === 0, "HTML was treated as headlines");
const diag = emptyFeedError("NFL", {
  url: "https://www.espn.com/espn/rss/nfl/news",
  status: 200,
  contentType: "text/html",
  bytes: html.length,
  body: html
});
check(diag.error === "parsed 0 items" && diag.httpStatus === 200 && diag.contentType === "text/html" && diag.bodyBytes === html.length && /Access denied/.test(diag.bodyStart), "zero-item response was not recorded");

const api = JSON.stringify({
  articles: [{
    id: 99,
    headline: "Bucky Irving practiced",
    description: "Official update from the team.",
    published: "2026-11-09T10:00:00Z",
    links: { web: { href: "https://www.espn.com/nfl/story/_/id/99/bucky" } }
  }]
});
const fromApi = parseSiteNews(api, { league: "NFL", division: "NFL", apiSource: "ESPN public NFL site API" });
check(fromApi.length === 1 && fromApi[0].title === "Bucky Irving practiced" && fromApi[0].source === "ESPN public NFL site API" && fromApi[0].flag === "verified", "site API article was dropped");
check(parseSiteNews("not json", { league: "NFL", division: "NFL", apiSource: "x" }).length === 0, "bad JSON invented a headline");

const previous = {
  fetchedAt: "2026-11-07T00:38:44.924Z",
  sourceNote: "ESPN public RSS",
  items: [{ id: "keep", title: "Old real headline", sourceUrl: "https://www.espn.com/nfl/story/old" }]
};
const kept = mergeNewsCache(previous, { fetchedAt: "2026-11-09T10:44:26.959Z", sourceNote: "new", items: [], errors: [diag] });
check(kept.stale && kept.kept === 1 && kept.cache.items[0].title === "Old real headline", "empty fetch replaced the last good headlines");
check(kept.cache.fetchedAt === "2026-11-07T00:38:44.924Z" && kept.cache.lastAttemptAt === "2026-11-09T10:44:26.959Z", "stale cache lost its real fetch date");

const fresh = mergeNewsCache(previous, {
  fetchedAt: "2026-11-10T10:00:00Z",
  sourceNote: "ESPN public feeds",
  items: [{ id: "new", title: "New headline" }],
  errors: []
});
check(!fresh.stale && fresh.cache.items.length === 1 && fresh.cache.items[0].id === "new" && fresh.cache.fetchedAt === "2026-11-10T10:00:00Z", "a real fetch did not replace the cache");

const sleeperOk = {
  pieces: {
    leagues: { ok: true, ogffl: { players: 31 }, dd: { players: 21 } },
    availability: { ok: true, matched: 2492 }
  }
};
check(coreReady(sleeperOk) && exitCode(sleeperOk) === 0, "a news miss would still block the Sleeper publish");
const broken = { pieces: { leagues: { ok: false }, availability: { error: "down" } } };
check(!coreReady(broken) && exitCode(broken) === 1, "a failed Sleeper fetch would still publish");

const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.includes('const STORAGE = "afa-gm-franchise-builder-v029"'), "save key changed");
const refresh = fs.readFileSync(root + "scripts/players-data-refresh.mjs", "utf8");
check(refresh.includes("A null injury is not listed, not healthy."), "availability note changed");
check(refresh.includes("Does not change GMFB overalls"), "refresh is allowed to edit ratings");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((f) => console.error(" - " + f));
  process.exit(1);
}
console.log("PASS");
