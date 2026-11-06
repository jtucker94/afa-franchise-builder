/**
 * AFAGameDay — drive/play-level football sim (window.AFAGameDay).
 * Standalone; feature-detects AFAStadiums / AFASystems.injuries / AFACoaches / AFAGrading.
 * User never controls players: philosophy + chemistry + play calls drive outcomes.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";

  /* ---- Calibration targets (see DESIGN.md) ---- */
  const TARGETS = {
    ppg: 22.5,            // [DATA] PFR ~22–23
    playsPerTeam: 63,     // [DATA] nflfastR/FTN
    ypp: 5.3,             // [DATA] PFR
    cmpPct: 0.65,         // [DATA]
    sacksPerTeam: 2.3,    // [DATA]
    toPerTeam: 1.3,       // [DATA]
    homeEdgeMax: 3.0      // AFAStadiums.CAPS.hfaMax
  };
  /* Scale INT/fumble rates so league TO/team ≈ TARGETS.toPerTeam (was ~0.81; target 1.3). */
  const TURNOVER_SCALE = 1.65;
  /* Slight offensive juice so integrated seasons land ~22–23 PPG after attrition. */
  const SCORING_BIAS = 1.18; // v027: injury-on seasons hold ~22 PPG
  const CAPS = {
    chemistryPts: 3.0,    // [EST] max attribution swing
    philosophyPts: 4.0,   // [EST]
    playCallPts: 2.5,     // [EST]
    chemUnit: { ol: 1.2, qbWr: 1.0, secondary: 1.0, frontSeven: 0.8, specialTeams: 0.5 }
  };

  /* ---- RNG ---- */
  function mulberry32(seed) {
    let t = (seed >>> 0) || 1;
    return function () {
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function createRng(seed) {
    if (typeof seed === "function") return seed;
    if (typeof seed === "number") return mulberry32(seed);
    if (seed == null) return mulberry32((Math.random() * 0xffffffff) >>> 0);
    return mulberry32(hashSeed(seed));
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const gauss = (rng) => (rng() + rng() + rng() - 1.5) * 1.15;

  /* ---- Defaults ---- */
  function defaultPhilosophy() {
    return {
      offense: { runPass: 0.57, aggressiveness: 0.5, tempo: 0.45, risk: 0.4 },
      defense: { blitzRate: 0.28, coverageShell: 0.35, aggressiveness: 0.5 }
    };
  }
  function defaultChemistry() {
    return { ol: 55, qbWr: 55, secondary: 55, frontSeven: 55, specialTeams: 50, continuity: 50 };
  }
  function defaultGamePlan() {
    return {
      openingScript: ["outside_zone", "quick_game", "play_action", "power", "slant_flat", "screen"],
      thirdAndShort: ["power", "qb_sneak", "slant_flat", "fade"],
      thirdAndLong: ["shotgun_spread", "crossers", "screen", "draw"],
      redZone: ["power", "fade", "slant_flat", "boot"],
      twoMinute: ["quick_game", "sideline", "spike", "hail_mary"],
      fourthDown: { goRate: 0.18, short: "power", medium: "slant_flat", long: "shotgun_spread" },
      blitzPackages: ["edge_storm", "sim_lb", "zero_blitz"],
      coveragePackages: ["cover3", "cover2", "cover1", "quarters"]
    };
  }
  const SETTINGS_KEY = "afa.gameday.replayView";
  const REPLAY_VIEWS = ["aerial", "sideline", "suite", "off"];
  function defaultSettings() {
    return { replayView: "aerial", playbackSpeed: 1, showLabels: true };
  }
  function getSettings() {
    const d = defaultSettings();
    try {
      if (typeof localStorage !== "undefined") {
        const v = localStorage.getItem(SETTINGS_KEY);
        if (REPLAY_VIEWS.includes(v)) d.replayView = v;
        const raw = localStorage.getItem("afa.gameday.settings");
        if (raw) Object.assign(d, JSON.parse(raw));
      }
    } catch (_) {}
    return d;
  }
  function setSettings(patch) {
    const cur = getSettings();
    Object.assign(cur, patch || {});
    if (!REPLAY_VIEWS.includes(cur.replayView)) cur.replayView = "aerial";
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SETTINGS_KEY, cur.replayView);
        localStorage.setItem("afa.gameday.settings", JSON.stringify(cur));
      }
    } catch (_) {}
    return cur;
  }

  /* Call families — RPS matrix keys */
  const CALL_FAMILIES = {
    // offense
    power: { side: "O", kind: "run", gap: "inside", risk: 0.2 },
    outside_zone: { side: "O", kind: "run", gap: "outside", risk: 0.25 },
    draw: { side: "O", kind: "run", gap: "inside", risk: 0.3, trick: true },
    qb_sneak: { side: "O", kind: "run", gap: "inside", risk: 0.1 },
    screen: { side: "O", kind: "pass", depth: "screen", risk: 0.25 },
    quick_game: { side: "O", kind: "pass", depth: "short", risk: 0.2 },
    slant_flat: { side: "O", kind: "pass", depth: "short", risk: 0.25 },
    crossers: { side: "O", kind: "pass", depth: "medium", risk: 0.35 },
    play_action: { side: "O", kind: "pass", depth: "medium", risk: 0.4, pa: true },
    boot: { side: "O", kind: "pass", depth: "medium", risk: 0.4, pa: true },
    sideline: { side: "O", kind: "pass", depth: "medium", risk: 0.35 },
    shotgun_spread: { side: "O", kind: "pass", depth: "medium", risk: 0.4 },
    fade: { side: "O", kind: "pass", depth: "deep", risk: 0.55 },
    hail_mary: { side: "O", kind: "pass", depth: "deep", risk: 0.9 },
    spike: { side: "O", kind: "clock", risk: 0 },
    // defense
    cover3: { side: "D", kind: "zone", shell: 0.2, blitz: 0.15 },
    cover2: { side: "D", kind: "zone", shell: 0.15, blitz: 0.1 },
    cover1: { side: "D", kind: "man", shell: 0.85, blitz: 0.25 },
    quarters: { side: "D", kind: "zone", shell: 0.3, blitz: 0.1 },
    edge_storm: { side: "D", kind: "blitz", shell: 0.5, blitz: 0.85 },
    sim_lb: { side: "D", kind: "blitz", shell: 0.4, blitz: 0.7 },
    zero_blitz: { side: "D", kind: "blitz", shell: 0.95, blitz: 1.0 },
    run_commit: { side: "D", kind: "run", shell: 0.3, blitz: 0.2 }
  };

  /* RPS: offense family vs defense family → success delta */
  function rpsDelta(offCall, defCall) {
    const o = CALL_FAMILIES[offCall] || CALL_FAMILIES.quick_game;
    const d = CALL_FAMILIES[defCall] || CALL_FAMILIES.cover3;
    let s = 0;
    if (o.kind === "run") {
      if (d.kind === "run" || d.blitz > 0.6) s -= 0.12;
      if (d.kind === "zone" && d.blitz < 0.2) s += 0.08;
      if (o.gap === "outside" && d.kind === "blitz") s += 0.06;
    } else if (o.kind === "pass") {
      if (d.kind === "blitz") {
        if (o.depth === "screen" || o.depth === "short") s += 0.1;
        else s -= 0.14;
      }
      if (o.pa && d.kind === "run") s += 0.12;
      if (o.depth === "deep" && d.kind === "zone" && d.shell < 0.4) s -= 0.08;
      if (o.depth === "deep" && d.kind === "man") s += 0.04;
      if (o.depth === "short" && d.kind === "zone") s += 0.05;
    }
    return clamp(s, -0.18, 0.2);
  }

  /* ---- Chemistry evolution ---- */
  function evolveChemistry(chem, ctx) {
    ctx = ctx || {};
    const c = Object.assign({}, defaultChemistry(), chem);
    const fit = ctx.schemeFit != null ? ctx.schemeFit : 0.5;
    const practice = ctx.practiceFocus || { ol: 0.25, qbWr: 0.25, secondary: 0.2, frontSeven: 0.2, specialTeams: 0.1 };
    const lead = (ctx.leadership || 70) / 100;
    const cont = ctx.continuity != null ? ctx.continuity : c.continuity / 100;
    const win = ctx.winPct != null ? ctx.winPct : 0.5;
    const drama = ctx.contractDrama || 0;
    const turnover = ctx.rosterTurnover || 0; // 0..1 share of new starters
    const loseStreak = ctx.losingStreak || 0;

    const bump = (key, base) => {
      let d = base + (practice[key] || 0) * 4 + (fit - 0.5) * 6 + lead * 2 + (cont - 0.5) * 4;
      d += (win - 0.5) * 3;
      d -= drama * 8 + turnover * 12 + Math.min(5, loseStreak) * 1.2;
      if (ctx.injuriesInUnit && ctx.injuriesInUnit[key]) d -= ctx.injuriesInUnit[key] * 3;
      c[key] = Math.round(clamp((c[key] || 55) + d * 0.35 + (ctx.noise || 0), 0, 100));
    };
    bump("ol", 0.5); bump("qbWr", 0.4); bump("secondary", 0.4); bump("frontSeven", 0.4); bump("specialTeams", 0.2);
    c.continuity = Math.round(clamp(cont * 100 * (1 - turnover * 0.5) + (1 - turnover) * 2, 0, 100));
    return c;
  }

  function chemistryMult(chem, unit) {
    const v = (chem && chem[unit] != null ? chem[unit] : 55) / 100;
    // map 0..1 → 0.94..1.06, soft
    return 0.94 + v * 0.12;
  }
  function chemistryPoints(chem) {
    // expected points contribution vs league-avg chemistry (55)
    let pts = 0;
    const units = CAPS.chemUnit;
    for (const k of Object.keys(units)) {
      const delta = ((chem[k] != null ? chem[k] : 55) - 55) / 45; // -1.2..1
      pts += clamp(delta * units[k], -units[k], units[k]);
    }
    return clamp(pts, -CAPS.chemistryPts, CAPS.chemistryPts);
  }

  function schemeFitBonus(coach, player) {
    if (root.AFACoaches && root.AFACoaches.schemeBonus) return root.AFACoaches.schemeBonus(coach, player);
    return 1;
  }
  function rosterSchemeFit(coach, roster) {
    if (root.AFACoaches && root.AFACoaches.schemeFit) return root.AFACoaches.schemeFit(coach, roster);
    return 0.5;
  }

  /* ---- Roster helpers ---- */
  function ovrOf(p) {
    if (!p) return 60;
    // v027: sim talent from roster ovr (grades are UI/scouting). Tiny grade blend keeps
    // hot/cold seasons flavorful without letting bad stat grades crater YoY PPG.
    const base = p.ovr != null ? p.ovr : (p.overall != null ? p.overall : 60);
    if (p.grade && p.grade.overall != null && p.grade.confidence > 0.45) {
      return Math.round(base * 0.92 + p.grade.overall * 0.08);
    }
    return base;
  }
  function byPos(roster, pos) {
    return (roster || []).filter((p) => p && !p.onIR && !p.inactive && p.pos === pos).sort((a, b) => ovrOf(b) - ovrOf(a));
  }
  function unitOvr(roster, positions, n) {
    const pool = (roster || []).filter((p) => p && !p.onIR && !p.inactive && positions.includes(p.pos))
      .map(ovrOf).sort((a, b) => b - a).slice(0, n || 5);
    if (!pool.length) return 62;
    return pool.reduce((s, x) => s + x, 0) / pool.length;
  }
  function depthChart(roster) {
    const take = (pos, n) => byPos(roster, pos).slice(0, n);
    return {
      qb: take("QB", 1)[0] || null,
      rb: take("RB", 2),
      wr: take("WR", 4),
      te: take("TE", 2),
      ot: take("OT", 2),
      og: take("OG", 2),
      c: take("C", 1)[0] || null,
      de: take("DE", 2),
      dt: take("DT", 2),
      lb: take("LB", 3),
      cb: take("CB", 3),
      s: take("S", 2),
      k: take("K", 1)[0] || null,
      p: take("P", 1)[0] || null
    };
  }

  function emptyStatLine(player) {
    return {
      playerId: player.id, name: player.name, pos: player.pos, number: player.number,
      games: 1,
      attempts: 0, completions: 0, passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
      sacks_suffered: 0, sack_yards_lost: 0,
      carries: 0, rushing_yards: 0, rushing_tds: 0,
      targets: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0,
      fumbles_total: 0,
      def_tackles_solo: 0, def_tackle_assists: 0, tackles: 0,
      def_sacks: 0, def_interceptions: 0, def_pass_defended: 0,
      def_fumbles_forced: 0, def_tackles_for_loss: 0, def_qb_hits: 0,
      fg_made: 0, fg_att: 0, pat_made: 0, pat_att: 0,
      pt_att: 0, pt_yards: 0, pt_net_yards: 0, pt_inside_20: 0,
      off_snaps: 0, pen: 0
    };
  }

  /* ---- Win probability (coarse Elo-ish) ---- */
  function winProb(homeScore, awayScore, secondsLeft, possessionHome, yardline, pregameHomeWP) {
    const margin = homeScore - awayScore;
    const timeFrac = clamp(secondsLeft / 3600, 0, 1);
    // pregame WP centered, then margin dominates as clock dies
    let wp = pregameHomeWP != null ? pregameHomeWP : 0.5;
    wp += margin * (0.03 + 0.07 * (1 - timeFrac));
    if (possessionHome && secondsLeft < 120 && margin >= 0) wp += 0.04;
    if (!possessionHome && secondsLeft < 120 && margin <= 0) wp -= 0.04;
    if (yardline != null && possessionHome) wp += (yardline - 50) * 0.001 * (1 - timeFrac);
    return clamp(wp, 0.02, 0.98);
  }

  /* ---- Weather ---- */
  function rollWeather(rng, stadium) {
    const roof = (stadium && stadium.roof) || (stadium && stadium.Roof) || "open";
    if (roof === "dome" || roof === "retractable_closed") {
      return { roof: "dome", wind: 0, rain: 0, temp: 72, label: "Dome" };
    }
    const temp = Math.round(30 + rng() * 60);
    const wind = Math.round(rng() * (temp < 40 ? 18 : 12));
    const rain = rng() < 0.12 ? +(0.3 + rng() * 0.7).toFixed(2) : (rng() < 0.08 ? 0.15 : 0);
    let label = temp + "°F";
    if (rain > 0.4) label += ", rain";
    else if (rain > 0) label += ", light rain";
    if (wind >= 12) label += ", windy";
    return { roof: "open", wind, rain, temp, label };
  }

  /* ---- Play selection ---- */
  function selectOffenseCall(ctx) {
    const { sit, plan, phil, coachTend, rng, override } = ctx;
    if (override) return override;
    if (sit.spike) return "spike";
    if (sit.openingIdx != null && sit.openingIdx < (plan.openingScript || []).length) {
      return plan.openingScript[sit.openingIdx];
    }
    const passRate = clamp(
      (phil.offense.runPass * 0.6 + (coachTend && coachTend.passRate != null ? coachTend.passRate : 0.57) * 0.4)
        + (sit.down === 3 && sit.distance >= 5 ? 0.15 : 0)
        + (sit.twoMinute ? 0.2 : 0)
        - (sit.shortYardage ? 0.25 : 0)
        + (phil.offense.aggressiveness - 0.5) * 0.08,
      0.28, 0.85
    );
    let pool;
    if (sit.down === 4) {
      return sit.distance <= 2 ? (plan.fourthDown.short || "power")
        : sit.distance <= 5 ? (plan.fourthDown.medium || "slant_flat")
        : (plan.fourthDown.long || "shotgun_spread");
    }
    if (sit.redZone) pool = plan.redZone;
    else if (sit.twoMinute) pool = plan.twoMinute;
    else if (sit.down === 3 && sit.distance <= 2) pool = plan.thirdAndShort;
    else if (sit.down === 3 && sit.distance >= 7) pool = plan.thirdAndLong;
    else pool = null;

    if (pool && pool.length) {
      // filter by pass/run intent
      const wantPass = rng() < passRate;
      const filtered = pool.filter((c) => {
        const f = CALL_FAMILIES[c];
        if (!f || f.kind === "clock") return true;
        return wantPass ? f.kind === "pass" : f.kind === "run";
      });
      return pick(rng, filtered.length ? filtered : pool);
    }
    // default balanced
    if (rng() < passRate) {
      const deep = phil.offense.aggressiveness * 0.35 + phil.offense.risk * 0.25;
      if (rng() < deep) return pick(rng, ["fade", "play_action", "crossers", "boot"]);
      return pick(rng, ["quick_game", "slant_flat", "screen", "shotgun_spread", "play_action", "sideline"]);
    }
    return pick(rng, ["power", "outside_zone", "outside_zone", "power", "draw"]);
  }

  function selectDefenseCall(ctx) {
    const { sit, plan, phil, rng, override } = ctx;
    if (override) return override;
    const blitzP = clamp(phil.defense.blitzRate + (sit.down === 3 ? 0.1 : 0) + (sit.twoMinute ? 0.05 : 0)
      + (phil.defense.aggressiveness - 0.5) * 0.1, 0.05, 0.7);
    if (sit.shortYardage && rng() < 0.45) return "run_commit";
    if (rng() < blitzP) return pick(rng, plan.blitzPackages || ["edge_storm", "sim_lb"]);
    // shell preference
    const shell = phil.defense.coverageShell;
    if (shell > 0.65) return pick(rng, ["cover1", "quarters", "cover3"]);
    if (shell < 0.3) return pick(rng, ["cover3", "cover2", "quarters"]);
    return pick(rng, plan.coveragePackages || ["cover3", "cover2", "cover1", "quarters"]);
  }

  function goForIt(ctx) {
    const { sit, plan, phil, coachTend, rng, scoreDiff /* offense perspective */ } = ctx;
    if (sit.down !== 4) return false;
    let rate = plan.fourthDown && plan.fourthDown.goRate != null ? plan.fourthDown.goRate : 0.18;
    if (coachTend && coachTend.goRate4th != null) rate = rate * 0.4 + coachTend.goRate4th * 0.6;
    rate += (phil.offense.aggressiveness - 0.5) * 0.2;
    if (sit.distance <= 1) rate += 0.25;
    else if (sit.distance <= 3) rate += 0.1;
    else if (sit.distance >= 8) rate -= 0.15;
    if (sit.yardline >= 70) rate += 0.15; // opp territory / FG range decisions handled by caller
    if (sit.yardline >= 95) rate += 0.2;
    if (scoreDiff < -8 && sit.twoMinute) rate += 0.35;
    if (scoreDiff > 8 && sit.quarter >= 4) rate -= 0.25;
    return rng() < clamp(rate, 0.02, 0.85);
  }

  /* ---- Resolve one offensive play ---- */
  function resolvePlay(state, teams, side /* 'home'|'away' */, opts) {
    const rng = state.rng;
    const off = teams[side];
    const def = teams[side === "home" ? "away" : "home"];
    const sit = {
      down: state.down,
      distance: state.distance,
      yardline: state.yardline, // 0–100 from offense's own goal
      quarter: state.quarter,
      clock: state.clock,
      redZone: state.yardline >= 80,
      shortYardage: state.distance <= 2,
      twoMinute: (state.quarter === 2 || state.quarter === 4) && state.clock <= 120,
      openingIdx: state.openingPlay,
      spike: false
    };
    const scoreOff = side === "home" ? state.homeScore : state.awayScore;
    const scoreDef = side === "home" ? state.awayScore : state.homeScore;

    // 4th down decision
    if (state.down === 4) {
      const fgRange = state.yardline >= 60 && state.weather.wind < 15; // rough
      const go = goForIt({
        sit, plan: off.plan, phil: off.phil, coachTend: off.coachTend, rng,
        scoreDiff: scoreOff - scoreDef
      });
      if (!go) {
        if (fgRange && state.yardline >= 65) return resolveFieldGoal(state, teams, side);
        return resolvePunt(state, teams, side);
      }
    }

    const offOverride = opts && opts.callOverrides && opts.callOverrides[state.playIndex];
    const defOverride = opts && opts.defCallOverrides && opts.defCallOverrides[state.playIndex];
    const offCall = selectOffenseCall({
      sit, plan: off.plan, phil: off.phil, coachTend: off.coachTend, rng,
      override: offOverride && offOverride.off
    });
    if (offCall === "spike") {
      return makeClockPlay(state, side, offCall);
    }
    const defCall = selectDefenseCall({
      sit, plan: def.plan, phil: def.phil, rng,
      override: (offOverride && offOverride.def) || defOverride
    });

    // Stadium noise on visiting offense
    let falseStart = false, delay = false, botched = false;
    const visiting = side !== "home";
    const noise = state.noise;
    if (visiting && noise) {
      if (rng() < (noise.falseStartProb || 0)) falseStart = true;
      else if (rng() < (noise.delayOfGameProb || 0)) delay = true;
      if (rng() < (noise.botchedAudibleProb || 0)) botched = true;
    }
    if (falseStart || delay) {
      const yards = 5;
      const yl = Math.max(1, state.yardline - yards);
      const dist = state.distance + yards;
      return finalizePlay(state, {
        side, offCall: "penalty", defCall, kind: "penalty",
        yards: -yards, complete: false, sank: false,
        label: falseStart ? "False start" : "Delay of game",
        penalty: falseStart ? "false_start" : "delay",
        key: false, participants: {},
        preYardline: state.yardline, postYardline: yl,
        down: state.down, distance: dist, firstDown: false,
        turnover: false, touchdown: false, score: false
      }, { noClock: false, clockBurn: 5 });
    }

    const fam = CALL_FAMILIES[offCall] || CALL_FAMILIES.quick_game;
    const rps = rpsDelta(offCall, defCall);
    const chemOff = off.chem;
    const chemDef = def.chem;

    // Unit strengths
    const ol = unitOvr(off.roster, ["OT", "OG", "C"], 5) * chemistryMult(chemOff, "ol");
    const skill = unitOvr(off.roster, ["RB", "WR", "TE"], 5);
    // Noise hurts pre-snap communication — soft penalty, not a full OVR crash ([EST] scaled).
    const noiseQb = (visiting && noise) ? (1 - (1 - (noise.qbPreSnapAdjust || 1)) * 0.35) : 1;
    const qb = ovrOf(off.dc.qb) * noiseQb * (botched ? 0.96 : 1) * chemistryMult(chemOff, "qbWr");
    const front = unitOvr(def.roster, ["DE", "DT", "LB"], 5) * chemistryMult(chemDef, "frontSeven");
    const cov = unitOvr(def.roster, ["CB", "S", "LB"], 5) * chemistryMult(chemDef, "secondary");
    // scheme bonuses on skill players
    let sch = 1;
    if (off.coach && off.dc.qb) sch = schemeFitBonus(off.coach, off.dc.qb);

    // Fatigue (4th quarter / high tempo)
    const tempo = clamp(off.phil.offense.tempo * 0.5 + (off.coachTend && off.coachTend.tempo != null ? off.coachTend.tempo : 0.45) * 0.5, 0, 1);
    const fatigue = 1 - (state.quarter >= 4 ? 0.04 : 0) - (tempo > 0.7 ? state.drivePlays * 0.004 : state.drivePlays * 0.002);
    const olEff = ol * clamp(fatigue, 0.88, 1);
    const frontEff = front * clamp(fatigue + 0.02, 0.88, 1.02);

    // Weather
    const wx = state.weather;
    const deepWx = 1 - (wx.wind / 40) - wx.rain * 0.15;
    const fumWx = 1 + wx.rain * 0.5 + (wx.temp < 35 ? 0.15 : 0);

    let kind, yards = 0, complete = false, sack = false, interception = false, fumble = false;
    let touchdown = false, participants = {}, label = "";

    const successBase = 0.5 + (olEff - frontEff) / 120 + (skill - cov) / 140 + rps
      + (off.phil.offense.aggressiveness - def.phil.defense.aggressiveness) * 0.03
      + state.momentum * 0.0004 * (side === "home" ? 1 : -1);
    const success = clamp(successBase + gauss(rng) * 0.08, 0.08, 0.92);

    if (fam.kind === "run") {
      kind = "run";
      const ypcExp = (4.1 + (olEff - frontEff) / 35 + (ovrOf(off.dc.rb[0]) - 75) / 40) * SCORING_BIAS
        + chemistryMult(chemOff, "ol") - 1 + rps * 3;
      const expl = clamp(0.06 + (off.phil.offense.risk * 0.05) + (success - 0.5) * 0.1, 0.02, 0.2);
      let roll = rng();
      if (roll < 0.08 * (frontEff / olEff)) {
        yards = -Math.round(1 + rng() * 3);
        participants.tfl = pickDef(def, rng, ["DE", "DT", "LB"]);
      } else if (roll < 0.08 * (frontEff / olEff) + expl) {
        yards = Math.round(12 + rng() * 35 + success * 15);
      } else {
        yards = Math.round(clamp(ypcExp + gauss(rng) * 2.4, -2, 18));
      }
      // fumble
      if (rng() < 0.010 * TURNOVER_SCALE * fumWx * (0.7 + off.phil.offense.risk)) {
        fumble = true;
        participants.fumbler = off.dc.rb[0] || off.dc.qb;
        participants.recoverer = pickDef(def, rng, ["DE", "DT", "LB", "CB", "S"]);
      }
      participants.ballCarrier = off.dc.rb[0] || off.dc.qb;
      participants.tackler = pickDef(def, rng, ["DE", "DT", "LB", "CB", "S"]);
      label = (participants.ballCarrier ? participants.ballCarrier.name.split(" ").pop() : "RB") + " run";
    } else {
      // pass
      kind = "pass";
      const pressure = clamp(0.2 + (frontEff - olEff) / 80 + (CALL_FAMILIES[defCall].blitz || 0) * 0.25, 0.05, 0.65);
      if (rng() < pressure * 0.18) {
        // sack
        sack = true;
        yards = -Math.round(4 + rng() * 8);
        participants.sacker = pickDef(def, rng, ["DE", "DT", "LB"]);
        participants.qb = off.dc.qb;
        // strip?
        if (rng() < 0.08 * TURNOVER_SCALE * fumWx) {
          fumble = true;
          participants.fumbler = off.dc.qb;
          participants.recoverer = participants.sacker;
        }
        label = "Sack";
      } else {
        const depth = fam.depth || "medium";
        const depthMul = depth === "screen" ? 0.7 : depth === "short" ? 0.95 : depth === "medium" ? 1.05 : 1.15 * deepWx;
        const cmpExp = clamp(
          0.645 + (qb - cov) / 100 + (chemistryMult(chemOff, "qbWr") - 1) * 0.5
            + (depth === "deep" ? -0.18 : depth === "short" ? 0.1 : depth === "screen" ? 0.12 : 0)
            + rps * 0.35
            - (visiting && noise ? (1 - (noise.qbPreSnapAdjust || 1)) * 0.15 : 0)
            - (botched ? 0.04 : 0),
          0.35, 0.82
        );
        complete = rng() < cmpExp;
        participants.qb = off.dc.qb;
        const target = pickTarget(off, rng, depth);
        participants.target = target;
        if (!complete) {
          yards = 0;
          // INT
          const intP = clamp((0.012 + off.phil.offense.risk * 0.018 + (depth === "deep" ? 0.02 : 0)
            - (qb - 75) / 400 + (cov - 75) / 500) * TURNOVER_SCALE, 0.006, 0.08);
          if (rng() < intP) {
            interception = true;
            participants.interceptor = pickDef(def, rng, ["CB", "S", "LB"]);
            label = "INTERCEPTION";
          } else {
            participants.defender = pickDef(def, rng, ["CB", "S", "LB"]);
            label = "Incomplete";
          }
        } else {
          const mean = depth === "screen" ? 6 : depth === "short" ? 7.5 : depth === "medium" ? 12.5 : 24;
          yards = Math.round(clamp(mean * depthMul + gauss(rng) * (depth === "deep" ? 8 : 3.5) + (success - 0.5) * 6, 0, 75));
          participants.receiver = target;
          participants.tackler = pickDef(def, rng, ["CB", "S", "LB", "DE"]);
          label = (target ? target.name.split(" ").pop() : "WR") + " catch";
        }
      }
    }

    // Apply yards / TD / turnover
    let post = state.yardline + yards;
    let td = false, safety = false;
    if (!interception && !fumble) {
      if (post >= 100) { td = true; touchdown = true; yards = 100 - state.yardline; post = 100; label = "TOUCHDOWN"; }
      if (post <= 0 && yards < 0) { safety = true; post = 0; label = "SAFETY"; }
    }

    const firstDown = !interception && !fumble && !td && (yards >= state.distance);
    const key = !!(td || interception || fumble || (state.down === 4) || yards >= 20 || safety);

    return finalizePlay(state, {
      side, offCall, defCall, kind, yards, complete, sack,
      interception, fumble, touchdown: td, safety,
      label, participants, key,
      preYardline: state.yardline, postYardline: clamp(post, 0, 100),
      down: state.down, distance: state.distance, firstDown,
      turnover: !!(interception || (fumble && true)),
      score: td || safety,
      rps, success, pressureNote: botched ? "botched_audible" : null,
      falseStart: false, delay: false
    }, { tempo, clockBurn: null });
  }

  function pickTarget(off, rng, depth) {
    const wrs = off.dc.wr || [];
    const tes = off.dc.te || [];
    const rbs = off.dc.rb || [];
    if (depth === "screen") return rbs[0] || wrs[0] || tes[0] || null;
    if (depth === "short") return pick(rng, [].concat(wrs.slice(0, 2), tes, rbs.slice(0, 1)).filter(Boolean));
    if (depth === "deep") return wrs[0] || wrs[1] || tes[0] || null;
    return pick(rng, [].concat(wrs, tes.slice(0, 1)).filter(Boolean)) || wrs[0] || null;
  }
  function pickDef(def, rng, positions) {
    const pool = [];
    for (const pos of positions) {
      const arr = byPos(def.roster, pos).slice(0, 2);
      pool.push(...arr);
    }
    return pool.length ? pick(rng, pool) : null;
  }

  function makeClockPlay(state, side, offCall) {
    return finalizePlay(state, {
      side, offCall, defCall: "cover3", kind: "clock", yards: 0, complete: false,
      label: "Spike", participants: { qb: null }, key: false,
      preYardline: state.yardline, postYardline: state.yardline,
      down: state.down + 1, distance: state.distance, firstDown: false,
      turnover: false, touchdown: false, score: false
    }, { clockBurn: 3 });
  }

  function resolveFieldGoal(state, teams, side) {
    const rng = state.rng;
    const off = teams[side];
    const k = off.dc.k;
    const dist = (100 - state.yardline) + 17; // ball at yardline, hold + endzone
    const kOvr = ovrOf(k);
    const wx = state.weather;
    const makeP = clamp(0.95 - Math.max(0, dist - 30) * 0.012 - wx.wind * 0.008 - wx.rain * 0.08
      + (kOvr - 75) * 0.004 + (chemistryMult(off.chem, "specialTeams") - 1) * 0.3, 0.15, 0.98);
    const made = rng() < makeP;
    return finalizePlay(state, {
      side, offCall: "field_goal", defCall: "fg_block", kind: "fg",
      yards: 0, complete: made, label: made ? ("FG good (" + dist + ")") : ("FG miss (" + dist + ")"),
      participants: { kicker: k }, key: true,
      preYardline: state.yardline, postYardline: state.yardline,
      down: 4, distance: state.distance, firstDown: false,
      turnover: !made, touchdown: false, score: made, fg: made, fgDist: dist,
      fgMiss: !made
    }, { clockBurn: 5 });
  }

  function resolvePunt(state, teams, side) {
    const rng = state.rng;
    const off = teams[side];
    const p = off.dc.p;
    const wx = state.weather;
    const gross = Math.round(42 + (ovrOf(p) - 70) * 0.25 + gauss(rng) * 5 - wx.wind * 0.3);
    const net = Math.round(gross - 6 - rng() * 8);
    const in20 = state.yardline + net >= 80;
    return finalizePlay(state, {
      side, offCall: "punt", defCall: "punt_return", kind: "punt",
      yards: net, complete: true, label: "Punt " + gross + " yd",
      participants: { punter: p }, key: false,
      preYardline: state.yardline, postYardline: clamp(state.yardline + net, 1, 99),
      down: 4, distance: state.distance, firstDown: false,
      turnover: true, touchdown: false, score: false, punt: true, puntGross: gross, puntNet: net, in20
    }, { clockBurn: 6 });
  }

  function resolveKickoff(state, teams, kickingSide) {
    const rng = state.rng;
    // touchback most of the time in modern NFL
    const tb = rng() < 0.72;
    const recv = kickingSide === "home" ? "away" : "home";
    const yl = tb ? 25 : Math.round(18 + rng() * 22);
    return finalizePlay(state, {
      side: kickingSide, offCall: "kickoff", defCall: "kick_return", kind: "kickoff",
      yards: 0, complete: true, label: tb ? "Kickoff touchback" : ("Kick return to " + yl),
      participants: {}, key: false,
      preYardline: 65, postYardline: yl,
      down: 1, distance: 10, firstDown: true,
      turnover: true, touchdown: false, score: false, kickoff: true, recvSide: recv, recvYardline: yl
    }, { clockBurn: 5, isKickoff: true });
  }

  function finalizePlay(state, play, meta) {
    meta = meta || {};
    const tempo = meta.tempo != null ? meta.tempo : 0.45;
    let baseBurn = meta.clockBurn;
    if (baseBurn == null) {
      // NFL-ish: clock-running plays chew ~28–40s (play + interval); stoppages ~5–8s.
      const twoMin = (state.quarter === 2 || state.quarter === 4) && state.clock <= 120;
      const stoppage = play.kind === "pass" && !play.complete && !play.sack
        || play.kind === "penalty" || play.spike || play.kind === "clock"
        || play.interception || play.touchdown || play.fg || play.punt || play.kickoff
        || play.outOfBounds;
      if (stoppage || twoMin) baseBurn = 5 + Math.round(state.rng() * 4);
      else baseBurn = 34 + Math.round(state.rng() * 10); // run/complete in bounds
    }
    // tempo: hurry-up shaves interval when clock is running
    const burn = Math.max(3, Math.round(baseBurn * (baseBurn >= 20 ? (1.05 - tempo * 0.25) : 1) / Math.sqrt(SCORING_BIAS)));
    play.clockBefore = state.clock;
    play.quarter = state.quarter;
    play.homeScoreBefore = state.homeScore;
    play.awayScoreBefore = state.awayScore;
    play.playIndex = state.playIndex;
    play.driveId = state.driveId;
    play.momentumBefore = state.momentum;
    play.wpBefore = state.wp;

    // mutate state via applyPlay later
    play._clockBurn = burn;
    play._meta = meta;
    return play;
  }

  function applyPlay(state, play, teams) {
    const side = play.side;
    const off = teams[side];
    const def = teams[side === "home" ? "away" : "home"];

    // box score accrual
    accrue(play, off, def);

    // scoring
    if (play.touchdown) {
      if (side === "home") state.homeScore += 6; else state.awayScore += 6;
      // PAT
      const pat = state.rng() < 0.94;
      if (pat) {
        if (side === "home") state.homeScore += 1; else state.awayScore += 1;
        const k = off.dc.k;
        if (k) { const st = off.stats[k.id] || (off.stats[k.id] = emptyStatLine(k)); st.pat_att++; st.pat_made++; }
        play.pat = true;
      } else {
        play.pat = false;
        const k = off.dc.k;
        if (k) { const st = off.stats[k.id] || (off.stats[k.id] = emptyStatLine(k)); st.pat_att++; }
      }
      play.points = play.pat ? 7 : 6;
      state.momentum += side === "home" ? 18 : -18;
      state.changeOfPossession = true;
      state.pendingKickoff = side;
    } else if (play.safety) {
      if (side === "home") state.awayScore += 2; else state.homeScore += 2;
      play.points = -2;
      state.momentum += side === "home" ? -12 : 12;
      state.changeOfPossession = true;
      state.pendingKickoff = side === "home" ? "away" : "home";
    } else if (play.fg) {
      if (side === "home") state.homeScore += 3; else state.awayScore += 3;
      play.points = 3;
      state.momentum += side === "home" ? 8 : -8;
      state.changeOfPossession = true;
      state.pendingKickoff = side;
    } else if (play.fgMiss || play.punt || play.kickoff) {
      state.changeOfPossession = true;
      if (play.kickoff) {
        state.possession = play.recvSide;
        state.yardline = play.recvYardline;
        state.down = 1; state.distance = 10;
        state.changeOfPossession = false;
        state.driveId++;
        state.drivePlays = 0;
        state.openingPlay = state.openingPlay == null ? 0 : state.openingPlay;
      } else if (play.punt) {
        // flip field
        const newYl = 100 - play.postYardline;
        state.possession = side === "home" ? "away" : "home";
        state.yardline = clamp(newYl, 1, 99);
        state.down = 1; state.distance = 10;
        state.driveId++;
        state.drivePlays = 0;
      } else if (play.fgMiss) {
        // opponent takes over at previous line of scrimmage (simplified: at spot)
        state.possession = side === "home" ? "away" : "home";
        state.yardline = clamp(100 - play.preYardline, 1, 99);
        state.down = 1; state.distance = 10;
        state.driveId++;
        state.drivePlays = 0;
      }
    } else if (play.turnover && (play.interception || play.fumble)) {
      state.momentum += side === "home" ? -16 : 16;
      state.possession = side === "home" ? "away" : "home";
      // ball at spot (turnover)
      const spot = clamp(play.postYardline, 1, 99);
      state.yardline = 100 - spot;
      state.down = 1; state.distance = 10;
      state.driveId++;
      state.drivePlays = 0;
      state.changeOfPossession = false;
    } else if (play.kind === "penalty") {
      state.yardline = play.postYardline;
      state.distance = play.distance;
      // down stays
    } else {
      // normal
      if (play.firstDown || play.touchdown) {
        state.yardline = play.postYardline;
        state.down = 1;
        state.distance = Math.min(10, 100 - state.yardline);
        if (play.firstDown) state.momentum += side === "home" ? 2 : -2;
      } else {
        state.yardline = play.postYardline;
        state.down += 1;
        state.distance = Math.max(1, state.distance - play.yards);
        if (state.down > 4) {
          // turnover on downs
          play.turnoverOnDowns = true;
          state.possession = side === "home" ? "away" : "home";
          state.yardline = 100 - state.yardline;
          state.down = 1; state.distance = 10;
          state.driveId++;
          state.drivePlays = 0;
          state.momentum += side === "home" ? -8 : 8;
        }
      }
      state.drivePlays++;
      if (state.openingPlay != null) state.openingPlay++;
    }

    // clock
    state.clock = Math.max(0, state.clock - (play._clockBurn || 5));
    play.clockAfter = state.clock;
    play.homeScore = state.homeScore;
    play.awayScore = state.awayScore;

    // momentum decay toward 50
    state.momentum = clamp(state.momentum * 0.97 + 50 * 0.03 + (play.key && play.touchdown ? 0 : 0), 0, 100);
    if (play.yards >= 20 && !play.turnover) state.momentum += side === "home" ? 6 : -6;
    state.momentum = clamp(state.momentum, 0, 100);

    state.wp = winProb(state.homeScore, state.awayScore, (4 - state.quarter) * 900 + state.clock,
      state.possession === "home", state.possession === "home" ? state.yardline : 100 - state.yardline, state.pregameWP);
    play.wpAfter = state.wp;
    play.momentumAfter = state.momentum;

    // noise live update hook
    if (state.stadiumObj && root.AFAStadiums && root.AFAStadiums.noiseDb) {
      try {
        const db = root.AFAStadiums.noiseDb(state.stadiumObj, {
          winPct: state.homeWinPct, stakes: state.stakes,
          margin: state.homeScore - state.awayScore, rival: state.rival,
          att: state.attendance
        });
        state.noise = root.AFAStadiums.noiseEffects(db);
        play.noiseDb = db;
      } catch (_) {}
    }

    state.playIndex++;
    state.plays.push(play);

    // handle pending kickoff after score
    if (state.pendingKickoff) {
      const ks = state.pendingKickoff;
      state.pendingKickoff = null;
      // switch possession setup via kickoff play
      const ko = resolveKickoff(state, teams, ks);
      // manually apply kickoff fields
      state.possession = ko.recvSide;
      state.yardline = ko.recvYardline;
      state.down = 1; state.distance = 10;
      state.driveId++;
      state.drivePlays = 0;
      state.openingPlay = 0;
      state.clock = Math.max(0, state.clock - (ko._clockBurn || 5));
      ko.clockAfter = state.clock;
      ko.homeScore = state.homeScore;
      ko.awayScore = state.awayScore;
      ko.wpAfter = state.wp;
      ko.momentumAfter = state.momentum;
      ko.playIndex = state.playIndex++;
      state.plays.push(ko);
    }
  }

  function accrue(play, off, def) {
    const add = (team, p, fn) => {
      if (!p) return;
      const st = team.stats[p.id] || (team.stats[p.id] = emptyStatLine(p));
      fn(st);
    };
    if (play.kind === "run" && play.participants.ballCarrier) {
      add(off, play.participants.ballCarrier, (s) => {
        s.carries++; s.rushing_yards += play.yards; s.off_snaps++;
        if (play.touchdown) s.rushing_tds++;
        if (play.fumble) s.fumbles_total++;
      });
      if (play.participants.tackler) add(def, play.participants.tackler, (s) => { s.def_tackles_solo++; s.tackles++; });
      if (play.participants.tfl) add(def, play.participants.tfl, (s) => { s.def_tackles_for_loss++; s.def_tackles_solo++; s.tackles++; });
    }
    if (play.kind === "pass") {
      add(off, play.participants.qb, (s) => {
        if (play.sack) {
          s.sacks_suffered++; s.sack_yards_lost += Math.abs(play.yards); s.off_snaps++;
          if (play.fumble) s.fumbles_total++;
        } else {
          s.attempts++; s.off_snaps++;
          if (play.complete) {
            s.completions++; s.passing_yards += play.yards;
            if (play.touchdown) s.passing_tds++;
          }
          if (play.interception) s.passing_interceptions++;
        }
      });
      if (play.complete && play.participants.receiver) {
        add(off, play.participants.receiver, (s) => {
          s.targets++; s.receptions++; s.receiving_yards += play.yards; s.off_snaps++;
          if (play.touchdown) s.receiving_tds++;
        });
      } else if (play.participants.target && !play.sack) {
        add(off, play.participants.target, (s) => { s.targets++; });
      }
      if (play.sack && play.participants.sacker) {
        add(def, play.participants.sacker, (s) => { s.def_sacks += 1; s.def_qb_hits++; s.def_tackles_solo++; s.tackles++; });
      }
      if (play.interception && play.participants.interceptor) {
        add(def, play.participants.interceptor, (s) => { s.def_interceptions++; s.def_pass_defended++; });
      }
      if (!play.complete && !play.sack && !play.interception && play.participants.defender) {
        add(def, play.participants.defender, (s) => { s.def_pass_defended++; });
      }
      if (play.complete && play.participants.tackler) {
        add(def, play.participants.tackler, (s) => { s.def_tackles_solo++; s.tackles++; });
      }
    }
    if (play.kind === "fg" && play.participants.kicker) {
      add(off, play.participants.kicker, (s) => {
        s.fg_att++; if (play.fg) s.fg_made++;
      });
    }
    if (play.kind === "punt" && play.participants.punter) {
      add(off, play.participants.punter, (s) => {
        s.pt_att++; s.pt_yards += play.puntGross || 0; s.pt_net_yards += play.puntNet || 0;
        if (play.in20) s.pt_inside_20++;
      });
    }
    if (play.kind === "penalty") {
      // charge OL randomly
      const ol = (off.dc.ot || []).concat(off.dc.og || [], off.dc.c ? [off.dc.c] : []);
      if (ol.length) add(off, pick(off._rng || Math.random, ol), (s) => { s.pen++; });
    }
  }

  /* ---- Team packaging ---- */
  function packageTeam(input, rng) {
    const roster = (input.roster || []).slice();
    const phil = Object.assign(defaultPhilosophy(), input.philosophy || {});
    if (input.philosophy && input.philosophy.offense) phil.offense = Object.assign(defaultPhilosophy().offense, input.philosophy.offense);
    if (input.philosophy && input.philosophy.defense) phil.defense = Object.assign(defaultPhilosophy().defense, input.philosophy.defense);
    const chem = Object.assign(defaultChemistry(), input.chemistry || {});
    const plan = Object.assign(defaultGamePlan(), input.gamePlan || {});
    if (input.gamePlan && input.gamePlan.fourthDown) plan.fourthDown = Object.assign(defaultGamePlan().fourthDown, input.gamePlan.fourthDown);
    const coach = input.coach || null;
    let coachTend = input.tendencies || (coach && coach.tendencies) || null;
    if (!coachTend && root.AFACoaches && coach) {
      // already on coach
      coachTend = coach.tendencies;
    }
    // blend philosophy toward coach if present
    if (coachTend) {
      phil.offense.runPass = phil.offense.runPass * 0.55 + coachTend.passRate * 0.45;
      phil.offense.tempo = phil.offense.tempo * 0.55 + (coachTend.tempo != null ? coachTend.tempo : phil.offense.tempo) * 0.45;
      if (plan.fourthDown.goRate == null) plan.fourthDown.goRate = coachTend.goRate4th;
      else plan.fourthDown.goRate = plan.fourthDown.goRate * 0.5 + coachTend.goRate4th * 0.5;
    }
    const dc = depthChart(roster);
    const stats = {};
    roster.forEach((p) => { if (p && p.id) stats[p.id] = emptyStatLine(p); });
    return {
      id: input.id || "team",
      name: input.name || "Team",
      abbr: input.abbr || (input.name || "TM").slice(0, 3).toUpperCase(),
      primary: input.primary || "#2244aa",
      secondary: input.secondary || "#ffffff",
      roster, phil, chem, plan, coach, coachTend, dc, stats,
      _rng: rng,
      power: unitOvr(roster, ["QB", "WR", "RB", "OT", "DE", "CB"], 11)
    };
  }

  /* ---- Main simulateGame ---- */
  /**
   * simulateGame(home, away, opts) → result
   * home/away: { id, name, abbr, primary, secondary, roster, philosophy?, chemistry?, gamePlan?, coach?, tendencies? }
   * opts: { seed, week, weather?, stadium?, stadiumState?, rival?, stakes?, homeWinPct?,
   *         injuries?: bool, callOverrides?, keyMomentResolver?, onPlay?,
   *         timeline?: bool (default true) }
   */
  function simulateGame(homeInput, awayInput, opts) {
    opts = opts || {};
    const rng = createRng(opts.seed);
    const home = packageTeam(homeInput, rng);
    const away = packageTeam(awayInput, rng);
    const teams = { home, away };

    // Stadium / noise
    let stadiumObj = opts.stadiumState || opts.stadium || null;
    let gd = null, noise = { falseStartProb: 0.01, delayOfGameProb: 0.003, botchedAudibleProb: 0, qbPreSnapAdjust: 1, hfaPoints: 1.2, db: 105, index: 0.2 };
    let attendance = null;
    if (root.AFAStadiums && stadiumObj && root.AFAStadiums.gameDay) {
      try {
        gd = root.AFAStadiums.gameDay(stadiumObj, {
          winPct: opts.homeWinPct != null ? opts.homeWinPct : 0.5,
          week: opts.week || 1,
          rival: !!opts.rival,
          stakes: opts.stakes != null ? opts.stakes : clamp((opts.week || 1) / 17, 0, 1),
          margin: 0
        });
        noise = gd.noise;
        attendance = gd.attendance;
      } catch (_) {}
    } else if (opts.noise) {
      noise = Object.assign(noise, opts.noise);
    }

    const weather = opts.weather || rollWeather(rng, stadiumObj || opts.stadiumMeta);
    let powerDelta = (home.power - away.power) / 45 + (noise.hfaPoints || 0) / 22;
    if (opts.playoff) {
      // Compress talent/HFA gaps so title games stay NFL-plausible
      powerDelta *= 0.55;
      noise.hfaPoints = Math.min(noise.hfaPoints || 0, 1.6);
    }
    const pregameWP = clamp(0.5 + powerDelta * 0.35 + chemistryPoints(home.chem) / 40 - chemistryPoints(away.chem) / 40, 0.2, 0.8);

    const state = {
      rng, quarter: 1, clock: 900,
      homeScore: 0, awayScore: 0,
      possession: rng() < 0.5 ? "home" : "away",
      yardline: 25, down: 1, distance: 10,
      driveId: 1, drivePlays: 0, openingPlay: 0,
      playIndex: 0, plays: [],
      momentum: 50, wp: pregameWP, pregameWP,
      weather, noise, stadiumObj, attendance,
      homeWinPct: opts.homeWinPct != null ? opts.homeWinPct : 0.5,
      stakes: opts.stakes != null ? opts.stakes : 0.5,
      rival: !!opts.rival,
      pendingKickoff: null, changeOfPossession: false
    };

    // Opening kickoff
    {
      const kicking = state.possession === "home" ? "away" : "home";
      // possession currently means who receives? set receiver as state.possession
      const recv = state.possession;
      const ko = resolveKickoff(state, teams, kicking);
      state.possession = recv;
      state.yardline = ko.recvYardline || 25;
      state.down = 1; state.distance = 10;
      ko.recvSide = recv;
      ko.playIndex = state.playIndex++;
      ko.homeScore = 0; ko.awayScore = 0;
      ko.wpAfter = state.wp; ko.momentumAfter = state.momentum;
      ko.clockAfter = state.clock;
      state.plays.push(ko);
    }

    const injuries = [];
    let guard = 0;
    while (state.quarter <= 4 && guard++ < 220) {
      if (state.clock <= 0) {
        if (state.quarter >= 4) break;
        state.quarter++;
        state.clock = 900;
        state.openingPlay = 0;
        if (state.quarter === 3) {
          // halftime — reverse possession of kickoff (loser of OT coin not needed)
          const kicking = state.plays[0] && state.plays[0].recvSide === "home" ? "home" : "away";
          const recv = kicking === "home" ? "away" : "home";
          const ko = resolveKickoff(state, teams, kicking);
          state.possession = recv;
          state.yardline = ko.recvYardline || 25;
          state.down = 1; state.distance = 10;
          state.driveId++; state.drivePlays = 0; state.openingPlay = 0;
          ko.recvSide = recv;
          ko.playIndex = state.playIndex++;
          ko.homeScore = state.homeScore; ko.awayScore = state.awayScore;
          ko.quarter = 3;
          ko.wpAfter = state.wp; ko.momentumAfter = state.momentum;
          ko.clockAfter = state.clock;
          state.plays.push(ko);
        }
        // Injury roll at half / end Q2
        if (opts.injuries !== false && root.AFASystems && root.AFASystems.injuries && state.quarter === 3) {
          try {
            const hInj = root.AFASystems.injuries.rollTeamGame(home.roster, { seed: hashSeed("h" + (opts.seed || 1)), week: opts.week || 1, teamId: home.id });
            const aInj = root.AFASystems.injuries.rollTeamGame(away.roster, { seed: hashSeed("a" + (opts.seed || 1)), week: opts.week || 1, teamId: away.id });
            injuries.push(...hInj.map((e) => Object.assign({ team: "home" }, e)), ...aInj.map((e) => Object.assign({ team: "away" }, e)));
          } catch (_) {}
        }
      }

      const play = resolvePlay(state, teams, state.possession, opts);
      if (opts.keyMomentResolver && isDecisionPoint(play, state) && !play._resolved) {
        // Allow host to inject override for this playIndex — re-resolve once
        const decision = opts.keyMomentResolver({
          playIndex: state.playIndex, state: snapshotState(state),
          situation: situationLabel(state), side: state.possession,
          defaultOff: play.offCall, defaultDef: play.defCall
        });
        if (decision && (decision.off || decision.def)) {
          opts.callOverrides = opts.callOverrides || {};
          opts.callOverrides[state.playIndex] = decision;
          const replayed = resolvePlay(state, teams, state.possession, opts);
          applyPlay(state, replayed, teams);
          if (opts.onPlay) opts.onPlay(replayed, state);
          continue;
        }
      }
      applyPlay(state, play, teams);
      if (opts.onPlay) opts.onPlay(play, state);
    }

    // Overtime sudden death simplified (one possession each max) if tied
    if (state.homeScore === state.awayScore) {
      state.quarter = 5; state.clock = 600;
      state.possession = rng() < 0.5 ? "home" : "away";
      state.yardline = 25; state.down = 1; state.distance = 10;
      state.driveId++; state.drivePlays = 0;
      let otGuard = 0;
      const firstScore = { home: false, away: false };
      while (state.homeScore === state.awayScore && otGuard++ < 40 && state.clock > 0) {
        const play = resolvePlay(state, teams, state.possession, opts);
        applyPlay(state, play, teams);
        if (play.touchdown || play.fg) firstScore[play.side] = true;
        if (firstScore.home && firstScore.away) break;
        if ((play.touchdown || play.fg) && state.playIndex > 0) {
          // after both had a chance or TD ends
          if (play.touchdown) break;
        }
      }
      // still tied — leave as tie (AFA regular season)
    }

    // End-game injury roll if not done
    if (opts.injuries !== false && root.AFASystems && root.AFASystems.injuries && !injuries.length) {
      try {
        const hInj = root.AFASystems.injuries.rollTeamGame(home.roster, { seed: hashSeed("hE" + (opts.seed || 1)), week: opts.week || 1, teamId: home.id });
        const aInj = root.AFASystems.injuries.rollTeamGame(away.roster, { seed: hashSeed("aE" + (opts.seed || 1)), week: opts.week || 1, teamId: away.id });
        injuries.push(...hInj.map((e) => Object.assign({ team: "home" }, e)), ...aInj.map((e) => Object.assign({ team: "away" }, e)));
      } catch (_) {}
    }

    const box = {
      home: summarizeTeam(home, state.homeScore),
      away: summarizeTeam(away, state.awayScore)
    };

    const attribution = buildAttribution(home, away, state, noise, weather);
    const keyPlays = state.plays.filter((p) => p.key || p.touchdown || p.interception || p.fumble || p.fg);

    const result = {
      version: VERSION,
      seed: opts.seed != null ? opts.seed : null,
      home: { id: home.id, name: home.name, abbr: home.abbr, primary: home.primary, secondary: home.secondary, score: state.homeScore },
      away: { id: away.id, name: away.name, abbr: away.abbr, primary: away.primary, secondary: away.secondary, score: state.awayScore },
      score: { home: state.homeScore, away: state.awayScore },
      plays: state.plays,
      keyPlays,
      boxScore: box,
      playerStatLines: {
        home: Object.values(home.stats),
        away: Object.values(away.stats)
      },
      attribution,
      injuries,
      weather,
      stadium: gd ? { attendance: gd.attendance, revenue: gd.revenue, noise: gd.noise, homePoints: gd.homePoints } : { noise },
      momentumFinal: state.momentum,
      wpFinal: winProb(state.homeScore, state.awayScore, 0, true, 50, pregameWP),
      pregameWP,
      totals: gameTotals(state.plays, box)
    };

    if (opts.timeline !== false) result.timeline = buildTimeline(result);
    return result;
  }

  function snapshotState(state) {
    return {
      quarter: state.quarter, clock: state.clock, down: state.down, distance: state.distance,
      yardline: state.yardline, possession: state.possession,
      homeScore: state.homeScore, awayScore: state.awayScore, momentum: state.momentum, wp: state.wp
    };
  }
  function situationLabel(state) {
    return "Q" + state.quarter + " " + clockFmt(state.clock) + " · " + state.down + "&" + state.distance
      + " @ " + state.yardline;
  }
  function isDecisionPoint(play, state) {
    return state.down === 4 || (state.yardline >= 95 && state.distance <= 5)
      || (state.quarter === 4 && state.clock <= 120 && Math.abs(state.homeScore - state.awayScore) <= 8);
  }
  function clockFmt(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function summarizeTeam(team, score) {
    const lines = Object.values(team.stats);
    const pass = lines.reduce((a, s) => a + (s.passing_yards || 0), 0);
    const rush = lines.reduce((a, s) => a + (s.rushing_yards || 0), 0);
    const att = lines.reduce((a, s) => a + (s.attempts || 0), 0);
    const cmp = lines.reduce((a, s) => a + (s.completions || 0), 0);
    const sacks = lines.reduce((a, s) => a + (s.def_sacks || 0), 0);
    const sacksAgainst = lines.reduce((a, s) => a + (s.sacks_suffered || 0), 0);
    const ints = lines.reduce((a, s) => a + (s.passing_interceptions || 0), 0);
    const fum = lines.reduce((a, s) => a + (s.fumbles_total || 0), 0);
    return {
      score, passYds: pass, rushYds: rush, totalYds: pass + rush,
      cmp, att, cmpPct: att ? cmp / att : 0,
      sacks, sacksAgainst, turnovers: ints + fum,
      players: lines.filter((s) => s.attempts || s.carries || s.receptions || s.tackles || s.def_sacks || s.fg_att || s.pt_att)
    };
  }

  function gameTotals(plays, box) {
    const offPlays = plays.filter((p) => p.kind === "run" || p.kind === "pass" || p.kind === "penalty");
    const homePlays = offPlays.filter((p) => p.side === "home" && p.kind !== "penalty");
    const awayPlays = offPlays.filter((p) => p.side === "away" && p.kind !== "penalty");
    const yds = (arr) => arr.reduce((s, p) => s + (p.kind === "run" || (p.kind === "pass" && p.complete) || p.sack ? p.yards : 0), 0);
    return {
      homePlays: homePlays.length,
      awayPlays: awayPlays.length,
      homeYpp: homePlays.length ? yds(homePlays) / homePlays.length : 0,
      awayYpp: awayPlays.length ? yds(awayPlays) / awayPlays.length : 0,
      totalPlays: homePlays.length + awayPlays.length
    };
  }

  function buildAttribution(home, away, state, noise, weather) {
    const chemH = chemistryPoints(home.chem);
    const chemA = chemistryPoints(away.chem);
    const philDelta = (home.phil.offense.aggressiveness - away.phil.defense.aggressiveness)
      + (away.phil.offense.aggressiveness - home.phil.defense.aggressiveness);
    const philPts = clamp(philDelta * 1.2 + (home.phil.offense.runPass - 0.57) * (away.phil.defense.blitzRate - 0.28) * 4, -CAPS.philosophyPts, CAPS.philosophyPts);
    const hfa = noise && noise.hfaPoints != null ? noise.hfaPoints : 1.2;
    const talent = (home.power - away.power) * 0.35;
    // luck ≈ residual vs expected
    const expected = 22.5 + talent / 2 + chemH - chemA + hfa / 2 + philPts / 2;
    const actualMargin = state.homeScore - state.awayScore;
    const luck = actualMargin - (expected - 22.5);
    return {
      home: {
        talent: +talent.toFixed(2),
        chemistry: +chemH.toFixed(2),
        philosophy: +(philPts / 2).toFixed(2),
        stadium: +hfa.toFixed(2),
        weather: +(-(weather.rain * 0.8 + weather.wind * 0.05)).toFixed(2),
        luck: +(luck / 2).toFixed(2)
      },
      away: {
        talent: +(-talent).toFixed(2),
        chemistry: +chemA.toFixed(2),
        philosophy: +(-philPts / 2).toFixed(2),
        stadium: +(-hfa).toFixed(2),
        weather: +(-(weather.rain * 0.8 + weather.wind * 0.05)).toFixed(2),
        luck: +(-luck / 2).toFixed(2)
      },
      blurb: attributionBlurb(chemH, chemA, philPts, hfa, talent)
    };
  }
  function attributionBlurb(chemH, chemA, phil, hfa, talent) {
    const parts = [];
    if (Math.abs(chemH - chemA) >= 0.6) {
      parts.push(chemH > chemA
        ? ("chemistry +" + (chemH - chemA).toFixed(1) + " pts to home")
        : ("chemistry +" + (chemA - chemH).toFixed(1) + " pts to away"));
    }
    if (Math.abs(phil) >= 0.8) parts.push("philosophy " + (phil >= 0 ? "+" : "") + phil.toFixed(1) + " pts");
    if (hfa >= 1.5) parts.push("crowd +" + hfa.toFixed(1) + " HFA");
    if (Math.abs(talent) >= 2) parts.push("talent " + (talent >= 0 ? "+" : "") + talent.toFixed(1));
    return parts.length ? parts.join(" · ") : "Even game — thin margins";
  }

  /* ---- Timeline for replay (~30s) ---- */
  function buildTimeline(result) {
    const plays = result.plays || [];
    const events = [];
    let t = 0; // seconds of replay time
    const KEY_DUR = 1.15;
    const BIG_DUR = 0.85;
    const NORM_DUR = 0.18;
    const SPECIAL_DUR = 0.35;

    for (let i = 0; i < plays.length; i++) {
      const p = plays[i];
      let dur;
      if (p.touchdown || p.interception || p.fumble || p.safety) dur = KEY_DUR;
      else if (p.fg || p.turnoverOnDowns || (p.down === 4 && p.kind !== "punt" && p.kind !== "fg") || Math.abs(p.yards) >= 20) dur = BIG_DUR;
      else if (p.kind === "kickoff" || p.kind === "punt" || p.kind === "penalty") dur = SPECIAL_DUR;
      else dur = NORM_DUR;

      // compress further if game is long
      events.push({
        t0: +t.toFixed(3),
        t1: +(t + dur).toFixed(3),
        playIndex: i,
        key: !!(p.key || p.touchdown || p.interception || p.fumble || p.fg),
        label: p.label,
        play: summarizePlayForReplay(p, result)
      });
      t += dur;
    }
    // normalize to ~30s if far off
    const target = 30;
    if (t > 0.1) {
      const scale = target / t;
      // only scale if outside 22–38s
      if (t < 22 || t > 38) {
        for (const e of events) { e.t0 = +(e.t0 * scale).toFixed(3); e.t1 = +(e.t1 * scale).toFixed(3); }
        t = target;
      }
    }
    return {
      duration: +t.toFixed(3),
      events,
      home: result.home,
      away: result.away,
      weather: result.weather,
      stadium: result.stadium
    };
  }

  function summarizePlayForReplay(p, result) {
    const homeColor = result.home.primary;
    const awayColor = result.away.primary;
    const offHome = p.side === "home";
    return {
      side: p.side,
      kind: p.kind,
      offCall: p.offCall,
      defCall: p.defCall,
      yards: p.yards,
      complete: p.complete,
      sack: p.sack,
      touchdown: p.touchdown,
      interception: p.interception,
      fumble: p.fumble,
      fg: p.fg,
      punt: p.punt,
      kickoff: p.kickoff,
      label: p.label,
      preYardline: p.preYardline,
      postYardline: p.postYardline,
      down: p.down,
      distance: p.distance,
      quarter: p.quarter,
      clockBefore: p.clockBefore,
      clockAfter: p.clockAfter,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      wpAfter: p.wpAfter,
      momentumAfter: p.momentumAfter,
      noiseDb: p.noiseDb,
      offColor: offHome ? homeColor : awayColor,
      defColor: offHome ? awayColor : homeColor,
      // synthetic formation for renderers
      ballStart: p.preYardline,
      ballEnd: p.postYardline,
      jersey: guessJerseys(p)
    };
  }

  function guessJerseys(p) {
    const j = {};
    const part = p.participants || {};
    const num = (pl) => (pl && pl.number != null ? pl.number : null);
    if (part.qb) j.qb = num(part.qb);
    if (part.ballCarrier) j.bc = num(part.ballCarrier);
    if (part.receiver) j.wr = num(part.receiver);
    if (part.target) j.tgt = num(part.target);
    if (part.sacker) j.sk = num(part.sacker);
    if (part.interceptor) j.int = num(part.interceptor);
    if (part.tackler) j.tk = num(part.tackler);
    return j;
  }

  function simulateWeek(games, opts) {
    opts = opts || {};
    return (games || []).map((g, i) => simulateGame(g.home, g.away, Object.assign({}, opts, {
      seed: opts.seed != null ? hashSeed(String(opts.seed) + ":" + i) : hashSeed("week:" + i),
      timeline: false,
      injuries: opts.injuries
    })));
  }

  /* ---- Sample roster builder (demo / tests) ---- */
  function makeDemoRoster(seed, power) {
    const rng = createRng(seed);
    const positions = [
      ["QB", 1], ["RB", 2], ["WR", 4], ["TE", 2], ["OT", 2], ["OG", 2], ["C", 1],
      ["DE", 2], ["DT", 2], ["LB", 3], ["CB", 3], ["S", 2], ["K", 1], ["P", 1]
    ];
    const roster = [];
    let id = 0;
    for (const [pos, n] of positions) {
      for (let i = 0; i < n; i++) {
        const ovr = Math.round(clamp((power || 75) + gauss(rng) * 6 - i * 3, 55, 99));
        roster.push({
          id: "d" + seed + "_" + (id++),
          name: pos + " " + ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Moore"][Math.floor(rng() * 10)],
          pos, age: 22 + Math.floor(rng() * 12),
          number: 1 + Math.floor(rng() * 98),
          ovr
        });
      }
    }
    return roster;
  }

  const api = {
    VERSION, TARGETS, CAPS, CALL_FAMILIES, REPLAY_VIEWS,
    defaultPhilosophy, defaultChemistry, defaultGamePlan, defaultSettings,
    getSettings, setSettings,
    createRng, hashSeed, mulberry32,
    evolveChemistry, chemistryPoints, chemistryMult,
    schemeFitBonus, rosterSchemeFit,
    simulateGame, simulateWeek, buildTimeline,
    makeDemoRoster, depthChart, unitOvr, ovrOf, rpsDelta,
    clockFmt
  };

  root.AFAGameDay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
