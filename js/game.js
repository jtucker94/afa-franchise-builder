/* GM Franchise Builder / AFA playable v0.1 */
(function () {
  const A = window.AFA;
  const SAVE_KEY = "afa-gfb-v01";
  const state = {
    controlMode: "all",
    focusTeamId: A.TEAMS[0].id,
    skipBoot: localStorage.getItem("afa-skip-boot") === "1",
    coaches: {}, // teamId -> coachId
    selectedCoachId: null,
    draftOrder: [],
    pickIndex: 0,
    picks: [], // {pick, round, teamId, playerId}
    rosters: {}, // teamId -> [playerId]
    faLeft: [],
    week: 0,
    maxWeek: 8,
    schedule: [],
    results: [],
    standings: {},
    focusGame: null
  };

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    $(id).classList.add("active");
  };
  const logoUrl = (team) => "logos/" + team.logo;
  const rng = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  function initMenu() {
    const sel = $("focusTeam");
    sel.innerHTML = A.TEAMS.map((t) =>
      `<option value="${t.id}">${A.displayName(t)}</option>`
    ).join("");
    sel.value = state.focusTeamId;
    $("controlMode").onclick = (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      state.controlMode = btn.dataset.mode;
      [...$("controlMode").children].forEach((c) => c.classList.toggle("on", c === btn));
      $("focusTeamWrap").style.display = state.controlMode === "one" ? "flex" : "none";
    };
    sel.onchange = () => { state.focusTeamId = sel.value; };
    $("btnPlayAfa").onclick = startStory;
    $("btnSkipBootHint").onclick = () => {
      localStorage.setItem("afa-skip-boot", "1");
      state.skipBoot = true;
      $("btnSkipBootHint").textContent = "Intro skipped next launch";
    };
    const saved = localStorage.getItem(SAVE_KEY);
    $("btnResume").disabled = !saved;
    $("btnResume").onclick = () => {
      if (!saved) return;
      Object.assign(state, JSON.parse(saved));
      if (state.pickIndex < A.TOTAL_PICKS && Object.keys(state.coaches).length === 32) {
        renderDraft(); show("draft");
      } else if (Object.keys(state.coaches).length < 32) {
        renderCoaches(); show("coaches");
      } else {
        renderSeason(); show("season");
      }
    };
  }

  function bootThenMenu() {
    if (state.skipBoot) { show("menu"); return; }
    show("boot");
    const logo = $("bootLogo");
    requestAnimationFrame(() => logo.classList.add("show"));
    setTimeout(() => logo.classList.add("hide"), 3000);
    setTimeout(() => show("menu"), 5000);
  }

  function startStory() {
    state.coaches = {};
    state.selectedCoachId = null;
    state.draftOrder = buildSnakeOrder();
    state.pickIndex = 0;
    state.picks = [];
    state.rosters = Object.fromEntries(A.TEAMS.map((t) => [t.id, []]));
    state.faLeft = A.PLAYERS.map((p) => p.id);
    state.week = 0;
    state.results = [];
    state.standings = Object.fromEntries(A.TEAMS.map((t) => [t.id, { w: 0, l: 0, pf: 0, pa: 0 }]));
    state.focusGame = null;
    state.schedule = buildSchedule(state.maxWeek, 20261105);
    renderCoaches();
    show("coaches");
  }

  function buildSnakeOrder() {
    const ids = A.TEAMS.map((t) => t.id);
    const order = [];
    for (let r = 0; r < A.ROUNDS; r++) {
      const round = r % 2 === 0 ? ids.slice() : ids.slice().reverse();
      order.push(...round);
    }
    return order;
  }

  function buildSchedule(weeks, seed) {
    const r = rng(seed);
    const ids = A.TEAMS.map((t) => t.id);
    const games = [];
    for (let w = 1; w <= weeks; w++) {
      const pool = ids.slice().sort(() => r() - 0.5);
      for (let i = 0; i + 1 < pool.length; i += 2) {
        const flip = r() > 0.5;
        games.push({ week: w, homeId: flip ? pool[i] : pool[i + 1], awayId: flip ? pool[i + 1] : pool[i] });
      }
    }
    return games;
  }

  function renderCoaches() {
    const assigned = new Set(Object.values(state.coaches));
    const left = A.COACHES.filter((c) => !assigned.has(c.id));
    $("coachProgress").textContent = `${Object.keys(state.coaches).length} / 32`;
    $("btnToDraft").disabled = Object.keys(state.coaches).length < 32;
    $("coachList").innerHTML = left.map((c) => `
      <button type="button" class="item ${state.selectedCoachId === c.id ? "selected" : ""}" data-coach="${c.id}">
        <div>
          <strong>${c.name}</strong>
          <div class="meta">OVR ${c.ovr} · ${c.style}</div>
          <div class="meta">ex-${c.prev}</div>
        </div>
        <span class="badge">HC</span>
      </button>`).join("") || `<div class="muted">All coaches placed.</div>`;
    $("coachList").onclick = (e) => {
      const btn = e.target.closest("[data-coach]");
      if (!btn) return;
      state.selectedCoachId = btn.dataset.coach;
      renderCoaches();
    };
    $("coachTeams").innerHTML = A.TEAMS.map((t) => {
      const cid = state.coaches[t.id];
      const coach = cid ? A.coachById(cid) : null;
      return `<div class="team-card ${coach ? "" : "empty"}" data-team="${t.id}" style="border-color:${t.primary}">
        <div class="head">
          <img class="logo" src="${logoUrl(t)}" alt="" />
          <div><strong>${t.abbr}</strong><div class="meta">${A.displayName(t)}</div></div>
        </div>
        <div class="body">${coach ? `${coach.name} · ${coach.ovr}` : "Open HC seat — click to assign"}</div>
      </div>`;
    }).join("");
    $("coachTeams").onclick = (e) => {
      const card = e.target.closest("[data-team]");
      if (!card || !state.selectedCoachId) return;
      const tid = card.dataset.team;
      if (state.coaches[tid]) return;
      state.coaches[tid] = state.selectedCoachId;
      state.selectedCoachId = null;
      renderCoaches();
    };
    $("btnAutoCoaches").onclick = () => {
      const open = A.TEAMS.filter((t) => !state.coaches[t.id]);
      const used = new Set(Object.values(state.coaches));
      const pool = A.COACHES.filter((c) => !used.has(c.id)).slice().sort((a, b) => b.ovr - a.ovr);
      open.forEach((t, i) => { if (pool[i]) state.coaches[t.id] = pool[i].id; });
      state.selectedCoachId = null;
      renderCoaches();
    };
    $("btnAssistedCoach").onclick = () => {
      const open = A.TEAMS.find((t) => !state.coaches[t.id]);
      if (!open) return;
      const used = new Set(Object.values(state.coaches));
      const best = A.COACHES.filter((c) => !used.has(c.id)).sort((a, b) => b.ovr - a.ovr)[0];
      if (!best) return;
      state.coaches[open.id] = best.id;
      state.selectedCoachId = null;
      renderCoaches();
    };
    $("btnBackMenu").onclick = () => show("menu");
    $("btnToDraft").onclick = () => { renderDraft(); show("draft"); };
  }

  function currentTeamId() {
    return state.draftOrder[state.pickIndex];
  }

  function isUserPick(teamId) {
    if (state.controlMode === "all") return true;
    return teamId === state.focusTeamId;
  }

  function renderDraft() {
    const done = state.pickIndex >= A.TOTAL_PICKS;
    const teamId = done ? null : currentTeamId();
    const team = teamId ? A.teamById(teamId) : null;
    const round = done ? A.ROUNDS : Math.floor(state.pickIndex / A.TEAMS_N) + 1;
    const pickInRound = done ? A.TEAMS_N : (state.pickIndex % A.TEAMS_N) + 1;
    $("draftSub").textContent = done
      ? "Draft complete"
      : `Round ${round} · Pick ${pickInRound} · Overall ${state.pickIndex + 1}/${A.TOTAL_PICKS}`;
    $("onClock").textContent = done ? "Board locked" : `On the clock: ${A.displayName(team)}`;
    $("draftBar").style.width = `${(state.pickIndex / A.TOTAL_PICKS) * 100}%`;
    $("btnFinishDraft").disabled = !done;
    $("btnAutoPick").disabled = done;
    $("btnAutoRestDraft").disabled = done;

    const filter = $("posFilter");
    if (!filter.options.length) {
      filter.innerHTML = `<option value="ALL">ALL</option>` + A.POSITIONS.map((p) => `<option value="${p}">${p}</option>`).join("");
      filter.onchange = renderDraft;
    }
    const pos = filter.value || "ALL";
    const available = state.faLeft
      .map((id) => A.playerById(id))
      .filter((p) => pos === "ALL" || p.pos === pos)
      .sort((a, b) => b.ovr - a.ovr);
    $("playerList").innerHTML = available.map((p) => `
      <button type="button" class="player-btn" data-player="${p.id}" ${done ? "disabled" : ""}>
        <span><strong>${p.name}</strong><div class="meta">${p.pos} · Age ${p.age}</div></span>
        <span class="ovr">${p.ovr}</span>
      </button>`).join("") || `<div class="muted">No players left at this filter.</div>`;
    $("playerList").onclick = (e) => {
      const btn = e.target.closest("[data-player]");
      if (!btn || done) return;
      if (!isUserPick(teamId)) {
        autoPick();
        return;
      }
      makePick(btn.dataset.player);
    };

    $("draftBoard").innerHTML = state.picks.slice().reverse().slice(0, 48).map((pk) => {
      const t = A.teamById(pk.teamId);
      const p = A.playerById(pk.playerId);
      return `<div class="pick-chip"><strong>R${pk.round} P${pk.pick} · ${t.abbr}</strong>${p.name} (${p.pos} ${p.ovr})</div>`;
    }).join("") || `<div class="muted">No picks yet.</div>`;

    if (team) {
      const roster = state.rosters[team.id].map((id) => A.playerById(id));
      $("deskRoster").innerHTML = roster.map((p) =>
        `<div class="item"><div><strong>${p.name}</strong><div class="meta">${p.pos}</div></div><span class="badge">${p.ovr}</span></div>`
      ).join("") || `<div class="muted">Empty desk — first pick incoming.</div>`;
    } else {
      $("deskRoster").innerHTML = `<div class="muted">Draft finished.</div>`;
    }

    $("btnAutoPick").onclick = () => autoPick();
    $("btnAutoRestDraft").onclick = () => {
      while (state.pickIndex < A.TOTAL_PICKS) autoPick(true);
      renderDraft();
    };
    $("btnFinishDraft").onclick = () => { renderSeason(); show("season"); };

    // Auto AI desks in one-team mode
    if (!done && !isUserPick(teamId)) {
      setTimeout(() => { autoPick(); }, 180);
    }
  }

  function bestAvailable(teamId) {
    const roster = state.rosters[teamId].map((id) => A.playerById(id));
    const have = {};
    roster.forEach((p) => { have[p.pos] = (have[p.pos] || 0) + 1; });
    const needPos = A.POS_NEED.find((pos) => !have[pos]);
    const pool = state.faLeft.map((id) => A.playerById(id)).sort((a, b) => b.ovr - a.ovr);
    if (needPos) {
      const hit = pool.find((p) => p.pos === needPos);
      if (hit) return hit.id;
    }
    return pool[0] && pool[0].id;
  }

  function makePick(playerId) {
    if (state.pickIndex >= A.TOTAL_PICKS) return;
    if (!state.faLeft.includes(playerId)) return;
    const teamId = currentTeamId();
    const round = Math.floor(state.pickIndex / A.TEAMS_N) + 1;
    const pick = (state.pickIndex % A.TEAMS_N) + 1;
    state.faLeft = state.faLeft.filter((id) => id !== playerId);
    state.rosters[teamId].push(playerId);
    state.picks.push({ pick, round, teamId, playerId });
    state.pickIndex += 1;
    renderDraft();
  }

  function autoPick(silent) {
    if (state.pickIndex >= A.TOTAL_PICKS) return;
    const id = bestAvailable(currentTeamId());
    if (!id) return;
    if (silent) {
      const teamId = currentTeamId();
      const round = Math.floor(state.pickIndex / A.TEAMS_N) + 1;
      const pick = (state.pickIndex % A.TEAMS_N) + 1;
      state.faLeft = state.faLeft.filter((x) => x !== id);
      state.rosters[teamId].push(id);
      state.picks.push({ pick, round, teamId, playerId: id });
      state.pickIndex += 1;
    } else {
      makePick(id);
    }
  }

  function unitOvr(roster, positions, n) {
    const picks = roster.filter((p) => positions.includes(p.pos)).sort((a, b) => b.ovr - a.ovr).slice(0, n);
    if (!picks.length) return 55;
    return picks.reduce((s, p) => s + p.ovr, 0) / picks.length;
  }

  function teamPower(teamId) {
    const roster = state.rosters[teamId].map((id) => A.playerById(id));
    const coach = A.coachById(state.coaches[teamId]);
    const coachBoost = coach ? (coach.ovr - 80) * 0.08 : 0;
    const off = unitOvr(roster, ["QB"], 1) * 0.34
      + unitOvr(roster, ["RB"], 1) * 0.14
      + unitOvr(roster, ["WR"], 2) * 0.2
      + unitOvr(roster, ["TE"], 1) * 0.1
      + unitOvr(roster, ["OT", "OG", "C"], 5) * 0.22 + coachBoost;
    const def = unitOvr(roster, ["DE", "DT"], 3) * 0.36
      + unitOvr(roster, ["LB"], 2) * 0.24
      + unitOvr(roster, ["CB"], 2) * 0.24
      + unitOvr(roster, ["S"], 2) * 0.16 + coachBoost * 0.7;
    const st = unitOvr(roster, ["K"], 1) * 0.6 + unitOvr(roster, ["P"], 1) * 0.4;
    return { off, def, st };
  }

  function simGame(homeId, awayId, week, seed) {
    const r = rng(seed);
    const home = A.teamById(homeId);
    const away = A.teamById(awayId);
    const hp = teamPower(homeId);
    const ap = teamPower(awayId);
    const hEdge = (hp.off - ap.def) / 18 + 1.4;
    const aEdge = (ap.off - hp.def) / 18;
    const sample = (exp) => Math.max(3, Math.round(exp + (r() + r() + r() - 1.5) * 7));
    let homePts = sample(21 + hEdge * 4);
    let awayPts = sample(19 + aEdge * 4);
    if (homePts === awayPts) homePts += 3;
    const labels = ["3-and-out", "Field goal", "Touchdown", "Punt", "Turnover", "Long drive FG", "Red-zone TD", "Explosive TD"];
    const drives = [];
    for (let i = 0; i < 8; i++) {
      const homeBall = i % 2 === 0;
      const kind = labels[Math.floor(r() * labels.length)];
      drives.push(`${homeBall ? home.abbr : away.abbr}: ${kind}`);
    }
    return { week, homeId, awayId, homePts, awayPts, drives, tag: `Week ${week}` };
  }

  function applyResult(g) {
    const h = state.standings[g.homeId];
    const a = state.standings[g.awayId];
    h.pf += g.homePts; h.pa += g.awayPts;
    a.pf += g.awayPts; a.pa += g.homePts;
    if (g.homePts > g.awayPts) { h.w++; a.l++; } else { a.w++; h.l++; }
  }

  function renderSeason() {
    const desk = $("deskSelect");
    const opts = A.TEAMS.map((t) => `<option value="${t.id}">${A.displayName(t)}</option>`).join("");
    desk.innerHTML = opts;
    $("tradeFrom").innerHTML = opts;
    $("tradeTo").innerHTML = opts;
    if (![...desk.options].some((o) => o.value === state.focusTeamId)) state.focusTeamId = A.TEAMS[0].id;
    desk.value = state.focusTeamId;
    $("tradeFrom").value = state.focusTeamId;
    $("tradeTo").value = A.TEAMS.find((t) => t.id !== state.focusTeamId).id;
    desk.onchange = () => { state.focusTeamId = desk.value; renderSeason(); };
    $("seasonSub").textContent = state.week >= state.maxWeek
      ? `Season complete · ${state.maxWeek} weeks`
      : `Week ${state.week} / ${state.maxWeek}`;
    const team = A.teamById(state.focusTeamId);
    const coach = A.coachById(state.coaches[team.id]);
    const power = teamPower(team.id);
    $("deskTitle").textContent = `${A.displayName(team)} · HC ${coach ? coach.name : "—"} · OFF ${power.off.toFixed(1)} DEF ${power.def.toFixed(1)}`;
    const roster = state.rosters[team.id].map((id) => A.playerById(id)).sort((a, b) => b.ovr - a.ovr);
    $("seasonRoster").innerHTML = roster.map((p) =>
      `<div class="item"><div><strong>${p.name}</strong><div class="meta">${p.pos} · Age ${p.age}</div></div><span class="badge gold">${p.ovr}</span></div>`
    ).join("");

    $("broadcast").innerHTML = state.focusGame ? broadcastHtml(state.focusGame) : `<div class="muted">Sim a week to open the broadcast board.</div>`;
    $("standings").innerHTML = Object.entries(A.DIVISIONS).map(([conf, divs]) =>
      divs.map((div) => {
        const teams = A.teamsInDivision(conf, div).slice().sort((a, b) => {
          const sa = state.standings[a.id], sb = state.standings[b.id];
          return sb.w - sa.w || (sb.pf - sb.pa) - (sa.pf - sa.pa);
        });
        return `<div class="panel" style="padding:10px"><h3 style="margin:0 0 6px">${conf} · ${div}</h3>
          <table><thead><tr><th>Team</th><th>W</th><th>L</th><th>Diff</th></tr></thead>
          <tbody>${teams.map((t) => {
            const s = state.standings[t.id];
            return `<tr><td>${t.abbr}</td><td>${s.w}</td><td>${s.l}</td><td>${s.pf - s.pa}</td></tr>`;
          }).join("")}</tbody></table></div>`;
      }).join("")
    ).join("");

    $("btnSimWeek").disabled = state.week >= state.maxWeek;
    $("btnSimRest").disabled = state.week >= state.maxWeek;
    $("btnSimWeek").onclick = () => { simWeeks(1); };
    $("btnSimRest").onclick = () => { simWeeks(state.maxWeek - state.week); };
    $("btnDoTrade").onclick = doTrade;
    $("btnSignFA").onclick = signFA;
    $("btnCut").onclick = cutLowest;
    $("btnSave").onclick = save;
    $("btnNewStory").onclick = () => { if (confirm("Start a new AFA story? Current progress stays in Save until overwritten.")) startStory(); };
  }

  function broadcastHtml(g) {
    const home = A.teamById(g.homeId);
    const away = A.teamById(g.awayId);
    return `<div class="broadcast">
      <div class="scorebug" style="background:linear-gradient(90deg,${away.primary},#111 45%,${home.primary})">
        <div class="side"><div>${away.city}</div><div style="font-weight:800;font-size:1.2rem">${away.abbr}</div><div class="pts">${g.awayPts}</div></div>
        <div style="text-align:center"><div class="tiny" style="color:#ddd">${g.tag.toUpperCase()}</div><div style="font-weight:800">FINAL</div></div>
        <div class="side"><div>${home.city}</div><div style="font-weight:800;font-size:1.2rem">${home.abbr}</div><div class="pts">${g.homePts}</div></div>
      </div>
      <div class="field"></div>
      <div class="drives">${g.drives.map((d) => `<div class="drive">${d}</div>`).join("")}</div>
    </div>`;
  }

  function simWeeks(n) {
    let lastUser = null;
    for (let i = 0; i < n; i++) {
      if (state.week >= state.maxWeek) break;
      const w = state.week + 1;
      const slate = state.schedule.filter((g) => g.week === w);
      const played = slate.map((g, idx) => simGame(g.homeId, g.awayId, w, 9000 + w * 97 + idx * 13));
      played.forEach(applyResult);
      state.results.push(...played);
      state.week = w;
      const focus = state.controlMode === "one" ? state.focusTeamId : state.focusTeamId;
      lastUser = played.find((g) => g.homeId === focus || g.awayId === focus) || played[0];
    }
    state.focusGame = lastUser;
    renderSeason();
  }

  function doTrade() {
    const a = $("tradeFrom").value;
    const b = $("tradeTo").value;
    if (a === b) return;
    const ra = state.rosters[a], rb = state.rosters[b];
    if (!ra.length || !rb.length) return;
    const pa = ra.slice().map((id) => A.playerById(id)).sort((x, y) => y.ovr - x.ovr)[0];
    const pb = rb.slice().map((id) => A.playerById(id)).sort((x, y) => y.ovr - x.ovr)[0];
    state.rosters[a] = ra.filter((id) => id !== pa.id).concat(pb.id);
    state.rosters[b] = rb.filter((id) => id !== pb.id).concat(pa.id);
    renderSeason();
  }

  function signFA() {
    const desk = state.focusTeamId;
    const best = state.faLeft.map((id) => A.playerById(id)).sort((a, b) => b.ovr - a.ovr)[0];
    if (!best) return alert("Free-agent pool is empty.");
    state.faLeft = state.faLeft.filter((id) => id !== best.id);
    state.rosters[desk].push(best.id);
    renderSeason();
  }

  function cutLowest() {
    const desk = state.focusTeamId;
    const roster = state.rosters[desk];
    if (roster.length < 2) return;
    const lowest = roster.map((id) => A.playerById(id)).sort((a, b) => a.ovr - b.ovr)[0];
    state.rosters[desk] = roster.filter((id) => id !== lowest.id);
    state.faLeft.push(lowest.id);
    renderSeason();
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    $("btnResume").disabled = false;
    alert("Progress saved in this browser.");
  }

  initMenu();
  bootThenMenu();
})();
