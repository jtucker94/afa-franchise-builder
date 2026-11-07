/* League scouting from stored settings, recorded stats, and public rosters.
 * No projections. League names are not formats.
 * Official Sleeper league docs (retrieved 2026-11-07) show settings as an
 * object and do not define settings.type 0/1/2. Those words are not applied.
 */
(function (root) {
  "use strict";

  var TYPE_DOC = {
    checked: "2026-11-07",
    url: "https://docs.sleeper.com/#get-a-specific-league",
    note: "Official docs list settings as an object and do not define settings.type. The integer is shown as returned. 0, 1, and 2 are not labeled redraft, keeper, or dynasty. The league name is not the format."
  };

  var GROUP = {
    QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K",
    DE: "DL", DT: "DL", LB: "LB", CB: "DB", S: "DB"
  };

  var STAT_MAP = {
    pass_yd: "passing_yards",
    pass_td: "passing_tds",
    pass_int: "passing_interceptions",
    rush_yd: "rushing_yards",
    rush_td: "rushing_tds",
    rec: "receptions",
    rec_yd: "receiving_yards",
    rec_td: "receiving_tds",
    idp_tkl_solo: "def_tackles_solo",
    idp_sack: "def_sacks",
    idp_int: "def_interceptions",
    sack: "def_sacks",
    ff: "def_fumbles_forced"
  };

  function groupOf(pos) { return GROUP[pos] || null; }

  function formatLabel(settingsType, leagueName) {
    return {
      settingsType: settingsType == null ? null : settingsType,
      label: null,
      nameIgnored: leagueName || null,
      source: TYPE_DOC.url,
      checked: TYPE_DOC.checked,
      note: TYPE_DOC.note
    };
  }

  function recordedPoints(line, scoring) {
    var parts = [];
    var omitted = [];
    var total = 0;
    var any = false;
    Object.keys(STAT_MAP).forEach(function (key) {
      if (!scoring || scoring[key] == null || Number(scoring[key]) === 0) return;
      var field = STAT_MAP[key];
      if (!line || !Object.prototype.hasOwnProperty.call(line, field)) {
        omitted.push(key);
        return;
      }
      var pts = Number(scoring[key]) * Number(line[field]);
      if (!isFinite(pts)) return;
      any = true;
      total += pts;
      parts.push({ key: key, stat: line[field], rate: scoring[key], points: Math.round(pts * 100) / 100 });
    });
    return {
      season: line && line.season || null,
      total: any ? Math.round(total * 100) / 100 : null,
      parts: parts,
      omitted: omitted,
      projection: false,
      note: any
        ? "Points from recorded season stats and this league's scoring settings. Not a projection."
        : "No mapped recorded stats for the non-zero scoring keys on file."
    };
  }

  function analyzeLineup(rosterPositions, players) {
    var need = {};
    (rosterPositions || []).forEach(function (pos) {
      if (pos === "BN" || pos === "IR" || pos === "TAXI") return;
      need[pos] = (need[pos] || 0) + 1;
    });
    var left = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DL: 0, LB: 0, DB: 0 };
    (players || []).forEach(function (p) {
      var g = groupOf(p && p.pos);
      if (g && left[g] != null) left[g] += 1;
    });
    var report = [];
    ["QB", "RB", "WR", "TE", "K", "DL", "LB", "DB"].forEach(function (slot) {
      var n = need[slot] || 0;
      if (!n) return;
      var used = Math.min(left[slot] || 0, n);
      left[slot] -= used;
      report.push({ slot: slot, slots: n, filled: used, short: n - used });
    });
    function fillFlex(slotName, keys) {
      var n = need[slotName] || 0;
      if (!n) return;
      var pool = 0;
      keys.forEach(function (k) { pool += left[k] || 0; });
      var used = Math.min(pool, n);
      var remain = used;
      keys.forEach(function (k) {
        var take = Math.min(left[k] || 0, remain);
        left[k] -= take;
        remain -= take;
      });
      report.push({ slot: slotName, slots: n, filled: used, short: n - used });
    }
    fillFlex("FLEX", ["RB", "WR", "TE"]);
    fillFlex("SUPER_FLEX", ["QB", "RB", "WR", "TE"]);
    fillFlex("IDP_FLEX", ["DL", "LB", "DB"]);
    if (need.DEF) {
      report.push({ slot: "DEF", slots: need.DEF, filled: null, short: null, note: "Team defense is not a player in this pool. Not counted as filled." });
    }
    Object.keys(need).forEach(function (slot) {
      if (["QB", "RB", "WR", "TE", "K", "DL", "LB", "DB", "FLEX", "SUPER_FLEX", "IDP_FLEX", "DEF"].indexOf(slot) >= 0) return;
      report.push({ slot: slot, slots: need[slot], filled: null, short: null, note: "No position map for this slot. It is not treated as filled." });
    });
    return { slots: report, depth: left };
  }

  function normId(id) {
    var s = String(id == null ? "" : id);
    if (/^\d+$/.test(s)) return "nfl_" + s;
    return s;
  }

  function occupiedFromRosters(rosters) {
    var ids = [];
    var seen = {};
    (rosters || []).forEach(function (row) {
      (row && row.players || []).forEach(function (id) {
        var key = normId(id);
        if (!key || seen[key]) return;
        seen[key] = true;
        ids.push(key);
      });
    });
    return ids;
  }

  function leagueFreeAgents(pool, occupiedIds) {
    if (!occupiedIds) {
      return {
        loaded: false,
        players: [],
        reason: "League rosters were not loaded. Players on other teams are not labeled free agents."
      };
    }
    var occ = {};
    occupiedIds.forEach(function (id) { occ[normId(id)] = true; });
    var players = (pool || []).filter(function (p) {
      if (!p || !p.id) return false;
      if (occ[normId(p.id)]) return false;
      if (p.sleeperId != null && occ[normId(p.sleeperId)]) return false;
      return true;
    });
    return {
      loaded: true,
      players: players,
      reason: "Available in this league means not on any roster in the Sleeper response. This is not the AFA free-agent pool."
    };
  }

  function projections() {
    return {
      available: false,
      label: "Unavailable. This build does not forecast starts, waivers, or future points."
    };
  }

  function comparePair(players, lines, scoring) {
    return (players || []).slice(0, 2).map(function (p, i) {
      var line = lines ? lines[i] : null;
      return {
        id: p && p.id,
        name: p && p.name,
        pos: p && p.pos,
        baseOvr: p && p.ovr,
        recorded: recordedPoints(line, scoring),
        form: formNote()
      };
    });
  }

  function formNote() {
    return formAdjustmentSafe();
  }

  function formAdjustmentSafe() {
    if (root.AFARealStatus) return root.AFARealStatus.formAdjustment();
    return { delta: null, applied: false, reason: "No evidence to adjust." };
  }

  root.AFALeagueScout = {
    TYPE_DOC: TYPE_DOC,
    GROUP: GROUP,
    STAT_MAP: STAT_MAP,
    groupOf: groupOf,
    formatLabel: formatLabel,
    recordedPoints: recordedPoints,
    analyzeLineup: analyzeLineup,
    occupiedFromRosters: occupiedFromRosters,
    leagueFreeAgents: leagueFreeAgents,
    projections: projections,
    comparePair: comparePair
  };
})(typeof window !== "undefined" ? window : globalThis);
