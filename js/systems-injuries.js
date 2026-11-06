/**
 * AFASystems.injuries — seedable per-game probabilistic injury model
 */
(function (root) {
  "use strict";

  function getData() {
    const pack = root.AFASystemsData || (typeof require !== "undefined" ? require("./systems-data-bundle.js") : null);
    if (!pack) throw new Error("AFASystemsData missing — load systems/data-bundle.js first");
    return pack["injury-rates"];
  }

  /** Mulberry32 — deterministic, seedable. */
  function mulberry32(seed) {
    let t = (seed >>> 0) || 1;
    return function () {
      t |= 0;
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createRng(seed) {
    if (typeof seed === "function") return seed;
    if (seed == null) return mulberry32((Math.random() * 1e9) | 0);
    if (typeof seed === "string") return mulberry32(hashSeed(seed));
    return mulberry32(Number(seed) || 1);
  }

  function ageMult(age, data) {
    const a = Number(age) || 27;
    const bps = data.ageMultiplier.breakpoints;
    for (let i = 0; i < bps.length; i++) {
      if (a <= bps[i].maxAge) return bps[i].mult;
    }
    return bps[bps.length - 1].mult;
  }

  function pronenessMult(player, data) {
    const hist = player.injuryHistory || player.injuries || [];
    const cfg = data.priorInjuryProneness;
    let major = 0;
    let any = hist.length || Number(player.priorInjuries) || 0;
    if (Array.isArray(hist)) {
      hist.forEach((h) => {
        const sev = (h && h.severity) || "";
        if (sev === "major" || sev === "season_ending") major += 1;
      });
      any = hist.length;
    }
    let m = Math.pow(cfg.perPriorAny, any) * Math.pow(cfg.perPriorMajor, major);
    if (player.injuryProneness != null) m *= Number(player.injuryProneness);
    return Math.min(cfg.cap, m);
  }

  function weightedType(pos, rng, data) {
    const types = data.types;
    const bias = (data.positionTypeBias && data.positionTypeBias[pos]) || {};
    const keys = Object.keys(types);
    let total = 0;
    const weights = keys.map((k) => {
      const w = types[k].weight * (bias[k] || 1);
      total += w;
      return w;
    });
    let r = rng() * total;
    for (let i = 0; i < keys.length; i++) {
      r -= weights[i];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  function sampleGamesOut(typeDef, rng) {
    const g = typeDef.gamesOut;
    if (!g) return 1;
    if (g.dist === "season_ending") {
      return g.gamesEquivalent != null ? g.gamesEquivalent : 17;
    }
    const values = g.values;
    const probs = g.probs;
    let r = rng();
    for (let i = 0; i < values.length; i++) {
      r -= probs[i];
      if (r <= 0) return values[i];
    }
    return values[values.length - 1];
  }

  function baseProb(pos, data) {
    return data.basePerGameTimeLossProb[pos] || 0.025;
  }

  /**
   * Roll one player for one game.
   * Returns null if healthy, or an injury event object.
   */
  function rollPlayerGame(player, ctx) {
    ctx = ctx || {};
    const data = getData();
    const rng = createRng(ctx.rng != null ? ctx.rng : ctx.seed);
    const pos = player.pos || "WR";
    let ageM = ageMult(player.age, data);
    // v027: compress age injury curve so Y2–Y5 don't crater PPG (cap ~1.12)
    ageM = 1 + (ageM - 1) * 0.35;
    let p = baseProb(pos, data) * 0.68 * ageM * Math.min(1.25, pronenessMult(player, data)); // v027 YoY

    // Reinjury risk while recently returned
    if (player.gamesSinceReturn != null && player.gamesSinceReturn < 4 && player.lastInjuryType) {
      const t = data.types[player.lastInjuryType];
      if (t) p *= t.reinjuryMult || 1.2;
    }
    if (player.onIR) return null; // already out

    if (rng() >= p) return null;

    const type = weightedType(pos, rng, data);
    const def = data.types[type];
    const gamesOut = sampleGamesOut(def, rng);
    const irRules = data.irRules;
    const placeOnIR = !!(def.irDefault || gamesOut >= irRules.minimumGames);

    return {
      playerId: player.id,
      name: player.name,
      pos: pos,
      type: type,
      severity: def.severity,
      gamesOut: gamesOut,
      gamesRemaining: gamesOut,
      ratingDip: def.ratingDip || 0,
      placeOnIR: placeOnIR,
      irMinimumGames: irRules.minimumGames,
      protocol: def.protocol || null,
      week: ctx.week != null ? ctx.week : null,
      seedNote: "deterministic given seed + call order"
    };
  }

  /**
   * Simulate one team's game: array of active players → injury events.
   */
  function rollTeamGame(players, ctx) {
    ctx = ctx || {};
    const baseSeed = ctx.seed != null ? ctx.seed : ((ctx.week || 0) * 10007 + (ctx.teamId || "").length * 13);
    const rng = createRng(typeof baseSeed === "number" || typeof baseSeed === "string" ? baseSeed : 1);
    const events = [];
    (players || []).forEach((p, i) => {
      if (!p || p.onIR || p.inactive) return;
      const ev = rollPlayerGame(p, { rng: rng, week: ctx.week });
      if (ev) events.push(ev);
    });
    return events;
  }

  /**
   * Apply an injury event onto a mutable player/roster state object.
   * player: expects optional ovr, injuryHistory[], onIR, irDesignationsUsed
   * teamIR: { designationsUsed, designationsLimit }
   */
  function applyInjury(player, event, teamIR) {
    if (!player || !event) return player;
    teamIR = teamIR || { designationsUsed: 0, designationsLimit: 8 };
    player.injuryHistory = player.injuryHistory || [];
    player.injuryHistory.push({
      type: event.type,
      severity: event.severity,
      gamesOut: event.gamesOut,
      week: event.week
    });
    player.currentInjury = {
      type: event.type,
      gamesRemaining: event.gamesOut,
      ratingDip: event.ratingDip
    };
    player.lastInjuryType = event.type;
    player.gamesSinceReturn = null;
    if (event.ratingDip && player.ovr != null) {
      player.ovrPreInjury = player.ovrPreInjury != null ? player.ovrPreInjury : player.ovr;
      player.ovr = Math.max(40, player.ovr - event.ratingDip);
    }
    if (event.placeOnIR) {
      const limit = teamIR.designationsLimit != null ? teamIR.designationsLimit : 8;
      const used = teamIR.designationsUsed || 0;
      if (used >= limit) {
        // Cap hit: still out via currentInjury, but do not consume another IR slot
        player.onIR = false;
        event.placeOnIR = false;
        event.irBlocked = true;
      } else {
        player.onIR = true;
        player.irGamesServed = 0;
        player.irReturnEligibleAt = event.irMinimumGames || 4;
        teamIR.designationsUsed = used + 1;
      }
    }
    return { player: player, teamIR: teamIR };
  }

  /** Advance one week for injured players; handle IR return designations. */
  function advanceWeek(roster, teamIR, opts) {
    opts = opts || {};
    teamIR = teamIR || { designationsUsed: 0, designationsLimit: 8, playerReturns: {} };
    const data = getData();
    const activated = [];
    (roster || []).forEach((p) => {
      if (!p) return;
      if (p.currentInjury && p.currentInjury.gamesRemaining > 0) {
        p.currentInjury.gamesRemaining -= 1;
        if (p.onIR) p.irGamesServed = (p.irGamesServed || 0) + 1;
        if (p.currentInjury.gamesRemaining <= 0) {
          // Healthy enough to return
          if (p.onIR) {
            const used = teamIR.designationsUsed || 0;
            const perPlayer = (teamIR.playerReturns[p.id] || 0);
            const can =
              used < (teamIR.designationsLimit || data.irRules.returnDesignationsPerTeam) &&
              perPlayer < data.irRules.returnDesignationsPerPlayer &&
              (p.irGamesServed || 0) >= (p.irReturnEligibleAt || data.irRules.minimumGames);
            if (can) {
              p.onIR = false;
              p.currentInjury = null;
              p.gamesSinceReturn = 0;
              teamIR.designationsUsed = used + 1;
              teamIR.playerReturns[p.id] = perPlayer + 1;
              activated.push(p.id);
              // Partial rating recovery from major dip
              if (p.ovrPreInjury != null && p.ovr < p.ovrPreInjury) {
                p.ovr = Math.min(p.ovrPreInjury, p.ovr + Math.ceil((p.ovrPreInjury - p.ovr) * 0.4));
              }
            } else {
              // Stay on IR remainder of season if no designations left
              p.currentInjury.gamesRemaining = 1; // keep flagged out
            }
          } else {
            p.currentInjury = null;
            p.gamesSinceReturn = 0;
          }
        }
      } else if (p.gamesSinceReturn != null) {
        p.gamesSinceReturn += 1;
      }
    });
    return { roster: roster, teamIR: teamIR, activated: activated };
  }

  /**
   * Simulate a full season of injuries for one 53-man roster.
   * Returns summary counts — used by tests.
   */
  function simulateSeason(players, opts) {
    opts = opts || {};
    const games = opts.games || 17;
    const seed = opts.seed != null ? opts.seed : 42;
    const rng = createRng(seed);
    // clone light
    const roster = (players || []).map((p) => Object.assign({}, p, {
      injuryHistory: [],
      onIR: false,
      currentInjury: null
    }));
    const teamIR = { designationsUsed: 0, designationsLimit: 8, playerReturns: {} };
    let timeLoss = 0;
    let irPlacements = 0;
    const byType = {};

    for (let w = 1; w <= games; w++) {
      const active = roster.filter((p) => !p.onIR && !(p.currentInjury && p.currentInjury.gamesRemaining > 0));
      active.forEach((p) => {
        const ev = rollPlayerGame(p, { rng: rng, week: w });
        if (!ev) return;
        timeLoss += 1;
        byType[ev.type] = (byType[ev.type] || 0) + 1;
        applyInjury(p, ev, teamIR);
        if (ev.placeOnIR) irPlacements += 1;
      });
      advanceWeek(roster, teamIR);
    }
    return {
      timeLossInjuries: timeLoss,
      irPlacements: irPlacements,
      designationsUsed: teamIR.designationsUsed,
      byType: byType,
      players: roster
    };
  }


  /** Offseason: everyone healthy again; IR designations reset; partial ovr restore. */
  function clearOffseason(roster, teamIR) {
    teamIR = teamIR || { designationsUsed: 0, designationsLimit: 8, playerReturns: {} };
    (roster || []).forEach((p) => {
      if (!p) return;
      if (p.ovrPreInjury != null && p.ovr != null) {
        // Full offseason recovery so Y2+ talent doesn't silently erode
        p.ovr = p.ovrPreInjury;
        delete p.ovrPreInjury;
      }
      p.onIR = false;
      p.currentInjury = null;
      p.irGamesServed = 0;
      p.irReturnEligibleAt = null;
      p.gamesSinceReturn = null;
      // Trim injury history so proneness doesn't compound forever across seasons
      if (Array.isArray(p.injuryHistory) && p.injuryHistory.length > 3) p.injuryHistory = p.injuryHistory.slice(-3);
    });
    teamIR.designationsUsed = 0;
    teamIR.playerReturns = {};
    return { roster: roster, teamIR: teamIR };
  }

  const api = {
    mulberry32,
    createRng,
    hashSeed,
    rollPlayerGame,
    rollTeamGame,
    applyInjury,
    advanceWeek,
    clearOffseason,
    simulateSeason,
    irRules: function () { return getData().irRules; },
    getRates: function () { return getData(); }
  };

  root.AFASystems = root.AFASystems || {};
  root.AFASystems.injuries = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
