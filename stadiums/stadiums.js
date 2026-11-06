/* AFA Stadiums — core model (no DOM). window.AFAStadiums / module.exports.
   References:
   - Crowd noise record 142.2 dB, Arrowhead Stadium, 29 Sep 2014 (Guinness World Records "Loudest crowd roar at a sports stadium").
   - CenturyLink/Lumen Field 137.6 dB (Dec 2013, prior Guinness record). Typical loud NFL crowds ~100-115 dB.
   - NFL home-field advantage: ~2.5-3 pts historically (1990s-2010s), ~1.5-2 pts recent seasons, ~0 in 2020 empty stadiums
     (e.g. FiveThirtyEight/ESPN analyses, Ben Baldwin/nflfastR studies). Model caps HFA at 3.0 pts.
   - NFL false starts: roughly 1-1.5 per team per game (~60-65 offensive snaps) -> ~1.5-2.5% per snap baseline. (approximate) */
(function (root) {
  const DATA = root.AFAStadiumData || (typeof require !== "undefined" ? require("./stadium-data.json") : null);
  const BY_ID = {}; DATA.teams.forEach((t) => { BY_ID[t.id] = t; });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const ROOFS = { open: { label: "Open air", noise: 0, cost: 0, weatherShield: 0 },
    retractable: { label: "Retractable", noise: 3, cost: 450e6, weatherShield: 0.9 },
    dome: { label: "Dome", noise: 5, cost: 300e6, weatherShield: 1 } };
  const BOWLS = { horseshoe: { label: "Horseshoe (open end)", noise: -1.5, capMult: 0.95 },
    bowl: { label: "Full bowl", noise: 1.5, capMult: 1.0 },
    steep: { label: "Steep stacked tiers", noise: 3.5, capMult: 0.97 } };
  const SURFACES = { grass: { label: "Natural grass", hype: 0.01 }, turf: { label: "Synthetic turf", hype: 0 }, hybrid: { label: "Hybrid", hype: 0.015 } };
  const BOARDS = { basic: { label: "Basic", hype: 0, noise: 0, rev: 0 }, hd: { label: "HD board", hype: 0.03, noise: 0.5, rev: 2e6 }, mega: { label: "Mega halo board", hype: 0.06, noise: 1, rev: 5e6 } };

  // Upgrade tree. tier gating via revenue; req = prerequisite ids. Built in offseason (buildSeasons).
  const UPGRADES = [
    { id: "cap1", cat: "Capacity", name: "Upper-deck expansion I", cost: 60e6, build: 1, tier: 1, fx: { capacity: 5000 } },
    { id: "cap2", cat: "Capacity", name: "Upper-deck expansion II", cost: 110e6, build: 1, tier: 2, req: ["cap1"], fx: { capacity: 7500 } },
    { id: "cap3", cat: "Capacity", name: "End-zone mega deck", cost: 200e6, build: 2, tier: 3, req: ["cap2"], fx: { capacity: 10000, noise: 0.5 } },
    { id: "con1", cat: "Amenities", name: "Concourse concessions", cost: 15e6, build: 1, tier: 1, fx: { perCap: 4, demand: 0.01 } },
    { id: "con2", cat: "Amenities", name: "Local food hall & bars", cost: 35e6, build: 1, tier: 2, req: ["con1"], fx: { perCap: 7, demand: 0.02 } },
    { id: "fx1", cat: "Fan experience", name: "HD video board", cost: 25e6, build: 1, tier: 1, fx: { board: "hd" } },
    { id: "fx2", cat: "Fan experience", name: "Mega halo board", cost: 70e6, build: 1, tier: 3, req: ["fx1"], fx: { board: "mega" } },
    { id: "snd", cat: "Fan experience", name: "Concert-grade sound system", cost: 12e6, build: 1, tier: 1, fx: { noise: 1, demand: 0.01 } },
    { id: "tail", cat: "Fan experience", name: "Tailgate village", cost: 10e6, build: 1, tier: 1, fx: { demand: 0.03, hype: 0.02 } },
    { id: "club1", cat: "Premium", name: "Club seats (+3,000)", cost: 40e6, build: 1, tier: 2, fx: { club: 3000 } },
    { id: "ste1", cat: "Premium", name: "Luxury suites (+40)", cost: 55e6, build: 1, tier: 2, fx: { suites: 40 } },
    { id: "ste2", cat: "Premium", name: "Field-level suites (+30)", cost: 90e6, build: 2, tier: 3, req: ["ste1"], fx: { suites: 30, faAppeal: 2 } },
    { id: "plaza", cat: "Revenue", name: "Entertainment plaza", cost: 80e6, build: 2, tier: 3, fx: { flatRev: 9e6, demand: 0.02 } },
    { id: "train", cat: "Revenue", name: "Training facility & lounge", cost: 45e6, build: 1, tier: 2, fx: { faAppeal: 4 } },
    { id: "roofR", cat: "Structure", name: "Convert to retractable roof", cost: 450e6, build: 2, tier: 4, fx: { roof: "retractable" } },
    { id: "roofD", cat: "Structure", name: "Enclose as dome", cost: 300e6, build: 2, tier: 4, fx: { roof: "dome" } }
  ];
  // Revenue gating: annual revenue (USD) thresholds that unlock each tier, plus a win/fan "momentum" bonus.
  const TIER_REVENUE = { 1: 0, 2: 120e6, 3: 170e6, 4: 230e6 };

  function cityData(teamId) { return BY_ID[teamId]; }

  function defaultStadium(teamId, name) {
    const c = BY_ID[teamId];
    return { teamId, name: name || "AFA Field", namingRights: false, roof: c.climateCold > 0.8 ? "dome" : "open", bowl: "bowl",
      surface: "grass", board: "basic", suites: Math.round(30 + 50 * c.marketNorm), clubSeats: Math.round((2000 + 4000 * c.marketNorm) / 100) * 100, ticketPrice: 85, baseCapacity: c.baseCapacity,
      addedCapacity: 0, built: [], pending: [], cash: 40e6, seasons: [], fanGrowth: 0 };
  }

  function fxSum(s, key) { return (s.built || []).reduce((t, id) => { const u = UPGRADES.find((x) => x.id === id); return t + ((u && u.fx[key]) || 0); }, 0); }

  // seats removed: each suite ~ 40 GA seats, each club seat 0.25 GA seat (wider seats/lounges)
  function capacity(s) {
    const raw = (s.baseCapacity + (s.addedCapacity || 0) + fxSum(s, "capacity")) * BOWLS[s.bowl].capMult;
    const cap = raw - (s.suites + fxSum(s, "suites")) * 40 - (s.clubSeats + fxSum(s, "club")) * 0.25;
    return Math.round(clamp(cap, 40000, 115000));
  }

  /* ctx: { winPct (0..1, season so far, default .5), hype (-1..1), week (1-17), rival (bool), stakes (0..1), weatherRoll (0..1) } */
  function attendanceLegacy(s, ctx) {
    ctx = ctx || {};
    const c = BY_ID[s.teamId]; const cap = capacity(s);
    const natural = c.baseCapacity * 0.97 * (1 + (s.fanGrowth || 0));               // seats the market fills at par
    const success = 0.75 + 0.45 * clamp(ctx.winPct == null ? 0.5 : ctx.winPct, 0, 1);   // 0.75 .. 1.20
    const hype = 1 + 0.12 * clamp(ctx.hype || 0, -1, 1) + BOARDS[s.board].hype + SURFACES[s.surface].hype + fxSum(s, "hype");
    const price = Math.pow(clamp(s.ticketPrice, 20, 400) / 85, -0.55);                 // elasticity ~ -0.55
    const late = clamp(((ctx.week || 1) - 10) / 7, 0, 1);
    const roof = ROOFS[s.roof];
    const weather = 1 - (1 - roof.weatherShield) * (0.12 * c.climateCold * late + 0.05 * c.climateHeatRain * (ctx.weatherRoll == null ? 0.5 : ctx.weatherRoll));
    const amen = 1 + fxSum(s, "demand") + (roof.weatherShield ? 0.02 : 0);
    const rival = ctx.rival ? 1.08 : 1;
    const demand = natural * success * hype * price * weather * amen * rival;
    const att = Math.round(clamp(demand, cap * 0.35, cap));
    return { attendance: att, capacity: cap, fill: att / cap, demand: Math.round(demand), emptySeats: cap - att };
  }

  function gameRevenue(s, att) {
    const perCap = 18 + fxSum(s, "perCap");
    return att.attendance * s.ticketPrice + att.attendance * perCap;
  }
  function seasonRevenue(s, ctx) {
    ctx = ctx || {}; const c = BY_ID[s.teamId];
    let gate = 0, games = 8, totAtt = 0;
    for (let w = 1; w <= games; w++) { const a = attendance(s, Object.assign({}, ctx, { week: w * 2 })); gate += gameRevenue(s, a); totAtt += a.attendance; }
    const suites = (s.suites + fxSum(s, "suites")) * (180000 + 220000 * c.marketNorm);
    const club = (s.clubSeats + fxSum(s, "club")) * (s.prices ? s.prices.club * clubSellRate(s, ctx.winPct) : s.ticketPrice * 2.2) * games;
    const naming = s.namingRights ? 3e6 + 9e6 * c.marketNorm : 0;
    const board = BOARDS[s.board].rev, flat = fxSum(s, "flatRev");
    const media = 60e6; // league-shared TV (flat, game assumption)
    const total = gate + suites + club + naming + board + flat + media;
    return { gate: Math.round(gate), suites: Math.round(suites), club: Math.round(club), naming: Math.round(naming), other: board + flat, media, total: Math.round(total), avgAttendance: Math.round(totAtt / games) };
  }

  /* ---- Crowd noise ---- ctx: {attendance obj or ctx for attendance, stakes 0..1, margin (home-away pts), rival} */
  const NOISE_RECORD = 142.2;
  function noiseDb(s, ctx) {
    ctx = ctx || {};
    const a = ctx.att || attendance(s, ctx);
    const size = 0.8 + 0.2 * clamp(a.attendance / 80000, 0, 1);
    let db = 88 + 22 * Math.pow(a.fill, 1.3) * size;              // full 80k open bowl ~110
    db += ROOFS[s.roof].noise + BOWLS[s.bowl].noise + BOARDS[s.board].noise + fxSum(s, "noise");
    db += 4 * clamp(ctx.stakes || 0, 0, 1) + (ctx.rival ? 2 : 0);
    const m = ctx.margin == null ? 0 : ctx.margin;                 // close games loud; blowouts quiet
    db += m <= -17 ? -6 : m >= 21 ? -2 : Math.abs(m) <= 8 ? 3 : 0;
    return Math.round(clamp(db, 75, NOISE_RECORD) * 10) / 10;
  }
  // noise index 0 at <=100 dB, 1 at >=130 dB
  function noiseIndex(db) { return clamp((db - 100) / 30, 0, 1); }

  const CAPS = { hfaMax: 3.0, falseStartMax: 0.032 };
  function noiseEffects(db) {
    const n = noiseIndex(db);
    return {
      db, index: Math.round(n * 1000) / 1000,
      falseStartProb: Math.min(CAPS.falseStartMax, 0.014 + 0.018 * n),   // per visiting offensive snap
      delayOfGameProb: 0.004 + 0.006 * n,                                  // per visiting snap (silent count)
      botchedAudibleProb: 0.06 * n,                                        // chance an audible fails
      qbPreSnapAdjust: 1 - 0.25 * n,                                       // multiplier on visiting QB adjustments
      hfaPoints: Math.min(CAPS.hfaMax, 0.8 + 1.6 * n + (n > 0.8 ? 0.6 * (n - 0.8) / 0.2 : 0))
    };
  }

  /* One-call hook for the game sim. Returns points to add to home expectation and expected visitor penalties. */
  function gameDay(s, ctx) {
    const att = attendance(s, ctx);
    const db = noiseDb(s, Object.assign({}, ctx, { att }));
    const fx = noiseEffects(db);
    const snaps = 62;
    return { attendance: att, revenue: Math.round(gameRevenue(s, att)), noise: fx,
      expVisitorFalseStarts: +(fx.falseStartProb * snaps).toFixed(2), expVisitorDelays: +(fx.delayOfGameProb * snaps).toFixed(2), homePoints: fx.hfaPoints };
  }
  // Seeded penalty roll (rng optional, default Math.random)
  function rollVisitorPenalties(fx, snaps, rng) {
    rng = rng || Math.random; let fs = 0, dg = 0;
    for (let i = 0; i < (snaps || 62); i++) { if (rng() < fx.falseStartProb) fs++; else if (rng() < fx.delayOfGameProb) dg++; }
    return { falseStarts: fs, delays: dg, yards: fs * 5 + dg * 5 };
  }

  /* ---- Upgrades & gating ---- */
  function unlockedTier(s, revenue, winPct) {
    const momentum = clamp(((winPct == null ? 0.5 : winPct) - 0.5) * 2, -1, 1) * 15e6 + (s.fanGrowth || 0) * 100e6 + (s.fans ? (s.fans.loyalty - 50) * 0.3e6 : 0);
    const r = revenue + momentum; let t = 1;
    [2, 3, 4].forEach((k) => { if (r >= TIER_REVENUE[k]) t = k; });
    return t;
  }
  function availableUpgrades(s, revenue, winPct) {
    const tier = unlockedTier(s, revenue, winPct);
    return UPGRADES.map((u) => {
      const done = s.built.includes(u.id) || s.pending.some((p) => p.id === u.id);
      const reqOk = (u.req || []).every((r) => s.built.includes(r));
      const roofDone = (u.id === "roofR" || u.id === "roofD") && s.roof !== "open";
      let reason = null;
      if (done) reason = "Built/in progress"; else if (roofDone) reason = "Roof already enclosed";
      else if (u.tier > tier) reason = "Locked: tier " + u.tier + " needs $" + (TIER_REVENUE[u.tier] / 1e6) + "M revenue";
      else if (!reqOk) reason = "Requires " + u.req.join(", "); else if (u.cost > s.cash) reason = "Insufficient cash";
      return Object.assign({}, u, { ok: !reason, reason });
    });
  }
  function startUpgrade(s, id, revenue, winPct) {
    const u = availableUpgrades(s, revenue, winPct).find((x) => x.id === id);
    if (!u || !u.ok) return { ok: false, reason: u ? u.reason : "Unknown" };
    s.cash -= u.cost; s.pending.push({ id, left: u.build }); return { ok: true };
  }
  function applyFx(s, u) { if (u.fx.board) s.board = u.fx.board; if (u.fx.roof) s.roof = u.fx.roof; }
  // Call once per offseason after a season: banks profit, advances construction, grows fan base.
  function endSeason(s, summary) {
    summary = summary || {}; const winPct = summary.winPct == null ? 0.5 : summary.winPct;
    if (summary.fanOffseason !== false) fanOffseason(s, summary);
    const rev = seasonRevenue(s, { winPct }).total;
    const ops = 70e6 + capacity(s) * 400;                         // stadium + team ops not covered by payroll (game assumption)
    const profit = rev - ops; s.cash = Math.max(0, s.cash + profit * 0.6);
    if (!s.fans) s.fanGrowth = clamp((s.fanGrowth || 0) + (winPct - 0.5) * 0.06 + (summary.playoffs ? 0.02 : 0), -0.1, 0.15);
    s.pending.forEach((p) => { p.left--; if (p.left <= 0) { s.built.push(p.id); applyFx(s, UPGRADES.find((u) => u.id === p.id)); if (s.fans) { s.fans.lastUpgradeYear = s.fans.year + 1; fanEvent(s, "upgradeCompleted", { id: p.id }); } } });
    s.pending = s.pending.filter((p) => p.left > 0);
    s.seasons.push({ revenue: Math.round(rev), profit: Math.round(profit), winPct, avgAtt: seasonRevenue(s, { winPct }).avgAttendance });
    return { revenue: rev, profit, cash: s.cash };
  }
  function faAppeal(s) { return clamp(fxSum(s, "faAppeal") + (s.roof !== "open" ? 1 : 0) + (s.board === "mega" ? 1 : 0), 0, 8); }

  /* CPU AI: personalities by market. Picks affordable upgrades by weighted priority, keeps a cash reserve. */
  function cpuPersonality(teamId) {
    const c = BY_ID[teamId];
    if (c.marketNorm > 0.7) return "bigspender";
    if (c.collegeFootball >= 0.7) return "fanfirst";
    if (c.marketNorm < 0.35) return "frugal";
    return "balanced";
  }
  const PRIO = { bigspender: { Capacity: 3, Premium: 4, Revenue: 3, "Fan experience": 2, Amenities: 2, Structure: 2 },
    fanfirst: { Capacity: 4, Premium: 1, Revenue: 1, "Fan experience": 4, Amenities: 3, Structure: 1 },
    frugal: { Capacity: 0.5, Premium: 2, Revenue: 3, "Fan experience": 2, Amenities: 3, Structure: 0.3 },
    balanced: { Capacity: 2, Premium: 2, Revenue: 2, "Fan experience": 2, Amenities: 2, Structure: 1 } };
  function cpuOffseason(s, summary, rng) {
    rng = rng || Math.random; const p = cpuPersonality(s.teamId); const winPct = (summary && summary.winPct) || 0.5;
    const rev = seasonRevenue(s, { winPct }).total; const reserve = p === "frugal" ? 0.5 : p === "bigspender" ? 0.15 : 0.3;
    cpuPricing(s, winPct);
    if (s.fans && s.cash > 5e6) {
      if (s.fans.loyalty < 45 || (winPct >= 0.5 && s.fans.loyalty < 58))
        investCommunity(s, s.cash > 60e6 ? 3e6 : (winPct >= 0.5 ? 2e6 : 1e6));
    }
    const a = attendance(s, { winPct }); const picks = [];
    for (let i = 0; i < 3; i++) {
      const opts = availableUpgrades(s, rev, winPct).filter((u) => u.ok && u.cost <= s.cash * (1 - reserve));
      if (!opts.length) break;
      const scored = opts.map((u) => {
        let w = PRIO[p][u.cat] || 1;
        if (u.cat === "Capacity") w *= a.fill > 0.97 ? 1.6 : 0.2;      // only expand if selling out
        if (u.cat === "Structure") w *= BY_ID[s.teamId].climateCold;
        if (winPct > 0.6) w *= 1.2;
        return { u, w: w * (0.8 + 0.4 * rng()) / Math.sqrt(u.cost / 1e7) };
      }).sort((x, y) => y.w - x.w);
      startUpgrade(s, scored[0].u.id, rev, winPct); picks.push(scored[0].u.id);
    }
    return { personality: p, picks };
  }

  function leagueTable(stadiums, winPcts) {
    return Object.values(stadiums).map((s) => { const wp = (winPcts && winPcts[s.teamId]) || 0.5; const r = seasonRevenue(s, { winPct: wp });
      const a = attendance(s, { winPct: wp }); return { teamId: s.teamId, name: s.name, capacity: a.capacity, avgAtt: r.avgAttendance, fill: +(a.fill.toFixed(3)), revenue: r.total, noiseDb: noiseDb(s, { stakes: 0.5, margin: 3 }), roof: s.roof, upgrades: s.built.length, cash: Math.round(s.cash) }; })
      .sort((x, y) => y.revenue - x.revenue);
  }
  function initLeague(teamIds) { const o = {}; (teamIds || DATA.teams.map((t) => t.id)).forEach((id) => { o[id] = defaultStadium(id); }); return o; }

  /* =================== Fan economy (v2) ===================
     Segments: season-ticket holders (sth, renew yearly), casual pool (buy per game, price/success sensitive),
     bandwagon (appear when winning). One visible meter: fans.loyalty 0-100 (fan loyalty/satisfaction).
     Calibration: ESPN 2024 NFL home attendance avg 69,442 (range 58,649-92,972) -> healthy NFL clubs sell ~95-100% of seats
     (nfl-attendance-2024.json). Season-ticket renewal ~85-95% for healthy NFL clubs is an [ESTIMATE] from team-reported
     renewal figures in press coverage; not a league statistic. Median household income (Census ACS) was NOT fetchable
     without an API key, so price fair value uses MSA market score instead [ESTIMATE]. */
  const TIER_SHARE = { upper: 0.6, lower: 0.4 };
  const TIER_FAIR_MULT = { upper: 0.75, lower: 1.35, club: 2.6 };
  const FIX = {
    price: { action: "setFairPrices", label: "Lower prices to fair band" },
    losing: { action: "roster", label: "Win games: improve roster/coaching" },
    blowout: { action: "roster", label: "Win games: improve roster/coaching" },
    star: { action: "community", label: "Invest in community programs" },
    coach: { action: "community", label: "Invest in community programs" },
    stagnant: { action: "upgrades", label: "Build a stadium upgrade" },
    neglect: { action: "upgrades", label: "Build a stadium upgrade" },
    spiral: { action: "promotion", label: "Run a ticket promotion ($0.5M)" },
    weather: { action: "upgrades", label: "Add a roof (upgrade)" }
  };
  const REASON = { price: "High ticket prices", losing: "Losing", blowout: "Blowout home losses", star: "Traded/cut fan favorite",
    coach: "Coach firing churn", stagnant: "Stagnant stadium", neglect: "Owner neglect (hoarding cash, no investment)",
    spiral: "Empty-seat spiral", weather: "Bad weather in open stadium", win: "Winning", playoff: "Playoffs", rival: "Rivalry wins",
    fair: "Affordable tickets", community: "Community programs", upgrade: "Stadium upgrades", signing: "Star signing", promotion: "Promotions", drift: "Long-run recovery" };

  function ensureFans(s) {
    if (s.fans) return s.fans;
    const base = BY_ID[s.teamId].baseCapacity;
    s.fans = { sth: Math.round(base * 0.50), casual: Math.round(base * 0.65), bandwagon: Math.round(base * 0.15), loyalty: 64,
      year: 0, lastUpgradeYear: 0, lowFillGames: 0, communityThisYear: 0, drivers: {}, lastDrivers: {}, log: [], history: [], lastFill: null, winPct: 0.5 };
    if (!s.prices) { const f = fairPrices(s, 0.5); const k = s.ticketPrice ? s.ticketPrice / 85 : 1; s.prices = { upper: Math.round(f.upper.mid * k), lower: Math.round(f.lower.mid * k), club: Math.round(f.club.mid) }; }
    syncTicketPrice(s); return s.fans;
  }
  function avgGA(p) { return p.upper * TIER_SHARE.upper + p.lower * TIER_SHARE.lower; }
  function syncTicketPrice(s) {
    if (s._tp != null && s.ticketPrice !== s._tp && s._tp > 0) { const k = s.ticketPrice / s._tp; s.prices.upper = Math.round(s.prices.upper * k); s.prices.lower = Math.round(s.prices.lower * k); }
    s.ticketPrice = Math.round(avgGA(s.prices)); s._tp = s.ticketPrice;
  }
  /* Fair value = market price level x success x loyalty x stadium quality. Returns per-tier {low, mid, high} band (+/-12%). */
  function fairPrices(s, winPct) {
    const c = BY_ID[s.teamId]; const loy = s.fans ? s.fans.loyalty : 60; winPct = winPct == null ? (s.fans ? s.fans.winPct : 0.5) : winPct;
    const base = (55 + 50 * c.marketNorm) * (1 + 0.4 * (winPct - 0.5)) * (1 + 0.004 * (loy - 60)) * (1 + Math.min(0.25, 0.03 * (s.built || []).length)) * (s.roof !== "open" ? 1.05 : 1);
    const o = {}; Object.keys(TIER_FAIR_MULT).forEach((k) => { const m = base * TIER_FAIR_MULT[k]; o[k] = { low: Math.round(m * 0.88), mid: Math.round(m), high: Math.round(m * 1.12) }; });
    o.avgGA = Math.round(avgGA({ upper: o.upper.mid, lower: o.lower.mid })); return o;
  }
  function priceRatio(s, winPct) { const f = fairPrices(s, winPct); return avgGA(s.prices) / avgGA({ upper: f.upper.mid, lower: f.lower.mid }); }
  // price response: elasticity 1.0 when winning, up to 2.0 when losing (fans less tolerant)
  function priceFactor(r, winPct) { const e = 1.15 + 2.4 * Math.max(0, 0.5 - winPct); return Math.pow(clamp(r, 0.4, 3), -e); }
  function clubSellRate(s, winPct) { if (!s.prices) return 1; ensureFans(s); const f = fairPrices(s, winPct); return clamp(0.95 * priceFactor(s.prices.club / f.club.mid, winPct == null ? 0.5 : winPct) * (0.6 + 0.5 * s.fans.loyalty / 100), 0.2, 1); }

  function attendance(s, ctx) {
    ctx = ctx || {}; ensureFans(s); syncTicketPrice(s);
    const F = s.fans, c = BY_ID[s.teamId], cap = capacity(s);
    const wp = clamp(ctx.winPct == null ? F.winPct : ctx.winPct, 0, 1);
    const clubN = s.clubSeats + fxSum(s, "club"); const ga = Math.max(0, cap - clubN);
    const late = clamp(((ctx.week || 1) - 10) / 7, 0, 1); const roof = ROOFS[s.roof];
    const weather = 1 - (1 - roof.weatherShield) * (0.15 * c.climateCold * late + 0.06 * c.climateHeatRain * (ctx.weatherRoll == null ? 0.5 : ctx.weatherRoll));
    const hype = 1 + 0.12 * clamp(ctx.hype || 0, -1, 1) + BOARDS[s.board].hype + SURFACES[s.surface].hype + fxSum(s, "hype") + fxSum(s, "demand") + (roof.weatherShield ? 0.02 : 0);
    const rival = ctx.rival ? 1.1 : 1;
    // Success curve: .500 ~ mid-80s% demand before price; losers clearly softer; winners push sellouts
    const succ = 0.58 + 0.78 * wp; // .25→0.775, .50→0.97, .80→1.204
    // Soft loyalty floor for .500+ (keep fill playable) but don't force near-sellouts
    const loyEff = (wp >= 0.5) ? Math.max(F.loyalty, 52) : F.loyalty;
    const loyF = 0.58 + 0.62 * loyEff / 100; // loy64 → ~0.977
    const f = fairPrices(s, wp); let gaSold = Math.min(ga, F.sth); const tiers = {};
    const sthLeft = Math.max(0, F.sth - ga); // (rare) sth exceeding GA
    ["upper", "lower"].forEach((k) => {
      const seats = ga * TIER_SHARE[k], sthIn = Math.min(seats, F.sth * TIER_SHARE[k]);
      const pf = priceFactor(s.prices[k] / f[k].mid, wp);
      const cas = F.casual * TIER_SHARE[k] * 0.52 * pf * succ * loyF * weather * hype * rival;
      const bw = F.bandwagon * TIER_SHARE[k] * clamp((wp - 0.40) * 2.0, 0, 1.15) * pf * weather;
      const sold = Math.round(Math.min(seats, sthIn + cas + bw));
      tiers[k] = { seats: Math.round(seats), sold, demand: Math.round(sthIn + cas + bw), price: s.prices[k], fair: f[k] };
    });
    const clubSold = Math.round(clubN * clubSellRate(s, wp));
    tiers.club = { seats: clubN, sold: clubSold, price: s.prices.club, fair: f.club };
    const att = Math.max(Math.round(cap * 0.15), tiers.upper.sold + tiers.lower.sold + clubSold) - 0 * sthLeft;
    const demand = tiers.upper.demand + tiers.lower.demand + clubSold;
    return { attendance: Math.min(cap, att), capacity: cap, fill: Math.min(cap, att) / cap, demand, emptySeats: cap - Math.min(cap, att), tiers, loyalty: Math.round(F.loyalty), priceRatio: +priceRatio(s, wp).toFixed(3) };
  }

  /* Loyalty change with asymmetry: losses full strength (softened slightly by high loyalty), gains at 50% and slower near 100.
     Floor raised to 32 so small markets don't collapse to unplayable fill; winning clubs recover faster below 70. */
  function bump(s, key, delta) {
    const F = ensureFans(s);
    let d = delta < 0 ? delta * (1.15 - F.loyalty / 250) : delta * 0.6 * (1 - F.loyalty / 140) * (F.loyalty < 32 ? 1.55 : 1);
    // Winning (.500+) clubs with soft loyalty get amplified positive bumps (losses stay asymmetric)
    if (F.winPct >= 0.5 && F.loyalty < 70 && d > 0) d *= 1.65;
    F.loyalty = clamp(F.loyalty + d, 32, 100); F.drivers[key] = (F.drivers[key] || 0) + d; return d;
  }
  function fanEvent(s, type, p) {
    p = p || {}; ensureFans(s); const L = s.fans.log; let d = 0;
    if (type === "starTraded" || type === "starCut") d = bump(s, "star", -clamp(((p.ovr || 85) - 75) * 0.5, 3, 10));
    else if (type === "starSigned") d = bump(s, "signing", clamp(((p.ovr || 85) - 75) * 0.4, 1, 6));
    else if (type === "coachFired") d = bump(s, "coach", -4);
    else if (type === "promotion") { s.cash -= 0.5e6; d = bump(s, "promotion", 3); s.fans.lowFillGames = 0; }
    else if (type === "upgradeCompleted") d = bump(s, "upgrade", 6);
    L.push({ type, d: +d.toFixed(2), year: s.fans.year }); if (L.length > 30) L.shift();
    return { loyalty: Math.round(s.fans.loyalty), delta: d };
  }
  // Community programs: clear cost; +loyalty with diminishing returns (max ~+5 effective per season)
  function investCommunity(s, amount) {
    ensureFans(s); amount = Math.max(0, Math.min(amount || 1e6, s.cash)); if (!amount) return { ok: false, reason: "No cash" };
    const before = s.fans.communityThisYear; s.fans.communityThisYear += amount; s.cash -= amount;
    const eff = (x) => 10 * (1 - Math.exp(-x / 4e6)); const d = bump(s, "community", eff(s.fans.communityThisYear) - eff(before));
    return { ok: true, cost: amount, delta: d, loyalty: Math.round(s.fans.loyalty) };
  }
  function setPrices(s, prices) { ensureFans(s); Object.keys(prices || {}).forEach((k) => { if (prices[k] != null) s.prices[k] = Math.max(5, Math.round(prices[k])); }); s._tp = null; s.ticketPrice = Math.round(avgGA(s.prices)); s._tp = s.ticketPrice; return s.prices; }
  function setFairPrices(s, winPct) { const f = fairPrices(s, winPct); return setPrices(s, { upper: f.upper.mid, lower: f.lower.mid, club: f.club.mid }); }

  /* Call after every HOME game. r: {won, margin (home-away), rival, playoff, week, winPct} -> attendance & loyalty change */
  function recordHomeGame(s, r) {
    r = r || {}; const F = ensureFans(s); const wp = r.winPct == null ? F.winPct : r.winPct; F.winPct = wp;
    const att = attendance(s, { winPct: wp, week: r.week, rival: r.rival }); const before = F.loyalty;
    if (r.won) { bump(s, "win", 1.6); if (r.rival) bump(s, "rival", 2); if (r.playoff) bump(s, "playoff", 4); }
    else if (r.won === false) { bump(s, "losing", -0.8); if ((r.margin || 0) <= -21) bump(s, "blowout", -2); if (r.rival) bump(s, "losing", -1); }
    const pr = att.priceRatio;
    if (pr > 1.12) bump(s, "price", -Math.min(2, (pr - 1.12) * 4)); else if (pr < 0.97) bump(s, "fair", 0.6);
    if (att.fill < 0.8) { F.lowFillGames++; if (F.lowFillGames >= 3 && (F.drivers.spiral || 0) > -4) bump(s, "spiral", -1); } else F.lowFillGames = 0;
    const c = BY_ID[s.teamId]; if (s.roof === "open" && (r.week || 1) >= 12 && c.climateCold > 0.6) bump(s, "weather", -0.4 * c.climateCold);
    const prevFill = F.lastFill; F.lastFill = att.fill;
    F.history.push({ year: F.year, week: r.week || null, att: att.attendance, fill: +att.fill.toFixed(3), loyalty: +F.loyalty.toFixed(1) }); if (F.history.length > 200) F.history.shift();
    return Object.assign(att, { loyaltyDelta: +(F.loyalty - before).toFixed(2), fillDrop: prevFill != null ? +(prevFill - att.fill).toFixed(3) : 0 });
  }

  /* Offseason fan update (auto-called by endSeason). summary: {winPct, playoffs} */
  function fanOffseason(s, summary) {
    summary = summary || {}; const F = ensureFans(s), c = BY_ID[s.teamId], base = c.baseCapacity;
    const wp = summary.winPct == null ? F.winPct : summary.winPct; F.winPct = wp;
    F.streak = wp < 0.45 ? Math.min(-1, (F.streak || 0) - 1) : wp > 0.55 ? Math.max(1, (F.streak || 0) + 1) : 0;
    if (wp < 0.5) bump(s, "losing", -(0.5 - wp) * 20 - (F.streak <= -2 ? Math.min(6, 2 * (-F.streak - 1)) : 0)); else bump(s, "win", (wp - 0.5) * 30);
    if (summary.playoffs) bump(s, "playoff", 8);
    const yrs = F.year - F.lastUpgradeYear;
    if (yrs >= 4) bump(s, "stagnant", -2);
    if (yrs >= 5 && s.cash > 100e6 && (F.lastFill || 1) < 0.85) bump(s, "neglect", -4);
    const pr = priceRatio(s, wp);
    const renewal = clamp(0.81 + 0.0015 * F.loyalty + 0.1 * (wp - 0.5) - 0.3 * Math.max(0, pr - 1.05), 0.65, 0.97);
    const ga = capacity(s) - s.clubSeats - fxSum(s, "club");
    const newSth = renewal > 0.85 && pr < 1.1 ? F.casual * 0.07 * (F.loyalty / 60) : 0;
    F.sth = Math.round(clamp(F.sth * renewal + newSth, base * 0.25, ga * 0.75));
    F.casual = Math.round(clamp(F.casual * (1 + clamp(0.004 * (F.loyalty - 55), -0.1, 0.035)), base * 0.35, base * 1.1));
    F.bandwagon = Math.round(base * 0.15 * clamp(1 + (wp - 0.5) * 3 + (summary.playoffs ? 0.5 : 0), 0.2, 2.5));
    // Offseason loyalty drift. Losing seasons pull down harder than winning pulls up (asymmetry).
    // Deep soft-loyalty (.500+ and loyalty<55) gets a stronger recovery path so small markets rebound.
    let driftTarget = 62, driftRate = 0.1;
    if (wp < 0.35) { driftTarget = 42; driftRate = 0.2; }
    else if (wp < 0.5) { driftTarget = 52; driftRate = 0.12; }
    else if (F.loyalty < 55) { driftTarget = 78; driftRate = 0.28; }  // .500+ recovering from floor
    else if (F.loyalty < 70) { driftTarget = 72; driftRate = 0.11; }
    else { driftTarget = 68; driftRate = 0.08; }
    F.loyalty = clamp(F.loyalty + (driftTarget - F.loyalty) * driftRate, 32, 100); F.drivers.drift = (F.drivers.drift || 0);
    s.fanGrowth = clamp((F.sth + F.casual + F.bandwagon) / (base * 1.45) - 1, -0.3, 0.3);
    const rec = { year: F.year, renewal: +renewal.toFixed(3), sth: F.sth, casual: F.casual, bandwagon: F.bandwagon, loyalty: Math.round(F.loyalty), winPct: wp, priceRatio: +pr.toFixed(3) };
    F.seasons = (F.seasons || []).concat([rec]).slice(-40);
    F.lastDrivers = F.drivers; F.drivers = {}; F.communityThisYear = 0; F.year++;
    return rec;
  }

  /* Cause->effect: top 1-2 negative drivers with % share and a fix. */
  function diagnose(s) {
    const F = ensureFans(s); const src = Object.keys(F.drivers).length ? F.drivers : F.lastDrivers;
    const neg = Object.keys(src).filter((k) => src[k] < 0).map((k) => ({ key: k, v: -src[k] }));
    const tot = neg.reduce((a, b) => a + b.v, 0); const pr = priceRatio(s);
    if (pr > 1.12 && !neg.find((n) => n.key === "price")) { neg.push({ key: "price", v: tot * 0.3 || 1 }); }
    const T = neg.reduce((a, b) => a + b.v, 0);
    const top = neg.sort((a, b) => b.v - a.v).slice(0, 2).map((n) => ({ key: n.key, reason: REASON[n.key], pct: Math.round(100 * n.v / (T || 1)), fix: FIX[n.key] || FIX.star }));
    const att = attendance(s, {}); const alert = F.loyalty < 45 || att.fill < 0.85 || (F.lastFill != null && att.fill < 0.9);
    return { alert, loyalty: Math.round(F.loyalty), fill: +att.fill.toFixed(3), reasons: top,
      message: top.length ? "Fans are drifting: " + top.map((t) => t.reason + " (" + t.pct + "%)").join(", ") : "Fans are happy." };
  }
  function applyFix(s, action) {
    if (action === "setFairPrices") return setFairPrices(s);
    if (action === "promotion") return fanEvent(s, "promotion");
    if (action === "community") return investCommunity(s, 2e6);
    return { ok: false, note: action === "upgrades" ? "Open the Upgrades list" : "Improve the roster/coaching" };
  }

  /* CPU pricing AI: fair price, nudged up when selling out, down when seats empty; personality tweak. */
  function cpuPricing(s, winPct) {
    ensureFans(s); const f = fairPrices(s, winPct); const a = attendance(s, { winPct });
    const per = { bigspender: 1.04, fanfirst: 0.96, frugal: 1.0, balanced: 1.0 }[cpuPersonality(s.teamId)];
    const k = per * (a.fill > 0.99 ? 1.06 : a.fill < 0.85 ? 0.9 : 1) * (s.fans.loyalty < 35 ? 0.85 : 1);
    return setPrices(s, { upper: Math.round(f.upper.mid * k), lower: Math.round(f.lower.mid * k), club: Math.round(f.club.mid * k) });
  }

  /* Convenience: simulate a season of 8 home games for one stadium (tests / CPU teams without per-game hooks). */
  function simulateHomeSeason(s, o) {
    o = o || {}; const rng = o.rng || Math.random; const wp = o.winPct == null ? 0.5 : o.winPct; const out = [];
    for (let i = 0; i < 8; i++) { const won = rng() < wp; out.push(recordHomeGame(s, { won, margin: won ? 7 : (rng() < (o.blowoutRate || 0.2) ? -24 : -6), rival: i < 3, week: 1 + i * 2, winPct: wp })); }
    return out;
  }

  /* Dynasty sync. AFADynasty.endSeason calls AFAStadiums.onFanBaseChange(teamId,{fans,rep,year}) and reads .capacity. */
  let LEAGUE = null;
  function registerLeague(stadiums) { LEAGUE = stadiums; return LEAGUE; }
  function dynastyFans(s) { const F = ensureFans(s); return Math.round((F.sth + F.casual + F.bandwagon) / 1000); }
  function onFanBaseChange(teamId, d) {
    const s = LEAGUE && LEAGUE[teamId]; if (!s) return null; ensureFans(s); d = d || {};
    if (d.rep != null) s.fans.loyalty = clamp(s.fans.loyalty + (d.rep - 50) * 0.04, 32, 100);
    const a = attendance(s, {}); return { capacity: a.capacity, attendance: a.attendance, fill: a.fill, loyalty: Math.round(s.fans.loyalty), fansK: dynastyFans(s) };
  }

  const API = { DATA, ROOFS, BOWLS, SURFACES, BOARDS, UPGRADES, TIER_REVENUE, CAPS, NOISE_RECORD, cityData, defaultStadium, capacity, attendance,
    gameRevenue, seasonRevenue, noiseDb, noiseIndex, noiseEffects, gameDay, rollVisitorPenalties, unlockedTier, availableUpgrades,
    startUpgrade, endSeason, faAppeal, cpuPersonality, cpuOffseason, leagueTable, initLeague,
    attendanceLegacy, ensureFans, fairPrices, priceRatio, setPrices, setFairPrices, fanEvent, investCommunity, recordHomeGame, fanOffseason,
    diagnose, applyFix, cpuPricing, simulateHomeSeason, registerLeague, onFanBaseChange, dynastyFans, REASON, FIX };
  root.AFAStadiums = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
