/* AFA Dynasty — Coach progression (window.AFACoaches). Standalone, no DOM.
   Ranges marked [DATA] are grounded in public NFL data (approx.; see INTEGRATION.md "Sources");
   [EST] are design estimates. */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rngFrom(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const gauss = (r) => (r() + r() + r() - 1.5) * 1.15;

  // Scheme families + the personnel each one leans on (positions weighted for fit).
  const OFF_SCHEMES = {
    "West Coast":      { passRate: 0.60, tempo: 0.45, keys: { QB: 1.2, WR: 1.0, TE: 0.9, RB: 0.6 } },
    "Air Raid":        { passRate: 0.66, tempo: 0.75, keys: { QB: 1.3, WR: 1.3, OT: 0.8 } },
    "Shanahan Zone":   { passRate: 0.53, tempo: 0.40, keys: { RB: 1.0, OG: 1.0, C: 0.9, OT: 1.0, TE: 0.9 } },
    "Spread Option":   { passRate: 0.55, tempo: 0.70, keys: { QB: 1.3, RB: 0.9, WR: 0.8 } },
    "Power Run":       { passRate: 0.50, tempo: 0.30, keys: { RB: 1.2, OG: 1.2, OT: 1.0, TE: 1.0 } },
    "Pro-Style":       { passRate: 0.57, tempo: 0.40, keys: { QB: 1.1, OT: 1.0, WR: 0.9, TE: 0.9 } }
  };
  const DEF_SCHEMES = {
    "4-3 Cover 3":     { keys: { DE: 1.1, DT: 1.0, LB: 1.0, S: 0.9 } },
    "3-4 Quarters":    { keys: { LB: 1.2, DT: 1.0, S: 1.1, CB: 0.9 } },
    "Wide-9 Pressure": { keys: { DE: 1.4, DT: 1.0, LB: 0.8 } },
    "Sim-Pressure":    { keys: { LB: 1.1, S: 1.1, CB: 1.0, DE: 0.9 } },
    "Man Press":       { keys: { CB: 1.4, S: 1.0, DE: 0.8 } }
  };
  // Map game data.js style strings -> families (fallback by keyword).
  const STYLE_MAP = [
    [/air raid|tempo|spread/i, "Air Raid", null], [/shanahan|zone|play-action|12 psn/i, "Shanahan Zone", null],
    [/west coast|motion|mcvay|schematic|qb/i, "West Coast", null], [/run-heavy|physical|power|tough/i, "Power Run", "4-3 Cover 3"],
    [/wide-9/i, null, "Wide-9 Pressure"], [/sim-pressure|blitz/i, null, "Sim-Pressure"], [/man coverage/i, null, "Man Press"],
    [/defens/i, null, "3-4 Quarters"]
  ];

  // [DATA] neutral-situation pass rate ~0.50–0.66 across NFL teams (nflfastR, 2019–24).
  // [DATA] 4th-down go rate ~10%–30% of 4th downs by team, league ~17–20% post-2020 (rbsdm/nflfastR).
  // [DATA] tempo ~26–31 sec/play in neutral situations (FTN/Football Outsiders pace) — stored 0..1.
  const RANGES = { passRate: [0.48, 0.68], goRate4th: [0.08, 0.32], tempo: [0, 1] };
  // [DATA] avg NFL HC tenure ≈ 4 seasons (median ~3); ~6–7 of 32 HCs replaced per year (~20%).
  const LEAGUE = { avgTenure: 4.0, annualTurnover: 0.2 };

  function createCoach(base, opts) {
    opts = opts || {}; const r = rngFrom(hash(base.id || base.name) ^ (opts.seed || 0));
    let off = "Pro-Style", def = "4-3 Cover 3";
    STYLE_MAP.forEach(([re, o, d]) => { if (re.test(base.style || "")) { if (o && off === "Pro-Style") off = o; if (d && def === "4-3 Cover 3") def = d; } });
    const ovr = base.ovr || 75, sk = (k) => clamp(Math.round(ovr + gauss(r) * 6 + (k || 0)), 40, 99);
    const os = OFF_SCHEMES[off];
    return {
      id: base.id, name: base.name, age: base.age || Math.round(42 + r() * 20), ovr,
      offScheme: off, defScheme: def,
      skills: { playcalling: sk(), development: sk(/qb|whisperer|development/i.test(base.style || "") ? 6 : 0), gameMgmt: sk(), leadership: sk(/culture/i.test(base.style || "") ? 5 : 0) },
      tendencies: {
        passRate: +clamp(os.passRate + gauss(r) * 0.03, ...RANGES.passRate).toFixed(3),
        goRate4th: +clamp(0.17 + gauss(r) * 0.05 + (/aggressive/i.test(base.style || "") ? 0.06 : 0), ...RANGES.goRate4th).toFixed(3),
        tempo: +clamp(os.tempo + gauss(r) * 0.1, 0, 1).toFixed(2)
      },
      xp: 0, tenure: 0, hotSeat: 20, history: [], oc: null, dc: null, contractYears: 5
    };
  }
  function createCoordinator(side, seed) {
    const r = rngFrom(seed), fams = Object.keys(side === "O" ? OFF_SCHEMES : DEF_SCHEMES);
    return { id: "coord_" + side + "_" + seed, side, scheme: fams[Math.floor(r() * fams.length)], age: Math.round(34 + r() * 18), rating: Math.round(60 + r() * 30) };
  }

  /* roster: [{pos, ovr}] -> 0..1 fit of the roster to the coach's schemes */
  function schemeFit(coach, roster) {
    if (!roster || !roster.length) return 0.5;
    const score = (keys) => { let s = 0, w = 0; for (const p in keys) { const top = roster.filter((x) => x.pos === p).map((x) => x.ovr).sort((a, b) => b - a).slice(0, 2); if (!top.length) continue; s += keys[p] * (top.reduce((a, b) => a + b, 0) / top.length); w += keys[p]; } return w ? s / w : 70; };
    const avg = roster.reduce((s, p) => s + p.ovr, 0) / roster.length;
    const rel = (score(OFF_SCHEMES[coach.offScheme].keys) + score(DEF_SCHEMES[coach.defScheme].keys)) / 2 - avg;
    return +clamp(0.5 + rel / 20, 0, 1).toFixed(3);
  }
  /* [EST] player effectiveness multiplier: 0.97..1.05 for key-position players in a fitting scheme */
  function schemeBonus(coach, player) {
    if (!coach || !player) return 1;
    const k = (OFF_SCHEMES[coach.offScheme].keys[player.pos] || 0) + (DEF_SCHEMES[coach.defScheme].keys[player.pos] || 0);
    const coordBoost = ((coach.oc && coach.oc.scheme === coach.offScheme) || (coach.dc && coach.dc.scheme === coach.defScheme)) ? 0.005 : 0;
    return +(0.985 + Math.min(1.4, k) * 0.045 + coordBoost).toFixed(3);
  }
  /* power delta for teamPower(): coach skill + fit, ≈ -2..+4 points */
  function teamPowerBonus(coach, roster) {
    if (!coach) return 0;
    const sk = (coach.skills.playcalling + coach.skills.gameMgmt) / 2;
    return +((sk - 80) * 0.2 + (schemeFit(coach, roster) - 0.5) * 3).toFixed(2);
  }

  /* Owner expectation (win%) from market + prior season + roster strength */
  function ownerExpectation(ctx) {
    return clamp(0.5 + ((ctx.rosterRank != null ? (16.5 - ctx.rosterRank) / 32 : 0) * 0.5) + (ctx.marketPressure || 0) * 0.08, 0.3, 0.8);
  }
  /* [DATA-informed] firing odds: NFL HCs at <.300 win% are fired ~60–70% of the time, .300–.450 ~25–35%,
     >.500 rarely (<5%) unless playoff expectations unmet (PFR coach records 2000–2024, approx.). Hot seat 0..100. */
  function hotSeat(coach, s) {
    const exp = ownerExpectation(s), gap = exp - s.winPct;
    const trend = s.prevWinPct != null ? s.winPct - s.prevWinPct : 0;
    let h = coach.hotSeat * 0.45 + 30 + gap * 130 - trend * 40 + (s.marketPressure || 0) * 8;
    h -= ({ none: 0, wildcard: 8, divisional: 14, conference: 20, champion: 35 })[s.playoff || "none"];
    if (coach.tenure < 1) h -= 15; // honeymoon
    return Math.round(clamp(h, 0, 100));
  }
  function fireProbability(h) { return h < 40 ? 0 : clamp((h - 40) / 45, 0, 1) ** 1.1; }

  /* Season-end evolution. s = {winPct, prevWinPct, playoff, roster, rosterRank, marketPressure, seed} */
  function evolveSeason(coach, s) {
    const r = rngFrom(s.seed || hash(coach.id + coach.tenure));
    const c = JSON.parse(JSON.stringify(coach)); const ev = [];
    c.age++; c.tenure++;
    const fit = schemeFit(c, s.roster);
    c.xp += Math.round(40 + s.winPct * 60 + ({ none: 0, wildcard: 15, divisional: 25, conference: 40, champion: 60 })[s.playoff || "none"]);
    // [EST] skill growth: young coaches grow, 62+ decline; XP converts ~1pt/120xp
    const ageAdj = c.age < 45 ? 1.2 : c.age < 55 ? 0.6 : c.age < 62 ? 0 : -1.4;
    for (const k in c.skills) {
      const d = ageAdj + (c.xp >= 120 ? 0.8 : 0) + gauss(r) * 0.9 + (k === "development" && fit > 0.6 ? 0.4 : 0);
      c.skills[k] = clamp(Math.round(c.skills[k] + d), 40, 99);
    }
    if (c.xp >= 120) c.xp -= 120;
    c.ovr = Math.round((c.skills.playcalling + c.skills.development + c.skills.gameMgmt + c.skills.leadership) / 4);
    // Tendencies drift: personnel (pass-heavy roster -> pass more), results, coordinator, age
    const t = c.tendencies, ros = s.roster || [];
    const top = (p) => Math.max(0, ...ros.filter((x) => x.pos === p).map((x) => x.ovr));
    const passLean = ((top("QB") + top("WR")) / 2 - (top("RB") + top("OG")) / 2) / 100;
    const target = OFF_SCHEMES[c.offScheme].passRate + passLean * 0.5 + (c.oc ? (OFF_SCHEMES[c.oc.scheme].passRate - OFF_SCHEMES[c.offScheme].passRate) * 0.3 : 0);
    t.passRate = +clamp(t.passRate + (target - t.passRate) * 0.3 + gauss(r) * 0.01, ...RANGES.passRate).toFixed(3);
    // League-wide 4th-down aggression has risen yearly since 2018 [DATA]; losing coaches gamble more, old coaches less.
    t.goRate4th = +clamp(t.goRate4th + 0.004 + (0.5 - s.winPct) * 0.02 - (c.age > 60 ? 0.01 : 0) + gauss(r) * 0.01, ...RANGES.goRate4th).toFixed(3);
    t.tempo = +clamp(t.tempo + (OFF_SCHEMES[c.offScheme].tempo - t.tempo) * 0.2 - (c.age > 60 ? 0.02 : 0) + gauss(r) * 0.03, 0, 1).toFixed(2);
    // Scheme change if fit is poor for a struggling coach [EST]
    if (fit < 0.35 && s.winPct < 0.45 && r() < 0.35) {
      const best = Object.keys(OFF_SCHEMES).map((k) => [k, schemeFit({ ...c, offScheme: k }, ros)]).sort((a, b) => b[1] - a[1])[0][0];
      if (best !== c.offScheme) { ev.push({ type: "scheme", text: c.name + " shifts offense to " + best }); c.offScheme = best; }
    }
    // Coordinator poaching [DATA]: most new NFL HCs (~70–80%) are hired from coordinator jobs; successful staffs get raided.
    ["oc", "dc"].forEach((k) => {
      if (c[k] && r() < 0.05 + Math.max(0, s.winPct - 0.55) * 0.6 + (s.playoff && s.playoff !== "none" ? 0.1 : 0)) {
        ev.push({ type: "poached", text: (k === "oc" ? "OC" : "DC") + " hired away as a head coach" });
        c[k] = createCoordinator(k === "oc" ? "O" : "D", Math.floor(r() * 1e9));
      } else if (c[k]) { c[k].age++; c[k].rating = clamp(c[k].rating + Math.round(gauss(r) * 2 + 1), 40, 99); }
    });
    c.contractYears--;
    c.hotSeat = hotSeat({ ...c, tenure: coach.tenure, hotSeat: coach.hotSeat }, s);
    let status = "stays";
    if (r() < fireProbability(c.hotSeat)) status = "fired";
    else if (c.age >= 68 && r() < 0.35) status = "retired";
    else if (c.hotSeat < 25 && (c.contractYears <= 1 || s.playoff === "champion")) { status = "extended"; c.contractYears += 4; }
    else if (c.contractYears <= 0) { status = c.hotSeat < 50 ? "extended" : "fired"; if (status === "extended") c.contractYears = 3; }
    if (status !== "stays") ev.push({ type: status, text: c.name + " " + ({ fired: "fired", retired: "retires", extended: "signs extension" })[status] });
    c.history.push({ winPct: +s.winPct.toFixed(3), playoff: s.playoff || "none", hotSeat: c.hotSeat, fit, ovr: c.ovr });
    return { coach: c, status, events: ev };
  }


  const FIRST = ["Marcus","Elena","Derek","Priya","Jamal","Cole","Ava","Hector","Naomi","Bryce","Sofia","Andre","Quinn","Iris","Malik","Tess","Owen","Ravi","Claire","Devin","Lucia","Grant","Yuna","Felix","Nora","Kai","Amira","Seth","Vera","Jonah","Pilar","Reese"];
  const LAST = ["Callahan","Nguyen","Brooks","Okoye","Vega","Harlan","Singh","Morales","Whitaker","Cho","Brennan","Patel","Drummond","Ibarra","Frost","Kline","Sato","Donovan","Ali","Mercer","Ruiz","Pace","Choi","Barrett","Larsen","Dupont","Shah","Keane","Ortega","Bloom"];
  const STYLES = ["West Coast","Air Raid","Shanahan Zone","Spread Option","Power Run","Pro-Style","Aggressive","Culture-first","QB whisperer","Defensive-minded"];

  /** Generate a free-agent HC pool for the coaching carousel. */
  function generateCoachPool(n, seed) {
    n = n || 24;
    const r = rngFrom(hash("pool:" + (seed || 1)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const name = FIRST[Math.floor(r() * FIRST.length)] + " " + LAST[Math.floor(r() * LAST.length)];
      const id = "fa_hc_" + hash(name + ":" + seed + ":" + i).toString(36);
      const ovr = Math.round(clamp(68 + r() * 22 + gauss(r) * 3, 62, 92));
      const style = STYLES[Math.floor(r() * STYLES.length)];
      const age = Math.round(38 + r() * 28);
      out.push(createCoach({ id, name, ovr, style, age }, { seed: hash(id) }));
    }
    return out;
  }

  /** Coaches in the FA pool not currently employed (by id). employed = array of coach objects or ids. */
  function availableCoaches(employed, pool) {
    const used = new Set((employed || []).map((c) => (c && c.id) ? c.id : c).filter(Boolean));
    const src = pool || [];
    return src.filter((c) => c && !used.has(c.id)).sort((a, b) => b.ovr - a.ovr);
  }

  const api = { OFF_SCHEMES, DEF_SCHEMES, RANGES, LEAGUE, createCoach, createCoordinator, generateCoachPool, availableCoaches, schemeFit, schemeBonus, teamPowerBonus, ownerExpectation, hotSeat, fireProbability, evolveSeason, rngFrom, hash };
  root.AFACoaches = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
