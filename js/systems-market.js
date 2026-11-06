/**
 * AFASystems.market — research-backed trade market value
 * Replaces app.js flat playerTradeValue / pickTradeValue formulas.
 * Does NOT patch app.js; call from hooks described in INTEGRATION.md.
 */
(function (root) {
  "use strict";

  function getData() {
    const pack = root.AFASystemsData || (typeof require !== "undefined" ? require("./systems-data-bundle.js") : null);
    if (!pack) throw new Error("AFASystemsData missing — load systems/data-bundle.js first");
    return pack;
  }

  function resolveGrade(player) {
    if (!player) return 60;
    if (typeof root.AFAGrading === "object" && root.AFAGrading && typeof root.AFAGrading.gradePlayer === "function") {
      try {
        const g = root.AFAGrading.gradePlayer(player);
        if (g && (g.overall != null || g.ovr != null)) return Number(g.overall != null ? g.overall : g.ovr);
      } catch (e) { /* grading optional */ }
    }
    if (player.grade != null && player.grade.overall != null) return Number(player.grade.overall);
    if (player.overall != null) return Number(player.overall);
    return Number(player.ovr) || 60;
  }

  /** Position-specific age curve multipliers (peak windows differ by pos). */
  function ageCurveByPos(pos, age) {
    const a = Number(age) || 27;
    const curves = {
      QB: [[23, 1.12], [26, 1.18], [29, 1.15], [32, 1.05], [35, 0.88], [38, 0.7], [99, 0.5]],
      RB: [[22, 1.15], [24, 1.1], [26, 0.95], [28, 0.75], [30, 0.55], [99, 0.35]],
      WR: [[23, 1.14], [26, 1.12], [29, 1.0], [31, 0.85], [33, 0.65], [99, 0.45]],
      TE: [[23, 1.08], [26, 1.12], [29, 1.05], [32, 0.9], [35, 0.7], [99, 0.5]],
      OT: [[23, 1.1], [26, 1.12], [29, 1.05], [32, 0.92], [35, 0.72], [99, 0.5]],
      OG: [[23, 1.08], [27, 1.1], [30, 1.0], [33, 0.85], [99, 0.55]],
      C:  [[23, 1.05], [27, 1.1], [30, 1.02], [33, 0.88], [99, 0.55]],
      DE: [[23, 1.14], [26, 1.12], [29, 1.0], [32, 0.82], [35, 0.6], [99, 0.4]],
      DT: [[23, 1.1], [27, 1.1], [30, 0.95], [33, 0.75], [99, 0.5]],
      LB: [[23, 1.12], [26, 1.08], [29, 0.95], [32, 0.75], [99, 0.5]],
      CB: [[22, 1.15], [25, 1.12], [28, 0.98], [30, 0.8], [33, 0.55], [99, 0.4]],
      S:  [[23, 1.12], [26, 1.08], [29, 0.95], [32, 0.78], [99, 0.5]],
      K:  [[25, 1.05], [30, 1.08], [35, 1.0], [99, 0.85]],
      P:  [[25, 1.05], [30, 1.08], [35, 1.0], [99, 0.85]]
    };
    const table = curves[pos] || curves.WR;
    for (let i = 0; i < table.length; i++) {
      if (a <= table[i][0]) return table[i][1];
    }
    return table[table.length - 1][1];
  }

  function gradeToTier(o) {
    // Keeps Madden-like magnitude so existing analyzer greed thresholds still feel right
    if (o >= 97) return 180 + (o - 97) * 35;
    if (o >= 94) return 130 + (o - 94) * 16;
    if (o >= 90) return 95 + (o - 90) * 8;
    if (o >= 85) return 62 + (o - 85) * 6;
    if (o >= 80) return 40 + (o - 80) * 4;
    if (o >= 75) return 26 + (o - 75) * 2.5;
    if (o >= 70) return 16 + (o - 70) * 1.8;
    return Math.max(4, o * 0.18);
  }

  function marketWeight(pos) {
    const data = getData()["positional-market-2025"];
    const scarcity = (data.scarcityIndex && data.scarcityIndex[pos]) || 1;
    const row = data.positions[pos];
    if (!row) return scarcity;
    // Blend scarcity with relative top-5 APY vs QB top-5
    const qb = data.positions.QB.top5Avg || 56000000;
    const rel = (row.top5Avg || row.topApy || qb) / qb;
    // Map relative APY into ~0.45–1.4 band, then average with scarcity
    const apyMul = 0.45 + Math.min(1.0, rel) * 0.95;
    return (scarcity * 0.55 + apyMul * 0.45);
  }

  /**
   * Performance market value in $APY terms from grade + positional market.
   * Elite (~99) ≈ topApy; ~90 ≈ top10; ~80 ≈ ~35% of top5; etc.
   */
  function performanceApy(player) {
    const data = getData()["positional-market-2025"];
    const pos = player.pos || "WR";
    const row = data.positions[pos] || data.positions.WR;
    const g = resolveGrade(player);
    let frac;
    if (g >= 97) frac = 0.95 + (g - 97) * 0.025;
    else if (g >= 94) frac = 0.82 + (g - 94) * 0.04;
    else if (g >= 90) frac = 0.62 + (g - 90) * 0.05;
    else if (g >= 85) frac = 0.42 + (g - 85) * 0.04;
    else if (g >= 80) frac = 0.28 + (g - 80) * 0.028;
    else if (g >= 75) frac = 0.18 + (g - 75) * 0.02;
    else if (g >= 70) frac = 0.12 + (g - 70) * 0.012;
    else frac = Math.max(0.04, g / 700);
    const anchor = row.top5Avg || row.topApy;
    return Math.round(anchor * frac);
  }

  /**
   * Expected contract shape on player (optional until accuracy pass adds contracts):
   *   player.contract = { apy, capHit, yearsRemaining, totalValue?, signingBonus? }
   * Surplus = performanceApy - capHit (or apy), scaled by years remaining.
   */
  function contractSurplusValue(player) {
    const c = player && player.contract;
    if (!c) return 0;
    const perf = performanceApy(player);
    const hit = Number(c.capHit != null ? c.capHit : c.apy) || 0;
    const years = Math.max(0, Number(c.yearsRemaining != null ? c.yearsRemaining : c.years) || 0);
    const annualSurplus = perf - hit;
    // Convert $ surplus into trade-value units (~$1M ≈ 1.1 TV at the top)
    const tvPerMillion = 1.15;
    return (annualSurplus / 1e6) * tvPerMillion * Math.min(4, years);
  }

  function teamNeedMultiplier(player, teamContext) {
    if (!teamContext) return 1;
    // teamContext: { needScoreByPos: {QB:0..1,...}, rosterCounts?, starterNeed? }
    const needMap = teamContext.needScoreByPos || teamContext.needs || null;
    if (needMap && player.pos != null && needMap[player.pos] != null) {
      const n = Number(needMap[player.pos]);
      // 0 = set, 1 = desperate starter hole
      return 0.85 + Math.max(0, Math.min(1, n)) * 0.45;
    }
    if (typeof teamContext.positionalNeedBonus === "number") {
      return 1 + teamContext.positionalNeedBonus;
    }
    return 1;
  }

  /**
   * Primary API — replaces playerTradeValue(p)
   * opts.teamContext optional need overlay
   */
  function playerMarketValue(player, opts) {
    opts = opts || {};
    if (!player) return 0;
    const g = resolveGrade(player);
    const tier = gradeToTier(g);
    const ageMul = ageCurveByPos(player.pos, player.age);
    const mkt = marketWeight(player.pos);
    const needMul = teamNeedMultiplier(player, opts.teamContext);
    let v = tier * mkt * ageMul * needMul;
    const surplus = contractSurplusValue(player);
    // Surplus adds/subtracts; cheap young stars climb, expensive declining vets fall
    v += surplus;
    if (opts.detail) {
      return {
        value: Math.max(0, Math.round(v)),
        grade: g,
        tier: Math.round(tier * 10) / 10,
        ageMul: Math.round(ageMul * 1000) / 1000,
        marketWeight: Math.round(mkt * 1000) / 1000,
        needMul: Math.round(needMul * 1000) / 1000,
        contractSurplus: Math.round(surplus * 10) / 10,
        performanceApy: performanceApy(player)
      };
    }
    return Math.max(0, Math.round(v));
  }

  function pickChartValue(overall) {
    const chart = getData()["draft-pick-chart"];
    const o = Math.max(1, Math.min(256, Number(overall) || 1));
    const raw = chart.byOverall[String(o)];
    if (raw != null) return raw;
    // beyond 256
    return Math.max(50, 190 - (o - 256) * 2);
  }

  function roundToOverall(round, slotInRound) {
    const r = Math.max(1, Math.min(7, Number(round) || 1));
    const s = Math.max(1, Math.min(32, Number(slotInRound) || 16));
    return (r - 1) * 32 + s;
  }

  /**
   * Replace pickTradeValue(pk)
   * pk: { round, year, overall?, slot?, originalTeamId? }
   * opts: { currentYear, standingsIndex (0=worst), scaleToMadden (default true) }
   *
   * Legacy app.js PICK_CHART used ~120 for current 1st. F-S uses 3000 for #1.
   * scaleToMadden maps F-S → legacy-ish units via / 25 (3000→120).
   */
  function pickMarketValue(pk, opts) {
    opts = opts || {};
    if (!pk) return 0;
    const chart = getData()["draft-pick-chart"];
    const currentYear = opts.currentYear != null ? opts.currentYear : (pk.currentYear || 2027);
    const year = Number(pk.year) || currentYear;
    const out = Math.max(0, Math.min(2, year - currentYear));
    let overall = pk.overall != null ? Number(pk.overall) : null;
    if (overall == null) {
      const mid = chart.roundMedianOverall[pk.round] || ((Number(pk.round) - 1) * 32 + 16);
      // Optional standings nudge: worse team → earlier pick
      if (opts.standingsIndex != null && pk.round) {
        const idx = Math.max(0, Math.min(31, Number(opts.standingsIndex)));
        overall = (Number(pk.round) - 1) * 32 + (idx + 1);
      } else {
        overall = mid;
      }
    }
    let fs = pickChartValue(overall);
    const disc = chart.meta.futureYearDiscount;
    const mult = out === 0 ? disc.year0 : out === 1 ? disc.year1 : disc.year2;
    fs *= mult;
    const scale = opts.scaleToMadden === false ? 1 : (1 / 25);
    let v = fs * scale;
    return Math.max(1, Math.round(v));
  }

  /**
   * Convenience: value both sides of a trade package.
   */
  function packageValue(players, picks, opts) {
    opts = opts || {};
    const pv = (players || []).reduce((s, p) => s + playerMarketValue(p, opts), 0);
    const kv = (picks || []).reduce((s, pk) => s + pickMarketValue(pk, opts), 0);
    return { players: pv, picks: kv, total: pv + kv };
  }

  const api = {
    resolveGrade,
    ageCurveByPos,
    performanceApy,
    contractSurplusValue,
    marketWeight,
    playerMarketValue,
    playerTradeValue: playerMarketValue, // alias for drop-in
    pickMarketValue,
    pickTradeValue: pickMarketValue,
    pickChartValue,
    packageValue,
    roundToOverall,
    REFERENCE_CAP_2025: 279200000,
    REFERENCE_CAP_2026: 301200000
  };

  root.AFASystems = root.AFASystems || {};
  root.AFASystems.market = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
