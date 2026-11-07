/* Match a pool player to a sourced Madden NFL 27 overall.
 * No match means not on record. This does not invent a grade or convert PFF.
 */
(function (root) {
  "use strict";

  var POS = { HB: "RB", RB: "RB", QB: "QB" };
  // Spelling only. Each list name maps to one pool name. Audric Estime is not in the pool, so he stays unmatched.
  var ALIAS = {
    "a j dillon|RB": "aj dillon|RB",
    "nick singleton|RB": "nicholas singleton|RB"
  };

  function fold(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function lists() {
    return root.AFA_MADDEN_LISTS || null;
  }

  function index() {
    var doc = lists();
    if (!doc) return null;
    if (doc._index) return doc._index;
    var byKey = {};
    var dup = {};
    (doc.players || []).forEach(function (row) {
      var pos = POS[row.pos] || row.pos;
      var key = fold(row.name) + "|" + pos;
      if (byKey[key]) dup[key] = true;
      byKey[key] = row;
    });
    Object.keys(dup).forEach(function (key) { delete byKey[key]; });
    doc._index = { byKey: byKey, dropped: Object.keys(dup) };
    return doc._index;
  }

  function lookup(player) {
    var doc = lists();
    var ix = index();
    if (!doc || !ix || !player) return null;
    var pos = POS[player.pos] || player.pos;
    if (pos !== "RB" && pos !== "QB") return null;
    var key = fold(player.name) + "|" + pos;
    var row = ix.byKey[key];
    if (!row) {
      var wanted = Object.keys(ALIAS).filter(function (listKey) { return ALIAS[listKey] === key; })[0];
      if (wanted && Object.keys(ALIAS).filter(function (listKey) { return ALIAS[listKey] === key; }).length === 1) {
        row = ix.byKey[wanted];
      }
    }
    if (!row || typeof row.ovr !== "number") return null;
    return {
      ovr: row.ovr,
      edition: doc.edition,
      retrievedAt: doc.retrievedAt,
      compiler: doc.compiler,
      listPos: row.pos,
      sourceUrl: (doc.lists || []).filter(function (list) { return list.pos === row.pos; }).map(function (list) { return list.url; })[0] || null,
      scale: "madden-ovr",
      pff: null
    };
  }

  function coverage() {
    var doc = lists();
    var ix = index();
    return {
      edition: doc && doc.edition,
      retrievedAt: doc && doc.retrievedAt,
      compiler: doc && doc.compiler,
      listed: doc && doc.players ? doc.players.length : 0,
      usable: ix ? Object.keys(ix.byKey).length : 0,
      positions: ["QB", "RB"],
      pff: "Not stored. A PFF grade is a different scale and is not converted into an overall.",
      absent: "A player who is not on these lists has no Madden number in this build."
    };
  }

  function applyFresh(player) {
    var src = lookup(player);
    if (!player) return { locked: false, src: null };
    if (src) {
      player.ovr = src.ovr;
      player.ovrBase = src.ovr;
      player.ratingBasis = "madden-nfl27-list";
      player.externalRatings = { madden: src, pff: null };
      return { locked: true, src: src };
    }
    if (player.ovrBase == null) player.ovrBase = player.ovr;
    if (!player.ratingBasis) player.ratingBasis = "afa-pool";
    player.externalRatings = { madden: null, pff: null };
    return { locked: false, src: null };
  }

  root.AFARatings = {
    fold: fold,
    lookup: lookup,
    coverage: coverage,
    applyFresh: applyFresh
  };
})(typeof window !== "undefined" ? window : globalThis);
