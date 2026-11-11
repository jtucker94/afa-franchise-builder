/* Match a pool player to an official Madden NFL 27 overall and the attributes
 * EA publishes on that player's ratings page. No match means not on record.
 * This does not invent a grade, average split ratings, or convert PFF.
 */
(function (root) {
  "use strict";

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

  function doc() {
    return root.AFA_MADDEN_EA || null;
  }

  function index() {
    var book = doc();
    if (!book) return null;
    if (book._index) return book._index;
    var byKey = {};
    var dup = {};
    var urls = {};
    (book.lists || []).forEach(function (list) { urls[list.pos] = list.url; });
    (book.players || []).forEach(function (row) {
      var key = fold(row.name) + "|" + row.pos;
      if (byKey[key]) dup[key] = true;
      byKey[key] = row;
    });
    Object.keys(dup).forEach(function (key) { delete byKey[key]; });
    book._index = { byKey: byKey, dropped: Object.keys(dup), urls: urls };
    return book._index;
  }

  function lookup(player) {
    var book = doc();
    var ix = index();
    if (!book || !ix || !player) return null;
    var key = fold(player.name) + "|" + player.pos;
    var row = ix.byKey[key];
    if (!row) {
      var wanted = Object.keys(ALIAS).filter(function (listKey) { return ALIAS[listKey] === key; });
      if (wanted.length === 1) row = ix.byKey[wanted[0]];
    }
    if (!row || typeof row.ovr !== "number") return null;
    return {
      ovr: row.ovr,
      attrs: row.attrs || {},
      edition: book.edition,
      iteration: book.iteration && book.iteration.label,
      retrievedAt: book.retrievedAt,
      publisher: book.publisher,
      compiler: "EA Sports",
      eaPos: row.eaPos,
      sourceUrl: ix.urls[row.eaPos] || book.source,
      scale: "madden-ovr",
      pff: null
    };
  }

  function coverage() {
    var book = doc();
    var ix = index();
    var positions = {};
    (book && book.lists || []).forEach(function (list) {
      positions[list.pool || list.pos] = (positions[list.pool || list.pos] || 0) + (list.count || 0);
    });
    return {
      edition: book && book.edition,
      iteration: book && book.iteration && book.iteration.label,
      retrievedAt: book && book.retrievedAt,
      publisher: book && book.publisher,
      listed: book && book.players ? book.players.length : 0,
      usable: ix ? Object.keys(ix.byKey).length : 0,
      positions: positions,
      pff: "Not stored. A PFF grade is a different scale and is not converted into an overall.",
      absent: "A player who is not on these EA pages has no Madden number in this build."
    };
  }

  function applyFresh(player) {
    var src = lookup(player);
    if (!player) return { locked: false, src: null };
    if (src) {
      player.ovr = src.ovr;
      player.ovrBase = src.ovr;
      player.ratingBasis = "madden-nfl27-ea";
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
