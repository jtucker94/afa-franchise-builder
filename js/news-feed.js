/* League-wide NFL and NCAAF headline check.
 * Target cadence is every 5 minutes from 8:00 AM through 10:55 PM America/New_York,
 * all seven days, while this page is open. That is a check interval, not a promise
 * that every player story is published or retrieved within 5 minutes.
 * Headlines are never written onto base overalls or into the AFA franchise save.
 */
(function (root) {
  "use strict";
  var CLOCK = root.AFARefreshClock;
  var CURSOR_KEY = "afa-news-cursor-v1";
  var SEEN_CAP = 1500;

  var FEEDS = [
    {
      id: "espn-nfl-rss",
      league: "NFL",
      division: "NFL",
      url: "https://www.espn.com/espn/rss/nfl/news",
      source: "ESPN public NFL RSS",
      covers: "National NFL headlines only. Not every player, practice-squad note, or local beat."
    },
    {
      id: "espn-ncaaf-rss",
      league: "NCAAF",
      division: "FBS-leaning national",
      url: "https://www.espn.com/espn/rss/ncf/news",
      source: "ESPN public college football RSS",
      covers: "National college headlines, weighted to FBS. FCS, Division II, and Division III are not covered."
    }
  ];

  function fold(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function classify(item) {
    var text = [item && item.title, item && item.summary, item && item.status].filter(Boolean).join(" ");
    var rumor = /\b(rumou?rs?|reportedly|sources say|hearing that|could |might |expected to|speculation)\b/i.test(text);
    var official = /\b(official|announced|placed on ir|on ir|injured reserve|suspended|ruled out|activated from|signed with|released|waived|traded to|designated to return)\b/i.test(text);
    var questionable = /\b(questionable|doubtful|game[- ]time decision)\b/i.test(text);
    var flag = rumor ? "rumor" : (official ? "verified" : "unknown");
    return {
      flag: flag,
      availability: questionable && !/ruled out/i.test(text) ? "listed-questionable" : null,
      notHealthy: false,
      notOut: questionable && !/ruled out/i.test(text)
    };
  }

  function dedupeKeys(item) {
    var url = fold(item && (item.url || item.link || item.id));
    var player = fold(item && (item.playerId || item.player));
    var event = fold(item && (item.event || item.title));
    var keys = [];
    if (url) keys.push("url:" + url);
    if (player && event) keys.push("pe:" + player + "|" + event);
    if (!keys.length && event) keys.push("ev:" + event);
    return keys;
  }

  function dedupeKey(item) {
    var keys = dedupeKeys(item);
    return keys.length ? keys.join(" || ") : "";
  }

  function blankCursor() {
    return { lastRetrievedAt: null, lastSuccessAt: null, lastError: null, seen: [] };
  }

  function remember(cursor, key) {
    var seen = (cursor.seen || []).filter(function (k) { return k !== key; });
    seen.push(key);
    if (seen.length > SEEN_CAP) seen = seen.slice(seen.length - SEEN_CAP);
    cursor.seen = seen;
  }

  function ingest(rawItems, cursor, meta) {
    var state = cursor ? {
      lastRetrievedAt: cursor.lastRetrievedAt || null,
      lastSuccessAt: cursor.lastSuccessAt || null,
      lastError: cursor.lastError || null,
      seen: (cursor.seen || []).slice()
    } : blankCursor();
    var seen = {};
    state.seen.forEach(function (k) { seen[k] = true; });
    var added = [];
    var duplicates = 0;
    var retrievedAt = (meta && meta.retrievedAt) || new Date().toISOString();
    (rawItems || []).forEach(function (raw) {
      if (!raw) return;
      var keys = dedupeKeys(raw);
      if (!keys.length || keys.some(function (k) { return seen[k]; })) { duplicates++; return; }
      var publishedAt = raw.publishedAt || raw.pubDate || null;
      var judged = classify(raw);
      keys.forEach(function (k) { seen[k] = true; remember(state, k); });
      var key = keys.join(" || ");
      added.push({
        id: key,
        league: raw.league || (meta && meta.league) || null,
        division: raw.division || (meta && meta.division) || null,
        source: raw.source || (meta && meta.source) || null,
        sourceUrl: raw.url || raw.link || null,
        title: raw.title || "",
        summary: raw.summary || "",
        playerId: raw.playerId || null,
        player: raw.player || null,
        publishedAt: publishedAt,
        retrievedAt: retrievedAt,
        flag: judged.flag,
        availability: judged.availability,
        feedId: (meta && meta.feedId) || raw.feedId || null
      });
    });
    state.lastRetrievedAt = retrievedAt;
    if (!(meta && meta.failed)) state.lastSuccessAt = retrievedAt;
    if (meta && meta.error) state.lastError = { at: retrievedAt, message: String(meta.error), feedId: meta.feedId || null };
    return { cursor: state, added: added, duplicates: duplicates };
  }

  function parseRss(xml, feed) {
    var text = String(xml || "");
    var items = [];
    var blocks = text.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    blocks.forEach(function (block) {
      function tag(name) {
        var m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
        if (!m) return "";
        return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
      }
      var title = tag("title");
      if (!title) return;
      items.push({
        title: title,
        summary: tag("description"),
        url: tag("link"),
        publishedAt: tag("pubDate") || null,
        league: feed && feed.league,
        division: feed && feed.division,
        source: feed && feed.source,
        feedId: feed && feed.id
      });
    });
    return items;
  }

  function coverage() {
    return {
      nfl: FEEDS[0].covers,
      ncaaf: FEEDS[1].covers,
      divisionsNotClaimed: ["FCS", "NCAA Division II", "NCAA Division III", "NAIA"],
      check: "About every 5 minutes from 8:00 AM through 10:55 PM America/New_York, seven days a week, only while this page is open.",
      notGuaranteed: "A check is not a publication deadline. Stories can appear later, be missing, or fail to load. This is not every player.",
      dailySeparated: "The full roster and stats snapshot is a different job at 5:00 AM America/New_York. News checks do not rebuild that dataset.",
      talent: "Headlines do not change base overalls and do not edit saved AFA seasons."
    };
  }

  function shouldCheck(date) {
    if (!CLOCK) return false;
    return CLOCK.inNewsWindow(date || new Date());
  }

  /* One check. fetchFeed(feed) returns { ok, xml|items, error }. No franchise state is read or written. */
  function tick(opts) {
    opts = opts || {};
    var now = (opts.now && typeof opts.now.getTime === "function" && !Number.isNaN(opts.now.getTime())) ? opts.now : new Date();
    var cursor = opts.cursor || blankCursor();
    if (!shouldCheck(now)) {
      return { skipped: true, reason: "outside-news-window", cursor: cursor, added: [], duplicates: 0, outages: [] };
    }
    var fetchFeed = opts.fetchFeed;
    if (typeof fetchFeed !== "function") {
      return { skipped: true, reason: "no-fetcher", cursor: cursor, added: [], duplicates: 0, outages: [] };
    }
    var added = [];
    var duplicates = 0;
    var outages = [];
    var next = cursor;
    FEEDS.forEach(function (feed) {
      var res;
      try { res = fetchFeed(feed); } catch (err) { res = { ok: false, error: err && err.message ? err.message : String(err) }; }
      if (!res || res.ok === false) {
        var ing = ingest([], next, { retrievedAt: now.toISOString(), failed: true, error: (res && res.error) || "feed unavailable", feedId: feed.id, league: feed.league, division: feed.division, source: feed.source });
        next = ing.cursor;
        outages.push({ feedId: feed.id, league: feed.league, division: feed.division, error: (res && res.error) || "feed unavailable" });
        return;
      }
      var raw = res.items || parseRss(res.xml || "", feed);
      var done = ingest(raw, next, { retrievedAt: now.toISOString(), feedId: feed.id, league: feed.league, division: feed.division, source: feed.source });
      next = done.cursor;
      added = added.concat(done.added);
      duplicates += done.duplicates;
    });
    return { skipped: false, cursor: next, added: added, duplicates: duplicates, outages: outages };
  }

  function refuseTalentWrite() {
    return { applied: false, reason: "News does not change base overalls or AFA save timelines." };
  }

  root.AFANews = {
    CURSOR_KEY: CURSOR_KEY,
    FEEDS: FEEDS,
    classify: classify,
    dedupeKey: dedupeKey,
    ingest: ingest,
    parseRss: parseRss,
    coverage: coverage,
    shouldCheck: shouldCheck,
    tick: tick,
    blankCursor: blankCursor,
    refuseTalentWrite: refuseTalentWrite
  };
})(typeof window !== "undefined" ? window : globalThis);
