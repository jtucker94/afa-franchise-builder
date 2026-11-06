/* AFA Dynasty — aging, reputation, fan base, history (window.AFADynasty). No DOM required except ui.* helpers. */
(function (root) {
  "use strict";
  const C = root.AFACoaches || (typeof require !== "undefined" ? require("./coaches.js") : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (r) => (r() + r() + r() - 1.5) * 1.15;

  /* [DATA-informed] position peak windows (PFF/PFR age-curve studies, approx.):
     RB peaks ~24–27 and falls sharply after 28; WR/TE ~25–29; QB ~27–33; OL ~26–31; edge/DT ~25–29; LB ~24–28;
     CB ~24–28; S ~25–29; K/P play into late 30s. decline = ovr pts/yr past peak end. */
  const AGE_CURVES = {
    QB: [27, 33, 2.0], RB: [24, 27, 4.5], WR: [25, 29, 3.0], TE: [25, 29, 3.0], OT: [26, 31, 2.5], OG: [26, 31, 2.5], C: [26, 31, 2.5],
    DE: [25, 29, 3.0], DT: [25, 29, 3.0], LB: [24, 28, 3.5], CB: [24, 28, 4.0], S: [25, 29, 3.0], K: [26, 36, 1.0], P: [26, 36, 1.0]
  };
  // [DATA] typical last-season ages; NFLPA avg career ≈3.3 yrs overall (longer for starters).
  const RETIRE_AGE = { QB: 38, RB: 30, WR: 33, TE: 33, OT: 34, OG: 34, C: 34, DE: 33, DT: 33, LB: 32, CB: 32, S: 33, K: 40, P: 40 };

  /* Age one player one season. devSkill = coach development 40..99. Returns new obj (+retired flag). */
  function agePlayer(p, devSkill, r) {
    const q = { ...p }, cv = AGE_CURVES[p.pos] || [25, 29, 3];
    if (q.pot == null) q.pot = clamp(q.ovr + (q.age < 24 ? Math.round(4 + r() * 14) : 0), q.ovr, 99);
    q.age = (q.age || 24) + 1;
    const dev = ((devSkill || 75) - 75) / 25; // -1.4..+1
    let d;
    if (q.age < cv[0]) {
      // development; [EST] ~15% bust (stall), ~10% boom
      const roll = r(); const room = Math.max(0, q.pot - q.ovr);
      d = room * (0.25 + dev * 0.08) + gauss(r) * 1.5;
      if (roll < 0.15 - dev * 0.04) { d = gauss(r) - 1; q.bust = true; }
      else if (roll > 0.9 - dev * 0.03) { d += 3; q.pot = clamp(q.pot + 3, 0, 99); }
    } else if (q.age <= cv[1]) d = gauss(r) * 1.2 + dev * 0.4;
    else d = -cv[2] * 0.55 * (1 + (q.age - cv[1]) * 0.08) + gauss(r) * 1.0 + dev * 0.4;
    q.ovr = clamp(Math.round(q.ovr + d), 35, 99);
    const over = q.age - RETIRE_AGE[q.pos || "WR"];
    const pRet = over >= 0 ? 0.22 + over * 0.12 : (q.ovr < 48 && q.age > 30 ? 0.08 : 0.005);
    q.retired = r() < clamp(pRet, 0, 0.97);
    return q;
  }
  function ageRoster(roster, devSkill, seed) {
    const r = C.rngFrom(seed || 7), kept = [], retired = [];
    roster.forEach((p) => { const q = agePlayer(p, devSkill, r); (q.retired ? retired : kept).push(q); });
    return { roster: kept, retired };
  }

  /* Front-office reputation 0..100: winning+playoffs ~65%, contracts honored 15%, player treatment 10%, stability 10% [EST weights]. */
  function updateReputation(rep, s) {
    const target = 55 * s.winPct + ({ none: 0, wildcard: 3, divisional: 6, conference: 9, champion: 14 })[s.playoff || "none"]
      + 15 * clamp(s.contractsHonored ?? 1, 0, 1) + 10 * clamp(s.playerTreatment ?? 0.5, 0, 1)
      + 10 * clamp(1 - (s.coachChanges || 0) * 0.5 - (s.gmChanges || 0) * 0.7, 0, 1);
    return Math.round(clamp(rep * 0.65 + clamp(target, 0, 100) * 0.35, 0, 100));
  }
  /* FA interest 0..1 and asking-price multiplier (0.9 .. 1.2): bad rep = pay a premium */
  function faInterest(rep, playerOvr) { return +clamp(0.25 + rep / 100 * 0.7 - (playerOvr > 85 ? 0.1 : 0) * (1 - rep / 100), 0.05, 0.98).toFixed(3); }
  function askingPriceMult(rep) { return +clamp(1.2 - rep / 100 * 0.3, 0.9, 1.2).toFixed(3); }

  /* Fan base (thousands of committed fans). Growth from winning, playoffs, rep; small markets cap lower. [EST] */
  function updateFanBase(fans, s) {
    const base = s.marketSize || 1; // 0.6 small .. 1.4 big
    const g = (s.winPct - 0.5) * 0.18 + ({ none: 0, wildcard: 0.02, divisional: 0.04, conference: 0.07, champion: 0.12 })[s.playoff || "none"]
      + (s.rep - 50) / 1000 + (s.streak || 0) * 0.005;
    const cap = 1200 * base;
    return Math.round(clamp(fans * (1 + g) + (g > 0 ? 6 : 0), 40, cap));
  }
  /* Attendance demand fraction for stadium modules: fan base vs capacity */
  function attendanceDemand(fans, capacity) { return +clamp(0.55 + fans / ((capacity || 65000) / 1000) * 0.08, 0.4, 1.15).toFixed(3); }

  function newFranchise(opts) {
    opts = opts || {};
    return { teamId: opts.teamId || null, rep: opts.rep ?? 50, fans: opts.fans ?? 150, marketSize: opts.marketSize ?? 1, streak: 0, history: [] };
  }
  /* One end-of-season dynasty step. ctx: {year, wins, losses, ties, playoff, roster, coach, coachRosterRank, contractsHonored, playerTreatment, marketPressure, seed}
     Returns {franchise, roster, retired, coach, coachStatus, events, stadium}. */
  function endSeason(fr, ctx) {
    const f = JSON.parse(JSON.stringify(fr)); const g = (ctx.wins + ctx.losses + (ctx.ties || 0)) || 1;
    const winPct = (ctx.wins + 0.5 * (ctx.ties || 0)) / g;
    const prev = f.history.length ? f.history[f.history.length - 1].winPct : null;
    const events = [];
    let coach = ctx.coach, coachStatus = "none";
    if (coach && C) {
      const res = C.evolveSeason(coach, { winPct, prevWinPct: prev, playoff: ctx.playoff, roster: ctx.roster, rosterRank: ctx.rosterRank, marketPressure: ctx.marketPressure ?? (f.marketSize - 1), seed: ctx.seed });
      coach = res.coach; coachStatus = res.status; events.push(...res.events);
    }
    const aged = ageRoster(ctx.roster || [], coach ? coach.skills.development : 75, (ctx.seed || 1) ^ 0x9e37);
    if (aged.retired.length) events.push({ type: "retire", text: aged.retired.length + " players retired" + (aged.retired[0] ? " (incl. " + aged.retired.sort((a, b) => b.ovr - a.ovr)[0].name + ")" : "") });
    f.streak = winPct > 0.5 ? Math.max(1, f.streak + 1) : winPct < 0.5 ? Math.min(-1, f.streak - 1) : 0;
    f.rep = updateReputation(f.rep, { winPct, playoff: ctx.playoff, contractsHonored: ctx.contractsHonored, playerTreatment: ctx.playerTreatment, coachChanges: coachStatus === "fired" ? 1 : 0 });
    f.fans = updateFanBase(f.fans, { winPct, playoff: ctx.playoff, rep: f.rep, marketSize: f.marketSize, streak: clamp(f.streak, -3, 3) });
    let stadium = null; const S = root.AFAStadiums;
    if (S && typeof S.onFanBaseChange === "function") { try { stadium = S.onFanBaseChange(f.teamId, { fans: f.fans, rep: f.rep, year: ctx.year }); } catch (e) { stadium = null; } }
    const cap = (stadium && stadium.capacity) || ctx.capacity || 65000;
    const demand = attendanceDemand(f.fans, cap);
    if (demand > 1.05) events.push({ type: "expansion", text: "Demand exceeds capacity — stadium expansion recommended" });
    f.history.push({ year: ctx.year, wins: ctx.wins, losses: ctx.losses, ties: ctx.ties || 0, winPct: +winPct.toFixed(3), playoff: ctx.playoff || "none",
      rep: f.rep, fans: f.fans, demand, coach: coach ? coach.name : null, coachOvr: coach ? coach.ovr : null, hotSeat: coach ? coach.hotSeat : null, coachStatus, events: events.map((e) => e.text) });
    return { franchise: f, roster: aged.roster, retired: aged.retired, coach, coachStatus, events, stadium: { capacity: cap, demand } };
  }

  /* ---------- UI helpers (return HTML strings; host inserts them) ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function lineChart(series, opts) {
    opts = opts || {}; const W = opts.w || 360, H = opts.h || 140, P = 26;
    const all = series.flatMap((s) => s.values); if (!all.length) return '<div class="dyn-empty">No seasons yet</div>';
    const max = opts.max ?? Math.max(...all), min = opts.min ?? Math.min(0, ...all), n = Math.max(2, series[0].values.length);
    const x = (i) => P + i * (W - 2 * P) / (n - 1), y = (v) => H - P - (v - min) / ((max - min) || 1) * (H - 2 * P);
    const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${s.values.map((v, i) => x(i) + "," + y(v)).join(" ")}"/>` +
      s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"><title>${esc(s.label)}: ${v}</title></circle>`).join("")).join("");
    const legend = series.map((s) => `<span class="dyn-leg"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("");
    return `<div class="dyn-chart"><div class="dyn-chart-title">${esc(opts.title || "")}</div><svg viewBox="0 0 ${W} ${H}" role="img"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" class="dyn-axis"/><text x="4" y="${y(max) + 4}" class="dyn-tick">${Math.round(max)}</text><text x="4" y="${H - P}" class="dyn-tick">${Math.round(min)}</text>${lines}</svg><div class="dyn-legend">${legend}</div></div>`;
  }
  function hotSeatMeter(v) {
    const col = v < 35 ? "#2ecc71" : v < 60 ? "#f1c40f" : v < 80 ? "#e67e22" : "#e74c3c";
    const lbl = v < 35 ? "Secure" : v < 60 ? "Warm" : v < 80 ? "Hot" : "On the brink";
    return `<div class="dyn-meter" title="Hot seat ${v}/100"><div class="dyn-meter-fill" style="width:${v}%;background:${col}"></div><span>${lbl} · ${v}</span></div>`;
  }
  function coachCardHTML(c) {
    if (!c) return "";
    const t = c.tendencies, bar = (l, v, mx) => `<div class="dyn-attr"><span>${l}</span><b style="width:${Math.round(v / mx * 100)}%"></b><em>${v}</em></div>`;
    return `<div class="dyn-card"><h3>${esc(c.name)} <small>Age ${c.age} · OVR ${c.ovr} · Yr ${c.tenure + 1}</small></h3>
      <div class="dyn-tags"><span class="dyn-tag off">${esc(c.offScheme)}</span><span class="dyn-tag def">${esc(c.defScheme)}</span></div>
      ${bar("Play-calling", c.skills.playcalling, 99)}${bar("Development", c.skills.development, 99)}${bar("Game mgmt", c.skills.gameMgmt, 99)}${bar("Leadership", c.skills.leadership, 99)}
      <div class="dyn-tend">Pass rate <b>${Math.round(t.passRate * 100)}%</b> · 4th-down go <b>${Math.round(t.goRate4th * 100)}%</b> · Tempo <b>${t.tempo < 0.4 ? "Slow" : t.tempo < 0.65 ? "Normal" : "Fast"}</b></div>
      <div class="dyn-sub">Hot seat</div>${hotSeatMeter(c.hotSeat)}</div>`;
  }
  function timelineHTML(fr) {
    const icon = { champion: "🏆", conference: "🥈", divisional: "⭐", wildcard: "🎟️", none: "" };
    return `<ol class="dyn-timeline">${fr.history.slice().reverse().map((h) => `<li class="${h.winPct >= 0.5 ? "up" : "down"}"><b>${h.year}</b> ${h.wins}-${h.losses}${h.ties ? "-" + h.ties : ""} ${icon[h.playoff] || ""}<span>${esc(h.coach || "")}${h.coachStatus && h.coachStatus !== "stays" && h.coachStatus !== "none" ? " · " + h.coachStatus : ""}</span>${h.events.length ? `<small>${h.events.map(esc).join(" · ")}</small>` : ""}</li>`).join("")}</ol>`;
  }
  function dashboardHTML(fr, coach) {
    const h = fr.history;
    return `<div class="dyn-dash"><div class="dyn-kpis"><div><span>Reputation</span><b>${fr.rep}</b></div><div><span>Fan base</span><b>${fr.fans}k</b></div><div><span>FA price</span><b>×${askingPriceMult(fr.rep)}</b></div></div>
      ${coachCardHTML(coach)}
      ${lineChart([{ label: "Reputation", color: "#8e44ad", values: h.map((x) => x.rep) }, { label: "Win %", color: "#27ae60", values: h.map((x) => Math.round(x.winPct * 100)) }], { title: "Reputation & winning", min: 0, max: 100 })}
      ${lineChart([{ label: "Fan base (k)", color: "#e67e22", values: h.map((x) => x.fans) }], { title: "Fan base" })}
      <h4>Season history</h4>${timelineHTML(fr)}</div>`;
  }

  const api = { AGE_CURVES, RETIRE_AGE, agePlayer, ageRoster, updateReputation, faInterest, askingPriceMult, updateFanBase, attendanceDemand, newFranchise, endSeason,
    ui: { lineChart, hotSeatMeter, coachCardHTML, timelineHTML, dashboardHTML }, coaches: C };
  root.AFADynasty = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
