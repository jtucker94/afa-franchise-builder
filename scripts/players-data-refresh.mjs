#!/usr/bin/env node
/* Public snapshot for the Players directory and Scouting leagues.
 * Writes compact JSON only. Does not change GMFB overalls or franchise saves.
 * News headlines are a cache. A failed news read must not block a good
 * Sleeper snapshot, and it must not replace the last good headline list.
 *
 * node scripts/players-data-refresh.mjs --write
 * Without --write, prints a status object and does not touch files.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const SLEEPER = "https://api.sleeper.app/v1";
const USER_AGENT = "AFA-Franchise-Builder/0.1.24 (daily public snapshot; +https://github.com/jtucker94/afa-franchise-builder)";

const FEEDS = [
  {
    league: "NFL",
    division: "NFL",
    rssSource: "ESPN public NFL RSS",
    apiSource: "ESPN public NFL site API",
    rss: "https://www.espn.com/espn/rss/nfl/news",
    api: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=25"
  },
  {
    league: "NCAAF",
    division: "FBS-leaning national",
    rssSource: "ESPN public college football RSS",
    apiSource: "ESPN public college football site API",
    rss: "https://www.espn.com/espn/rss/ncf/news",
    api: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?limit=25"
  }
];

function preview(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function classify(title, summary) {
  const text = (title || "") + " " + (summary || "");
  const rumor = /\b(rumou?rs?|reportedly|sources say|hearing that|could |might |expected to)\b/i.test(text);
  const official = /\b(official|announced|on ir|injured reserve|suspended|ruled out|signed with|released|waived|traded to)\b/i.test(text);
  return rumor ? "rumor" : (official ? "verified" : "unknown");
}

function tagValue(block, name) {
  const match = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function parseRss(xml, feed) {
  const items = [];
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  blocks.slice(0, 25).forEach((block) => {
    const title = tagValue(block, "title");
    if (!title) return;
    const summary = tagValue(block, "description");
    const link = tagValue(block, "link") || null;
    items.push({
      id: (link || title).toLowerCase(),
      league: feed.league,
      division: feed.division,
      source: feed.rssSource || feed.source,
      sourceUrl: link,
      title,
      summary: summary.slice(0, 280),
      publishedAt: tagValue(block, "pubDate") || null,
      flag: classify(title, summary)
    });
  });
  return items;
}

function articleUrl(article) {
  const links = article && article.links;
  if (!links) return null;
  if (typeof links.href === "string" && links.href.startsWith("https://")) return links.href;
  if (links.web && typeof links.web.href === "string" && links.web.href.startsWith("https://")) return links.web.href;
  return null;
}

function parseSiteNews(body, feed) {
  let data;
  try { data = JSON.parse(body); } catch (err) { return []; }
  const articles = data && Array.isArray(data.articles) ? data.articles : [];
  const items = [];
  articles.slice(0, 25).forEach((article) => {
    const title = article && article.headline;
    if (!title) return;
    const summary = article.description || "";
    const link = articleUrl(article);
    items.push({
      id: (link || String(article.id || title)).toLowerCase(),
      league: feed.league,
      division: feed.division,
      source: feed.apiSource,
      sourceUrl: link,
      title,
      summary: String(summary).slice(0, 280),
      publishedAt: article.published || null,
      flag: classify(title, summary)
    });
  });
  return items;
}

function responseNote(response, parsedCount) {
  return {
    url: response.url,
    httpStatus: response.status,
    contentType: response.contentType,
    bodyBytes: response.bytes,
    bodyStart: preview(response.body),
    parsed: parsedCount
  };
}

function emptyFeedError(feedName, response) {
  const note = responseNote(response, 0);
  return {
    league: feedName,
    error: "parsed 0 items",
    ...note
  };
}

async function getResponse(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8"
    }
  });
  const body = await res.text();
  return {
    url,
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    bytes: Buffer.byteLength(body),
    body
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return null; }
}

function mergeNewsCache(previous, attempt) {
  if (attempt.items.length > 0) {
    return {
      cache: {
        fetchedAt: attempt.fetchedAt,
        sourceNote: attempt.sourceNote,
        stale: false,
        items: attempt.items,
        errors: attempt.errors
      },
      stale: false,
      kept: 0
    };
  }
  const prevItems = previous && Array.isArray(previous.items) ? previous.items : [];
  return {
    cache: {
      fetchedAt: previous && previous.fetchedAt || null,
      sourceNote: previous && previous.sourceNote || attempt.sourceNote,
      stale: true,
      lastAttemptAt: attempt.fetchedAt,
      lastAttemptErrors: attempt.errors,
      items: prevItems,
      errors: attempt.errors
    },
    stale: true,
    kept: prevItems.length
  };
}

function coreReady(status) {
  const leagues = status.pieces && status.pieces.leagues;
  const availability = status.pieces && status.pieces.availability;
  return !!(leagues && leagues.ogffl && leagues.dd && availability && availability.matched > 0 && !availability.error);
}

function exitCode(status) {
  return coreReady(status) ? 0 : 1;
}

function loadPoolIds() {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/players-nfl.js"), "utf8"), sandbox);
  const ids = new Set();
  (sandbox.AFA_NFL_PLAYERS || []).forEach((p) => { if (p && p.sleeperId) ids.add(String(p.sleeperId)); });
  return { count: (sandbox.AFA_NFL_PLAYERS || []).length, sleeperIds: ids };
}

async function getJson(url) {
  const res = await getResponse(url);
  if (!res.ok) throw new Error(url + " HTTP " + res.status);
  return JSON.parse(res.body);
}

async function leagueBundle(key, leagueId, rosterId) {
  const [league, rosters, users] = await Promise.all([
    getJson(SLEEPER + "/league/" + leagueId),
    getJson(SLEEPER + "/league/" + leagueId + "/rosters"),
    getJson(SLEEPER + "/league/" + leagueId + "/users")
  ]);
  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) throw new Error(key + " roster " + rosterId + " missing");
  const user = users.find((u) => u.user_id === roster.owner_id) || {};
  const name = (user.metadata && (user.metadata.team_name || user.metadata.teamName)) || user.display_name || null;
  return {
    key,
    league: league.name,
    leagueId: String(league.league_id),
    season: league.season,
    status: league.status,
    rosterId,
    owner: user.display_name || null,
    ownerId: roster.owner_id,
    teamName: name,
    settingsType: league.settings ? league.settings.type : null,
    taxiSlots: league.settings ? league.settings.taxi_slots : null,
    reserveSlots: league.settings ? league.settings.reserve_slots : null,
    numTeams: league.settings ? league.settings.num_teams : league.total_rosters,
    waiverType: league.settings ? league.settings.waiver_type : null,
    tradeDeadline: league.settings ? league.settings.trade_deadline : null,
    rosterPositions: league.roster_positions || [],
    scoring: league.scoring_settings || {},
    playerIds: (roster.players || []).map((id) => /^\d+$/.test(String(id)) ? "nfl_" + id : String(id)),
    starters: (roster.starters || []).map((id) => /^\d+$/.test(String(id)) ? "nfl_" + id : String(id)),
    note: "settings.type is stored as Sleeper returned it. This file does not translate that integer into redraft or dynasty."
  };
}

async function readFeed(feed) {
  const attempts = [];
  let items = [];
  let source = null;
  let feedUrl = feed.rss;
  try {
    const rss = await getResponse(feed.rss);
    const parsed = rss.ok ? parseRss(rss.body, feed) : [];
    attempts.push(responseNote(rss, parsed.length));
    if (!rss.ok) attempts[attempts.length - 1].error = "HTTP " + rss.status;
    if (parsed.length) {
      items = parsed;
      source = feed.rssSource;
      feedUrl = feed.rss;
    }
  } catch (err) {
    attempts.push({ url: feed.rss, error: String(err.message || err), parsed: 0 });
  }
  if (!items.length) {
    try {
      const api = await getResponse(feed.api);
      const parsed = api.ok ? parseSiteNews(api.body, feed) : [];
      const note = responseNote(api, parsed.length);
      if (!api.ok) note.error = "HTTP " + api.status;
      attempts.push(note);
      if (parsed.length) {
        items = parsed;
        source = feed.apiSource;
        feedUrl = feed.api;
      }
    } catch (err) {
      attempts.push({ url: feed.api, error: String(err.message || err), parsed: 0 });
    }
  }
  return { items, source, feedUrl, attempts, ok: items.length > 0 };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const status = { fetchedAt, ok: false, coreOk: false, pieces: {}, errors: [] };
  const pool = loadPoolIds();
  status.pieces.pool = { count: pool.count, withSleeperId: pool.sleeperIds.size };

  let state = null;
  try {
    state = await getJson(SLEEPER + "/state/nfl");
    status.pieces.state = { ok: true, season: state.season, week: state.week, season_type: state.season_type };
  } catch (err) {
    status.errors.push(String(err.message || err));
    status.pieces.state = { ok: false, error: String(err.message || err) };
  }

  const leagues = {};
  try {
    leagues.ogffl = await leagueBundle("ogffl", "1312302487876677632", 1);
    leagues.dd = await leagueBundle("dd", "1355552579894923264", 7);
    status.pieces.leagues = {
      ok: true,
      ogffl: { players: leagues.ogffl.playerIds.length, starters: leagues.ogffl.starters.length, owner: leagues.ogffl.owner },
      dd: { players: leagues.dd.playerIds.length, starters: leagues.dd.starters.length, owner: leagues.dd.owner }
    };
  } catch (err) {
    status.errors.push(String(err.message || err));
    status.pieces.leagues = { ok: false, error: String(err.message || err) };
  }

  const attempt = {
    fetchedAt,
    sourceNote: "ESPN public feeds. Not every player. College coverage is national and FBS-leaning. Headlines do not change GMFB overalls.",
    items: [],
    errors: []
  };
  for (const feed of FEEDS) {
    const result = await readFeed(feed);
    status.pieces[feed.league] = {
      ok: result.ok,
      headlines: result.items.length,
      source: result.source,
      attempts: result.attempts
    };
    if (!result.ok) {
      const failure = {
        league: feed.league,
        error: "parsed 0 items",
        attempts: result.attempts
      };
      attempt.errors.push(failure);
      status.errors.push(feed.league + " parsed 0 items");
    } else {
      result.items.forEach((item) => {
        attempt.items.push(Object.assign({ retrievedAt: fetchedAt, feedUrl: result.feedUrl }, item));
      });
    }
  }

  const previous = readJson(path.join(root, "data/news-cache.json"));
  const merged = mergeNewsCache(previous, attempt);
  status.pieces.news = {
    ok: !merged.stale,
    stale: merged.stale,
    fetchedAt: merged.cache.fetchedAt,
    freshHeadlines: attempt.items.length,
    kept: merged.kept
  };

  let availability = null;
  try {
    const all = await getJson(SLEEPER + "/players/nfl");
    const bySleeperId = {};
    let matched = 0;
    Object.keys(all).forEach((sid) => {
      if (!pool.sleeperIds.has(sid)) return;
      const p = all[sid] || {};
      matched++;
      bySleeperId[sid] = {
        team: p.team || null,
        injury: p.injury_status || null,
        position: p.position || null,
        status: p.status || null
      };
    });
    availability = {
      fetchedAt,
      source: SLEEPER + "/players/nfl",
      season: state && state.season,
      week: state && state.week,
      note: "Team and injury only. Does not change GMFB overalls. A null injury is not listed, not healthy.",
      matched,
      bySleeperId
    };
    status.pieces.availability = { ok: matched > 0, matched, poolWithSleeperId: pool.sleeperIds.size };
  } catch (err) {
    status.errors.push("availability " + String(err.message || err));
    status.pieces.availability = { ok: false, error: String(err.message || err) };
  }

  status.coreOk = coreReady(status);
  status.ok = status.coreOk && !merged.stale;
  const code = exitCode(status);
  if (!write) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    process.exit(code);
  }
  if (leagues.ogffl && leagues.dd) {
    fs.writeFileSync(path.join(root, "data/league-settings.json"), JSON.stringify({
      fetchedAt,
      source: SLEEPER,
      state: status.pieces.state && status.pieces.state.ok
        ? { season: status.pieces.state.season, week: status.pieces.state.week, season_type: status.pieces.state.season_type }
        : null,
      leagues
    }, null, 2) + "\n");
  }
  fs.writeFileSync(path.join(root, "data/news-cache.json"), JSON.stringify(merged.cache, null, 2) + "\n");
  if (availability) fs.writeFileSync(path.join(root, "data/nfl-availability.json"), JSON.stringify(availability) + "\n");
  fs.writeFileSync(path.join(root, "data/refresh-status.json"), JSON.stringify(status, null, 2) + "\n");
  process.stdout.write(JSON.stringify(status, null, 2) + "\n");
  process.exit(code);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack || err) + "\n");
    process.exit(1);
  });
}

export {
  parseRss,
  parseSiteNews,
  emptyFeedError,
  mergeNewsCache,
  coreReady,
  exitCode,
  preview,
  USER_AGENT
};
