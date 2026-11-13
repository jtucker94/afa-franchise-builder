/* Original sideline coach view. Simulated AFA only. No league trademarks. */
(function (root) {
  "use strict";

  var PLAYS = [
    { id: "run", name: "Inside handoff", formation: "Eleven personnel" },
    { id: "pass", name: "Play-action shot", formation: "Eleven personnel" },
    { id: "go", name: "Quick out", formation: "Twelve personnel" },
    { id: "punt", name: "Punt", formation: "Punt unit" },
    { id: "field-goal", name: "Field goal", formation: "Field goal unit" }
  ];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function suggest(game) {
    var down = game.down || 1;
    var toGo = game.toGo || 10;
    if (down >= 4 && (game.yard || 0) < 60) return PLAYS[3];
    if (down >= 4) return PLAYS[4];
    if (toGo >= 8) return PLAYS[1];
    if (toGo <= 2) return PLAYS[0];
    return PLAYS[2];
  }

  function portrait(player, primary, secondary) {
    var num = player && player.number ? String(player.number) : "—";
    var pos = player && player.pos ? player.pos : "";
    return '<svg class="player-portrait" viewBox="0 0 80 104" role="img" aria-label="' + esc(pos) + " " + esc(num) + '">' +
      '<rect width="80" height="104" rx="12" fill="' + esc(primary || "#143") + '"/>' +
      '<ellipse cx="40" cy="30" rx="16" ry="18" fill="#c9a27a"/>' +
      '<path d="M22 24c4-14 32-14 36 0v6H22z" fill="' + esc(secondary || "#d4a017") + '"/>' +
      '<rect x="18" y="50" width="44" height="42" rx="8" fill="' + esc(secondary || "#d4a017") + '"/>' +
      '<text x="40" y="76" text-anchor="middle" font-size="18" font-family="sans-serif" font-weight="700" fill="#111">' + esc(num) + "</text>" +
      '<text x="40" y="96" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#111">' + esc(pos) + "</text>" +
      "</svg>";
  }

  function isOut(player) {
    return !!(player && player.currentInjury && Number(player.currentInjury.gamesRemaining) > 0);
  }

  function token(player, x, y, fill) {
    var num = player && player.number ? String(player.number) : "";
    var pos = player && player.pos ? player.pos : "";
    return '<g class="field-token" transform="translate(' + x + "," + y + ')">' +
      '<circle r="8" fill="' + esc(fill) + '" stroke="#f4f1e4" stroke-width="0.7"/>' +
      '<text y="1.4" text-anchor="middle" font-size="5" font-family="sans-serif" font-weight="700" fill="#111">' + esc(num || pos) + "</text>" +
      "</g>";
  }

  function fieldSVG(game, roster, primary, secondary) {
    var yard = Math.max(5, Math.min(95, game.yard || 25));
    var offense = (roster || []).slice(0, 11);
    var spots = [[8, 18], [14, 28], [14, 40], [20, 16], [20, 32], [20, 46], [26, 22], [26, 36], [32, 20], [32, 40], [38, 30]];
    var ballX = 8 + (yard / 100) * 84;
    var shift = game.lastGain ? Math.max(-8, Math.min(8, game.lastGain / 3)) : 0;
    var bodies = offense.filter(function (p) { return !isOut(p); }).map(function (p, i) {
      var s = spots[i] || [30, 30];
      return token(p, ballX - 18 + (s[0] - 20) * 0.35 + shift, s[1], primary || "#1c6b3a");
    }).join("");
    var defense = "";
    for (var d = 0; d < 7; d++) {
      defense += token({ pos: "D", number: d + 1 }, ballX + 6 + (d % 4) * 4 - shift, 16 + d * 4, secondary || "#8b1e1e");
    }
    return '<svg class="sideline-svg" viewBox="0 0 100 64" role="img" aria-label="Simulated field">' +
      '<rect width="100" height="64" rx="2" fill="#1d6b32"/>' +
      '<g stroke="rgba(255,255,255,0.75)" stroke-width="0.4" fill="none">' +
      '<rect x="4" y="6" width="92" height="52"/>' +
      [10, 20, 30, 40, 50, 60, 70, 80, 90].map(function (n) {
        return '<line x1="' + n + '" y1="6" x2="' + n + '" y2="58"/>';
      }).join("") +
      "</g>" +
      defense + bodies +
      '<ellipse class="field-ball" cx="' + ballX + '" cy="32" rx="1.6" ry="1" fill="#f4e1a6"/>' +
      "</svg>";
  }

  function meter(label, value) {
    var n = Math.max(0, Math.min(100, value | 0));
    return '<span class="side-meter"><i>' + esc(label) + '</i><b style="width:' + n + '%"></b></span>';
  }

  function render(model) {
    var game = model.game || {};
    var side = model.side || {};
    var roster = model.roster || [];
    var team = model.team || {};
    var tip = suggest(game);
    var downName = ["", "1st", "2nd", "3rd", "4th"][game.down] || (game.down + "th");
    var cards = PLAYS.map(function (play) {
      return '<button type="button" class="play-card" data-playcall="' + play.id + '"><strong>' + esc(play.name) + "</strong><span>" + esc(play.formation) + "</span></button>";
    }).join("");
    var bench = roster.slice(0, 8).map(function (p) {
      var fatigue = side.fatigue && side.fatigue[p.id] != null ? side.fatigue[p.id] : 18;
      var morale = side.morale && side.morale[p.id] != null ? side.morale[p.id] : 70;
      var benched = side.bench && side.bench[p.id];
      var hurt = isOut(p);
      return '<div class="side-player' + (benched || hurt ? " is-out" : "") + '">' +
        portrait(p, team.primary, team.secondary) +
        '<div><strong>' + esc(p.name) + "</strong><span>" + esc(p.pos) + " · #" + esc(p.number || "—") + "</span>" +
        (hurt ? '<span class="side-hurt">Out · ' + esc(p.currentInjury.type || "injury") + " · simulated</span>" : "") +
        meter("Fatigue", fatigue) + meter("Morale", morale) +
        '<button type="button" class="btn" data-sub="' + esc(p.id) + '">' + (benched ? "Send in" : "Take out") + "</button></div></div>";
    }).join("");
    var half = game.quarter === 3 && !side.halfDone
      ? '<div class="halftime"><p>Halftime. Simulated adjustment only.</p><button type="button" class="btn" data-half="run">Lean on the run</button><button type="button" class="btn" data-half="pass">Open the passing game</button></div>'
      : "";
    return '<section class="sideline" id="sideline">' +
      '<header class="sideline-board"><span>Q' + esc(game.quarter || 1) + "</span><strong>" + esc(downName) + " &amp; " + esc(game.toGo || 10) + "</strong><span>Ball on " + esc(game.yard || 25) + "</span>" +
      "<b>" + esc(game.scoreOff || 0) + "–" + esc(game.scoreDef || 0) + "</b>" +
      "<span>Timeouts " + esc(side.timeouts == null ? 3 : side.timeouts) + "</span></header>" +
      '<div class="sideline-grid">' +
      '<div class="sideline-field">' + fieldSVG(game, roster, team.primary, team.secondary) +
      "<p class=\"help\">" + esc((game.log || []).slice(-1)[0] || "No snaps yet.") + "</p></div>" +
      '<div class="sideline-calls"><p class="headset">Coordinator, simulated: ' + esc(tip.name) + ".</p>" + cards +
      '<div class="btn-row"><button type="button" class="btn" data-timeout="1">Call timeout</button><button type="button" class="btn" data-challenge="1">Throw a challenge</button></div>' +
      half + "</div>" +
      '<aside class="sideline-bench"><h3>Sideline</h3>' + bench + "</aside></div>" +
      '<p class="help">Simulated sideline. Text drive results are not a real NFL play.</p></section>';
  }

  function afterSnap(side, roster, note) {
    side = side || { fatigue: {}, morale: {}, bench: {}, timeouts: 3, challenges: 2 };
    side.fatigue = side.fatigue || {};
    side.morale = side.morale || {};
    (roster || []).slice(0, 6).forEach(function (p, i) {
      if (side.bench && side.bench[p.id]) return;
      var next = (side.fatigue[p.id] || 15) + 6 + i;
      side.fatigue[p.id] = Math.min(100, next);
      var mood = side.morale[p.id] == null ? 70 : side.morale[p.id];
      if (/score|first down/i.test(note || "")) mood += 4;
      if (/turnover|miss/i.test(note || "")) mood -= 6;
      side.morale[p.id] = Math.max(0, Math.min(100, mood));
    });
    return side;
  }

  root.AFASideline = {
    PLAYS: PLAYS,
    suggest: suggest,
    portrait: portrait,
    render: render,
    afterSnap: afterSnap
  };
})(typeof window !== "undefined" ? window : globalThis);
