/* AFA draft engine — roster needs, identity, and real/generated class policy.
 * Pure functions. No DOM. Loaded before js/app.js as window.AFADraft.
 *
 * Class policy (coverage-based, not a hardcoded "everything after 2028 is fake"):
 * - A year is REAL when the compiled prospect file has at least one non-generated
 *   prospect with real !== false for that year (currently 2027 and 2028).
 *   Only those real prospects are used. The board may run out; that exhaustion
 *   is reported and is not patched with invented players.
 * - The season immediately after the last compiled real class, and any year
 *   before that class, is UNAVAILABLE. No fictional class is created. 2029 is
 *   this near-term gap while 2028 is the last compiled class.
 * - A year is GENERATED only when it has no real class, it is at least two
 *   seasons after the last compiled real class, AND it is 2030 or later.
 *   Generated prospects are labeled fictional, carry no biography and no
 *   stats, and their height/weight/overall are game-only attributes.
 * - Adding a real class file for a year flips that year back to REAL
 *   automatically. Known classes are never relabeled fictional.
 */
(function (root) {
  "use strict";

  const STARTER_NEED = { QB: 1, RB: 1, WR: 2, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
  const DEPTH_NEED = { QB: 2, RB: 3, WR: 5, TE: 2, OT: 3, OG: 3, C: 2, DE: 4, DT: 3, LB: 5, CB: 4, S: 3, K: 1, P: 1 };
  const POS_PREMIUM = { QB: 1.22, OT: 1.18, DE: 1.16, CB: 1.14, WR: 1.12, DT: 1.08, TE: 1.06, OG: 1.05, C: 1.05, LB: 1.04, S: 1.03, RB: 0.86, K: 0.35, P: 0.32 };
  const GENERATED_FLOOR_YEAR = 2030;

  /* Same human entered twice under a spelling or nickname. Keep the first id.
   * These are listing duplicates, not two players who happen to share a surname. */
  const ALIAS_GROUPS = [
    {
      id: "kelley-jones-msst-cb",
      keep: "col_2027_kelley_jones",
      ids: ["col_2027_kelley_jones", "col_2027_kelly_jones"],
      note: "Mississippi State CB. Public boards spell the prospect Kelley Jones; Kelly Jones in the compiled file is the same listing."
    },
    {
      id: "oj-frederique-miami-cb",
      keep: "col_2027_romanas_oj_frederique_jr",
      ids: ["col_2027_romanas_oj_frederique_jr", "col_2027_oj_frederique_jr"],
      note: "Miami CB Romanas \"OJ\" Frederique Jr. was compiled twice, once under the nickname only."
    }
  ];
  const GROUP_BY_ID = Object.create(null);
  ALIAS_GROUPS.forEach((g) => g.ids.forEach((id) => { GROUP_BY_ID[id] = g; }));

  const POLICY = {
    generatedFloorYear: GENERATED_FLOOR_YEAR,
    nearTermGapSeasons: 1,
    summary: "Real compiled classes are used as-is. The next uncompiled season is left empty. Fictional prospects begin only in 2030 or later, and only two or more seasons after the last real class on file."
  };

  function hashStr(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFrom(seed) {
    let x = seed >>> 0;
    return function () { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function foldName(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9' ]/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function schoolKey(s) {
    return String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
  }
  function isDuplicateListing(id) {
    const g = GROUP_BY_ID[id];
    return !!(g && g.keep !== id);
  }
  function aliasGroupShared(a, b) {
    if (!a || !b) return false;
    const ga = GROUP_BY_ID[a.id];
    const gb = GROUP_BY_ID[b.id];
    return !!(ga && gb && ga.id === gb.id);
  }

  /* Two records are the same person only with a positive identity link.
   * Different Sleeper ids or different ESPN ids are different people even
   * when the folded name matches (Justin Jefferson WR/LB, Jaylon Jones, …).
   * Name + position + college matches a prospect to a pro, or two listings
   * of one prospect. Name alone never matches. */
  function peopleClash(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (aliasGroupShared(a, b)) return true;
    if (a.sleeperId && b.sleeperId) return String(a.sleeperId) === String(b.sleeperId);
    if (a.espnId && b.espnId && String(a.espnId) === String(b.espnId)) return true;
    if ((a.sleeperId && b.sleeperId && String(a.sleeperId) !== String(b.sleeperId))
      || (a.espnId && b.espnId && String(a.espnId) !== String(b.espnId))) return false;
    const na = foldName(a.name);
    const nb = foldName(b.name);
    if (!na || na !== nb || !a.pos || a.pos !== b.pos) return false;
    const sa = schoolKey(a.college);
    const sb = schoolKey(b.college);
    return !!(sa && sb && sa === sb);
  }

  function clashesWithAny(player, kept) {
    if (!player) return false;
    for (let i = 0; i < kept.length; i++) if (peopleClash(player, kept[i])) return true;
    return false;
  }

  function blankIndex() {
    return { ids: new Set(), sleeper: new Set(), espn: new Set(), npc: new Set(), groups: new Set() };
  }
  function indexAdd(ix, p) {
    if (!p) return;
    if (p.id) ix.ids.add(p.id);
    if (p.sleeperId) ix.sleeper.add(String(p.sleeperId));
    if (p.espnId) ix.espn.add(String(p.espnId));
    const g = GROUP_BY_ID[p.id];
    if (g) {
      ix.groups.add(g.id);
      g.ids.forEach((id) => ix.ids.add(id));
    }
    const nm = foldName(p.name);
    const sch = schoolKey(p.college);
    if (nm && p.pos && sch) ix.npc.add(nm + "|" + p.pos + "|" + sch);
  }
  function indexHit(ix, p) {
    if (!p) return false;
    if (p.id && ix.ids.has(p.id)) return true;
    const g = GROUP_BY_ID[p.id];
    if (g && ix.groups.has(g.id)) return true;
    if (p.sleeperId && ix.sleeper.has(String(p.sleeperId))) return true;
    if (p.espnId && ix.espn.has(String(p.espnId))) return true;
    if (p.sleeperId) return false;
    if (p.espnId && ix.espn.size) return false;
    const nm = foldName(p.name);
    const sch = schoolKey(p.college);
    return !!(nm && p.pos && sch && ix.npc.has(nm + "|" + p.pos + "|" + sch));
  }

  function dedupeIds(ids, lookup, kept) {
    const out = [];
    let removed = 0;
    const ix = blankIndex();
    (kept || []).forEach((p) => indexAdd(ix, p));
    (ids || []).forEach((id) => {
      const p = (lookup && lookup(id)) || { id: id };
      if (indexHit(ix, p)) { removed++; return; }
      kept.push(p);
      indexAdd(ix, p);
      out.push(id);
    });
    return { ids: out, removed: removed };
  }

  function countPositions(players) {
    const counts = {};
    (players || []).forEach((p) => { if (p && p.pos) counts[p.pos] = (counts[p.pos] || 0) + 1; });
    return counts;
  }

  function rosterPhase(counts) {
    const c = counts || {};
    const starterHoles = [];
    const depthHoles = [];
    let startersFilled = 0;
    let startersTotal = 0;
    let depthFilled = 0;
    let depthTotal = 0;
    Object.keys(STARTER_NEED).forEach((pos) => {
      const have = c[pos] || 0;
      const s = STARTER_NEED[pos];
      const d = DEPTH_NEED[pos];
      startersTotal += s;
      startersFilled += Math.min(have, s);
      depthTotal += d;
      depthFilled += Math.min(have, d);
      if (have < s) starterHoles.push(pos);
      else if (have < d) depthHoles.push(pos);
    });
    return {
      counts: c,
      starterHoles: starterHoles,
      depthHoles: depthHoles,
      holes: startersTotal - startersFilled,
      startersFilled: startersFilled,
      startersTotal: startersTotal,
      depthFilled: depthFilled,
      depthTotal: depthTotal
    };
  }

  function ageCurve(player, round) {
    const age = Number(player && player.age) || 27;
    if (round <= 8) {
      if (age <= 24) return 1.12;
      if (age <= 27) return 1.05;
      if (age <= 30) return 0.95;
      if (age <= 33) return 0.72;
      return 0.45;
    }
    if (round <= 25) {
      if (age <= 26) return 1.08;
      if (age <= 30) return 1.0;
      if (age <= 33) return 0.9;
      return 0.7;
    }
    if (age >= 34 && player && player.ovr >= 80) return 0.85;
    return 1.0;
  }

  function needMultiplier(player, counts, round) {
    const have = (counts && counts[player.pos]) || 0;
    const starters = STARTER_NEED[player.pos] || 1;
    const depth = DEPTH_NEED[player.pos] || (starters + 1);
    const phase = rosterPhase(counts || {});
    if (have < starters) {
      const urgency = starters - have;
      let m = 1.48 + urgency * 0.2;
      if ((player.pos === "K" || player.pos === "P") && phase.holes > 10 && round < 22) m *= 0.18;
      return m;
    }
    if (have < depth) {
      let m = 1.08;
      if (phase.holes >= 6 && round <= 10) m = 0.62;
      else if (phase.holes >= 3 && round <= 6) m = 0.78;
      if (player.pos === "RB" && have >= 1 && round <= 10 && player.ovr < 93) m *= 0.72;
      return m;
    }
    if (phase.holes > 0 || phase.depthHoles.length > 0) {
      if (round <= 2 && player.ovr >= 97) return 0.82;
      if (round <= 5 && player.ovr >= 94) return 0.42;
      return 0.2;
    }
    return player.ovr >= 88 ? 0.92 : 0.8;
  }

  function schemeFactor(player, scheme) {
    if (!scheme) return 1;
    const w = ((scheme.offKeys && scheme.offKeys[player.pos]) || 0) + ((scheme.defKeys && scheme.defKeys[player.pos]) || 0);
    return 1 + 0.06 * Math.min(1.4, w);
  }

  function complementFactor(player, roster, scheme) {
    if (!player || player.pos !== "RB" || !scheme || !/Power Run|Shanahan/.test(scheme.offScheme || "")) return 1;
    const rb1 = (roster || []).filter((p) => p && p.pos === "RB").sort((a, b) => b.ovr - a.ovr)[0];
    if (!rb1 || !rb1.weight || !player.weight || rb1.id === player.id) return 1;
    return Math.abs(rb1.weight - player.weight) >= 15 ? 1.06 : 0.95;
  }

  function scorePlayer(player, ctx) {
    ctx = ctx || {};
    const round = ctx.round || 1;
    const counts = ctx.counts || {};
    const premium = POS_PREMIUM[player.pos] || 1;
    const need = needMultiplier(player, counts, round);
    const age = ageCurve(player, round);
    let score = (Number(player.ovr) || 0) * premium * need * age;
    const have = counts[player.pos] || 0;
    const depth = DEPTH_NEED[player.pos] || 2;
    if (round <= 5 && player.ovr >= 96 && premium >= 1.05 && have < depth) score += 12;
    if (round <= 8 && (player.pos === "K" || player.pos === "P") && have >= 1) score *= 0.05;
    if (round <= 6 && player.pos === "RB" && player.ovr < 94 && have >= 1) score *= 0.8;
    score *= schemeFactor(player, ctx.scheme);
    score *= complementFactor(player, ctx.roster, ctx.scheme);
    if (typeof ctx.availabilityFactor === "function") {
      const factor = Number(ctx.availabilityFactor(player));
      if (isFinite(factor)) score *= factor;
    }
    const sc = ctx.scarcity;
    const depthTarget = DEPTH_NEED[player.pos] || (STARTER_NEED[player.pos] || 1);
    // Leave scarce bodies for clubs that are still short of depth. Plentiful positions stay available.
    if (have >= depthTarget && sc && sc.slotsOpen > 0 && sc.supply <= sc.slotsOpen) score *= 0.04;
    if ((player.pos === "K" || player.pos === "P") && have >= 1 && sc && sc.supply <= sc.teamsWithout) score *= 0.02;
    return score;
  }

  /* Seasonal / college board. Rosters already exist, so a hole or a clearly
   * weaker starter outranks a luxury pick. A mid-60s prospect can win a job
   * when the player ahead of him is worse; he does not jump an established starter. */
  function scoreProspect(player, roster, round, scheme) {
    const counts = countPositions(roster);
    const have = counts[player.pos] || 0;
    const starters = STARTER_NEED[player.pos] || 1;
    const depth = DEPTH_NEED[player.pos] || (starters + 1);
    const at = (roster || []).filter((p) => p && p.pos === player.pos).sort((a, b) => b.ovr - a.ovr);
    let m;
    if (have < starters) m = 1.55 + (starters - have) * 0.15;
    else if (have < depth) m = 1.12;
    else if (at.length) {
      const starterOvr = at[Math.min(at.length, starters) - 1].ovr || 0;
      m = player.ovr >= starterOvr + 2 ? 1.05 : 0.7;
    } else m = 1.2;
    let score = (Number(player.ovr) || 0) * (POS_PREMIUM[player.pos] || 1) * m;
    score *= schemeFactor(player, scheme);
    score *= complementFactor(player, roster, scheme);
    if (round <= 2 && player.ovr >= 78 && have < starters) score += 4;
    return score;
  }

  function recommend(opts) {
    opts = opts || {};
    const board = opts.board || [];
    if (!board.length) return null;
    const roster = opts.roster || [];
    const counts = countPositions(roster);
    const phase = rosterPhase(counts);
    const pickIndex = opts.pickIndex || 0;
    const round = opts.round || (Math.floor(pickIndex / 32) + 1);
    const byPos = {};
    board.forEach((p) => { if (!p || !p.pos) return; (byPos[p.pos] || (byPos[p.pos] = [])).push(p); });
    Object.keys(byPos).forEach((pos) => byPos[pos].sort((a, b) => b.ovr - a.ovr || String(a.id).localeCompare(String(b.id))));
    const top = board.slice().sort((a, b) => b.ovr - a.ovr || String(a.id).localeCompare(String(b.id))).slice(0, 80);
    const seen = new Set();
    const short = [];
    top.forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); short.push(p); } });
    function add(pos, n) {
      const arr = byPos[pos] || [];
      for (let i = 0; i < arr.length && i < n; i++) {
        if (!seen.has(arr[i].id)) { seen.add(arr[i].id); short.push(arr[i]); }
      }
    }
    phase.starterHoles.forEach((pos) => add(pos, 12));
    phase.depthHoles.forEach((pos) => add(pos, 8));
    if (round >= 12 || phase.holes <= 8) { add("K", 4); add("P", 4); }
    const league = opts.leagueRosters || null;
    function scarcityFor(pos) {
      if (!league) return null;
      let teamsWithout = 0;
      let slotsOpen = 0;
      const target = DEPTH_NEED[pos] || 1;
      Object.keys(league).forEach((tid) => {
        const rs = league[tid] || [];
        let have = 0;
        for (let i = 0; i < rs.length; i++) if (rs[i] && rs[i].pos === pos) have++;
        if (have < 1) teamsWithout++;
        if (have < target) slotsOpen += target - have;
      });
      return { supply: (byPos[pos] || []).length, teamsWithout: teamsWithout, slotsOpen: slotsOpen };
    }
    let best = null;
    let bestScore = -Infinity;
    short.forEach((p) => {
      const s = scorePlayer(p, { counts: counts, round: round, scheme: opts.scheme, roster: roster, scarcity: scarcityFor(p.pos), availabilityFactor: opts.availabilityFactor });
      const jitter = ((hashStr(String(opts.teamId) + ":" + p.id + ":" + pickIndex) % 1000) / 1000) * 0.8;
      if (s + jitter > bestScore) { best = p; bestScore = s + jitter; }
    });
    return best;
  }

  function recommendProspect(opts) {
    opts = opts || {};
    const board = opts.board || [];
    if (!board.length) return null;
    const roster = opts.roster || [];
    const round = opts.round || 1;
    let best = null;
    let bestScore = -Infinity;
    board.forEach((p) => {
      if (!p) return;
      const s = scoreProspect(p, roster, round, opts.scheme);
      const jitter = ((hashStr(String(opts.teamId) + ":" + p.id + ":" + round) % 1000) / 1000) * 0.6;
      if (s + jitter > bestScore) { best = p; bestScore = s + jitter; }
    });
    return best;
  }

  function cloneDraft(draft) {
    const rosters = {};
    Object.keys(draft.rosters || {}).forEach((k) => { rosters[k] = (draft.rosters[k] || []).slice(); });
    return {
      draftPick: draft.draftPick || 0,
      board: (draft.board || []).slice(),
      rosters: rosters,
      picks: (draft.picks || []).slice()
    };
  }

  /* One founding-draft selection. Mutates nothing on the input.
   * A repeated call for a player already on that club returns ok without
   * a second roster spot. A keeper mismatch or a reserved player is refused
   * with the board, rosters, and pick index unchanged. */
  function commitPick(draft, action) {
    action = action || {};
    const next = cloneDraft(draft || {});
    const teamId = action.teamId;
    const playerId = action.playerId;
    const total = action.totalPicks || 0;
    if (next.draftPick >= total) return { ok: false, reason: "complete", draft: next };
    if (action.expectedTeamId && action.expectedTeamId !== teamId) return { ok: false, reason: "wrong-team", draft: next };
    const roster = next.rosters[teamId] || (next.rosters[teamId] = []);
    const already = (next.picks || []).some((pk) => pk && pk.playerId === playerId && pk.teamId === teamId);
    if (already && roster.indexOf(playerId) >= 0) return { ok: true, reason: "idempotent", draft: next };
    if (action.requiredPlayerId && action.requiredPlayerId !== playerId) {
      return { ok: false, reason: "keeper", keeperId: action.requiredPlayerId, draft: next };
    }
    if (action.blockedIds && action.blockedIds.indexOf(playerId) >= 0) {
      return { ok: false, reason: "reserved", draft: next };
    }
    const bi = next.board.indexOf(playerId);
    if (bi < 0) return { ok: false, reason: "not-on-board", draft: next };
    const lookup = action.lookup || function () { return null; };
    const incoming = lookup(playerId) || { id: playerId };
    const owned = [];
    Object.keys(next.rosters).forEach((tid) => {
      (next.rosters[tid] || []).forEach((id) => {
        const p = lookup(id);
        if (p) owned.push(p);
      });
    });
    if (clashesWithAny(incoming, owned)) {
      next.board.splice(bi, 1);
      return { ok: false, reason: "owned", draft: next };
    }
    next.board.splice(bi, 1);
    roster.push(playerId);
    next.rosters[teamId] = roster;
    const overall = next.draftPick + 1;
    const round = Math.floor(next.draftPick / 32) + 1;
    next.picks.push({ pick: overall, overall: overall, round: round, teamId: teamId, playerId: playerId });
    next.draftPick = overall;
    return { ok: true, reason: "picked", draft: next, playerId: playerId };
  }

  function commitCollegePick(draft, action) {
    action = action || {};
    const cd = draft || {};
    const order = cd.order || [];
    const idx = cd.idx || 0;
    const next = {
      year: cd.year,
      order: order,
      idx: idx,
      board: (cd.board || []).slice(),
      picks: (cd.picks || []).slice(),
      rosters: {}
    };
    Object.keys(cd.rosters || {}).forEach((k) => { next.rosters[k] = (cd.rosters[k] || []).slice(); });
    if (idx >= order.length) return { ok: false, reason: "complete", draft: next };
    const slot = order[idx];
    if (action.expectedTeamId && action.expectedTeamId !== slot.ownerTeamId) return { ok: false, reason: "wrong-team", draft: next };
    const playerId = action.playerId;
    const dupPick = next.picks.some((pk) => pk && pk.playerId === playerId);
    if (dupPick) return { ok: true, reason: "idempotent", draft: next };
    const bi = next.board.indexOf(playerId);
    if (bi < 0) return { ok: false, reason: "not-on-board", draft: next };
    const lookup = action.lookup || function () { return null; };
    const incoming = lookup(playerId) || { id: playerId };
    const owned = (action.ownedPlayers || []).slice();
    Object.keys(next.rosters).forEach((tid) => {
      (next.rosters[tid] || []).forEach((id) => { const p = lookup(id); if (p) owned.push(p); });
    });
    if (clashesWithAny(incoming, owned)) {
      next.board.splice(bi, 1);
      return { ok: false, reason: "owned", draft: next };
    }
    next.board.splice(bi, 1);
    if (!next.rosters[slot.ownerTeamId]) next.rosters[slot.ownerTeamId] = [];
    next.rosters[slot.ownerTeamId].push(playerId);
    next.picks.push({
      overall: slot.overall, round: slot.round, pick: slot.pick,
      teamId: slot.ownerTeamId, originalTeamId: slot.originalTeamId, playerId: playerId
    });
    next.idx = idx + 1;
    return { ok: true, reason: "picked", draft: next, slot: slot, playerId: playerId };
  }

  function realClassYears(prospects) {
    const years = [];
    (prospects || []).forEach((p) => {
      if (!p || p.generated || p.fictional || p.real === false) return;
      const y = Number(p.year || p.draftClass);
      if (y) years.push(y);
    });
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }

  function classPolicy(year, prospects) {
    const y = Number(year);
    const years = realClassYears(prospects);
    const last = years.length ? years[years.length - 1] : 0;
    if (years.indexOf(y) >= 0) return "real";
    if (!y || y < last || y === last + 1) return "unavailable";
    if (y >= GENERATED_FLOOR_YEAR && y >= last + 2) return "generated";
    return "unavailable";
  }

  function pickFreeAgent(roster, fa) {
    const counts = countPositions(roster);
    const phase = rosterPhase(counts);
    const pool = (fa || []).filter(Boolean);
    function bestAt(pos) {
      return pool.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr || String(a.id).localeCompare(String(b.id)))[0] || null;
    }
    const order = phase.starterHoles.concat(phase.depthHoles);
    for (let i = 0; i < order.length; i++) {
      const hit = bestAt(order[i]);
      if (hit) return hit;
    }
    if (!pool.length) return null;
    return pool.slice().sort((a, b) => b.ovr - a.ovr || String(a.id).localeCompare(String(b.id)))[0];
  }

  /* Drop the lowest surplus players until the roster is at `limit`.
   * The last starter at a position is kept while anyone above the starter
   * count can be released. */
  function trimRoster(players, limit) {
    const pool = (players || []).slice();
    const cut = [];
    const cap = limit == null ? 53 : limit;
    while (pool.length > cap) {
      const counts = countPositions(pool);
      let candidates = pool.filter((p) => (counts[p.pos] || 0) > (STARTER_NEED[p.pos] || 1));
      if (!candidates.length) candidates = pool.filter((p) => (counts[p.pos] || 0) > 1);
      if (!candidates.length) candidates = pool;
      candidates.sort((a, b) => (a.ovr || 0) - (b.ovr || 0) || String(a.id).localeCompare(String(b.id)));
      const victim = candidates[0];
      cut.push(victim);
      pool.splice(pool.indexOf(victim), 1);
    }
    return { keep: pool, cut: cut };
  }

  const GEN_FIRST = ["Ames","Bodhi","Cullen","Dax","Ellis","Fen","Gale","Hart","Ivo","Joss","Keene","Lenn","Moss","Nico","Orin","Pax","Quill","Rho","Soren","Tate","Umber","Voss","Wynn","York","Zed","Briar","Cade","Dell","Ewan","Frost"];
  const GEN_LAST = ["Adler","Bram","Cobb","Dune","Ellery","Frost","Greer","Holt","Ives","Jasper","Kern","Lowe","Marsh","Nyx","Oak","Pike","Rowe","Slate","Thorn","Underwood","Vale","West","Yard","Zane","Quill","Harrow","Penn","Sable","Drake","Voss"];
  const GEN_QUOTA = [
    ["QB", 15], ["RB", 18], ["WR", 34], ["TE", 16], ["OT", 22], ["OG", 20], ["C", 12],
    ["DE", 22], ["DT", 18], ["LB", 26], ["CB", 26], ["S", 17], ["K", 7], ["P", 7]
  ];
  const GEN_SIZE = {
    QB: [73, 77, 205, 235], RB: [69, 73, 185, 235], WR: [70, 76, 180, 220], TE: [75, 78, 235, 265],
    OT: [76, 80, 300, 340], OG: [75, 78, 300, 335], C: [74, 77, 290, 320],
    DE: [74, 78, 250, 290], DT: [74, 77, 290, 330], LB: [72, 76, 225, 255],
    CB: [70, 75, 180, 210], S: [71, 75, 190, 220], K: [70, 74, 175, 210], P: [72, 76, 190, 225]
  };

  function generateProspectClass(year, avoidPlayers) {
    const y = Number(year);
    const rng = rngFrom(hashStr("afa-gen-class:" + y));
    const blocked = new Set();
    (avoidPlayers || []).forEach((p) => {
      const n = foldName(p && p.name);
      if (n) blocked.add(n);
    });
    const combos = [];
    GEN_FIRST.forEach((f) => GEN_LAST.forEach((l) => combos.push(f + " " + l)));
    const ordered = shuffle(combos, rng);
    const names = [];
    for (let i = 0; i < ordered.length && names.length < 260; i++) {
      const n = ordered[i];
      if (blocked.has(foldName(n))) continue;
      if (names.some((x) => foldName(x) === foldName(n))) continue;
      names.push(n);
      blocked.add(foldName(n));
    }
    const slots = [];
    GEN_QUOTA.forEach((pair) => { for (let i = 0; i < pair[1]; i++) slots.push(pair[0]); });
    const positions = shuffle(slots, rngFrom(hashStr("afa-gen-pos:" + y)));
    const n = Math.min(names.length, positions.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const pos = positions[i];
      const sizeRng = rngFrom(hashStr("afa-gen-size:" + y + ":" + i));
      const band = GEN_SIZE[pos] || [72, 76, 200, 240];
      const heightIn = band[0] + Math.floor(sizeRng() * (band[1] - band[0] + 1));
      const weight = band[2] + Math.floor(sizeRng() * (band[3] - band[2] + 1));
      const ft = Math.floor(heightIn / 12);
      const inch = heightIn % 12;
      const ovr = Math.max(58, Math.min(84, Math.round(82 - (i / Math.max(1, n - 1)) * 22)));
      const age = 21 + (hashStr("afa-gen-age:" + y + ":" + i) % 3);
      out.push({
        id: "gen_" + y + "_" + String(i + 1).padStart(3, "0"),
        name: names[i],
        pos: pos,
        age: age,
        height: ft + "'" + inch + "\"",
        weight: weight,
        college: null,
        ovr: ovr,
        number: null,
        real: false,
        fictional: true,
        generated: true,
        prospect: true,
        draftClass: y,
        year: y,
        sleeperId: null,
        espnId: null,
        bio: null,
        stats: null,
        label: "Fictional prospect",
        source: "afa-generated"
      });
    }
    return out;
  }

  function snakeTeamId(pickIndex, order) {
    const pos = pickIndex % 32;
    const round = Math.floor(pickIndex / 32);
    if (!order || order.length < 32) return null;
    return round % 2 === 0 ? order[pos] : order[31 - pos];
  }

  /* Reference simulator. Uses recommend + commitPick, same as the app. */
  function runSnakeDraft(config) {
    config = config || {};
    const teamIds = config.teamIds.slice();
    const rng = rngFrom(config.seed >>> 0);
    const order = config.order ? config.order.slice() : shuffle(teamIds, rng);
    const rounds = config.rounds || 53;
    const total = rounds * teamIds.length;
    const byId = Object.create(null);
    (config.players || []).forEach((p) => { if (p && p.id) byId[p.id] = p; });
    const lookup = function (id) { return byId[id] || null; };
    let draft = {
      draftPick: 0,
      board: (config.players || []).map((p) => p.id),
      rosters: {},
      picks: []
    };
    teamIds.forEach((id) => { draft.rosters[id] = []; });
    const kept = [];
    const deduped = dedupeIds(draft.board, lookup, kept);
    draft.board = deduped.ids;
    const maxPicks = config.maxPicks == null ? total : config.maxPicks;
    const userTeamId = config.userTeamId || null;
    const importIds = (config.importIds || []).filter((id) => byId[id]);
    const schemes = config.schemes || {};
    let stopped = null;
    while (draft.draftPick < total && draft.draftPick < maxPicks && draft.board.length) {
      const tid = snakeTeamId(draft.draftPick, order);
      if (config.stopWhen && config.stopWhen({ draft: draft, teamId: tid })) { stopped = "stopWhen"; break; }
      const mode = (config.desk && config.desk[tid]) || (tid === userTeamId ? (config.userMode || "auto") : "auto");
      if (config.simToManual && mode !== "auto") { stopped = "manual"; break; }
      const roster = (draft.rosters[tid] || []).map(lookup).filter(Boolean);
      const league = {};
      teamIds.forEach((id) => { league[id] = (draft.rosters[id] || []).map(lookup).filter(Boolean); });
      const boardPlayers = draft.board.map(lookup).filter(Boolean);
      const reserved = new Set(importIds);
      const cpuBoard = tid === userTeamId ? boardPlayers : boardPlayers.filter((p) => !reserved.has(p.id));
      const pending = importIds.filter((id) => draft.board.indexOf(id) >= 0).map(lookup).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
      let player = null;
      let required = null;
      if (tid === userTeamId && pending.length) {
        player = pending[0];
        required = pending[0].id;
      } else if (mode === "manual" && typeof config.manualPicker === "function") {
        player = config.manualPicker({ teamId: tid, board: cpuBoard, roster: roster, recommend: recommend({ board: cpuBoard, roster: roster, teamId: tid, pickIndex: draft.draftPick, scheme: schemes[tid], leagueRosters: league }) });
      } else {
        player = recommend({ board: cpuBoard, roster: roster, teamId: tid, pickIndex: draft.draftPick, scheme: schemes[tid], leagueRosters: league });
      }
      if (!player) { stopped = "empty"; break; }
      const res = commitPick(draft, {
        teamId: tid,
        playerId: player.id,
        expectedTeamId: tid,
        totalPicks: total,
        requiredPlayerId: required,
        blockedIds: tid === userTeamId ? null : importIds,
        lookup: lookup
      });
      if (!res.ok) { stopped = res.reason; break; }
      draft = res.draft;
    }
    if (!stopped && draft.board.length === 0 && draft.draftPick < total) stopped = "empty";
    return { draft: draft, order: order, stopped: stopped, lookup: lookup };
  }

  root.AFADraft = {
    STARTER_NEED: STARTER_NEED,
    DEPTH_NEED: DEPTH_NEED,
    POS_PREMIUM: POS_PREMIUM,
    POLICY: POLICY,
    ALIAS_GROUPS: ALIAS_GROUPS,
    GENERATED_FLOOR_YEAR: GENERATED_FLOOR_YEAR,
    hashStr: hashStr,
    rngFrom: rngFrom,
    shuffle: shuffle,
    foldName: foldName,
    schoolKey: schoolKey,
    isDuplicateListing: isDuplicateListing,
    peopleClash: peopleClash,
    clashesWithAny: clashesWithAny,
    dedupeIds: dedupeIds,
    countPositions: countPositions,
    rosterPhase: rosterPhase,
    ageCurve: ageCurve,
    needMultiplier: needMultiplier,
    scorePlayer: scorePlayer,
    scoreProspect: scoreProspect,
    recommend: recommend,
    recommendProspect: recommendProspect,
    commitPick: commitPick,
    commitCollegePick: commitCollegePick,
    classPolicy: classPolicy,
    realClassYears: realClassYears,
    pickFreeAgent: pickFreeAgent,
    trimRoster: trimRoster,
    generateProspectClass: generateProspectClass,
    snakeTeamId: snakeTeamId,
    runSnakeDraft: runSnakeDraft
  };
})(typeof window !== "undefined" ? window : globalThis);
