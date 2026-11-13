/* Simulated AFA franchise rules. Not real NFL results.
 * Scores, progression, bids, and headlines produced here are league fiction.
 */
(function (root) {
  "use strict";

  var DEADLINE_WEEK = 10;

  function headToHead(schedule, a, b) {
    var aw = 0;
    var bw = 0;
    (schedule || []).forEach(function (week) {
      (week || []).forEach(function (g) {
        if (!g || !g.played) return;
        var home = g.home;
        var away = g.away;
        if (!((home === a && away === b) || (home === b && away === a))) return;
        if (g.hs === g.as) return;
        var winner = g.hs > g.as ? home : away;
        if (winner === a) aw += 1;
        if (winner === b) bw += 1;
      });
    });
    return aw - bw;
  }

  function compareClubs(a, b, ctx) {
    ctx = ctx || {};
    var ra = ctx.records[a.id] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    var rb = ctx.records[b.id] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    var pa = ra.w + ra.t * 0.5;
    var pb = rb.w + rb.t * 0.5;
    if (pb !== pa) return pb - pa;
    var h2h = headToHead(ctx.schedule, a.id, b.id);
    if (h2h) return -h2h;
    var da = (ra.pf || 0) - (ra.pa || 0);
    var db = (rb.pf || 0) - (rb.pa || 0);
    if (db !== da) return db - da;
    if ((rb.pf || 0) !== (ra.pf || 0)) return (rb.pf || 0) - (ra.pf || 0);
    return String(a.id).localeCompare(String(b.id));
  }

  function simTarget(state, target) {
    state = state || {};
    var week = state.week | 0;
    if (state.seasonDone) return { weeks: 0, label: "The regular season is already final." };
    if (target === "deadline") {
      var left = Math.max(0, DEADLINE_WEEK - week + 1);
      return { weeks: left, stopWeek: DEADLINE_WEEK, label: left ? "Sim through the Week 10 trade deadline." : "The deadline week is already complete." };
    }
    var end = (state.seasonWeeks | 0) || 18;
    return { weeks: Math.max(0, end - week + 1), stopWeek: end, label: "Sim the rest of the regular season, then the playoffs." };
  }

  function statRows(lines) {
    return (lines || []).map(function (row) {
      var pass = Number(row.passYd) || 0;
      var rush = Number(row.rushYd) || 0;
      var rec = Number(row.recYd) || 0;
      var td = (Number(row.passTd) || 0) + (Number(row.rushTd) || 0) + (Number(row.recTd) || 0);
      return {
        id: row.id || row.playerId || row.name,
        name: row.name || "Player",
        pos: row.pos || "",
        passYd: pass,
        rushYd: rush,
        recYd: rec,
        td: td,
        simulated: true
      };
    });
  }

  function ageCurve(age, pos) {
    age = Number(age) || 26;
    var peak = pos === "RB" ? 25 : (pos === "QB" ? 29 : 27);
    return Math.max(-2, Math.min(2, Math.round((peak - age) / 4)));
  }

  function weeklyChange(player, performance) {
    player = player || {};
    performance = performance || {};
    var snaps = Number(performance.snaps) || 0;
    var grade = Number(performance.grade);
    if (!isFinite(grade)) grade = 0;
    var play = snaps >= 20 ? (grade >= 70 ? 1 : (grade < 45 ? -1 : 0)) : 0;
    var delta = ageCurve(player.age, player.pos) === 0 ? play : (play + (ageCurve(player.age, player.pos) > 0 && snaps >= 10 ? 1 : 0) + (ageCurve(player.age, player.pos) < 0 && snaps < 15 ? -1 : 0));
    delta = Math.max(-2, Math.min(2, delta));
    return {
      delta: delta,
      week: performance.week || null,
      reason: delta > 0 ? "Simulated bump from playing time" : (delta < 0 ? "Simulated dip from age or a quiet week" : "Holding steady"),
      simulated: true
    };
  }

  function applyWeekly(player, performance) {
    var change = weeklyChange(player, performance);
    var before = Number(player.ovr) || 60;
    player.ovr = Math.max(40, Math.min(99, before + change.delta));
    if (!player.progression) player.progression = [];
    player.progression.push({ week: change.week, before: before, after: player.ovr, delta: change.delta, reason: change.reason, simulated: true });
    if (player.progression.length > 24) player.progression = player.progression.slice(-24);
    return change;
  }

  function offseasonChange(player) {
    var swing = ageCurve(player && player.age, player && player.pos);
    var pot = Number(player && player.potential);
    if (isFinite(pot) && pot > (Number(player.ovr) || 60) && swing >= 0) swing += 1;
    swing = Math.max(-3, Math.min(3, swing));
    return { delta: swing, reason: swing >= 0 ? "Simulated offseason growth" : "Simulated offseason decline", simulated: true };
  }

  function deadMoney(contract) {
    if (!contract) return 0;
    var bonus = Number(contract.signingBonus) || 0;
    var years = Math.max(1, Number(contract.yearsRemaining) || 1);
    var left = Number(contract.dead) ;
    if (isFinite(left)) return Math.max(0, Math.round(left));
    return Math.max(0, Math.round(bonus * Math.min(1, years / 4) * 0.5 + (Number(contract.capHit) || 0) * 0.15));
  }

  function capCharge(roster, dead) {
    var hit = (roster || []).reduce(function (sum, p) {
      return sum + ((p && p.contract && Number(p.contract.capHit)) || 0);
    }, 0);
    return hit + (Number(dead) || 0);
  }

  function room(cap, roster, dead) {
    return (Number(cap) || 0) - capCharge(roster, dead);
  }

  function cpuOffer(club) {
    club = club || {};
    if ((club.week | 0) > 10 && !club.offseason) return null;
    var needs = club.needs || [];
    var cap = Number(club.capRoom);
    if (isFinite(cap) && cap < 1000000 && !club.shedding) return null;
    var urgency = (club.week | 0) >= 8 ? 2 : 1;
    if ((club.wins | 0) >= 7) urgency += 1;
    if ((club.wins | 0) <= 3) urgency -= 1;
    if (!needs.length && urgency < 2) return null;
    return {
      from: club.id,
      need: needs[0] || "depth",
      urgency: urgency,
      reason: urgency >= 3 ? "deadline push for a contender" : (urgency <= 0 ? "rebuilding, only a bargain" : "positional need"),
      simulated: true
    };
  }

  function faChoice(player, bids) {
    var list = (bids || []).filter(function (bid) {
      return bid && Number(bid.money) > 0 && bid.capRoom >= Number(bid.money);
    });
    if (!list.length) return null;
    list.sort(function (a, b) {
      var as = Number(a.money) + (a.contender ? 1500000 : 0) + (a.role === "starter" ? 800000 : 0);
      var bs = Number(b.money) + (b.contender ? 1500000 : 0) + (b.role === "starter" ? 800000 : 0);
      if (bs !== as) return bs - as;
      return String(a.teamId).localeCompare(String(b.teamId));
    });
    return Object.assign({ simulated: true, playerId: player && player.id }, list[0]);
  }

  function headline(event) {
    event = event || {};
    var kind = event.kind || "note";
    var text = event.text || "The league moves on.";
    return {
      kind: kind,
      text: text,
      tag: "Simulated AFA",
      week: event.week || null,
      simulated: true
    };
  }

  function approvalStep(meter, event) {
    meter = meter || { score: 60 };
    var score = Number(meter.score);
    if (!isFinite(score)) score = 60;
    var delta = 0;
    if (event === "win") delta = 4;
    else if (event === "loss") delta = -3;
    else if (event === "big-win") delta = 6;
    else if (event === "trade") delta = 1;
    else if (event === "bad-trade") delta = -4;
    else if (event === "signing") delta = 2;
    else if (event === "star-cut") delta = -6;
    else if (event === "injury") delta = -1;
    score = Math.max(0, Math.min(100, score + delta));
    var warning = score < 35 ? "Owner patience is thin." : "";
    var firing = score < 20;
    return { score: score, delta: delta, warning: warning, firing: firing, simulated: true };
  }

  function gradePick(player, need) {
    var ovr = Number(player && player.ovr) || 60;
    var fit = need && player && player.pos === need;
    var grade = ovr >= 90 ? "A" : ovr >= 80 ? "B" : ovr >= 70 ? "C" : "D";
    if (fit && grade !== "A") grade = grade === "D" ? "C" : String.fromCharCode(grade.charCodeAt(0) - 1);
    return { grade: grade, fit: !!fit, simulated: true, blurb: (fit ? "Fills a need. " : "") + "Simulated draft grade " + grade + "." };
  }

  function defaults(state) {
    state = state || {};
    if (!state.progression) state.progression = {};
    if (!state.deadCap) state.deadCap = {};
    if (!state.approval) state.approval = { score: 60 };
    if (!Array.isArray(state.leagueNews)) state.leagueNews = [];
    if (!state.faMarket) state.faMarket = {};
    return state;
  }

  root.AFAFranchise = {
    DEADLINE_WEEK: DEADLINE_WEEK,
    headToHead: headToHead,
    compareClubs: compareClubs,
    simTarget: simTarget,
    statRows: statRows,
    ageCurve: ageCurve,
    weeklyChange: weeklyChange,
    applyWeekly: applyWeekly,
    offseasonChange: offseasonChange,
    deadMoney: deadMoney,
    capCharge: capCharge,
    room: room,
    cpuOffer: cpuOffer,
    faChoice: faChoice,
    headline: headline,
    approvalStep: approvalStep,
    gradePick: gradePick,
    defaults: defaults
  };
})(typeof window !== "undefined" ? window : globalThis);
