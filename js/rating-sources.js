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

  function nflCode(code) {
    var c = String(code || "").toUpperCase();
    if (c === "WAS" || c === "WSH") return "WSH";
    if (c === "JAC") return "JAX";
    return c;
  }

  function index() {
    var book = doc();
    if (!book) return null;
    if (book._index) return book._index;
    var byKey = {};
    var urls = {};
    (book.lists || []).forEach(function (list) { urls[list.pos] = list.url; });
    (book.players || []).forEach(function (row) {
      var key = fold(row.name) + "|" + row.pos;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(row);
    });
    book._index = { byKey: byKey, urls: urls };
    return book._index;
  }

  function lookup(player) {
    var book = doc();
    var ix = index();
    if (!book || !ix || !player) return null;
    var key = fold(player.name) + "|" + player.pos;
    var rows = (ix.byKey[key] || []).slice();
    if (!rows.length) {
      var wanted = Object.keys(ALIAS).filter(function (listKey) { return ALIAS[listKey] === key; });
      if (wanted.length === 1) rows = (ix.byKey[wanted[0]] || []).slice();
    }
    if (player.nflTeam) {
      var teamRows = rows.filter(function (row) { return row.nfl && nflCode(player.nflTeam) === nflCode(row.nfl); });
      var teamKnown = rows.some(function (row) { return row.nfl; });
      if (teamRows.length) rows = teamRows;
      else if (teamKnown) return null;
    }
    if (rows.length > 1 && player.college) {
      var schoolRows = rows.filter(function (row) { return row.college && fold(player.college) === fold(row.college); });
      if (schoolRows.length) rows = schoolRows;
    }
    if (rows.length !== 1 || typeof rows[0].ovr !== "number") return null;
    var row = rows[0];
    return {
      ovr: row.ovr,
      attrs: row.attrs || {},
      edition: book.edition,
      iteration: book.iteration && book.iteration.label,
      retrievedAt: book.retrievedAt,
      publisher: book.publisher,
      compiler: "EA Sports",
      eaPos: row.eaPos,
      nfl: row.nfl || null,
      college: row.college || null,
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
      usable: ix ? Object.keys(ix.byKey).reduce(function (n, key) { return n + (ix.byKey[key].length === 1 ? 1 : 0); }, 0) : 0,
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
