/* Real-NFL directory and league-scouting helpers. No DOM.
 * NFL team, stats, and photos stay separate from any AFA save assignment.
 */
(function (root) {
  "use strict";

  var STATS = {
    QB: [["completions", "Completions"], ["attempts", "Attempts"], ["passing_yards", "Pass yds"], ["passing_tds", "Pass TD"], ["passing_interceptions", "INT"], ["carries", "Carries"], ["rushing_yards", "Rush yds"]],
    RB: [["carries", "Carries"], ["rushing_yards", "Rush yds"], ["rushing_tds", "Rush TD"], ["targets", "Targets"], ["receptions", "Receptions"], ["receiving_yards", "Rec yds"], ["receiving_tds", "Rec TD"]],
    WR: [["targets", "Targets"], ["receptions", "Receptions"], ["receiving_yards", "Rec yds"], ["receiving_tds", "Rec TD"]],
    TE: [["targets", "Targets"], ["receptions", "Receptions"], ["receiving_yards", "Rec yds"], ["receiving_tds", "Rec TD"]],
    K: [["fg_made", "FG made"], ["fg_att", "FG att"], ["pat_made", "PAT made"], ["pat_att", "PAT att"]],
    P: [["pt_att", "Punts"], ["pt_yards", "Punt yds"]],
    DE: [["def_sacks", "Sacks"], ["def_tackles_solo", "Solo tkl"], ["def_qb_hits", "QB hits"], ["def_tackles_for_loss", "TFL"]],
    DT: [["def_sacks", "Sacks"], ["def_tackles_solo", "Solo tkl"], ["def_qb_hits", "QB hits"], ["def_tackles_for_loss", "TFL"]],
    LB: [["def_tackles_solo", "Solo tkl"], ["def_tackle_assists", "Ast"], ["def_sacks", "Sacks"], ["def_tackles_for_loss", "TFL"]],
    CB: [["def_interceptions", "INT"], ["def_pass_defended", "PD"], ["def_tackles_solo", "Solo tkl"]],
    S: [["def_interceptions", "INT"], ["def_pass_defended", "PD"], ["def_tackles_solo", "Solo tkl"]]
  };

  function cell(value, applicable) {
    if (applicable === false) return { kind: "na", text: "n/a" };
    if (value == null || value === "") return { kind: "missing", text: "Not on record" };
    if (typeof value === "number" && !isFinite(value)) return { kind: "missing", text: "Not on record" };
    return { kind: "value", text: String(value) };
  }

  function sleeperRow(map, player) {
    if (!map || !player) return null;
    return map[player.id] || null;
  }

  function liveRow(avail, player) {
    if (!avail || !player || !player.sleeperId) return null;
    var bag = avail.bySleeperId || avail;
    return bag[String(player.sleeperId)] || null;
  }

  function nflTeam(player, sleeper, avail) {
    var live = liveRow(avail, player);
    var raw = (live && live.team) || (sleeper && sleeper.team) || (player && player.nflTeam) || "";
    var source = live && live.team ? "sleeper-live" : (sleeper && sleeper.team ? "sleeper-snapshot" : (player && player.nflTeam ? "espn-pool" : "none"));
    if (!raw || raw === "FA" || raw === "None" || raw === "null") {
      return { abbr: "FA", label: "Free agent", source: source === "none" ? "none" : source };
    }
    return { abbr: String(raw), label: String(raw), source: source };
  }

  function availability(player, sleeper, avail) {
    var live = liveRow(avail, player);
    var inj = (live && (live.injury || live.injury_status)) || (sleeper && sleeper.inj) || null;
    if (inj == null || inj === "") {
      return { text: "Not listed", kind: "unknown", listedHealthy: false };
    }
    return { text: String(inj), kind: "listed", listedHealthy: false };
  }

  function headshot(player) {
    if (player && player.sleeperId) {
      return { url: "https://sleepercdn.com/content/nfl/players/" + player.sleeperId + ".jpg", source: "Sleeper CDN" };
    }
    if (player && player.espnId) {
      return { url: "https://a.espncdn.com/i/headshots/nfl/players/full/" + player.espnId + ".png", source: "ESPN headshot" };
    }
    return { url: null, source: null };
  }

  function teamLogo(abbr) {
    if (!abbr || abbr === "FA") return null;
    return "https://a.espncdn.com/i/teamlogos/nfl/500/" + String(abbr).toLowerCase() + ".png";
  }

  function directoryRows(players, sleeperMap, avail) {
    var seen = {};
    var out = [];
    (players || []).forEach(function (p) {
      if (!p || !p.id || seen[p.id]) return;
      seen[p.id] = true;
      var sl = sleeperRow(sleeperMap, p);
      var team = nflTeam(p, sl, avail);
      var availRow = availability(p, sl, avail);
      out.push({
        id: p.id,
        name: p.name || "Unknown",
        pos: p.pos || "",
        age: p.age == null ? null : p.age,
        ovr: p.ovr == null ? null : p.ovr,
        nfl: team.abbr,
        nflLabel: team.label,
        nflSource: team.source,
        status: availRow.text,
        statusKind: availRow.kind,
        college: p.college || "",
        sleeperId: p.sleeperId || null,
        search: (p.name + " " + (p.pos || "") + " " + team.abbr + " " + (p.college || "")).toLowerCase()
      });
    });
    return out;
  }

  function filterSort(rows, query) {
    query = query || {};
    var text = String(query.text || "").trim().toLowerCase();
    var pos = query.pos || "";
    var team = query.team || "";
    var sort = query.sort || "name";
    var list = (rows || []).filter(function (r) {
      if (text && r.search.indexOf(text) < 0) return false;
      if (pos && r.pos !== pos) return false;
      if (team && r.nfl !== team) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (sort === "ovr") return (b.ovr || -1) - (a.ovr || -1) || a.name.localeCompare(b.name);
      if (sort === "pos") return String(a.pos).localeCompare(String(b.pos)) || a.name.localeCompare(b.name);
      if (sort === "team") return String(a.nfl).localeCompare(String(b.nfl)) || a.name.localeCompare(b.name);
      if (sort === "status") return String(a.status).localeCompare(String(b.status)) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function pageSlice(rows, page, size) {
    var sizeN = size || 40;
    var total = (rows || []).length;
    var pages = Math.max(1, Math.ceil(total / sizeN));
    var p = Math.max(0, Math.min(page || 0, pages - 1));
    return { page: p, pages: pages, total: total, size: sizeN, rows: (rows || []).slice(p * sizeN, p * sizeN + sizeN) };
  }

  function seasonLine(statsPack, id) {
    var rows = statsPack && statsPack[id];
    if (!rows || !rows.length) return null;
    return rows[0];
  }

  function statSheet(player, line) {
    var spec = STATS[player && player.pos] || [];
    if (!spec.length) {
      return { applicable: false, cells: [], note: "No stat template for this position. Missing is not zero." };
    }
    if (!line) {
      return {
        applicable: true,
        season: null,
        cells: spec.map(function (pair) { return { key: pair[0], label: pair[1], cell: cell(null, true) }; }),
        note: "No season line on file. Blank is not a zero."
      };
    }
    return {
      applicable: true,
      season: line.season || null,
      cells: spec.map(function (pair) {
        var present = Object.prototype.hasOwnProperty.call(line, pair[0]);
        return { key: pair[0], label: pair[1], cell: cell(present ? line[pair[0]] : null, true) };
      }),
      note: "Zeros are real zeros. Stats this position does not use are omitted, not shown as zero."
    };
  }

  function leagueSlice(league, byId) {
    var mine = [];
    var missing = [];
    ((league && league.ids) || (league && league.playerIds) || []).forEach(function (id) {
      var p = byId && byId[id];
      if (!p) missing.push(id);
      else mine.push(p);
    });
    return { mine: mine, missing: missing, skipped: (league && league.skipped) || [] };
  }

  function slotCounts(rosterPositions) {
    var counts = {};
    (rosterPositions || []).forEach(function (pos) {
      if (pos === "BN" || pos === "IR" || pos === "TAXI") return;
      counts[pos] = (counts[pos] || 0) + 1;
    });
    return counts;
  }

  function haveCounts(players) {
    var counts = {};
    (players || []).forEach(function (p) { if (p && p.pos) counts[p.pos] = (counts[p.pos] || 0) + 1; });
    return counts;
  }

  root.AFAWorkspaceData = {
    STATS: STATS,
    cell: cell,
    nflTeam: nflTeam,
    availability: availability,
    headshot: headshot,
    teamLogo: teamLogo,
    directoryRows: directoryRows,
    filterSort: filterSort,
    pageSlice: pageSlice,
    seasonLine: seasonLine,
    statSheet: statSheet,
    leagueSlice: leagueSlice,
    slotCounts: slotCounts,
    haveCounts: haveCounts
  };
})(typeof window !== "undefined" ? window : globalThis);
