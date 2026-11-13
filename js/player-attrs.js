/* Estimated physical and skill ratings for the draft board.
 * These are not EA attribute exports. A sourced Madden overall, when present,
 * is only the overall. Missing attributes stay estimates.
 */
(function (root) {
  "use strict";

  var CORE = ["SPD", "ACC", "AGI", "JMP", "CTH", "STR", "AWR"];
  var EXTRA = {
    QB: [["THP", "Throw power"], ["THA", "Throw accuracy"]],
    RB: [["CAR", "Carrying"], ["BCV", "Vision"]],
    WR: [["CIT", "Catch in traffic"]],
    TE: [["RBK", "Run block"], ["PBK", "Pass block"]],
    OT: [["RBK", "Run block"], ["PBK", "Pass block"]],
    OG: [["RBK", "Run block"], ["PBK", "Pass block"]],
    C: [["RBK", "Run block"], ["PBK", "Pass block"]],
    DE: [["TAK", "Tackle"], ["PRS", "Pass rush"]],
    DT: [["TAK", "Tackle"], ["PRS", "Pass rush"]],
    LB: [["TAK", "Tackle"], ["PRS", "Pass rush"]],
    CB: [["TAK", "Tackle"], ["PRS", "Press"]],
    S: [["TAK", "Tackle"], ["PRS", "Play recognition"]],
    K: [["KPW", "Kick power"], ["KAC", "Kick accuracy"]],
    P: [["KPW", "Punt power"], ["KAC", "Punt accuracy"]]
  };
  var COLUMNS = [
    ["ovr", "OVR"], ["name", "Player"], ["pos", "Pos"], ["age", "Age"],
    ["SPD", "SPD"], ["ACC", "ACC"], ["AGI", "AGI"], ["JMP", "JMP"],
    ["CTH", "CTH"], ["STR", "STR"], ["AWR", "AWR"],
    ["THP", "THP"], ["THA", "THA"], ["TAK", "TAK"], ["PRS", "PRS"],
    ["RBK", "RBK"], ["PBK", "PBK"]
  ];

  function hash(s) {
    var h = 2166136261;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function clamp(n) { return Math.max(40, Math.min(99, n | 0)); }

  function realAttrs(player) {
    var src = player && player.externalRatings && player.externalRatings.madden;
    if ((!src || !src.attrs) && root.AFARatings && root.AFARatings.lookup) src = root.AFARatings.lookup(player);
    return (src && src.attrs) || null;
  }

  function attrsFor(player) {
    var ovr = Number(player && player.ovr);
    if (!isFinite(ovr)) ovr = 70;
    var h = hash(player && (player.id || player.name));
    var real = realAttrs(player) || {};
    var sourced = {};
    var estimated = {};
    var out = {};
    function put(code, estimateValue) {
      if (typeof real[code] === "number") {
        out[code] = real[code];
        sourced[code] = true;
      } else {
        out[code] = estimateValue;
        estimated[code] = true;
      }
    }
    CORE.forEach(function (code, i) {
      put(code, clamp(ovr + ((h >>> (i * 3)) % 11) - 5));
    });
    var extras = EXTRA[player && player.pos] || [];
    extras.forEach(function (pair, i) {
      put(pair[0], clamp(ovr + ((h >>> (18 + i * 3)) % 11) - 5));
    });
    var sourcedKeys = Object.keys(sourced);
    out.estimate = sourcedKeys.length === 0;
    out.sourced = sourced;
    out.estimated = estimated;
    out.extras = extras.map(function (pair) { return pair[0]; });
    out.source = sourcedKeys.length ? (out.estimate ? "estimate-from-overall" : "madden-nfl27-ea") : "estimate-from-overall";
    if (sourcedKeys.length && Object.keys(estimated).length) {
      out.note = "Madden NFL 27 attributes from the EA ratings page where that page publishes the number. A cell without an EA value is an estimate from the overall, not a Madden attribute. Throw accuracy and a single pass-rush rating are not one EA number, so those stay estimates.";
    } else if (sourcedKeys.length) {
      out.note = "Madden NFL 27 attributes from the EA ratings page, retrieved 2026-11-11.";
    } else {
      out.note = "Not an EA attribute. The number is the overall plus a stable id wobble.";
    }
    return out;
  }

  function shows(player, key) {
    if (key === "ovr" || key === "name" || key === "pos" || key === "age") return true;
    if (CORE.indexOf(key) >= 0) return true;
    var extras = EXTRA[player && player.pos] || [];
    return extras.some(function (pair) { return pair[0] === key; });
  }

  function sortValue(player, key) {
    if (!player) return null;
    if (key === "name") return String(player.name || "");
    if (key === "pos") return String(player.pos || "");
    if (key === "age") return Number(player.age);
    if (key === "ovr") return Number(player.ovr);
    if (!shows(player, key)) return null;
    var n = attrsFor(player)[key];
    return n == null ? null : n;
  }

  function comparePlayers(a, b, key, dir) {
    var av = sortValue(a, key);
    var bv = sortValue(b, key);
    var mul = dir === "asc" ? 1 : -1;
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    if (av != null && bv != null && av !== bv) {
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
      return (av - bv) * mul;
    }
    var name = String(a && a.name).localeCompare(String(b && b.name));
    if (name) return name;
    return String(a && a.id).localeCompare(String(b && b.id));
  }

  root.AFAAttrs = {
    CORE: CORE,
    EXTRA: EXTRA,
    COLUMNS: COLUMNS,
    attrsFor: attrsFor,
    shows: shows,
    sortValue: sortValue,
    comparePlayers: comparePlayers
  };
})(typeof window !== "undefined" ? window : globalThis);
