/* Real NFL and college marks for directory rows and headlines.
 * Current affiliation comes only from a structured team abbreviation.
 * A headline match is "mentioned", never treated as the player's current team.
 * Ambiguous words (Brown, New York, Washington, Los Angeles) are not teams.
 * Logos are ESPN CDN files for canonical ids. Missing ids get text, not a drawn mark.
 */
(function (root) {
  "use strict";
  var NFL = [
    { abbr: "ARI", espn: "ari", label: "Arizona Cardinals", nicks: ["cardinals"] },
    { abbr: "ATL", espn: "atl", label: "Atlanta Falcons", nicks: ["falcons"] },
    { abbr: "BAL", espn: "bal", label: "Baltimore Ravens", nicks: ["ravens"] },
    { abbr: "BUF", espn: "buf", label: "Buffalo Bills", nicks: ["bills"] },
    { abbr: "CAR", espn: "car", label: "Carolina Panthers", nicks: ["panthers"] },
    { abbr: "CHI", espn: "chi", label: "Chicago Bears", nicks: ["bears"] },
    { abbr: "CIN", espn: "cin", label: "Cincinnati Bengals", nicks: ["bengals"] },
    { abbr: "CLE", espn: "cle", label: "Cleveland Browns", nicks: ["browns"] },
    { abbr: "DAL", espn: "dal", label: "Dallas Cowboys", nicks: ["cowboys"] },
    { abbr: "DEN", espn: "den", label: "Denver Broncos", nicks: ["broncos"] },
    { abbr: "DET", espn: "det", label: "Detroit Lions", nicks: ["lions"] },
    { abbr: "GB", espn: "gb", label: "Green Bay Packers", nicks: ["packers"] },
    { abbr: "HOU", espn: "hou", label: "Houston Texans", nicks: ["texans"] },
    { abbr: "IND", espn: "ind", label: "Indianapolis Colts", nicks: ["colts"] },
    { abbr: "JAX", espn: "jax", label: "Jacksonville Jaguars", nicks: ["jaguars"] },
    { abbr: "KC", espn: "kc", label: "Kansas City Chiefs", nicks: ["chiefs"] },
    { abbr: "LV", espn: "lv", label: "Las Vegas Raiders", nicks: ["raiders"] },
    { abbr: "LAC", espn: "lac", label: "Los Angeles Chargers", nicks: ["chargers"] },
    { abbr: "LAR", espn: "lar", label: "Los Angeles Rams", nicks: ["rams"] },
    { abbr: "MIA", espn: "mia", label: "Miami Dolphins", nicks: ["dolphins"] },
    { abbr: "MIN", espn: "min", label: "Minnesota Vikings", nicks: ["vikings"] },
    { abbr: "NE", espn: "ne", label: "New England Patriots", nicks: ["patriots"] },
    { abbr: "NO", espn: "no", label: "New Orleans Saints", nicks: ["saints"] },
    { abbr: "NYG", espn: "nyg", label: "New York Giants", nicks: ["giants"] },
    { abbr: "NYJ", espn: "nyj", label: "New York Jets", nicks: ["jets"] },
    { abbr: "PHI", espn: "phi", label: "Philadelphia Eagles", nicks: ["eagles"] },
    { abbr: "PIT", espn: "pit", label: "Pittsburgh Steelers", nicks: ["steelers"] },
    { abbr: "SF", espn: "sf", label: "San Francisco 49ers", nicks: ["49ers", "niners"] },
    { abbr: "SEA", espn: "sea", label: "Seattle Seahawks", nicks: ["seahawks"] },
    { abbr: "TB", espn: "tb", label: "Tampa Bay Buccaneers", nicks: ["buccaneers", "bucs"] },
    { abbr: "TEN", espn: "ten", label: "Tennessee Titans", nicks: ["titans"] },
    { abbr: "WAS", espn: "wsh", label: "Washington Commanders", nicks: ["commanders"] }
  ];
  /* ESPN college ids used by a.espncdn.com/i/teamlogos/ncaa/500/{id}.png.
   * Only schools with a stable id are listed. Shared mascots are not keys. */
  var COLLEGE = [
    { id: 333, label: "Alabama", names: ["alabama"] },
    { id: 194, label: "Ohio State", names: ["ohio state"] },
    { id: 61, label: "Georgia", names: ["georgia"], unless: /georgia\s+tech/i },
    { id: 130, label: "Michigan", names: ["michigan"] },
    { id: 251, label: "Texas", names: ["texas"] },
    { id: 30, label: "USC", names: ["usc", "southern california"] },
    { id: 87, label: "Notre Dame", names: ["notre dame"] },
    { id: 228, label: "Clemson", names: ["clemson"] },
    { id: 99, label: "LSU", names: ["lsu"] },
    { id: 57, label: "Florida", names: ["florida"] },
    { id: 52, label: "Florida State", names: ["florida state"] },
    { id: 248, label: "Oregon", names: ["oregon"] },
    { id: 213, label: "Penn State", names: ["penn state"] },
    { id: 201, label: "Oklahoma", names: ["oklahoma"] },
    { id: 2, label: "Auburn", names: ["auburn"] },
    { id: 2633, label: "Tennessee", names: ["tennessee"] },
    { id: 245, label: "Texas A&M", names: ["texas a&m", "texas am"] },
    { id: 275, label: "Wisconsin", names: ["wisconsin"] },
    { id: 2294, label: "Iowa", names: ["iowa"] },
    { id: 158, label: "Nebraska", names: ["nebraska"] },
    { id: 2390, label: "Miami", names: ["miami"], unless: /miami\s+dolphins/i },
    { id: 127, label: "Michigan State", names: ["michigan state"] },
    { id: 26, label: "UCLA", names: ["ucla"] },
    { id: 264, label: "Washington", names: ["washington huskies"] }
  ];
  var NFL_BY_ABBR = {};
  NFL.forEach(function (t) { NFL_BY_ABBR[t.abbr] = t; });

  function spans(text, word) {
    var lower = String(text || "").toLowerCase();
    var needle = String(word || "").toLowerCase();
    var out = [];
    var from = 0;
    while (needle && from < lower.length) {
      var at = lower.indexOf(needle, from);
      if (at < 0) break;
      var beforeOk = at === 0 || !/[a-z0-9]/.test(lower.charAt(at - 1));
      var afterOk = at + needle.length >= lower.length || !/[a-z0-9]/.test(lower.charAt(at + needle.length));
      if (beforeOk && afterOk) out.push([at, at + needle.length]);
      from = at + needle.length;
    }
    return out;
  }

  function overlaps(a, b) {
    return a[0] < b[1] && b[0] < a[1];
  }

  function hasAbbr(text, abbr) {
    var re = new RegExp("(^|[^A-Za-z0-9])" + abbr + "([^A-Za-z0-9]|$)");
    return re.test(String(text || ""));
  }

  function nflMark(team, role) {
    return {
      league: "NFL",
      role: role,
      abbr: team.abbr,
      label: team.label,
      url: "https://a.espncdn.com/i/teamlogos/nfl/500/" + team.espn + ".png",
      source: "ESPN CDN team logo"
    };
  }

  function collegeMark(school, role) {
    return {
      league: "COLLEGE",
      role: role,
      abbr: String(school.id),
      label: school.label,
      url: "https://a.espncdn.com/i/teamlogos/ncaa/500/" + school.id + ".png",
      source: "ESPN CDN college logo"
    };
  }

  function currentNfl(abbr) {
    var key = String(abbr || "").toUpperCase();
    if (!NFL_BY_ABBR[key]) return null;
    return nflMark(NFL_BY_ABBR[key], "current");
  }

  function mentioned(text, limit) {
    var candidates = [];
    NFL.forEach(function (team) {
      var hit = [];
      team.nicks.forEach(function (n) { hit = hit.concat(spans(text, n)); });
      if (hasAbbr(text, team.abbr)) hit.push([0, 0]);
      if (!hit.length) return;
      candidates.push({ mark: nflMark(team, "mentioned"), spans: hit, len: team.label.length });
    });
    COLLEGE.forEach(function (school) {
      if (school.unless && school.unless.test(String(text || ""))) return;
      var hit = [];
      school.names.forEach(function (n) { hit = hit.concat(spans(text, n)); });
      if (!hit.length) return;
      candidates.push({ mark: collegeMark(school, "mentioned"), spans: hit, len: school.label.length });
    });
    candidates.sort(function (a, b) { return b.len - a.len; });
    var kept = [];
    var used = [];
    candidates.forEach(function (c) {
      var blocked = c.spans.some(function (span) {
        return used.some(function (prior) { return overlaps(span, prior); });
      });
      if (blocked) return;
      kept.push(c.mark);
      c.spans.forEach(function (span) { if (span[1] > span[0]) used.push(span); });
    });
    return kept.slice(0, limit || 2);
  }

  function storyTeams(text) {
    var body = String(text || "");
    var marks = mentioned(body, 4);
    var trade = /\b(trade|traded|trading|acquired|acquire|sends|blockbuster)\b/i.test(body);
    var transfer = /\b(transfer|portal|commits|committed|decommits)\b/i.test(body);
    var nfl = marks.filter(function (m) { return m.league === "NFL"; });
    var college = marks.filter(function (m) { return m.league === "COLLEGE"; });
    if (trade && nfl.length >= 2) return nfl.slice(0, 2);
    if (transfer && college.length >= 2) return college.slice(0, 2);
    if (transfer && college.length) return college.slice(0, 2);
    if (nfl.length) return nfl.slice(0, 2);
    return college.slice(0, 2);
  }

  function safeHref(url) {
    var raw = String(url || "").trim();
    if (!/^https:\/\//i.test(raw)) return null;
    try {
      var u = new URL(raw);
      if (u.protocol !== "https:") return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }

  function categoryOf(item) {
    var league = String((item && (item.league || item.division)) || "").toUpperCase();
    if (league.indexOf("NCAA") >= 0 || league.indexOf("COLLEGE") >= 0) return "COLLEGE";
    if (league === "NFL") return "NFL";
    return null;
  }

  function prepareHeadlines(items) {
    var seen = {};
    var out = [];
    (items || []).forEach(function (item) {
      if (!item || !item.title) return;
      var href = safeHref(item.sourceUrl || item.url || item.link);
      if (!href || seen[href]) return;
      var category = categoryOf(item);
      if (!category) return;
      seen[href] = true;
      var flag = item.flag === "verified" || item.flag === "rumor" ? item.flag : "unknown";
      out.push({
        id: href,
        category: category,
        title: String(item.title),
        href: href,
        publishedAt: item.publishedAt || null,
        retrievedAt: item.retrievedAt || null,
        source: item.source || null,
        flag: flag,
        teams: storyTeams(item.title + " " + (item.summary || ""))
      });
    });
    return out;
  }

  root.AFATeamLogos = {
    NFL: NFL,
    COLLEGE: COLLEGE,
    currentNfl: currentNfl,
    storyTeams: storyTeams,
    safeHref: safeHref,
    prepareHeadlines: prepareHeadlines
  };
})(typeof window !== "undefined" ? window : globalThis);
