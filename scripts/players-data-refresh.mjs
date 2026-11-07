#!/usr/bin/env node
/* Public snapshot for the Players directory and Scouting leagues.
 * Writes compact JSON only. Does not change GMFB overalls or franchise saves.
 * News headlines are stored as a cache, not applied to ratings.
 *
 * node scripts/players-data-refresh.mjs --write
 * Without --write, prints a status object and does not touch files.
 */
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const write = process.argv.includes("--write");
const SLEEPER = "https://api.sleeper.app/v1";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " HTTP " + res.status);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " HTTP " + res.status);
  return res.text();
}

function parseRss(xml, feed) {
  const items = [];
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  blocks.slice(0, 25).forEach((block) => {
    const tag = (name) => {
      const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
      if (!m) return "";
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
    };
    const title = tag("title");
    if (!title) return;
    const text = title + " " + tag("description");
    const rumor = /\b(rumou?rs?|reportedly|sources say|hearing that|could |might |expected to)\b/i.test(text);
    const official = /\b(official|announced|on ir|injured reserve|suspended|ruled out|signed with|released|waived|traded to)\b/i.test(text);
    const link = tag("link") || null;
    items.push({
      id: (link || title).toLowerCase(),
      league: feed.league,
      division: feed.division,
      source: feed.source,
      sourceUrl: link,
      title,
      summary: tag("description").slice(0, 280),
      publishedAt: tag("pubDate") || null,
      flag: rumor ? "rumor" : (official ? "verified" : "unknown")
    });
  });
  return items;
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

async function main() {
  const fetchedAt = new Date().toISOString();
  const status = { fetchedAt, ok: false, pieces: {}, errors: [] };
  const pool = loadPoolIds();
  status.pieces.pool = { count: pool.count, withSleeperId: pool.sleeperIds.size };

  let state = null;
  try {
    state = await getJson(SLEEPER + "/state/nfl");
    status.pieces.state = { season: state.season, week: state.week, season_type: state.season_type };
  } catch (err) {
    status.errors.push(String(err.message || err));
  }

  const leagues = {};
  try {
    leagues.ogffl = await leagueBundle("ogffl", "1312302487876677632", 1);
    leagues.dd = await leagueBundle("dd", "1355552579894923264", 7);
    status.pieces.leagues = {
      ogffl: { players: leagues.ogffl.playerIds.length, starters: leagues.ogffl.starters.length, owner: leagues.ogffl.owner },
      dd: { players: leagues.dd.playerIds.length, starters: leagues.dd.starters.length, owner: leagues.dd.owner }
    };
  } catch (err) {
    status.errors.push(String(err.message || err));
  }

  const news = { fetchedAt, sourceNote: "ESPN public RSS. Not every player. College feed is national and FBS-leaning.", items: [], errors: [] };
  for (const feed of [
    { league: "NFL", division: "NFL", source: "ESPN public NFL RSS", url: "https://www.espn.com/espn/rss/nfl/news" },
    { league: "NCAAF", division: "FBS-leaning national", source: "ESPN public college football RSS", url: "https://www.espn.com/espn/rss/ncf/news" }
  ]) {
    try {
      const xml = await getText(feed.url);
      const parsed = parseRss(xml, feed).map((item) => Object.assign({ retrievedAt: fetchedAt, feedUrl: feed.url }, item));
      news.items = news.items.concat(parsed);
      status.pieces[feed.league] = { headlines: parsed.length };
    } catch (err) {
      news.errors.push({ league: feed.league, error: String(err.message || err) });
      status.errors.push(feed.league + " " + String(err.message || err));
    }
  }

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
    status.pieces.availability = { matched, poolWithSleeperId: pool.sleeperIds.size };
  } catch (err) {
    status.errors.push("availability " + String(err.message || err));
    status.pieces.availability = { error: String(err.message || err) };
  }

  status.ok = !!(leagues.ogffl && leagues.dd && news.items.length);
  const payload = {
    status,
    settings: { fetchedAt, source: SLEEPER, state: status.pieces.state || null, leagues },
    news,
    availability
  };
  if (!write) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    process.exit(status.ok ? 0 : 1);
  }
  fs.writeFileSync(path.join(root, "data/refresh-status.json"), JSON.stringify(status, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "data/league-settings.json"), JSON.stringify(payload.settings, null, 2) + "\n");
  fs.writeFileSync(path.join(root, "data/news-cache.json"), JSON.stringify(payload.news, null, 2) + "\n");
  if (availability) fs.writeFileSync(path.join(root, "data/nfl-availability.json"), JSON.stringify(availability) + "\n");
  process.stdout.write(JSON.stringify(status, null, 2) + "\n");
  process.exit(status.ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + "\n");
  process.exit(1);
});
