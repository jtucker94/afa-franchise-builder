/* GM Franchise Builder — AFA prototype v0.1 */
(function () {
  const STORAGE = "afa-gm-franchise-builder-v029";
  const SEASON_WEEKS = 18; // NFL: 17 games + 1 bye
  const GAMES_PER_TEAM = 17;
  const BYE_WEEK_MIN = 5;
  const BYE_WEEK_MAX = 14;
  const LEGACY_STORAGE = ["afa-gm-franchise-builder-v028", "afa-gm-franchise-builder-v027", "afa-gm-franchise-builder-v026", "afa-gm-franchise-builder-v025", "afa-gm-franchise-builder-v024", "afa-gm-franchise-builder-v023", "afa-gm-franchise-builder-v022", "afa-gm-franchise-builder-v021"];
  const AFA_CAP = (window.AFABridge && window.AFABridge.AFA_CAP) || 279200000;
  const { TEAMS, COACHES, PLAYERS, DIVISIONS, POSITIONS, POS_GROUPS, POS_NEED,
    ROUNDS, TOTAL_PICKS, teamById, coachById, playerById, displayName } = window.AFA;

  let state;
  let bootTimer = null;
  let clockTimer = null;
  let clockLeft = 15;
  let lastClockPick = -1;
  let draftOpenTimer = null;
  let draftRunning = false;
  let lastPickRefuse = null;
  let lastPickKeeperId = null;
  let proClashIds = null;
  const CLOCK_PRESETS = [
    { label: "15s", sec: 15 },
    { label: "30s", sec: 30 },
    { label: "1m", sec: 60 },
    { label: "2m", sec: 120 },
    { label: "3m", sec: 180 },
    { label: "4m", sec: 240 },
    { label: "5m", sec: 300 },
    { label: "6m", sec: 360 },
    { label: "7m", sec: 420 },
    { label: "8m", sec: 480 },
    { label: "9m", sec: 540 },
    { label: "10m", sec: 600 },
    { label: "No limit", sec: 0 }
  ];

  const ui = {
    selectedTeam: null,
    selectedCoach: null,
    selectedPlayer: null,
    posFilter: "ALL",
    query: "",
    hubTab: "home",
    tradeLeft: null,
    tradeRight: null,
    offer: [],
    ask: [],
    offerPicks: [],
    askPicks: [],
    draftIntro: true,
    draftTab: "board",
    draftViewTeam: null,
    lineupSide: "offense",
    formation: "11",
    defFormation: "base43",
    stFormation: "fg",
    replayView: "aerial"
  };

  function freshState() {
    return {
      version: "0.1.24",
      phase: "menu",
      mode: null,
      userTeamId: null,
      coachAssign: {},
      desks: {},
      draftOrder: [],
      draftPick: 0,
      board: PLAYERS.map((p) => p.id),
      picks: [],
      rosters: Object.fromEntries(TEAMS.map((t) => [t.id, []])),
      fa: [],
      week: 1,
      schedule: [],
      seasonDone: false,
      draftIntroSeen: false,
      seasonStarted: false,
      clockLimit: 15,
      clockPaused: false,
      seasonYear: 2027,
      draftYear: 2027,
      ownedPicks: [],
      collegeDraft: null,
      collegeDrafted: [],
      playerStats: {},
      gradingNorms: null,
      teamIR: {},
      salaryCap: AFA_CAP,
      useStatGrades: true,
      lastSeasonGames: [],
      hooks: { stadiums: null, dynasty: null, gameday: null },
      stadiums: null,
      dynasty: null,
      philosophy: {},
      chemistry: {},
      gamePlans: {},
      lastWatchedGame: null,
      playoffs: null,
      coachPool: null,
      liveDataEffects: false,
      realWorldStatus: window.AFARealStatus ? AFARealStatus.blank() : { enabled: false, scope: null, holds: {}, form: null }
    };
  }

  function snapshotUi() {
    return {
      selectedTeam: ui.selectedTeam,
      selectedCoach: ui.selectedCoach,
      selectedPlayer: ui.selectedPlayer,
      posFilter: ui.posFilter,
      query: ui.query,
      hubTab: ui.hubTab,
      tradeLeft: ui.tradeLeft,
      tradeRight: ui.tradeRight,
      offer: (ui.offer || []).slice(),
      ask: (ui.ask || []).slice(),
      offerPicks: (ui.offerPicks || []).slice(),
      askPicks: (ui.askPicks || []).slice(),
      draftIntro: ui.draftIntro,
      draftTab: ui.draftTab,
      draftViewTeam: ui.draftViewTeam,
      lineupSide: ui.lineupSide,
      formation: ui.formation || "11",
      defFormation: ui.defFormation || "base43",
      stFormation: ui.stFormation || "fg",
      replayView: ui.replayView || "aerial",
      viewTeamId: ui.viewTeamId || null
    };
  }

  function applyUiSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;
    Object.keys(snap).forEach((k) => {
      if (k in ui) ui[k] = snap[k];
    });
  }

  function captureActivePhase() {
    const active = document.querySelector(".screen.active");
    if (!active || !active.id || active.id.indexOf("screen-") !== 0) return;
    const id = active.id.slice("screen-".length);
    if (!id || id === "boot" || id === "directory" || id === "scouting") return;
    // Mid-draft: keep phase as draft even if you glanced at the menu
    if (draftInProgress() && (id === "menu" || id === "mode" || id === "story")) {
      state.phase = "draft";
      return;
    }
    state.phase = id;
  }

  /* v0.1.21 HARD RULE: one NFL player can exist in exactly one place.
   * Identity = Sleeper player_id when known, else GMFB id. Order of ownership: user club first,
   * then other clubs (fixed TEAMS order), then FA, then draft board. Later copies are dropped (never cloned). */
  function playerKey(id) {
    const p = playerById(id);
    if (!p) return "g:" + id;
    if (p.sleeperId) return "s:" + String(p.sleeperId);
    if (p.espnId) return "e:" + String(p.espnId);
    return "g:" + id;
  }
  /* One person, one place. Priority: user club, other clubs, free agency, draft board.
   * Sleeper id, ESPN id, verified listing aliases, or the same name+position+college.
   * Distinct people who only share a name stay. Pick history drops a later selection of
   * someone already picked; it does not erase a player who was later traded. */
  function enforceUniquePlayers() {
    if (!state || !state.rosters || !window.AFADraft) return 0;
    const kept = [];
    let fixed = 0;
    const apply = (ids) => {
      const r = AFADraft.dedupeIds(ids, playerById, kept);
      fixed += r.removed;
      return r.ids;
    };
    const order = TEAMS.map((t) => t.id).sort((a, b) => (a === state.userTeamId ? -1 : b === state.userTeamId ? 1 : 0));
    order.forEach((tid) => { if (Array.isArray(state.rosters[tid])) state.rosters[tid] = apply(state.rosters[tid]); });
    Object.keys(state.rosters).forEach((tid) => {
      if (order.indexOf(tid) < 0 && Array.isArray(state.rosters[tid])) state.rosters[tid] = apply(state.rosters[tid]);
    });
    if (Array.isArray(state.fa)) state.fa = apply(state.fa);
    if (Array.isArray(state.board)) state.board = apply(state.board);
    if (state.collegeDraft && Array.isArray(state.collegeDraft.board)) state.collegeDraft.board = apply(state.collegeDraft.board);
    const pickKept = [];
    if (Array.isArray(state.picks)) {
      state.picks = state.picks.filter((pk) => {
        if (!pk) return false;
        const p = playerById(pk.playerId) || { id: pk.playerId };
        if (AFADraft.clashesWithAny(p, pickKept)) { fixed++; return false; }
        pickKept.push(p);
        return true;
      });
    }
    if (Array.isArray(state.collegeDrafted)) {
      const draftedKept = [];
      const hist = AFADraft.dedupeIds(state.collegeDrafted, playerById, draftedKept);
      state.collegeDrafted = hist.ids;
      fixed += hist.removed;
    }
    if (state.sleeperImport && Array.isArray(state.sleeperImport.ids)) {
      const importKept = [];
      const r = AFADraft.dedupeIds(state.sleeperImport.ids, playerById, importKept);
      state.sleeperImport.ids = r.ids;
      fixed += r.removed;
    }
    if (fixed) { state.dupFixes = (state.dupFixes || 0) + fixed; console.warn("AFA: removed " + fixed + " duplicate player entries"); }
    return fixed;
  }
  function isOwned(id) {
    if (!window.AFADraft) {
      const k = playerKey(id);
      return Object.values(state.rosters || {}).some((r) => Array.isArray(r) && r.some((x) => playerKey(x) === k));
    }
    const p = playerById(id) || { id: id };
    const owned = [];
    Object.keys(state.rosters || {}).forEach((tid) => {
      (state.rosters[tid] || []).forEach((x) => { const q = playerById(x); if (q) owned.push(q); });
    });
    return AFADraft.clashesWithAny(p, owned);
  }
  function save() {
    try {
      enforceUniquePlayers();
      captureActivePhase();
      state.version = "0.1.24";
      const payload = {
        version: "0.1.24",
        savedAt: Date.now(),
        state: state,
        ui: snapshotUi()
      };
      localStorage.setItem(STORAGE, JSON.stringify(payload));
    } catch (e) { /* ignore quota */ }
  }

  function load() {
    try {
      let raw = localStorage.getItem(STORAGE);
      if (!raw) { for (const k of LEGACY_STORAGE) { raw = localStorage.getItem(k); if (raw) break; } }
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed) return false;
      let savedState = null;
      let savedUi = null;
      if (parsed.state && parsed.version) {
        savedState = parsed.state;
        savedUi = parsed.ui || null;
      } else if (parsed.version) {
        savedState = parsed; // legacy flat saves
      } else {
        return false;
      }
      const ver = savedState.version || parsed.version;
      if (!["0.1.24","0.1.23","0.1.22","0.1.21","0.1.20","0.1.19","0.1.17","0.1.16","0.1.15","0.1.14","0.1.13","0.1.12","0.1.11","0.1.10","0.1.9","0.1.8","0.1.7","0.1.6","0.1.5","0.1.4","0.1.3","0.1.2","0.1.1","0.1"].includes(ver)) return false;
      state = Object.assign(freshState(), savedState);
      state.version = "0.1.24";
      if (!state.playerStats) state.playerStats = {};
      if (!state.teamIR) state.teamIR = {};
      if (!state.salaryCap) state.salaryCap = AFA_CAP;
      if (typeof state.useStatGrades !== "boolean") state.useStatGrades = true;
      if (!state.hooks) state.hooks = { stadiums: null, dynasty: null, gameday: null };
      if (!state.philosophy) state.philosophy = {};
      if (!state.chemistry) state.chemistry = {};
      if (!state.gamePlans) state.gamePlans = {};
      if (state.gradingNorms && window.AFAGrading) {
        try { window.AFAGrading.importNorms(state.gradingNorms); } catch (e) {}
      }
      try { seedGradesAndContracts(false); } catch (e) { console.warn("seed migrate", e); }
      try { ensureStadiums(); } catch (e) { console.warn("stadiums migrate", e); }
      try { ensureDynasty(); } catch (e) { console.warn("dynasty migrate", e); }
      if (typeof state.clockLimit !== "number") state.clockLimit = 15;
      if (typeof state.clockPaused !== "boolean") state.clockPaused = state.clockLimit === 0;
      if (typeof state.liveDataEffects !== "boolean") state.liveDataEffects = false;
      if (window.AFARealStatus) AFARealStatus.migrate(state);
      else if (!state.realWorldStatus) state.realWorldStatus = { enabled: false, scope: null, holds: {}, form: null };
      if (typeof savedState.seasonStarted !== "boolean") {
        // Week 1 after a founding draft still counts as draft era so Draft Room stays available
        state.seasonStarted = !!(state.seasonDone || ((state.week | 0) > 1));
      }
      clockLeft = state.clockLimit || 0;
      applyUiSnapshot(savedUi);
      if (!Array.isArray(ui.offerPicks)) ui.offerPicks = [];
      if (!Array.isArray(ui.askPicks)) ui.askPicks = [];
      if (state.phase === "hub" || state.seasonStarted) ensurePicks();
      try { rehydrateGeneratedClasses(); } catch (e) { console.warn("generated class", e); }
      try { enforceUniquePlayers(); } catch (e) { console.warn("dedupe", e); }
      return true;
    } catch (e) {
      return false;
    }
  }

  function describeSaveSpot() {
    const phase = state.phase || "menu";
    if (phase === "coaches") {
      const n = Object.keys(state.coachAssign || {}).filter((k) => state.coachAssign[k]).length;
      return "Coach desk · " + n + "/32 hired";
    }
    if (phase === "draft") {
      const tab = ui.draftTab || "board";
      if (state.draftIntroSeen === false) return "Draft intro";
      return "Draft · pick " + Math.min((state.draftPick || 0) + 1, TOTAL_PICKS) + "/" + TOTAL_PICKS + " · " + tab;
    }
    if (phase === "hub") return "Season hub · week " + (state.week || 1) + " · " + (ui.hubTab || "standings");
    if (phase === "story") return "Story";
    if (phase === "mode") return "Mode select";
    return "Main menu";
  }

  function manualSave() {
    save();
    const fab = $("btn-save-anywhere");
    if (fab) {
      fab.classList.remove("flash");
      void fab.offsetWidth;
      fab.classList.add("flash");
    }
    toast("Saved exactly here — " + describeSaveSpot());
  }

  function hasProgress() {
    return !!(state && (state.mode || state.phase === "story" || Object.keys(state.coachAssign || {}).length || (state.picks || []).length || state.phase === "hub"));
  }

  function draftInProgress() {
    if (!state) return false;
    if (!(state.draftOrder || []).length) return false;
    if ((state.draftPick | 0) >= TOTAL_PICKS) return false;
    return true;
  }

  function draftEraOpen() {
    return !!(state && (state.draftOrder || []).length && !state.seasonStarted);
  }

  function goDraftRoom() {
    if (!draftEraOpen()) {
      toast("Founding draft isn't open.");
      updateDraftRoomFab();
      syncHubDraftTab();
      return;
    }
    if (state.draftIntroSeen) ui.draftIntro = false;
    ui.draftTab = "board";
    state.phase = "draft";
    if (draftInProgress()) {
      renderDraft();
    } else {
      // Picks finished — open review board (season hub is one click away)
      renderDraftReview();
    }
    updateDraftRoomFab();
    syncHubDraftTab();
    toast("Back in the draft room.");
  }

  function updateDraftRoomFab() {
    const fab = $("btn-draft-room");
    if (!fab) return;
    const open = draftEraOpen();
    const onDraft = !!document.querySelector("#screen-draft.active");
    // Hide while already in the draft room so it can't cover Sim / Auto-pick
    fab.hidden = !open || onDraft;
    if (!open || onDraft) return;
    fab.textContent = "Draft Room";
    fab.title = "Return to the draft room / board";
  }

  function syncHubDraftTab() {
    const btn = $("btn-hub-draft-room");
    if (!btn) return;
    const show = draftEraOpen();
    btn.hidden = !show;
    if (show) {
      btn.onclick = goDraftRoom;
      // Keep it visually first: already first in HTML
      btn.classList.add("btn-draft-tab");
    }
  }

  function $(id) { return document.getElementById(id); }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    const sc = $("screen-" + id);
    if (sc) {
      sc.classList.add("active");
      sc.scrollTop = 0;
      const ws = sc.querySelector(".workspace");
      if (ws) ws.scrollTop = 0;
    }
    ["boot","menu","mode","story","coaches","draft","hub","directory","scouting"].forEach((name) => {
      document.body.classList.toggle("screen-" + name + "-active", name === id);
    });
    if (window.AFAMobileUnpinScout) { try { window.AFAMobileUnpinScout(); } catch (e) {} }
    if (window.AFAMobile && typeof window.AFAMobile.resetScreenScroll === "function") {
      try { window.AFAMobile.resetScreenScroll(id); } catch (_) {}
    }
    updateDraftRoomFab();
    if (window.AFANewsTicker && AFANewsTicker.onScreen) {
      try { AFANewsTicker.onScreen(); } catch (e) {}
    }
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.style.pointerEvents = "none";
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function ovrClass(n) {
    if (n >= 94) return "ovr elite";
    if (n >= 88) return "ovr star";
    return "ovr good";
  }

  function jerseyNum(p) {
    if (!p || p.number == null || Number(p.number) === 0) return "—";
    return String(Number(p.number));
  }

  function attrTone(n) {
    if (n >= 90) return "ovr elite";
    if (n >= 80) return "ovr star";
    if (n >= 70) return "ovr good";
    return "";
  }

  function ensureScout(player) {
    if (!player) return null;
    if (player.scout && player.scout.schema === 4) return player;
    if (window.AFA && typeof window.AFA.enrichPlayer === "function") return window.AFA.enrichPlayer(player);
    return player;
  }

  function scoutCardHtml(player) {
    player = ensureScout(player);
    if (!player || !player.scout) return "";
    const s = player.scout;
    const keys = (s.madden.keys || []).slice(0, 8);
    const attrs = keys.map(([code, label]) => {
      const v = s.madden.attrs[code];
      const pct = Math.max(0, Math.min(100, v));
      const tone = attrTone(v);
      return `<div class="scout-attr"><span class="k">${label}</span><div class="scout-mini-bar"><span class="fill ${tone}" style="width:${pct}%"></span></div><span class="v ${tone}">${v}</span></div>`;
    }).join("");
    const pffEst = s.pff.estimated !== false;
    return `
      <div class="scout-card-top">
        ${s.face}
        <div class="scout-id">
          <h3 class="name">${player.name}</h3>
          <div class="meta">#${player.number || "—"} · ${player.pos} · Age ${player.age}</div>
          <div class="scout-grades">
            <div class="scout-grade pff"><span class="g-label">PFF${pffEst ? " est." : ""}</span><span class="g-val">${s.pff.overall.toFixed(1)}</span><span class="g-sub">${s.pff.label}${pffEst ? " · estimate" : ""}</span></div>
            <div class="scout-grade madden"><span class="g-label">Madden</span><span class="g-val">${s.madden.ovr}</span><span class="g-sub">OVR</span></div>
            <div class="scout-grade gmfb"><span class="g-label">GMFB</span><span class="g-val">${s.gmfb.ovr}</span><span class="g-sub">algo v${s.gmfb.version}${s.gmfb.sleeper ? " · Sleeper " + (s.gmfb.sleeper.adj > 0 ? "+" : "") + s.gmfb.sleeper.adj : ""}</span></div>
            ${player.grade ? `<div class="scout-grade afa"><span class="g-label">AFA Grade</span><span class="g-val">${player.grade.overall}</span><span class="g-sub">base ${player.ovrBase != null ? player.ovrBase : "—"} · conf ${Math.round((player.grade.confidence || 0) * 100)}%</span></div>` : ""}
          </div>
        </div>
      </div>
      <div class="scout-body">
        <div class="scout-vitals">
          <span><b>HT</b> ${player.height || "—"}</span>
          <span><b>WT</b> ${player.weight || "—"} lbs</span>
          <span><b>Hand</b> ${player.hand || "—"}</span>
          <span><b>College</b> ${player.college || "—"}</span>
        </div>
        ${window.AFA && AFA.sleeperHtml ? AFA.sleeperHtml(player) : ""}
        <div class="scout-section-label">PFF-style splits <span class="est-tag">estimate</span></div>
        <div class="scout-pff-row">
          <div class="scout-pff-cell"><span class="t">${s.pff.label}</span><span class="n">${s.pff.grade.toFixed(1)}</span></div>
          <div class="scout-pff-cell"><span class="t">Pass</span><span class="n">${s.pff.pass.toFixed(1)}</span></div>
          <div class="scout-pff-cell"><span class="t">Run</span><span class="n">${s.pff.run.toFixed(1)}</span></div>
        </div>
        <div class="scout-section-label">Madden attributes</div>
        <div class="scout-attrs">${attrs}</div>
        ${window.AFACareersUI ? `<div class="scout-section-label">NFL career</div>${AFACareersUI.statsHtml(player.id)}` : ""}
        <div class="scout-foot">${s.gmfb.label}: ${s.gmfb.note}
          ${window.AFAPlayersTab ? ` · <button type="button" class="btn btn-sm" data-profile="${player.id}">Full profile</button>` : ""}
        </div>
      </div>`;
  }

  let scoutHideTimer = null;
  function placeScoutCard(card, clientX, clientY) {
    // Mobile uses CSS modal centering — don't fight it with inline coords
    const mobile = (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) ||
      (window.AFAMobile && window.AFAMobile.isMobile && window.AFAMobile.isMobile());
    if (mobile) {
      card.style.left = "";
      card.style.top = "";
      card.style.right = "";
      card.style.bottom = "";
      return;
    }
    const pad = 14;
    const w = card.offsetWidth || 360;
    const h = card.offsetHeight || 420;
    let left = clientX + 18;
    let top = clientY + 18;
    if (left + w > window.innerWidth - pad) left = clientX - w - 16;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function showScoutCard(player, evt) {
    const card = $("scout-card");
    if (!card || !player) return;
    clearTimeout(scoutHideTimer);
    card.innerHTML = scoutCardHtml(player);
    const mobile = (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) ||
      (window.AFAMobile && window.AFAMobile.isMobile && window.AFAMobile.isMobile());
    if (mobile) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "scout-close";
      close.setAttribute("aria-label", "Close scout card");
      close.textContent = "×";
      close.onclick = (e) => { e.preventDefault(); e.stopPropagation(); hideScoutCard(0); card.classList.remove("pinned"); document.getElementById("scout-backdrop")?.classList.remove("show"); };
      card.insertBefore(close, card.firstChild);
      document.getElementById("scout-backdrop")?.classList.add("show");
    }
    card.hidden = false;
    card.classList.add("show");
    const cx = (evt && evt.clientX != null) ? evt.clientX : window.innerWidth / 2;
    const cy = (evt && evt.clientY != null) ? evt.clientY : window.innerHeight / 2;
    requestAnimationFrame(() => placeScoutCard(card, cx, cy));
  }

  function moveScoutCard(evt) {
    const card = $("scout-card");
    if (!card || card.hidden) return;
    placeScoutCard(card, evt.clientX, evt.clientY);
  }

  function hideScoutCard(delay) {
    const card = $("scout-card");
    if (!card) return;
    clearTimeout(scoutHideTimer);
    scoutHideTimer = setTimeout(() => {
      card.classList.remove("show", "pinned");
      card.hidden = true;
      document.getElementById("scout-backdrop")?.classList.remove("show");
    }, delay == null ? 80 : delay);
  }

  function bindScoutHover(rootEl) {
    if (!rootEl) return;
    const touchy = (window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches) || ("ontouchstart" in window);
    rootEl.querySelectorAll("[data-pid], [data-scout]").forEach((el) => {
      if (el._scoutBound) return;
      el._scoutBound = true;
      const pid = el.getAttribute("data-pid") || el.getAttribute("data-scout");
      el.addEventListener("mouseenter", (e) => {
        if (touchy) return;
        const p = playerById(pid);
        if (!p) return;
        el.classList.add("scout-hot");
        showScoutCard(p, e);
      });
      el.addEventListener("mousemove", (e) => { if (!touchy) moveScoutCard(e); });
      el.addEventListener("mouseleave", () => {
        if (touchy) return;
        el.classList.remove("scout-hot");
        hideScoutCard();
      });
      if (touchy) {
        el.addEventListener("click", (e) => {
          if (e.target.closest && e.target.closest("button, a, input, select, label, .btn")) return;
          if (el.closest(".apt-row, .apt-modal")) return; // Players tab opens the full profile instead
          const p = playerById(pid);
          if (!p) return;
          const card = $("scout-card");
          showScoutCard(p, e);
          if (card) card.classList.add("pinned");
        });
      }
    });
  }

  function logoImg(team, size) {
    const cls = "logo" + (size === "lg" ? " lg" : size === "sm" ? " sm" : "");
    return '<img class="' + cls + '" src="logos/' + team.logo + '" alt="' + displayName(team) +
      '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'">' +
      '<div class="' + cls + ' fallback" style="display:none;background:' + team.primary + '">' + team.abbr + '</div>';
  }

  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) || 1;
  }

  function rngFrom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function resumePhase() {
    ui.draftIntro = !state.draftIntroSeen;
    if (draftInProgress()) {
      state.phase = "draft";
      ui.draftTab = ui.draftTab || "board";
      renderDraft();
      updateDraftRoomFab();
      syncHubDraftTab();
      return;
    }
    if (draftEraOpen() && (state.draftPick | 0) >= TOTAL_PICKS) {
      // Recover from the old stuck complete screen
      enterSeasonHub();
      return;
    }
    const p = state.phase || "menu";
    if (p === "mode") renderMode();
    else if (p === "story") renderStory();
    else if (p === "coaches") renderCoaches();
    else if (p === "draft") renderDraft();
    else if (p === "hub") renderHub();
    else renderMenu();
    updateDraftRoomFab();
  }

  /* ---------- BOOT / MENU ---------- */
  function startBoot() {
    showScreen("boot");
    const go = () => {
      clearTimeout(bootTimer);
      bootTimer = null;
      renderMenu();
    };
    bootTimer = setTimeout(go, 5000);
    $("screen-boot").onclick = go;
  }

  function openDirectory() {
    showScreen("directory");
    if (window.AFADirectory) AFADirectory.mount($("directory-root"));
  }
  function openScouting() {
    showScreen("scouting");
    if (window.AFAScouting) AFAScouting.mount($("scouting-root"));
  }

  function renderMenu() {
    showScreen("menu");
    const cont = $("btn-continue");
    const mid = draftInProgress();
    const show = hasProgress() && (state.phase !== "menu" || mid);
    cont.style.display = show ? "inline-flex" : "none";
    cont.textContent = mid ? "Return to Draft" : "Continue";
    updateDraftRoomFab();
  }

  function confirmNewStory() {
    if (hasProgress() && state.phase !== "menu") {
      if (!window.confirm("Start a new AFA story? This replaces your saved league.")) return;
    }
    state = freshState();
    save();
    renderMode();
  }

  function renderMode() {
    state.phase = "mode";
    save();
    showScreen("mode");
    $("franchise-picker").style.display = "none";
    const note = $("real-status-source");
    fetch("data/nfl-availability.json").then((r) => r.ok ? r.json() : null).then((data) => {
      if (data) window.AFA_NFL_AVAIL = data;
      if (!note) return;
      const when = data && data.fetchedAt ? data.fetchedAt : "not loaded";
      note.textContent = "Snapshot " + when + ". Out, IR, PUP, and suspension marks can make a player unavailable. Questionable, doubtful, blank, and rumors do not. Base GMFB ratings stay. Existing saves are not changed from this checkbox.";
    }).catch(() => {
      if (note) note.textContent = "Availability snapshot failed to load. Leaving the box checked will not invent statuses.";
    });
  }

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function applyNewRealStatus() {
    const box = $("opt-real-avail");
    const on = !!(box && box.checked);
    if (!window.AFARealStatus) {
      state.realWorldStatus = { enabled: false, scope: null, holds: {}, form: null };
      return;
    }
    const result = AFARealStatus.enableNew(state, (window.AFA && AFA.PLAYERS) || [], window.AFA_NFL_AVAIL || null, [], on);
    if (on && !result.applied) toast("Verified availability was not loaded, so this new franchise does not use that overlay.");
  }

  function chooseAll32() {
    state.mode = "all32";
    applyNewRealStatus();
    state.sleeperImport = null;
    state.userTeamId = null;
    state.desks = Object.fromEntries(TEAMS.map((t) => [t.id, "manual"]));
    save();
    renderStory();
  }

  function openFranchisePicker() {
    const box = $("franchise-picker");
    box.style.display = "block";
    const mode = $("screen-mode");
    if (mode) mode.scrollTop = 0;
    const LG = (window.AFA_SLEEPER_LEAGUES && window.AFA_SLEEPER_LEAGUES.leagues) || {};
    const imp = ui.importKey || "";
    const impBtn = (k, lab, sub) => `<button type="button" class="import-opt${imp === k ? " on" : ""}" data-import="${k}"><b>${lab}</b><span>${sub}</span></button>`;
    box.innerHTML = `<div class="import-panel">
        <p class="eyebrow">Optional · Bring your Sleeper team</p>
        <div class="import-row">
          ${impBtn("", "Standard draft", "Founding draft from scratch")}
          ${LG.ogffl ? impBtn("ogffl", "Import OGFFL", esc(LG.ogffl.teamName) + " · " + LG.ogffl.ids.length + " players") : ""}
          ${LG.dd ? impBtn("dd", "Import Dynasty Domination", esc(LG.dd.teamName) + " · " + LG.dd.ids.length + " players") : ""}
        </div>
        <p class="help">${imp && LG[imp] ? `Your ${esc(LG[imp].league)} roster becomes your club's core: your first ${LG[imp].ids.length} founding-draft picks lock them in (keeper rounds), then the whole draft auto-assigns all 32 clubs around each head coach's scheme. No player can land on two teams. Snapshot ${esc(String(window.AFA_SLEEPER_LEAGUES.meta.fetchedAt).slice(0, 10))}${LG[imp].skipped.length ? " · skipped: " + LG[imp].skipped.map((x) => esc(x.name)).join(", ") : ""}.` : "Pick an import to play with your fantasy roster, or keep the standard draft."}</p>
      </div>
      <p class="eyebrow">Choose your franchise</p>
      <div class="team-assign-grid">
        ${TEAMS.map((t) => `
          <div class="team-slot" data-pick-team="${t.id}">
            ${logoImg(t)}
            <div class="slot-meta">
              <div class="nick">${t.nick}</div>
              <div class="city">${t.city} · ${t.division}</div>
            </div>
          </div>`).join("")}
      </div>`;
    box.querySelectorAll("[data-import]").forEach((el) => {
      el.onclick = () => { ui.importKey = el.getAttribute("data-import"); openFranchisePicker(); };
    });
    box.querySelectorAll("[data-pick-team]").forEach((el) => {
      el.onclick = () => chooseSingle(el.getAttribute("data-pick-team"));
    });
  }

  function chooseSingle(teamId) {
    state.mode = "single";
    state.userTeamId = teamId;
    state.desks = Object.fromEntries(TEAMS.map((t) => [t.id, t.id === teamId ? "manual" : "auto"]));
    ui.selectedTeam = teamId;
    ui.draftViewTeam = teamId;
    ui.viewTeamId = teamId;
    const LG = (window.AFA_SLEEPER_LEAGUES && window.AFA_SLEEPER_LEAGUES.leagues) || {};
    const L = ui.importKey && LG[ui.importKey];
    applyNewRealStatus();
    const imported = L && window.AFARealStatus
      ? AFARealStatus.retainImportIds(L.ids, playerById)
      : null;
    state.sleeperImport = L ? {
      key: L.key,
      league: L.league,
      teamName: L.teamName,
      ids: imported ? imported.ids : L.ids.filter((id) => playerById(id)),
      skipped: L.skipped.length
    } : null;
    save();
    toast(L ? "Imported " + state.sleeperImport.ids.length + " " + L.league + " players to the " + displayName(teamById(teamId)) + "." : "You run the " + displayName(teamById(teamId)) + ". CPU handles the other 31.");
    renderStory();
  }

  function ensureSingleDesks() {
    if (state.mode !== "single" || !state.userTeamId) return;
    // Fantasy import: the whole founding draft auto-assigns (imported core locked first, then every club fills)
    state.desks = Object.fromEntries(TEAMS.map((t) => [t.id, t.id === state.userTeamId && !(state.sleeperImport && state.phase === "draft" && state.draftPick < TOTAL_PICKS) ? "manual" : "auto"]));
  }

  /* ---------- STORY ---------- */
  function renderStory() {
    state.phase = "story";
    save();
    showScreen("story");
  }

  function continueFromStory() {
    renderCoaches();
  }

  /* ---------- COACHES ---------- */
  function assignedCount() {
    return Object.keys(state.coachAssign).filter((k) => state.coachAssign[k]).length;
  }

  function availableCoaches() {
    const used = new Set(Object.values(state.coachAssign));
    return COACHES.filter((c) => !used.has(c.id)).sort((a, b) => b.ovr - a.ovr);
  }

  function openTeams() {
    return TEAMS.filter((t) => !state.coachAssign[t.id]);
  }

  function hiredPairs() {
    return TEAMS.filter((t) => state.coachAssign[t.id]).map((t) => ({
      team: t,
      coach: coachById(state.coachAssign[t.id])
    }));
  }

  function renderCoaches() {
    state.phase = "coaches";
    save();
    showScreen("coaches");
    if (state.mode === "single" && state.userTeamId) {
      if (!ui.selectedTeam || (state.coachAssign[ui.selectedTeam] && !state.coachAssign[state.userTeamId])) {
        if (!state.coachAssign[state.userTeamId]) ui.selectedTeam = state.userTeamId;
      }
      if (!ui.selectedTeam && !state.coachAssign[state.userTeamId]) ui.selectedTeam = state.userTeamId;
    }
    const hired = assignedCount();
    const openRaw = openTeams();
    const single = state.mode === "single" && state.userTeamId;
    const userHired = single && !!state.coachAssign[state.userTeamId];
    // Put the player's club first so the "do this now" desk is never buried under the other 31
    const open = openRaw.slice().sort((a, b) => {
      if (!single) return 0;
      if (a.id === state.userTeamId) return -1;
      if (b.id === state.userTeamId) return 1;
      return 0;
    });
    const free = availableCoaches();
    const selTeam = ui.selectedTeam ? teamById(ui.selectedTeam) : null;
    const help = $("coach-help");
    if (help) {
      if (single) {
        const club = displayName(teamById(state.userTeamId));
        if (!userHired) {
          help.innerHTML = "<strong>Step 1 of 3 — Hire your head coach</strong> for <strong>" + club + "</strong> (highlighted as Your club). Select a coach on the right and tap <strong>Hire</strong>. The other open desks are CPU/other clubs — optional.";
        } else if (hired < 32) {
          help.innerHTML = "<strong>Step 2 of 3 — Fill the other clubs</strong>. Your " + club + " desk is set. Hire more yourself, tap <strong>Assist</strong> for one pick, or <strong>Sim other 31</strong> to auto-fill every remaining desk.";
        } else {
          help.innerHTML = "<strong>Step 3 of 3 — Lock hires</strong>. All 32 desks are filled. Tap <strong>Lock hires · go to draft</strong> (or Next) to open the AFA Draft.";
        }
      } else {
        help.innerHTML = hired < 32
          ? "<strong>Commissioner mode:</strong> pick any open club, then Hire a 2026 NFL head coach. Or tap <strong>Simulate</strong> / <strong>Assist</strong> to auto-fill. When every desk is filled, <strong>Lock hires · go to draft</strong>."
          : "<strong>Step 3 — Lock hires.</strong> All 32 desks are filled. Go to the AFA Draft.";
      }
    }
    // Progress accents on the 3-step strip (visual + not color-only: data-state text via CSS ::)
    const steps = $("coach-steps");
    if (steps) {
      const s1 = !single ? (hired > 0) : userHired;
      const s2 = hired >= 32 || (single && userHired && hired > 1) || (!single && hired >= 16);
      const s3 = hired >= 32;
      steps.querySelectorAll(".coach-step").forEach((el) => {
        const n = el.getAttribute("data-step");
        let st = "todo";
        if (n === "1") st = s1 ? "done" : "current";
        else if (n === "2") st = s3 ? "done" : (s1 ? "current" : "todo");
        else if (n === "3") st = s3 ? "current" : "todo";
        el.setAttribute("data-state", st);
        el.setAttribute("aria-current", st === "current" ? "step" : "false");
      });
    }
    const clubsHint = $("open-clubs-hint");
    if (clubsHint) {
      clubsHint.hidden = !single;
      if (single && userHired) {
        clubsHint.innerHTML = "Your club already has a head coach. Remaining desks are <span class=\"badge-cpu\">Other club</span> — hire them yourself or use <strong>Sim other 31</strong>.";
      } else if (single) {
        clubsHint.innerHTML = "Start with <span class=\"badge-yours\">Your club</span>. Other open desks are <span class=\"badge-cpu\">Other club</span> (CPU unless you hire them).";
      }
    }
    $("coach-count").textContent = hired + " / 32 hired";
    $("coach-count").setAttribute("aria-label", hired + " of 32 head coaches hired");
    if ($("open-team-count")) $("open-team-count").textContent = open.length + " left";
    if ($("open-coach-count")) $("open-coach-count").textContent = free.length + " available";

    const strip = $("hired-strip");
    if (strip) {
      const pairs = hiredPairs();
      if (!pairs.length) {
        strip.hidden = true;
        strip.innerHTML = "";
      } else {
        strip.hidden = false;
        strip.innerHTML = pairs.map(({ team: t, coach: c }) => {
          const yours = single && t.id === state.userTeamId;
          const label = (yours ? "Your club: " : "Other club: ") + t.nick + " hired " + (c ? c.name : "?") + ". Activate to reopen this desk.";
          return `<button type="button" class="hired-chip${yours ? " yours" : ""}" role="listitem" aria-label="${label}">${logoImg(t, "sm")}<span><strong>${t.nick}</strong> · ${c ? c.name : "?"}${yours ? ' <em class="chip-tag">You</em>' : ""}</span></button>`;
        }).join("");
        strip.querySelectorAll(".hired-chip").forEach((el, i) => {
          el.onclick = () => {
            const tid = pairs[i].team.id;
            delete state.coachAssign[tid];
            ui.selectedTeam = tid;
            ui.selectedCoach = null;
            save();
            toast(displayName(pairs[i].team) + " back in the open bank");
            renderCoaches();
          };
        });
      }
    }

    if (ui.selectedTeam && state.coachAssign[ui.selectedTeam]) {
      ui.selectedTeam = open[0] ? open[0].id : null;
    }

    const grid = $("team-assign-grid");
    grid.innerHTML = open.map((t) => {
      const isYours = single && t.id === state.userTeamId;
      const sel = ui.selectedTeam === t.id ? " selected" : "";
      const yours = isYours ? " yours" : " cpu";
      const badge = isYours
        ? '<span class="slot-badge badge-yours">Your club</span>'
        : '<span class="slot-badge badge-cpu">Other club</span>';
      const who = isYours ? "Hire your head coach here first" : "Optional — CPU fills if you Sim";
      const aria = (isYours ? "Your club: " : "Other club: ") + displayName(t) + (ui.selectedTeam === t.id ? ", selected" : "");
      return `<div class="team-slot${sel}${yours}" data-team="${t.id}" role="option" tabindex="0" aria-selected="${ui.selectedTeam === t.id ? "true" : "false"}" aria-label="${aria}">
        ${logoImg(t)}
        <div class="slot-meta">
          <div class="nick">${t.nick}</div>
          <div class="city">${t.city}</div>
          ${badge}
          <div class="who">${who}</div>
        </div>
      </div>`;
    }).join("") || `<p class="help" role="status">Every club has a head coach. The AFA Draft opens automatically.</p>`;
    grid.querySelectorAll("[data-team]").forEach((el) => {
      const activate = () => {
        ui.selectedTeam = el.getAttribute("data-team");
        if (ui.selectedCoach) tryAssign();
        else renderCoaches();
      };
      el.onclick = activate;
      el.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(); }
      };
    });

    const hireTarget = selTeam ? displayName(selTeam) : "the selected club";
    const list = $("coach-list");
    list.innerHTML = free.map((c) => {
      const rec = ui.selectedCoach === c.id ? " selected" : "";
      const hireLabel = "Hire " + c.name + " for " + hireTarget + ", overall " + c.ovr;
      return `<div class="coach-row${rec}" data-coach="${c.id}" role="listitem" aria-label="${c.name}, overall ${c.ovr}, ${c.prev}, ${c.style}">
        <div class="${ovrClass(c.ovr)}" aria-hidden="true">${c.ovr}</div>
        <div>
          <div class="name">${c.name}</div>
          <div class="prev">${c.prev} · ${c.style}</div>
        </div>
        <button class="btn btn-sm btn-hire" type="button" data-hire="${c.id}" aria-label="${hireLabel}">Hire</button>
      </div>`;
    }).join("") || `<p class="help" role="status">Every 2026 NFL head coach has a desk.</p>`;
    list.querySelectorAll("[data-coach]").forEach((el) => {
      el.onclick = (ev) => {
        if (ev.target.closest("[data-hire]")) return;
        ui.selectedCoach = el.getAttribute("data-coach");
        if (ui.selectedTeam) tryAssign();
        else renderCoaches();
      };
    });
    list.querySelectorAll("[data-hire]").forEach((el) => {
      el.onclick = (ev) => {
        ev.stopPropagation();
        ui.selectedCoach = el.getAttribute("data-hire");
        if (!ui.selectedTeam) {
          toast(single && !userHired ? "Select your club first (highlighted Your club), then Hire." : "Select an open club first, then hire.");
          renderCoaches();
          return;
        }
        tryAssign();
      };
    });

    const lockBtn = $("btn-lock-coaches");
    if (lockBtn) {
      lockBtn.disabled = hired < 32;
      lockBtn.setAttribute("aria-disabled", hired < 32 ? "true" : "false");
    }
    const sim = $("btn-sim-coaches");
    const note = $("coach-footer-note");
    if (sim) {
      const done = hired >= 32;
      const othersOpen = single ? TEAMS.filter((t) => t.id !== state.userTeamId && !state.coachAssign[t.id]).length : open.length;
      sim.disabled = false;
      if (done) {
        sim.textContent = "Next · go to draft";
        sim.classList.add("next");
        sim.setAttribute("data-mode", "next");
        sim.setAttribute("aria-label", "All coaches hired. Go to the AFA Draft");
      } else if (single) {
        sim.textContent = othersOpen ? "Sim other 31" : "Simulate";
        sim.classList.remove("next");
        sim.setAttribute("data-mode", "sim");
        if (!othersOpen && !state.coachAssign[state.userTeamId]) sim.textContent = "Simulate";
        sim.setAttribute("aria-label", othersOpen
          ? "Simulate: auto-hire head coaches for the other " + othersOpen + " open clubs"
          : "Simulate remaining coach hires");
      } else {
        sim.textContent = "Simulate";
        sim.classList.remove("next");
        sim.setAttribute("data-mode", "sim");
        sim.setAttribute("aria-label", "Simulate: auto-hire head coaches for every remaining open club");
      }
      if (note) {
        if (done) note.textContent = "All 32 desks are filled — opening the AFA Draft…";
        else if (single && !userHired) note.textContent = "Tip: hire your HC first, then Sim other 31 — or hire every desk yourself.";
        else if (single) note.textContent = "Your desk is set. Sim other 31 fills every remaining open sideline, then you can Lock hires.";
        else note.textContent = "Simulate fills every remaining open sideline with the best available 2026 HCs.";
      }
      if (done) maybeAutoStartDraft();
    }
  }

  function coachFooterAction() {
    if (assignedCount() >= 32) {
      lockCoaches();
      return;
    }
    simulateCoaches();
  }

  function tryAssign() {
    if (!ui.selectedTeam || !ui.selectedCoach) return;
    const hiredTeam = ui.selectedTeam;
    const already = Object.entries(state.coachAssign).find(([, cid]) => cid === ui.selectedCoach);
    if (already && already[0] !== ui.selectedTeam) delete state.coachAssign[already[0]];
    state.coachAssign[ui.selectedTeam] = ui.selectedCoach;
    syncCoachToDynasty(ui.selectedTeam, ui.selectedCoach);
    toast(coachById(ui.selectedCoach).name + " → " + displayName(teamById(ui.selectedTeam)));
    ui.selectedCoach = null;
    // Single franchise: once your HC is signed, auto-fill the other 31 and jump to the draft open
    if (state.mode === "single" && state.userTeamId && hiredTeam === state.userTeamId) {
      autoCoaches(true);
      save();
      if (assignedCount() >= 32) {
        toast("Sidelines set — opening the AFA Draft.");
        setTimeout(() => { if (state.phase === "coaches") lockCoaches(); }, 450);
        return;
      }
    }
    const next = TEAMS.find((t) => !state.coachAssign[t.id]);
    ui.selectedTeam = next ? next.id : ui.selectedTeam;
    save();
    renderCoaches();
    maybeAutoStartDraft();
  }

  function unassignSelected() {
    const entries = Object.entries(state.coachAssign || {});
    if (!entries.length) { toast("Nothing to undo yet."); return; }
    let tid = ui.selectedTeam && state.coachAssign[ui.selectedTeam] ? ui.selectedTeam : null;
    if (!tid) tid = entries[entries.length - 1][0];
    const c = coachById(state.coachAssign[tid]);
    delete state.coachAssign[tid];
    if (state.dynasty && state.dynasty.coaches) delete state.dynasty.coaches[tid];
    ui.selectedTeam = tid;
    ui.selectedCoach = null;
    save();
    toast("Undid " + (c ? c.name : "hire") + " on " + displayName(teamById(tid)));
    renderCoaches();
  }

  function simulateCoaches() {
    autoCoaches();
  }

  function assistCoach() {
    // Never overwrite an existing hire (fixes HC lock vs dynasty card drift)
    if (!ui.selectedTeam || state.coachAssign[ui.selectedTeam]) {
      const open = TEAMS.find((t) => !state.coachAssign[t.id]);
      if (!open) { toast("Every sideline already has a head coach."); return; }
      ui.selectedTeam = open.id;
    }
    const best = availableCoaches()[0];
    if (!best) { toast("No coaches left."); return; }
    ui.selectedCoach = best.id;
    tryAssign();
  }

  function autoCoaches(quiet) {
    let empty = TEAMS.filter((t) => !state.coachAssign[t.id]);
    if (state.mode === "single" && state.userTeamId) {
      empty = empty.filter((t) => t.id !== state.userTeamId);
    }
    const free = availableCoaches();
    const desks = shuffle(empty);
    let filled = 0;
    desks.forEach((t, i) => {
      if (free[i]) {
        state.coachAssign[t.id] = free[i].id;
        syncCoachToDynasty(t.id, free[i].id);
        filled += 1;
      }
    });
    save();
    if (!quiet) {
      if (state.mode === "single" && state.userTeamId && !state.coachAssign[state.userTeamId]) {
        ui.selectedTeam = state.userTeamId;
        toast(filled ? ("CPU hired " + filled + " coaches. Your desk is still open.") : "No desks left to sim.");
      } else {
        toast(filled ? ("CPU filled " + filled + " sideline" + (filled === 1 ? "" : "s") + ".") : "Nothing left to simulate.");
      }
      renderCoaches();
      maybeAutoStartDraft();
    }
  }

  function maybeAutoStartDraft() {
    if (state.phase !== "coaches") return;
    if (assignedCount() < 32) return;
    if (maybeAutoStartDraft._pending) return;
    maybeAutoStartDraft._pending = true;
    toast("All desks filled — opening the AFA Draft.");
    setTimeout(() => {
      maybeAutoStartDraft._pending = false;
      if (state.phase === "coaches" && assignedCount() >= 32) lockCoaches();
    }, 500);
  }

  function lockCoaches() {
    if (assignedCount() < 32) { toast("Every team needs a head coach."); return; }
    // Freeze hires into dynasty so the HC card matches coachAssign on first hub entry
    if (!state.dynasty) state.dynasty = { lastYear: null, coaches: {}, teams: {} };
    if (!state.dynasty.coaches) state.dynasty.coaches = {};
    if (!state.dynasty.teams) state.dynasty.teams = {};
    TEAMS.forEach((t) => {
      if (!state.dynasty.teams[t.id] && window.AFADynasty) {
        state.dynasty.teams[t.id] = AFADynasty.newFranchise({ teamId: t.id });
      }
      if (state.coachAssign[t.id]) syncCoachToDynasty(t.id, state.coachAssign[t.id]);
    });
    beginDraft();
  }

  /* ---------- DRAFT ---------- */
  function beginDraft() {
    state.phase = "draft";
    state.seasonStarted = false;
    state.draftPick = 0;
    state.picks = [];
    state.board = PLAYERS.map((p) => p.id);
    state.rosters = Object.fromEntries(TEAMS.map((t) => [t.id, []]));
    state.draftOrder = shuffle(TEAMS.map((t) => t.id));
    state.draftIntroSeen = false;
    ui.draftIntro = true;
    if (state.mode === "single" && state.userTeamId) {
      ensureSingleDesks();
      ui.draftViewTeam = state.userTeamId;
    } else if (!state.desks || Object.keys(state.desks).length !== 32) {
      state.desks = Object.fromEntries(TEAMS.map((t) => [t.id, "manual"]));
    }
    save();
    renderDraft();
  }

  function enterDraftRoom() {
    clearDraftOpenTimer();
    state.draftIntroSeen = true;
    ui.draftIntro = false;
    save();
    renderDraft();
    processAutoRun();
  }

  function snakeTeamId(pickIndex) {
    const pos = pickIndex % 32;
    const round = Math.floor(pickIndex / 32);
    const order = state.draftOrder;
    if (!order.length) return TEAMS[pos].id;
    return round % 2 === 0 ? order[pos] : order[31 - pos];
  }

  function currentDraftTeam() { return teamById(snakeTeamId(state.draftPick)); }

  function rosterOf(teamId) {
    return (state.rosters[teamId] || []).map(playerById).filter(Boolean);
  }

  function realHoldBlocks(p) {
    return !!(window.AFARealStatus && state.realWorldStatus && AFARealStatus.blocks(state.realWorldStatus, p));
  }

  function healthyRoster(teamId) {
    return rosterOf(teamId).filter((p) => !realHoldBlocks(p));
  }

  function posCounts(teamId) {
    const c = {};
    rosterOf(teamId).forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; });
    return c;
  }

  function healthyCounts(teamId) {
    const c = {};
    healthyRoster(teamId).forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; });
    return c;
  }
  function needsList(teamId) {
    const counts = healthyCounts(teamId);
    if (!window.AFADraft) return POS_NEED.filter((pos) => !counts[pos]);
    return AFADraft.rosterPhase(counts).starterHoles;
  }
  function depthNeedsList(teamId) {
    if (!window.AFADraft) return [];
    return AFADraft.rosterPhase(healthyCounts(teamId)).depthHoles;
  }

  // Targets live in js/draft-engine.js (starter coverage, then depth, then best player).
  const STARTER_NEED = window.AFADraft ? AFADraft.STARTER_NEED : { QB: 1, RB: 1, WR: 2, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
  const DEPTH_NEED = window.AFADraft ? AFADraft.DEPTH_NEED : { QB: 2, RB: 3, WR: 5, TE: 2, OT: 3, OG: 3, C: 2, DE: 4, DT: 3, LB: 5, CB: 4, S: 3, K: 1, P: 1 };
  const POS_PREMIUM = window.AFADraft ? AFADraft.POS_PREMIUM : { QB: 1.22, OT: 1.18, DE: 1.16, CB: 1.14, WR: 1.12, DT: 1.08, TE: 1.06, OG: 1.05, C: 1.05, LB: 1.04, S: 1.03, RB: 0.86, K: 0.35, P: 0.32 };

  function draftRound() {
    return Math.floor((state.draftPick || 0) / 32) + 1;
  }

  function rosterPhase(teamId) {
    const counts = posCounts(teamId);
    if (window.AFADraft) return AFADraft.rosterPhase(counts);
    let startersFilled = 0;
    let startersTotal = 0;
    Object.keys(STARTER_NEED).forEach((pos) => {
      startersTotal += STARTER_NEED[pos];
      startersFilled += Math.min(counts[pos] || 0, STARTER_NEED[pos]);
    });
    return { counts, startersFilled, startersTotal, holes: startersTotal - startersFilled, starterHoles: [], depthHoles: [] };
  }

  function schemeContext(teamId) {
    const C = window.AFACoaches;
    const co = state.dynasty && state.dynasty.coaches && state.dynasty.coaches[teamId];
    if (!C || !co || !C.OFF_SCHEMES[co.offScheme] || !C.DEF_SCHEMES[co.defScheme]) return null;
    return {
      offScheme: co.offScheme,
      defScheme: co.defScheme,
      offKeys: C.OFF_SCHEMES[co.offScheme].keys,
      defKeys: C.DEF_SCHEMES[co.defScheme].keys
    };
  }

  function scorePlayerForTeam(player, teamId) {
    const roster = rosterOf(teamId);
    if (!window.AFADraft) return player ? player.ovr : 0;
    return AFADraft.scorePlayer(player, {
      counts: posCounts(teamId),
      round: draftRound(),
      scheme: schemeContext(teamId),
      roster: roster
    });
  }

  /* v0.1.21 Sleeper import (keeper rounds): Jordan's imported fantasy roster is reserved for his club;
   * his first N founding-draft picks lock those players in, CPU clubs never take them, and the rest of
   * the 53 rounds fill normally so all 32 rosters stay realistic and no player is duplicated. */
  function importReserved() { return (state.sleeperImport && state.sleeperImport.ids) || []; }
  function pendingKeepers() {
    const r = importReserved(); if (!r.length) return [];
    const onBoard = new Set(state.board);
    return r.filter((id) => onBoard.has(id)).map(playerById).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  }
  function recommendPlayer(teamId) {
    const isUser = state.sleeperImport && teamId === state.userTeamId;
    if (isUser) { const k = pendingKeepers(); if (k.length) return k[0]; }
    const reserved = !isUser && state.sleeperImport ? new Set(importReserved()) : null;
    const pool = [];
    for (let i = 0; i < state.board.length; i++) {
      if (reserved && reserved.has(state.board[i])) continue;
      const p = playerById(state.board[i]);
      if (p) pool.push(p);
    }
    if (!pool.length || !window.AFADraft) return pool[0] || null;
    const league = {};
    TEAMS.forEach((t) => { league[t.id] = healthyRoster(t.id); });
    return AFADraft.recommend({
      board: pool,
      roster: healthyRoster(teamId),
      teamId: teamId,
      pickIndex: state.draftPick,
      scheme: schemeContext(teamId),
      leagueRosters: league,
      availabilityFactor: (p) => realHoldBlocks(p) ? 0.45 : 1
    });
  }

  function makePick(teamId, playerId, quiet) {
    lastPickRefuse = null;
    lastPickKeeperId = null;
    if (!window.AFADraft) return false;
    const keepers = (state.sleeperImport && teamId === state.userTeamId) ? pendingKeepers() : [];
    const res = AFADraft.commitPick({
      draftPick: state.draftPick,
      board: state.board,
      rosters: state.rosters,
      picks: state.picks
    }, {
      teamId: teamId,
      playerId: playerId,
      expectedTeamId: snakeTeamId(state.draftPick),
      totalPicks: TOTAL_PICKS,
      requiredPlayerId: keepers.length ? keepers[0].id : null,
      blockedIds: (state.sleeperImport && teamId !== state.userTeamId) ? importReserved() : null,
      lookup: playerById
    });
    lastPickRefuse = res.reason;
    lastPickKeeperId = res.keeperId || null;
    if (res.reason === "owned" && res.draft) state.board = res.draft.board;
    if (!res.ok) return false;
    if (res.reason !== "idempotent") {
      state.board = res.draft.board;
      state.rosters = res.draft.rosters;
      state.picks = res.draft.picks;
      state.draftPick = res.draft.draftPick;
    }
    if (!quiet) save();
    return true;
  }

  function aiPick(teamId, quiet) {
    const rec = recommendPlayer(teamId);
    if (!rec) return false;
    return makePick(teamId, rec.id, quiet);
  }

  function finishDraftLoop() {
    save();
    if (state.draftPick >= TOTAL_PICKS) {
      lockDraft();
      return;
    }
    renderDraft();
  }

  function processAutoRun() {
    if (draftRunning) return;
    draftRunning = true;
    try {
      let guard = 0;
      while (state.draftPick < TOTAL_PICKS && guard++ < TOTAL_PICKS + 2) {
        const tid = snakeTeamId(state.draftPick);
        if (state.sleeperImport && tid === state.userTeamId && pendingKeepers().length) { if (!aiPick(tid, true)) break; continue; }
        if ((state.desks[tid] || "manual") !== "auto") break;
        if (!aiPick(tid, true)) break;
      }
      finishDraftLoop();
    } finally { draftRunning = false; }
  }

  function setDeskMode(teamId, mode) {
    if (state.mode === "single" && state.userTeamId && teamId !== state.userTeamId) {
      toast("CPU clubs stay on Auto in single-franchise mode.");
      ensureSingleDesks();
      save();
      processAutoRun();
      return;
    }
    state.desks[teamId] = mode;
    if (state.mode === "single" && state.userTeamId) {
      // keep the other 31 locked to auto
      TEAMS.forEach((t) => {
        if (t.id !== state.userTeamId) state.desks[t.id] = "auto";
      });
    }
    save();
    if (mode === "auto") processAutoRun();
    else renderDraft();
  }

  function setAllDesks(mode, exceptUser) {
    TEAMS.forEach((t) => {
      if (exceptUser && t.id === state.userTeamId) return;
      state.desks[t.id] = mode;
    });
    save();
    processAutoRun();
  }

  function autoCompleteDraft() {
    if (draftRunning) return;
    draftRunning = true;
    try {
      toast("Simulating the rest of the founding draft…");
      let guard = 0;
      while (state.draftPick < TOTAL_PICKS && guard++ < TOTAL_PICKS + 2) {
        const tid = snakeTeamId(state.draftPick);
        if (!aiPick(tid, true)) break;
      }
      finishDraftLoop();
    } finally { draftRunning = false; }
  }

  function simDraftRound() {
    if (draftRunning) return;
    draftRunning = true;
    try {
      const target = Math.min(TOTAL_PICKS, (Math.floor((state.draftPick || 0) / 32) + 1) * 32);
      let guard = 0;
      while (state.draftPick < target && guard++ < 40) {
        const tid = snakeTeamId(state.draftPick);
        if (!aiPick(tid, true)) break;
      }
      finishDraftLoop();
    } finally { draftRunning = false; }
  }

  function simDraftRemaining() {
    // Big Sim Draft: fill every remaining pick for every club
    if (state.mode === "single" && state.userTeamId) {
      TEAMS.forEach((t) => { state.desks[t.id] = "auto"; });
    } else {
      TEAMS.forEach((t) => { state.desks[t.id] = "auto"; });
    }
    autoCompleteDraft();
  }

  function simToManual() {
    if (draftRunning) return;
    draftRunning = true;
    try {
      let guard = 0;
      while (state.draftPick < TOTAL_PICKS && guard++ < TOTAL_PICKS + 2) {
        const tid = snakeTeamId(state.draftPick);
        if ((state.desks[tid] || "manual") !== "auto") break;
        if (!aiPick(tid, true)) break;
      }
      finishDraftLoop();
    } finally { draftRunning = false; }
  }

  function userDraft(playerId) {
    if (draftRunning) return;
    if (state.draftPick >= TOTAL_PICKS) return;
    const team = currentDraftTeam();
    if (state.mode === "single" && state.userTeamId && team.id !== state.userTeamId) {
      toast("That's a CPU pick. Wait for your club — or hit Sim to your pick.");
      return;
    }
    if (!makePick(team.id, playerId)) {
      if (lastPickRefuse === "keeper") {
        const k = playerById(lastPickKeeperId);
        toast(k ? ("Keeper round — next imported player is " + k.name + ". That pick was not changed.") : "Keeper round — that player isn't the next imported player.");
      } else toast("Can't draft that player.");
      return;
    }
    const pickedId = state.picks.length ? state.picks[state.picks.length - 1].playerId : playerId;
    const p = playerById(pickedId);
    toast(displayName(team) + " select " + (p ? p.name : "a player"));
    processAutoRun();
  }

  function lockDraft() {
    clearInterval(clockTimer);
    clearDraftOpenTimer();
    if (!state.schedule || !state.schedule.length) {
      state.fa = (state.board || []).slice();
      state.board = [];
      state.week = 1;
      state.seasonDone = false;
      state.schedule = generateSchedule();
    }
    state.draftIntroSeen = true;
    ui.draftIntro = false;
    ensurePicks();
    ui.tradeLeft = state.userTeamId || TEAMS[0].id;
    ui.tradeRight = TEAMS.find((t) => t.id !== ui.tradeLeft).id;
    // Show draft summary charts, then auto-advance to hub
    showDraftComplete();
  }

  function showDraftComplete() {
    clearDraftOpenTimer();
    state.phase = "draft";
    showScreen("draft");
    const intro = $("draft-intro");
    const board = $("draft-board");
    const done = $("draft-complete");
    if (intro) intro.hidden = true;
    if (board) board.hidden = true;
    if (done) {
      done.hidden = false;
      done.style.pointerEvents = "auto";
      done.style.zIndex = "80";
    }
    $("screen-draft").classList.remove("draft-open-active");
    const lede = $("draft-complete-lede");
    if (lede) lede.textContent = "All " + TOTAL_PICKS + " picks are in. Continue to the season hub, or review the board.";
    const charts = $("draft-complete-charts");
    if (charts) {
      const tid = state.userTeamId || TEAMS[0].id;
      charts.innerHTML = draftPosBreakdown(tid) + '<div class="chart-panel" style="margin-top:10px"><div class="panel-h"><strong>Positional strength</strong></div><div class="chart-body">' + svgPosBars(tid, { width: 380 }) + '</div></div>';
    }
    const stay = $("btn-draft-complete-review");
    if (stay) {
      stay.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        renderDraftReview();
      };
    }
    const hub = $("btn-draft-complete-hub");
    if (hub) {
      hub.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterSeasonHub();
      };
    }
    // Auto-advance so you can't get stuck here
    clearTimeout(showDraftComplete._auto);
    showDraftComplete._auto = setTimeout(() => {
      if ($("draft-complete") && !$("draft-complete").hidden) enterSeasonHub();
    }, 12000);
  }

  function renderDraftReview() {
    state.phase = "draft";
    state.draftIntroSeen = true;
    showScreen("draft");
    const intro = $("draft-intro");
    const board = $("draft-board");
    const done = $("draft-complete");
    if (intro) intro.hidden = true;
    if (done) done.hidden = true;
    if (board) board.hidden = false;
    $("screen-draft").classList.remove("draft-open-active");
    // Keep pick feed / roster tabs available after the last pick
    const lastTeam = state.picks.length ? teamById(state.picks[state.picks.length - 1].teamId) : TEAMS[0];
    $("draft-status").innerHTML = `
      <div class="on-clock">
        ${logoImg(lastTeam || TEAMS[0], "lg")}
        <div>
          <div class="clk-label">Draft complete</div>
          <div class="nick" style="font-family:var(--display);font-size:22px;text-transform:uppercase">Founding class locked</div>
          <div class="city" style="color:var(--muted)">${TOTAL_PICKS} picks · review rosters, then continue</div>
        </div>
      </div>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-primary" id="btn-draft-review-hub">Continue to season hub</button>
      </div>`;
    const go = $("btn-draft-review-hub");
    if (go) go.onclick = enterSeasonHub;
    $("rec-box").innerHTML = `<p class="help">Founding draft is finished. Use Drafted / Depth / Lineup to scout clubs, then continue to the season hub.</p>
      <div class="btn-row" style="justify-content:flex-start;margin-top:10px">
        <button class="btn btn-primary" id="btn-draft-review-hub-2">Continue to season hub</button>
      </div>`;
    const go2 = $("btn-draft-review-hub-2");
    if (go2) go2.onclick = enterSeasonHub;
    // Player pool: show remaining FA only (read-only)
    $("player-body").innerHTML = (state.fa || []).slice(0, 40).map((id) => {
      const p = playerById(id);
      if (!p) return "";
      return `<tr class="dim"><td class="${ovrClass(p.ovr)}">${p.ovr}</td><td>${p.name}</td><td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td><td>${p.age}</td></tr>`;
    }).join("") || `<tr><td colspan="4" class="help">Board is empty — every prospect was drafted.</td></tr>`;
    const feed = (state.picks || []).slice().reverse().slice(0, 24).map((pk) => {
      const t = teamById(pk.teamId);
      const p = playerById(pk.playerId);
      return `<div class="pick-row"><span>#${pk.pick}</span> ${logoImg(t, "sm")} <strong>${displayName(t)}</strong> — ${p ? p.name : "?"} <span class="pos-pill pos-${p ? p.pos : "QB"}">${p ? p.pos : ""}</span></div>`;
    }).join("");
    $("pick-feed").innerHTML = feed || `<p class="help">No picks recorded.</p>`;
    syncDraftNav();
    renderDraftRosterTabs();
    updateDraftRoomFab();
    syncHubDraftTab();
  }

  function enterSeasonHub() {
    clearInterval(clockTimer);
    if (!state.schedule || !state.schedule.length) {
      state.fa = (state.board || state.fa || []).slice();
      state.board = [];
      state.week = 1;
      state.seasonDone = false;
      state.schedule = generateSchedule();
    }
    state.seasonStarted = true;
    ensurePicks();
    state.phase = "hub";
    ui.hubTab = "home";
    if (state.userTeamId) ui.viewTeamId = state.userTeamId;
    save();
    toast("Season hub unlocked — League Home is live.");
    updateDraftRoomFab();
    syncHubDraftTab();
    renderHub();
  }

  function formatClock(sec) {
    if (state.clockLimit === 0) return "∞";
    const s = Math.max(0, sec | 0);
    if (state.clockLimit >= 60 || s >= 60) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + ":" + String(r).padStart(2, "0");
    }
    return String(s);
  }

  function syncClockFace() {
    const el = $("pick-clock");
    if (!el) return;
    el.textContent = formatClock(clockLeft);
    el.classList.toggle("paused", !!state.clockPaused || state.clockLimit === 0);
    el.classList.toggle("nolimit", state.clockLimit === 0);
    el.title = state.clockLimit === 0
      ? "No time limit"
      : (state.clockPaused ? "Paused" : "Pick clock");
  }

  function stopClockTick() {
    clearInterval(clockTimer);
    clockTimer = null;
  }

  function startClock() {
    const limit = state.clockLimit | 0;
    if (lastClockPick !== state.draftPick) {
      lastClockPick = state.draftPick;
      clockLeft = limit;
      // keep pause state as user set; no-limit stays "paused mode" for countdown
    }
    stopClockTick();
    syncClockFace();
    if (limit === 0 || state.clockPaused) return;
    clockTimer = setInterval(() => {
      if (state.clockPaused || state.clockLimit === 0) return;
      clockLeft = Math.max(0, clockLeft - 1);
      syncClockFace();
      if (clockLeft <= 0) {
        stopClockTick();
        // soft expire — stay on pick; player can still draft
        const badge = $("clock-status");
        if (badge) badge.textContent = "Time's up — still pick";
      }
    }, 1000);
  }

  function toggleClockPause() {
    if (state.clockLimit === 0) {
      toast("No-limit mode is already untimed. Pick a clock length to use Pause.");
      return;
    }
    state.clockPaused = !state.clockPaused;
    save();
    if (state.clockPaused) {
      stopClockTick();
      toast("Pick clock paused.");
    } else {
      toast("Pick clock running.");
    }
    startClock();
    renderDraftClockControlsOnly();
  }

  function setClockLimit(sec) {
    const n = Number(sec);
    state.clockLimit = n;
    state.clockPaused = n === 0 ? true : false;
    clockLeft = n;
    lastClockPick = -1; // force reset face for current pick
    save();
    toast(n === 0 ? "No time limit — draft at your pace." : ("Pick clock set to " + formatClock(n) + "."));
    startClock();
    renderDraft();
  }

  function renderDraftClockControlsOnly() {
    const pause = $("btn-clock-pause");
    const status = $("clock-status");
    if (pause) {
      const nolimit = state.clockLimit === 0;
      pause.disabled = nolimit;
      pause.textContent = nolimit ? "No limit" : (state.clockPaused ? "Resume" : "Pause");
      pause.classList.toggle("on", !!state.clockPaused && !nolimit);
    }
    if (status) {
      status.textContent = state.clockLimit === 0
        ? "Untimed"
        : (state.clockPaused ? "Paused" : "Live");
    }
    syncClockFace();
  }



  /* ---------- v0.1.14 grading / cap / injury helpers (bridge-backed) ---------- */
  function allPlayersList() {
    const seen = new Set();
    const out = [];
    (PLAYERS || []).forEach((p) => { if (p && p.id && !seen.has(p.id)) { seen.add(p.id); out.push(p); } });
    Object.keys(state.rosters || {}).forEach((tid) => {
      (state.rosters[tid] || []).forEach((id) => {
        const p = playerById(id);
        if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
      });
    });
    (state.fa || []).forEach((id) => {
      const p = playerById(id);
      if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    });
    return out;
  }

  function seedGradesAndContracts(force) {
    const statsPack = window.AFA_STATS_2025 || {};
    const G = window.AFAGrading;
    const vet = (window.AFABridge && window.AFABridge.veteranContractFor) || null;
    allPlayersList().forEach((p) => {
      if (force || p.ovrBase == null) p.ovrBase = p.ovr;
      if (G && (force || !p.grade)) {
        const lines = statsPack[p.id] || [];
        let g = G.gradePlayer({ pos: p.pos, age: p.age, ovr: p.ovrBase }, lines, { applyAge: false });
        if ((p.pos === "K" || p.pos === "P") && g && g.statRating != null && g.confidence >= 0.35) {
          const blended = Math.round(0.25 * (p.ovrBase || 70) + 0.75 * g.statRating);
          g = Object.assign({}, g, { overall: Math.max(40, Math.min(99, blended)), explanation: (g.explanation || "") + " K/P stat lean applied." });
        }
        p.grade = g;
        if (state.useStatGrades && g && g.confidence > 0) p.ovr = g.overall;
        else p.ovr = p.ovrBase;
      }
      if (!p.contract) p.contract = vet ? vet(p) : { apy: 1500000, capHit: 1500000, yearsRemaining: 2, kind: "veteran-founding" };
    });
  }

  function attachRookieContract(player, overallPick, year) {
    const RS = window.AFASystems && window.AFASystems.rookieScale;
    if (!RS || !player) return;
    const raw = RS.rookieContract(overallPick, year || state.draftYear || 2027, { afaCap: state.salaryCap || AFA_CAP });
    player.contract = {
      apy: raw.apy,
      capHit: raw.capHit || (raw.yearlyCapHits && raw.yearlyCapHits[0]) || raw.apy,
      yearsRemaining: raw.yearsRemaining || raw.years || 4,
      totalValue: raw.totalValue,
      signingBonus: raw.signingBonus,
      overallPick: raw.overallPick,
      kind: "rookie-scale",
      fifthYearOptionEligible: !!raw.fifthYearOptionEligible,
      slotStatus: raw.slotStatus
    };
  }

  function teamCapHit(teamId) {
    return rosterOf(teamId).reduce((s, p) => s + ((p.contract && Number(p.contract.capHit)) || 0), 0);
  }

  function formatMoney(n) {
    return (window.AFABridge && window.AFABridge.formatMoney) ? window.AFABridge.formatMoney(n) : ("$" + n);
  }

  function gradeDeltaBadge(p) {
    return (window.AFABridge && window.AFABridge.gradeDeltaBadge) ? window.AFABridge.gradeDeltaBadge(p) : "";
  }

  function ensureTeamIR(teamId) {
    if (!state.teamIR) state.teamIR = {};
    if (!state.teamIR[teamId]) state.teamIR[teamId] = { designationsUsed: 0, playerReturns: {} };
    return state.teamIR[teamId];
  }

  function activeRosterForSim(teamId) {
    return rosterOf(teamId).filter((p) => !p.onIR && !(p.currentInjury && p.currentInjury.out) && !realHoldBlocks(p));
  }

  function playerEffectiveOvr(p) {
    if (!p) return 60;
    if (p.onIR) return 0;
    return p.ovr || 60;
  }

  /* ---------- v0.1.20 mobile/PWA + v0.1.18 schedule / coaches / playoffs / picks / schedule / coaches ---------- */
  function ensureStadiums() {
    if (!window.AFAStadiums) return null;
    if (!state.stadiums) state.stadiums = AFAStadiums.initLeague(TEAMS.map((t) => t.id));
    TEAMS.forEach((t) => {
      if (!state.stadiums[t.id]) state.stadiums[t.id] = AFAStadiums.defaultStadium(t.id, displayName(t));
    });
    if (typeof AFAStadiums.registerLeague === "function") AFAStadiums.registerLeague(state.stadiums);
    if (window.AFABridge && window.AFABridge.hooks) window.AFABridge.hooks.stadiums = AFAStadiums;
    return state.stadiums;
  }

  function ensureDynasty() {
    if (!window.AFADynasty || !window.AFACoaches) return null;
    if (!state.dynasty) state.dynasty = { lastYear: null, coaches: {}, teams: {} };
    ensureCoachPool(false);
    TEAMS.forEach((t) => {
      if (!state.dynasty.teams[t.id]) state.dynasty.teams[t.id] = AFADynasty.newFranchise({ teamId: t.id });
      if (state.coachAssign[t.id]) {
        // coachAssign wins — keep dynasty card locked to the hired HC
        syncCoachToDynasty(t.id, state.coachAssign[t.id]);
      } else if (state.dynasty.coaches[t.id]) {
        state.coachAssign[t.id] = state.dynasty.coaches[t.id].id;
      }
    });
    if (window.AFABridge && window.AFABridge.hooks) window.AFABridge.hooks.dynasty = AFADynasty;
    return state.dynasty;
  }


  function syncCoachToDynasty(teamId, coachIdOrObj) {
    if (!window.AFACoaches) return null;
    if (!state.dynasty) state.dynasty = { lastYear: null, coaches: {}, teams: {} };
    if (!state.dynasty.coaches) state.dynasty.coaches = {};
    let base = null;
    if (coachIdOrObj && typeof coachIdOrObj === "object") base = coachIdOrObj;
    else {
      const id = coachIdOrObj || state.coachAssign[teamId];
      base = coachById(id) || (state.coachPool || []).find((c) => c.id === id);
    }
    if (!base) return null;
    const existing = state.dynasty.coaches[teamId];
    // Preserve progression if same id
    if (existing && existing.id === base.id) {
      state.coachAssign[teamId] = existing.id;
      return existing;
    }
    const hiredId = base.id;
    const created = base.skills ? base : AFACoaches.createCoach(base, { seed: hashStr(teamId + ":" + (hiredId || base.name)) });
    // Preserve the hired id on both sides so dynasty card can't drift from coachAssign
    if (hiredId) created.id = hiredId;
    state.dynasty.coaches[teamId] = created;
    if (hiredId) state.coachAssign[teamId] = hiredId;
    else if (created.id) state.coachAssign[teamId] = created.id;
    return created;
  }

  function dynCoach(id) { return state.dynasty && state.dynasty.coaches[id]; }

  function ensureCoachPool(force) {
    if (!window.AFACoaches || typeof AFACoaches.generateCoachPool !== "function") return [];
    if (!state.coachPool || force) {
      state.coachPool = AFACoaches.generateCoachPool(28, hashStr("pool:" + (state.seasonYear || 2026)));
    }
    return state.coachPool;
  }

  function winPctOf(rec) {
    const gp = (rec.w || 0) + (rec.l || 0) + (rec.t || 0);
    return gp ? (rec.w + rec.t * 0.5) / gp : 0;
  }

  function teamSortKey(id, rec) {
    const r = rec[id] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    return { id, wp: winPctOf(r), w: r.w, diff: (r.pf || 0) - (r.pa || 0), pf: r.pf || 0 };
  }

  function compareSeeds(a, b) {
    if (b.wp !== a.wp) return b.wp - a.wp;
    if (b.w !== a.w) return b.w - a.w;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.pf - a.pf;
  }

  /** Build 7 seeds/conference: 4 division winners (1–4) + 3 wild cards (5–7). #1 bye. */
  function buildConferenceSeeds(conf, rec) {
    const divWinners = [];
    const rest = [];
    (DIVISIONS[conf] || []).forEach((div) => {
      const clubs = TEAMS.filter((t) => t.conference === conf && t.division === div).map((t) => teamSortKey(t.id, rec));
      clubs.sort(compareSeeds);
      if (clubs[0]) divWinners.push(Object.assign({ division: div, divWinner: true }, clubs[0]));
      clubs.slice(1).forEach((c) => rest.push(Object.assign({ division: div, divWinner: false }, c)));
    });
    divWinners.sort(compareSeeds);
    rest.sort(compareSeeds);
    const wild = rest.slice(0, 3);
    const seeds = divWinners.concat(wild).map((s, i) => Object.assign({}, s, { seed: i + 1 }));
    return seeds;
  }

  function playoffResult(teamId) {
    if (state.playoffs && state.playoffs.results && state.playoffs.results[teamId]) return state.playoffs.results[teamId];
    return "none";
  }

  function simPlayoffGame(homeId, awayId, tag) {
    const g = { home: homeId, away: awayId, played: false, playoff: true, round: tag };
    simGame(g, { timeline: false, injuries: false, playoff: true });
    return g;
  }

  function advanceBracketGame(g) {
    if (!g.played) {
      const played = simPlayoffGame(g.home, g.away, g.round || "playoff");
      Object.assign(g, played);
    }
    if (g.hs == null || g.as == null) { g.hs = g.hs || 0; g.as = g.as || 0; }
    if (g.hs === g.as) {
      // Playoffs cannot tie — home gets OT edge for bookkeeping
      g.hs = (g.hs || 0) + 3; g.overtime = true;
    }
    // NFL-plausible margin soft-cap (compress blowouts toward ~10–21)
    let margin = Math.abs(g.hs - g.as);
    if (margin > 21) {
      const winnerHome = g.hs > g.as;
      const keep = 10 + Math.round((margin - 21) * 0.2); // ~10..18 NFL-ish
      const capped = Math.min(keep, 18);
      const mid = Math.round((g.hs + g.as) / 2);
      // Also gently pull totals toward ~45 if absurd
      let m2 = mid;
      if (g.hs + g.as > 70) m2 = Math.round(m2 * 0.85 + 22.5 * 0.15);
      if (winnerHome) { g.hs = m2 + Math.ceil(capped / 2); g.as = m2 - Math.floor(capped / 2); }
      else { g.as = m2 + Math.ceil(capped / 2); g.hs = m2 - Math.floor(capped / 2); }
      g.marginCapped = true;
    }
    g.winner = g.hs > g.as ? g.home : g.away;
    g.loser = g.winner === g.home ? g.away : g.home;
    g.played = true;
    return g;
  }

  /** Run full postseason after regular season. Mutates state.playoffs + feeds stadium/dynasty via playoffResult. */
  function runPlayoffs() {
    const rec = records();
    const results = {};
    TEAMS.forEach((t) => { results[t.id] = "none"; });
    const conferences = {};
    ["Eastern", "Western"].forEach((conf) => {
      const seeds = buildConferenceSeeds(conf, rec);
      seeds.forEach((s) => { results[s.id] = "wildcard"; }); // made field; refined as they lose/win
      // #1 bye; WC: 2v7, 3v6, 4v5 (higher seed hosts)
      const byId = {}; seeds.forEach((s) => { byId[s.seed] = s; });
      const wc = [
        { round: "wildcard", home: byId[2].id, away: byId[7].id, seedH: 2, seedA: 7 },
        { round: "wildcard", home: byId[3].id, away: byId[6].id, seedH: 3, seedA: 6 },
        { round: "wildcard", home: byId[4].id, away: byId[5].id, seedH: 4, seedA: 5 }
      ].map((g) => advanceBracketGame(Object.assign({}, g)));
      wc.forEach((g) => { results[g.loser] = "wildcard"; });
      const still = [byId[1].id].concat(wc.map((g) => g.winner));
      // Divisional: #1 vs lowest remaining seed; other two by seed
      const seedOf = (id) => (seeds.find((s) => s.id === id) || {}).seed || 99;
      still.sort((a, b) => seedOf(a) - seedOf(b));
      const low = still[still.length - 1];
      const top = still[0];
      const mid = still.filter((id) => id !== top && id !== low).sort((a, b) => seedOf(a) - seedOf(b));
      const divisional = [
        { round: "divisional", home: top, away: low, seedH: seedOf(top), seedA: seedOf(low) },
        { round: "divisional", home: mid[0], away: mid[1], seedH: seedOf(mid[0]), seedA: seedOf(mid[1]) }
      ].map((g) => advanceBracketGame(Object.assign({}, g)));
      divisional.forEach((g) => { results[g.loser] = "divisional"; });
      const confFinalists = divisional.map((g) => g.winner).sort((a, b) => seedOf(a) - seedOf(b));
      const conference = advanceBracketGame({
        round: "conference", home: confFinalists[0], away: confFinalists[1],
        seedH: seedOf(confFinalists[0]), seedA: seedOf(confFinalists[1])
      });
      results[conference.loser] = "conference";
      results[conference.winner] = "conference"; // bump to champion after title
      conferences[conf] = { seeds, wildcard: wc, divisional, conference, champion: conference.winner };
    });
    const east = conferences.Eastern.champion;
    const west = conferences.Western.champion;
    // Championship: better regular-season record hosts
    const host = compareSeeds(teamSortKey(east, rec), teamSortKey(west, rec)) <= 0 ? east : west;
    const visitor = host === east ? west : east;
    const championship = advanceBracketGame({ round: "championship", home: host, away: visitor });
    results[championship.loser] = "conference";
    results[championship.winner] = "champion";
    state.playoffs = {
      year: state.seasonYear,
      conferences,
      championship,
      results
    };
    // Stadium playoff bumps for home playoff games already via recordHomeGame if hooked; apply end flags later
    return state.playoffs;
  }


  /** Rebuild FA from anyone not on a roster, then fill each club toward 53 by positional need. */
  function rebuildFreeAgency() {
    const owned = [];
    TEAMS.forEach((t) => (state.rosters[t.id] || []).forEach((id) => { const p = playerById(id); if (p) owned.push(p); }));
    const pool = allPlayersList().filter((p) => p && !p.retired && !(window.AFADraft && AFADraft.clashesWithAny(p, owned)));
    const kept = owned.slice();
    if (window.AFADraft) {
      const r = AFADraft.dedupeIds(pool.map((p) => p.id), playerById, kept);
      state.fa = r.ids;
    } else {
      const taken = new Set(owned.map((p) => p.id));
      state.fa = pool.filter((p) => !taken.has(p.id)).map((p) => p.id);
    }
    return state.fa.length;
  }

  function refillRostersFromFA() {
    rebuildFreeAgency();
    TEAMS.forEach((t) => {
      let roster = (state.rosters[t.id] || []).slice();
      let n = 0;
      while (roster.length < 53 && n++ < 80) {
        const mine = roster.map(playerById).filter(Boolean);
        const owned = mine.slice();
        TEAMS.forEach((tm) => {
          if (tm.id === t.id) return;
          (state.rosters[tm.id] || []).forEach((id) => { const p = playerById(id); if (p) owned.push(p); });
        });
        const faPlayers = (state.fa || []).map(playerById).filter((p) => p && !p.retired && !(window.AFADraft && AFADraft.clashesWithAny(p, owned)));
        const pick = window.AFADraft ? AFADraft.pickFreeAgent(mine, faPlayers) : faPlayers[0];
        if (!pick) break;
        roster.push(pick.id);
        state.fa = (state.fa || []).filter((id) => {
          if (id === pick.id) return false;
          const p = playerById(id);
          return !(p && window.AFADraft && AFADraft.peopleClash(p, pick));
        });
        if (!pick.contract) {
          try {
            if (window.AFABridge && AFABridge.veteranContractFor) pick.contract = AFABridge.veteranContractFor(pick, state.seasonYear || 2026);
          } catch (e) {}
        }
      }
      state.rosters[t.id] = roster;
    });
  }

  function clearLeagueInjuries() {
    const Inj = window.AFASystems && window.AFASystems.injuries;
    const all = [];
    TEAMS.forEach((t) => { all.push.apply(all, rosterOf(t.id)); });
    (state.fa || []).forEach((id) => { const p = playerById(id); if (p) all.push(p); });
    // Also sweep global pool so free agents don't stay stuck on IR forever
    if (window.AFA && Array.isArray(AFA.PLAYERS)) {
      AFA.PLAYERS.forEach((p) => { if (p && (p.onIR || p.currentInjury)) all.push(p); });
    }
    const seen = new Set();
    const uniq = all.filter((p) => p && p.id && !seen.has(p.id) && seen.add(p.id));
    if (!Inj || typeof Inj.clearOffseason !== "function") {
      uniq.forEach((p) => { p.onIR = false; p.currentInjury = null; delete p.ovrPreInjury; });
      TEAMS.forEach((t) => { if (state.teamIR) state.teamIR[t.id] = { designationsUsed: 0, designationsLimit: 8, playerReturns: {} }; });
      return;
    }
    TEAMS.forEach((t) => { Inj.clearOffseason(rosterOf(t.id), ensureTeamIR(t.id)); });
    Inj.clearOffseason(uniq, { designationsUsed: 0, designationsLimit: 8, playerReturns: {} });
  }

  function hireReplacementCoach(teamId, year) {
    ensureCoachPool();
    const employed = Object.values(state.dynasty.coaches || {});
    const avail = AFACoaches.availableCoaches(employed, state.coachPool);
    let next = avail[0];
    if (!next) {
      // refresh pool mid-carousel
      const extra = AFACoaches.generateCoachPool(12, hashStr("topup:" + year + ":" + teamId));
      state.coachPool = (state.coachPool || []).concat(extra);
      next = AFACoaches.availableCoaches(employed, state.coachPool)[0];
    }
    if (!next) next = AFACoaches.createCoach({ id: "hc_" + teamId + "_" + year, name: "Interim HC", ovr: 72, style: "Pro-Style" }, { seed: hashStr("rep" + teamId + year) });
    // remove from pool
    state.coachPool = (state.coachPool || []).filter((c) => c.id !== next.id);
    return next;
  }

  function dynastyEndSeason() {
    if (!window.AFADynasty) return;
    ensureDynasty();
    const year = state.seasonYear;
    if (state.dynasty.lastYear === year) return;
    const rec = records();
    TEAMS.forEach((t) => {
      const r = rec[t.id] || { w: 0, l: 0, t: 0 };
      // Work on shallow copies so AFA.PLAYERS source ages stay intact
      const roster = rosterOf(t.id).map((p) => Object.assign({}, p));
      const out = AFADynasty.endSeason(state.dynasty.teams[t.id], {
        year, wins: r.w, losses: r.l, ties: r.t,
        playoff: playoffResult(t.id),
        roster, coach: dynCoach(t.id),
        seed: hashStr(t.id + ":" + year)
      });
      state.dynasty.teams[t.id] = out.franchise;
      state.dynasty.coaches[t.id] = out.coach;
      // Write aged ovr/age onto live player objects carefully
      (out.roster || roster).forEach((aged) => {
        const live = playerById(aged.id);
        if (!live) return;
        if (aged.age != null) live.age = aged.age;
        if (aged.ovr != null) {
          const prev = live.ovr;
          // Cap year-over-year decline so league PPG stays near target after dynasty
          live.ovr = aged.ovr < prev ? Math.max(aged.ovr, prev - 1) : aged.ovr;
        }
        if (aged.pot != null) live.pot = aged.pot;
        if (aged.bust) live.bust = true;
      });
      (out.retired || []).forEach((rp) => {
        const id = (rp && rp.id) ? rp.id : rp;
        state.rosters[t.id] = (state.rosters[t.id] || []).filter((x) => x !== id);
        if (id && !state.fa.includes(id)) state.fa.push(id);
        const live = playerById(id);
        if (live) live.retired = true;
      });
      // Coach fired/retired → hire from FA coach pool (carousel)
      if (out.coachStatus === "fired" || out.coachStatus === "retired") {
        const next = hireReplacementCoach(t.id, year);
        syncCoachToDynasty(t.id, next);
        if (window.AFAStadiums && state.stadiums && state.stadiums[t.id] && out.coachStatus === "fired") {
          try { AFAStadiums.fanEvent(state.stadiums[t.id], "coachFired"); } catch (e) {}
        }
      }
    });
    state.dynasty.lastYear = year;
  }

  function stadiumOffseason() {
    if (!window.AFAStadiums || !state.stadiums) return;
    const rec = records();
    TEAMS.forEach((t) => {
      const r = rec[t.id] || { w: 0, l: 0, t: 0 };
      const gp = r.w + r.l + r.t || 1;
      const wp = (r.w + r.t / 2) / gp;
      const st = state.stadiums[t.id];
      if (!st) return;
      if (t.id !== state.userTeamId) AFAStadiums.cpuOffseason(st, { winPct: wp });
      AFAStadiums.endSeason(st, { winPct: wp, playoffs: playoffResult(t.id) !== "none" });
    });
  }

  function teamPhilosophy(teamId) {
    if (!state.philosophy) state.philosophy = {};
    if (!state.philosophy[teamId] && window.AFAGameDay) state.philosophy[teamId] = AFAGameDay.defaultPhilosophy();
    return state.philosophy[teamId] || (window.AFAGameDay && AFAGameDay.defaultPhilosophy()) || null;
  }
  function teamChemistry(teamId) {
    if (!state.chemistry) state.chemistry = {};
    if (!state.chemistry[teamId] && window.AFAGameDay) state.chemistry[teamId] = AFAGameDay.defaultChemistry();
    return state.chemistry[teamId] || (window.AFAGameDay && AFAGameDay.defaultChemistry()) || null;
  }
  function teamGamePlan(teamId) {
    if (!state.gamePlans) state.gamePlans = {};
    if (!state.gamePlans[teamId] && window.AFAGameDay) state.gamePlans[teamId] = AFAGameDay.defaultGamePlan();
    return state.gamePlans[teamId] || (window.AFAGameDay && AFAGameDay.defaultGamePlan()) || null;
  }

  function foldStatLines(lines) {
    (lines || []).forEach((line) => {
      if (!line || !line.playerId) return;
      const st = ensurePlayerSeasonStats(line.playerId);
      st.season = state.seasonYear || state.draftYear || st.season;
      st.games = (st.games || 0) + (line.games || 1);
      Object.keys(line).forEach((k) => {
        if (k === "playerId" || k === "name" || k === "pos" || k === "number" || k === "games") return;
        if (typeof line[k] === "number") st[k] = (Number(st[k]) || 0) + line[k];
      });
      // aliases used by older accrue path
      if (line.passing_yards) st.passYds = (st.passYds || 0) + line.passing_yards;
      if (line.passing_tds) st.passTd = (st.passTd || 0) + line.passing_tds;
      if (line.passing_interceptions) st.passInt = (st.passInt || 0) + line.passing_interceptions;
      if (line.attempts) st.passAtt = (st.passAtt || 0) + line.attempts;
      if (line.completions) st.passCmp = (st.passCmp || 0) + line.completions;
      if (line.rushing_yards) st.rushYds = (st.rushYds || 0) + line.rushing_yards;
      if (line.carries) st.rushAtt = (st.rushAtt || 0) + line.carries;
      if (line.rushing_tds) st.rushTd = (st.rushTd || 0) + line.rushing_tds;
      if (line.receptions) st.rec = (st.rec || 0) + line.receptions;
      if (line.receiving_yards) st.recYds = (st.recYds || 0) + line.receiving_yards;
      if (line.receiving_tds) st.recTd = (st.recTd || 0) + line.receiving_tds;
      if (line.targets) st.targets = (st.targets || 0) + line.targets;
      if (line.def_sacks) st.sacks = (st.sacks || 0) + line.def_sacks;
      if (line.def_interceptions) st.int = (st.int || 0) + line.def_interceptions;
      if (line.tackles || line.def_tackles_solo) st.tackles = (st.tackles || 0) + (line.tackles || line.def_tackles_solo || 0);
    });
  }

  function buildGameDaySide(teamId) {
    const t = teamById(teamId);
    return {
      id: teamId,
      name: displayName(t),
      abbr: t.abbr,
      primary: t.primary,
      secondary: t.secondary,
      roster: activeRosterForSim(teamId),
      philosophy: teamPhilosophy(teamId),
      chemistry: teamChemistry(teamId),
      gamePlan: teamGamePlan(teamId),
      coach: dynCoach(teamId)
    };
  }


  /* ---------- MADDEN-STYLE DEPTH / LINEUP ---------- */
  function draftFocusTeamId() {
    if (ui.draftViewTeam && teamById(ui.draftViewTeam)) return ui.draftViewTeam;
    if (state.userTeamId) return state.userTeamId;
    if (state.phase === "draft" && state.draftPick < TOTAL_PICKS) {
      try { return snakeTeamId(state.draftPick); } catch (e) { /* ignore */ }
    }
    return TEAMS[0].id;
  }

  function playersAtPos(teamId, pos) {
    return rosterOf(teamId).filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
  }

  function takeStarter(pool, used) {
    for (const p of pool) {
      if (!used.has(p.id)) {
        used.add(p.id);
        return p;
      }
    }
    return null;
  }

  function buildLineup(teamId, formationId) {
    const used = new Set();
    const pools = {};
    ["WR","RB","TE","OT","OG","C","QB","DE","DT","LB","CB","S","K","P"].forEach((pos) => {
      pools[pos] = playersAtPos(teamId, pos);
    });
    function pickFrom(pos, ord) {
      const pool = pools[pos] || [];
      const want = ord || 0;
      // Absolute depth-chart index (WR1→ord0→X): prefer pool[want] if free
      if (pool[want] && !used.has(pool[want].id)) {
        used.add(pool[want].id);
        return pool[want];
      }
      for (let i = want; i < pool.length; i++) {
        if (!used.has(pool[i].id)) { used.add(pool[i].id); return pool[i]; }
      }
      for (let i = 0; i < want; i++) {
        if (pool[i] && !used.has(pool[i].id)) { used.add(pool[i].id); return pool[i]; }
      }
      return null;
    }
    const FORMATIONS = (window.AFABridge && window.AFABridge.FORMATIONS) || {};
    const fid = formationId || ui.formation || "11";
    const form = FORMATIONS[fid] || FORMATIONS["11"] || { label: "11", slots: [] };
    const offense = (form.slots || []).map((spec) => ({
      role: spec.role,
      slot: spec.slot,
      label: spec.label || spec.slot,
      player: pickFrom(spec.from, spec.ord),
      x: spec.x,
      y: spec.y
    }));
    const DEF = (window.AFABridge && window.AFABridge.DEFENSE_FORMATIONS) || {};
    const dfid = ui.defFormation || "base43";
    const dform = DEF[dfid] || DEF.base43;
    const defense = dform ? (dform.slots || []).map((spec) => ({
      role: spec.role, slot: spec.slot, label: spec.label || spec.slot,
      player: pickFrom(spec.from, spec.ord), x: spec.x, y: spec.y
    })) : [];
    const ST = (window.AFABridge && window.AFABridge.SPECIAL_FORMATIONS) || {};
    const sfid = ui.stFormation || "fg";
    const sform = ST[sfid] || ST.fg;
    const specialField = sform ? (sform.slots || []).map((spec) => ({
      role: spec.role, slot: spec.slot, label: spec.label || spec.slot,
      player: pickFrom(spec.from, spec.ord), x: spec.x, y: spec.y
    })) : [];
    const special = [
      { role: "K", slot: "K", player: pickFrom("K", 0) },
      { role: "P", slot: "P", player: pickFrom("P", 0) }
    ];
    const starters = new Set(
      offense.concat(defense).concat(special).concat(specialField).filter((s) => s.player).map((s) => s.player.id)
    );
    const bench = rosterOf(teamId).filter((pl) => !starters.has(pl.id)).sort((a, b) => b.ovr - a.ovr);
    const validate = window.AFABridge && window.AFABridge.validateLineupGeometry;
    const defIssues = validate ? validate(defense) : [];
    const stIssues = validate ? validate(specialField) : [];
    return {
      offense, defense, special, specialField, bench,
      formation: fid,
      formLabel: form.label,
      defFormation: dfid,
      defLabel: dform && dform.label,
      stFormation: sfid,
      stLabel: sform && sform.label,
      geometryIssues: validate ? validate(offense) : [],
      defenseIssues: defIssues,
      specialIssues: stIssues
    };
  }

  function depthChartBlocks(teamId) {
    const order = [
      ["QB", 1], ["HB", "RB", 3], ["WR", 4], ["TE", 2],
      ["LT", "OT", 1], ["LG", "OG", 1], ["C", 1], ["RG", "OG", 1], ["RT", "OT", 1],
      ["LE", "DE", 1], ["DT", 2], ["RE", "DE", 1],
      ["LOLB", "LB", 1], ["MLB", "LB", 1], ["ROLB", "LB", 1],
      ["CB", 3], ["FS", "S", 1], ["SS", "S", 1],
      ["K", 1], ["P", 1]
    ];
    // Build with shared pools so LT/RT don't duplicate same OT as both #1
    const pools = {};
    POSITIONS.forEach((pos) => { pools[pos] = playersAtPos(teamId, pos).slice(); });
    const used = new Set();
    const cards = [];

    function pull(pos, count) {
      const rows = [];
      const pool = pools[pos] || [];
      let rank = 1;
      for (const pl of pool) {
        if (used.has(pl.id)) continue;
        rows.push({ rank, player: pl });
        used.add(pl.id);
        rank += 1;
        if (rows.length >= count) break;
      }
      while (rows.length < count) {
        rows.push({ rank: rows.length + 1, player: null });
      }
      return rows;
    }

    // Madden-ish labeled slots
    const slots = [
      { label: "Quarterbacks", pos: "QB", n: 2 },
      { label: "Halfbacks", pos: "RB", n: 3 },
      { label: "Wide Receivers", pos: "WR", n: 4 },
      { label: "Tight Ends", pos: "TE", n: 2 },
      { label: "Left Tackles", pos: "OT", n: 1, tag: "LT" },
      { label: "Left Guards", pos: "OG", n: 1, tag: "LG" },
      { label: "Centers", pos: "C", n: 1 },
      { label: "Right Guards", pos: "OG", n: 1, tag: "RG" },
      { label: "Right Tackles", pos: "OT", n: 1, tag: "RT" },
      { label: "Left Ends", pos: "DE", n: 1, tag: "LE" },
      { label: "Defensive Tackles", pos: "DT", n: 2 },
      { label: "Right Ends", pos: "DE", n: 1, tag: "RE" },
      { label: "Outside Linebackers", pos: "LB", n: 2, tag: "OLB" },
      { label: "Middle Linebackers", pos: "LB", n: 1, tag: "MLB" },
      { label: "Cornerbacks", pos: "CB", n: 3 },
      { label: "Free Safeties", pos: "S", n: 1, tag: "FS" },
      { label: "Strong Safeties", pos: "S", n: 1, tag: "SS" },
      { label: "Kickers", pos: "K", n: 1 },
      { label: "Punters", pos: "P", n: 1 }
    ];

    // Sequential pull so LT then RT consume OT pool in OVR order
    return slots.map((slot) => {
      const rows = pull(slot.pos, slot.n);
      return { label: slot.label, tag: slot.tag || slot.pos, rows };
    });
  }

  function draftedPicksForTeam(teamId) {
    return (state.picks || []).filter((pk) => pk.teamId === teamId);
  }

  function renderDraftedHTML(team) {
    const picks = draftedPicksForTeam(team.id);
    const rows = picks.map((pk) => {
      const pl = playerById(pk.playerId);
      if (!pl) return "";
      const overall = pk.pick || pk.overall || 0;
      const round = Math.floor((overall - 1) / 32) + 1;
      const pickInRound = ((overall - 1) % 32) + 1;
      return `<tr data-scout="${pl.id}" data-player-id="${pl.id}">
        <td>R${round} · ${pickInRound}</td>
        <td>#${overall}</td>
        <td class="${ovrClass(pl.ovr)}">${pl.ovr}</td>
        <td data-profile="${pl.id}">${pl.name}</td>
        <td><span class="pos-pill pos-${pl.pos}">${pl.pos}</span></td>
        <td>${pl.age}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="6" class="help">No picks yet for this club. Draft from the Board tab.</td></tr>`;
    return `<button type="button" class="btn btn-sm btn-primary back-to-board" data-back-board>← Draft board</button>
      <div class="madden-head">
        <h2>${displayName(team)} · Drafted</h2>
        <span class="phase-chip">${picks.length} pick${picks.length === 1 ? "" : "s"}</span>
      </div>
      <div class="panel"><div class="panel-b">
        <table class="drafted-table">
          <thead><tr><th>Round</th><th>Overall</th><th>OVR</th><th>Player</th><th>Pos</th><th>Age</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div></div>`;
  }

  function renderDepthHTML(team) {
    const cards = depthChartBlocks(team.id).map((card) => {
      const body = card.rows.map((row) => {
        if (!row.player) {
          return `<div class="depth-slot empty"><span class="rank">${row.rank}</span><span>Empty</span><span>—</span></div>`;
        }
        return `<div class="depth-slot${row.rank === 1 ? " starter" : ""}" data-scout="${row.player.id}" data-player-id="${row.player.id}">
          <span class="rank">${row.rank}</span>
          <span data-profile="${row.player.id}"><span class="jersey">#${jerseyNum(row.player)}</span> ${row.player.name}</span>
          <span class="${ovrClass(row.player.ovr)}">${row.player.ovr}</span>
        </div>`;
      }).join("");
      return `<div class="depth-card"><div class="dh">${card.tag} · ${card.label}</div>${body}</div>`;
    }).join("");
    return `<button type="button" class="btn btn-sm btn-primary back-to-board" data-back-board>← Draft board</button>
      <div class="madden-head">
        <h2>${displayName(team)} · Depth Chart</h2>
        <span class="help">Madden-style starters highlighted · ranked by OVR at position</span>
      </div>
      <div class="depth-madden">${cards}</div>`;
  }

  function fieldSlotHTML(slot) {
    const lab = slot.label || slot.slot;
    if (!slot.player) {
      return `<div class="field-slot open" style="left:${slot.x}%;top:${slot.y}%" data-slot="${slot.slot}" data-role="${slot.role || ""}" data-x="${slot.x}" data-y="${slot.y}">
        <span class="role">${lab}</span>
        <span class="nm">Open</span>
      </div>`;
    }
    return `<div class="field-slot" style="left:${slot.x}%;top:${slot.y}%" data-scout="${slot.player.id}" data-profile="${slot.player.id}" data-player-id="${slot.player.id}" data-slot="${slot.slot}" data-role="${slot.role || ""}" data-x="${slot.x}" data-y="${slot.y}" data-pid="${slot.player.id}">
      <span class="role">${lab}</span>
      <span class="nm"><span class="jersey">#${jerseyNum(slot.player)}</span> ${slot.player.name}</span>
      <span class="ov ${ovrClass(slot.player.ovr)}">${slot.player.ovr} OVR</span>
    </div>`;
  }

  function renderLineupHTML(team) {
    const lu = buildLineup(team.id);
    const side = ui.lineupSide === "defense" ? "defense" : (ui.lineupSide === "special" ? "special" : "offense");
    const slots = side === "defense" ? lu.defense : (side === "special" ? (lu.specialField || []) : lu.offense);
    const FORMATIONS = (window.AFABridge && window.AFABridge.FORMATIONS) || {};
    const DEF = (window.AFABridge && window.AFABridge.DEFENSE_FORMATIONS) || {};
    const ST = (window.AFABridge && window.AFABridge.SPECIAL_FORMATIONS) || {};
    let formToggle = "";
    if (side === "offense") {
      formToggle = `<div class="lineup-toggle" id="lineup-form-toggle">${Object.keys(FORMATIONS).map((k) => `<button class="btn btn-sm ${(lu.formation || "11") === k ? "on" : ""}" data-form="${k}">${k}</button>`).join("")}</div>`;
    } else if (side === "defense") {
      formToggle = `<div class="lineup-toggle" id="lineup-form-toggle">${Object.keys(DEF).map((k) => `<button class="btn btn-sm ${(lu.defFormation || "base43") === k ? "on" : ""}" data-defform="${k}">${k}</button>`).join("")}</div>`;
    } else {
      formToggle = `<div class="lineup-toggle" id="lineup-form-toggle">${Object.keys(ST).map((k) => `<button class="btn btn-sm ${(lu.stFormation || "fg") === k ? "on" : ""}" data-stform="${k}">${k}</button>`).join("")}</div>`;
    }
    const issues = side === "offense" ? lu.geometryIssues : (side === "defense" ? lu.defenseIssues : lu.specialIssues);
    const geo = (issues && issues.length) ? `<div class="geo-warn">⚠ Lineup geometry: ${issues.join("; ")}</div>` : "";
    const wrKey = side === "offense" ? `<p class="help wr-key">WR alignment · X = split end (on LOS, wide) · Z = flanker (off LOS) · SL/SR = slot · WR1→X, WR2→Z, WR3→slot</p>` : "";
    const bench = lu.bench.filter((pl) => {
      if (side === "offense") return ["QB","RB","WR","TE","OT","OG","C"].includes(pl.pos);
      return ["DE","DT","LB","CB","S"].includes(pl.pos);
    });
    const special = lu.special.map((s) => {
      if (!s.player) return `<div class="bench-chip"><span>${s.slot}</span><span class="help">Open</span></div>`;
      return `<div class="bench-chip" data-scout="${s.player.id}" data-player-id="${s.player.id}"><span data-profile="${s.player.id}">${s.slot} · <span class="jersey">#${jerseyNum(s.player)}</span> ${s.player.name}</span><span class="${ovrClass(s.player.ovr)}">${s.player.ovr}</span></div>`;
    }).join("");
    return `<button type="button" class="btn btn-sm btn-primary back-to-board" data-back-board>← Draft board</button>
      <div class="madden-head">
        <h2>${displayName(team)} · Lineup${side === "offense" ? " · " + (lu.formLabel || lu.formation) : ""}</h2>
        <div class="lineup-toggle" id="lineup-side-toggle">
          <button class="btn btn-sm ${side === "offense" ? "on" : ""}" data-side="offense">Offense</button>
          <button class="btn btn-sm ${side === "defense" ? "on" : ""}" data-side="defense">Defense</button>
          <button class="btn btn-sm ${side === "special" ? "on" : ""}" data-side="special">Special</button>
        </div>
        ${formToggle}
      </div>
      ${wrKey}${geo}
      <div class="field-wrap">
        <div class="field" data-formation="${lu.formation || "11"}">${slots.map(fieldSlotHTML).join("")}</div>
      </div>
      <p class="help" style="margin-top:12px">Special teams</p>
      <div class="lineup-bench">${special}</div>
      <p class="help" style="margin-top:12px">${side === "offense" ? "Offense" : "Defense"} depth / bench</p>
      <div class="lineup-bench">
        ${bench.map((pl) => `<div class="bench-chip" data-player-id="${pl.id}"><span data-profile="${pl.id}"><span class="pos-pill pos-${pl.pos}">${pl.pos}</span> ${pl.name}</span><span class="${ovrClass(pl.ovr)}">${pl.ovr}</span></div>`).join("") || `<div class="help">No bench players yet.</div>`}
      </div>`;
  }

  function syncDraftNav() {
    const nav = $("draft-nav");
    if (!nav) return;
    nav.querySelectorAll("[data-draft-tab]").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-draft-tab") === ui.draftTab);
      b.onclick = () => {
        ui.draftTab = b.getAttribute("data-draft-tab");
        renderDraft();
      };
    });
    const sel = $("draft-team-select");
    if (sel) {
      const focus = draftFocusTeamId();
      ui.draftViewTeam = focus;
      sel.innerHTML = TEAMS.map((t) =>
        `<option value="${t.id}" ${t.id === focus ? "selected" : ""}>${displayName(t)}</option>`
      ).join("");
      sel.onchange = () => {
        ui.draftViewTeam = sel.value;
        renderDraft();
      };
    }
  }

  function renderDraftRosterTabs() {
    const board = $("draft-tab-board");
    const view = $("draft-tab-view");
    if (!board || !view) return;
    const tab = ui.draftTab || "board";
    if (tab === "board") {
      board.hidden = false;
      view.hidden = true;
      view.innerHTML = "";
      return;
    }
    board.hidden = true;
    view.hidden = false;
    const team = teamById(draftFocusTeamId());
    if (tab === "drafted") view.innerHTML = renderDraftedHTML(team);
    else if (tab === "depth") view.innerHTML = renderDepthHTML(team);
    else if (tab === "lineup") {
      view.innerHTML = renderLineupHTML(team);
      const toggle = $("lineup-side-toggle");
      if (toggle) {
        toggle.querySelectorAll("[data-side]").forEach((b) => {
          b.onclick = () => {
            ui.lineupSide = b.getAttribute("data-side");
            renderDraft();
          };
        });
      }
      const ft = $("lineup-form-toggle");
      if (ft) {
        ft.querySelectorAll("[data-form]").forEach((b) => {
          b.onclick = () => { ui.formation = b.getAttribute("data-form"); renderDraft(); };
        });
        ft.querySelectorAll("[data-defform]").forEach((b) => {
          b.onclick = () => { ui.defFormation = b.getAttribute("data-defform"); renderDraft(); };
        });
        ft.querySelectorAll("[data-stform]").forEach((b) => {
          b.onclick = () => { ui.stFormation = b.getAttribute("data-stform"); renderDraft(); };
        });
      }
    }
    view.querySelectorAll("[data-back-board]").forEach((b) => {
      b.onclick = () => { ui.draftTab = "board"; renderDraft(); };
    });
    bindScoutHover(view);
  }


  function clearDraftOpenTimer() {
    if (draftOpenTimer) {
      clearTimeout(draftOpenTimer);
      draftOpenTimer = null;
    }
  }

  function fillDraftIntroCopy() {
    const single = state.mode === "single" && state.userTeamId;
    const club = single ? displayName(teamById(state.userTeamId)) : null;
    // Hired HC from coach-assignment (state.coachAssign); never invent a name
    const hcId = single ? (state.coachAssign && state.coachAssign[state.userTeamId]) : null;
    const hc = hcId ? coachById(hcId) : null;
    const coachName = hc && hc.name ? hc.name : null;
    const eye = $("draft-intro-eyebrow");
    const title = $("draft-intro-title");
    const sub = $("draft-intro-sub");
    const lede = $("draft-intro-lede");
    const dim = $("draft-intro-dim");
    if (eye) {
      if (single && club) {
        eye.textContent = coachName
          ? ("Your franchise · " + club + " · HC " + coachName)
          : ("Your franchise · " + club);
      } else {
        eye.textContent = "Alliance Football Association";
      }
    }
    if (title) title.textContent = "DRAFT";
    if (sub) {
      sub.textContent = single
        ? ("FOUNDING SNAKE DRAFT · YOUR PICKS · " + (club || "").toUpperCase())
        : "FOUNDING SNAKE DRAFT · 32 CLUBS · " + TOTAL_PICKS.toLocaleString() + " PICKS";
    }
    if (lede) lede.textContent = "The AFA Draft is officially underway — every NFL player is a free agent.";
    if (dim) {
      if (single && club) {
        dim.textContent = coachName
          ? ("You draft for the " + club + ", led by " + coachName + ". The other 31 clubs pick themselves.")
          : ("You draft for the " + club + ". The other 31 clubs pick themselves.");
      } else {
        dim.textContent = "Every roster starts empty. The founding snake draft is live.";
      }
    }
    const ticker = $("draft-intro-ticker");
    if (ticker) {
      const bits = TEAMS.map((t) => {
        const c = coachById(state.coachAssign[t.id]);
        return displayName(t) + (c ? (" · <span>" + c.name + "</span>") : "");
      });
      ticker.innerHTML = bits.concat(bits).join("  ·  ");
    }
  }

  function startDraftOpenSequence() {
    clearDraftOpenTimer();
    const stage = $("draft-open-stage");
    const barWrap = stage ? stage.querySelector(".draft-open-progress") : null;
    if (barWrap) {
      barWrap.classList.remove("running");
      void barWrap.offsetWidth;
      barWrap.classList.add("running");
    }
    if (stage) {
      stage.onclick = () => enterDraftRoom();
      stage.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          enterDraftRoom();
        }
      };
    }
    draftOpenTimer = setTimeout(() => enterDraftRoom(), 4000);
  }

  function wireDraftIntroChrome() {
    // Kept for older bindings; open is click-to-skip + auto-advance
    const enter = $("btn-enter-draft");
    if (enter) enter.onclick = enterDraftRoom;
  }

  function hideCoachReview() { /* coach review removed from open */ }

  function renderDraft() {
    state.phase = "draft";
    showScreen("draft");
    updateDraftRoomFab();

    const intro = $("draft-intro");
    const board = $("draft-board");
    const showIntro = !state.draftIntroSeen;
    if (intro && board) {
      if (showIntro) {
        intro.hidden = false;
        board.hidden = true;
        const done = $("draft-complete");
        if (done) done.hidden = true;
        $("screen-draft").classList.add("draft-open-active");
        fillDraftIntroCopy();
        wireDraftIntroChrome();
        const stage = $("draft-open-stage");
        if (stage) {
          stage.classList.remove("replay");
          void stage.offsetWidth;
          stage.classList.add("replay");
        }
        startDraftOpenSequence();
        syncHubDraftTab();
        return;
      }
      intro.hidden = true;
      board.hidden = false;
      const done = $("draft-complete");
      if (done) done.hidden = true;
      $("screen-draft").classList.remove("draft-open-active");
      hideCoachReview();
    }

    if (state.draftPick >= TOTAL_PICKS) { lockDraft(); return; }
    syncHubDraftTab();

    const team = currentDraftTeam();
    const round = Math.floor(state.draftPick / 32) + 1;
    const pickInRound = (state.draftPick % 32) + 1;
    const overall = state.draftPick + 1;
    const rec = recommendPlayer(team.id);
    const desk = state.desks[team.id] || "manual";
    const roundChip = $("draft-round-chip");
    if (roundChip) roundChip.textContent = ROUNDS + " rounds · " + TOTAL_PICKS.toLocaleString() + " picks · Rd " + round;

    const limit = state.clockLimit | 0;
    const paused = !!state.clockPaused || limit === 0;
    $("draft-status").innerHTML = `
      <div class="on-clock">
        ${logoImg(team, "lg")}
        <div>
          <div class="clk-label">${state.mode === "single" && state.userTeamId && team.id === state.userTeamId ? "Your pick" : (state.mode === "single" ? "CPU on the clock" : "On the clock")}</div>
          <div class="nick" style="font-family:var(--display);font-size:22px;text-transform:uppercase">${displayName(team)}</div>
          <div class="city" style="color:var(--muted)">Round ${round} · Pick ${pickInRound} · Overall ${overall} of ${TOTAL_PICKS}</div>
        </div>
      </div>
      <div>
        <div class="eyebrow">AFA Founding Snake Draft · ${ROUNDS} rounds</div>
        <div class="desk-modes" id="desk-modes">
          ${state.mode === "single" && state.userTeamId && team.id !== state.userTeamId
            ? `<span class="phase-chip">CPU desk · Auto</span>`
            : `<button class="btn btn-sm ${desk === "manual" ? "on" : ""}" data-desk="manual">Manual</button>
          <button class="btn btn-sm ${desk === "assisted" ? "on" : ""}" data-desk="assisted">Assisted</button>
          <button class="btn btn-sm ${desk === "auto" ? "on" : ""}" data-desk="auto">Auto</button>`}
        </div>
      </div>
      <div class="clock-panel">
        <div class="pick-clock${paused ? " paused" : ""}${limit === 0 ? " nolimit" : ""}" id="pick-clock" title="${limit === 0 ? "No time limit" : (state.clockPaused ? "Paused" : "Pick clock")}">${formatClock(clockLeft)}</div>
        <div class="clock-actions">
          <button class="btn btn-sm ${state.clockPaused && limit !== 0 ? "on" : ""}" id="btn-clock-pause" ${limit === 0 ? "disabled" : ""}>${limit === 0 ? "No limit" : (state.clockPaused ? "Resume" : "Pause")}</button>
          <span class="clock-status" id="clock-status">${limit === 0 ? "Untimed" : (state.clockPaused ? "Paused" : "Live")}</span>
        </div>
        <div class="clock-presets" id="clock-presets" title="Pick clock length">
          ${CLOCK_PRESETS.map((opt) => `<button class="chip ${limit === opt.sec ? "on" : ""}" data-clock="${opt.sec}">${opt.label}</button>`).join("")}
        </div>
      </div>`;
    $("desk-modes").querySelectorAll("[data-desk]").forEach((b) => {
      b.onclick = () => setDeskMode(team.id, b.getAttribute("data-desk"));
    });
    const pauseBtn = $("btn-clock-pause");
    if (pauseBtn) pauseBtn.onclick = toggleClockPause;
    $("clock-presets").querySelectorAll("[data-clock]").forEach((b) => {
      b.onclick = () => setClockLimit(b.getAttribute("data-clock"));
    });

    const needs = needsList(team.id);
    const depthNeeds = depthNeedsList(team.id);
    const keeperLeft = pendingKeepers();
    $("rec-box").innerHTML = `
      <div class="rec-card">
        <div class="kicker">${keeperLeft.length && state.userTeamId === team.id ? "Imported keeper" : (desk === "assisted" ? "Recommended pick" : "Best available by need")}</div>
        ${rec ? `<h3>${rec.name}</h3>
          <div><span class="pos-pill pos-${rec.pos}">${rec.pos}</span> · <span class="${ovrClass(rec.ovr)}">${rec.ovr} OVR</span> · Age ${rec.age}${rec.fictional ? " · Fictional" : ""}</div>` : "<p>Board is empty.</p>"}
        <div class="needs">${needs.length ? "<span class='help'>Starters open</span> " + needs.map((p) => `<span class="pos-pill pos-${p}">${p}</span>`).join("") : ""}${depthNeeds.length ? " <span class='help'>Depth</span> " + depthNeeds.slice(0, 6).map((p) => `<span class="pos-pill pos-${p}">${p}</span>`).join("") : ""}${!needs.length && !depthNeeds.length ? "<span class='help'>Starter groups filled</span>" : ""}</div>
        <div class="btn-row" style="justify-content:flex-start;margin-top:10px">
          <button class="btn btn-primary btn-sm" id="btn-take-rec" ${rec ? "" : "disabled"}>Draft ${rec ? rec.name.split(" ").slice(-1)[0] : ""}</button>
        </div>
      </div>
      <p class="help">${state.mode === "single"
        ? ("Single franchise: you only pick for " + displayName(teamById(state.userTeamId)) + ". Board is real NFL free agents after the fold. Use <strong>Sim to your pick</strong> to fast-forward CPU selections.")
        : "Founding draft — every prospect is a real NFL free agent. Manual, Assisted, or Auto on each desk. Sim Draft fills the rest."}</p>
      <div class="sim-draft-bar">
        <button class="btn btn-sim-draft" id="btn-sim-draft" title="Fill every remaining pick">Sim Draft</button>
        <div class="btn-row" style="justify-content:flex-start;margin:0;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-primary" id="btn-sim-manual">${state.mode === "single" ? "Sim to your pick" : "Sim to next manual"}</button>
          <button class="btn btn-sm" id="btn-sim-round">Sim this round</button>
          <button class="btn btn-sm" id="btn-auto-rest">${state.mode === "single" ? "Auto-pick my remaining" : "Auto-complete draft"}</button>
          ${state.mode === "single" ? "" : '<button class="btn btn-sm" id="btn-all-auto">Set remaining desks to Auto</button>'}
        </div>
        <p class="help" style="margin:6px 0 0">Founding draft is <strong>${ROUNDS} rounds</strong> (${TOTAL_PICKS} picks). Hit <strong>Sim Draft</strong> anytime to finish the board.</p>
      </div>
    `;
    const yourTurn = !(state.mode === "single" && state.userTeamId && team.id !== state.userTeamId);
    $("btn-take-rec").onclick = () => { if (yourTurn && rec) userDraft(rec.id); };
    $("btn-take-rec").disabled = !rec || !yourTurn;
    $("btn-sim-draft").onclick = () => simDraftRemaining();
    const simRoundBtn = $("btn-sim-round");
    if (simRoundBtn) simRoundBtn.onclick = () => simDraftRound();
    $("btn-sim-manual").onclick = () => {
      if (state.mode === "single") ensureSingleDesks();
      simToManual();
    };
    $("btn-auto-rest").onclick = () => {
      if (state.mode === "single" && state.userTeamId) {
        state.desks[state.userTeamId] = "auto";
        TEAMS.forEach((t) => { if (t.id !== state.userTeamId) state.desks[t.id] = "auto"; });
        save();
        processAutoRun();
        return;
      }
      autoCompleteDraft();
    };
    const allAuto = $("btn-all-auto");
    if (allAuto) allAuto.onclick = () => setAllDesks("auto", state.mode === "single");

    const q = (ui.query || "").toLowerCase();
    let pool = state.board.map(playerById).filter(Boolean);
    if (ui.posFilter !== "ALL") pool = pool.filter((p) => p.pos === ui.posFilter);
    if (q) pool = pool.filter((p) => p.name.toLowerCase().includes(q));
    pool.sort((a, b) => b.ovr - a.ovr);
    const pageSize = 80;
    if (ui.boardPage == null) ui.boardPage = 0;
    const maxPage = Math.max(0, Math.ceil(pool.length / pageSize) - 1);
    if (ui.boardPage > maxPage) ui.boardPage = maxPage;
    const pageStart = ui.boardPage * pageSize;
    const pagePool = pool.slice(pageStart, pageStart + pageSize);

    $("pos-filters").innerHTML = ["ALL"].concat(POSITIONS).map((p) =>
      `<button class="chip ${ui.posFilter === p ? "on" : ""}" data-pos="${p}">${p}</button>`
    ).join("");
    $("pos-filters").querySelectorAll("[data-pos]").forEach((b) => {
      b.onclick = () => { ui.posFilter = b.getAttribute("data-pos"); ui.boardPage = 0; renderDraft(); };
    });

    $("player-body").innerHTML = pagePool.map((p) => {
      const recRow = rec && rec.id === p.id ? " rec" : "";
      return `<tr class="${recRow}" data-pid="${p.id}" data-scout="${p.id}" data-player-id="${p.id}">
        <td class="${ovrClass(p.ovr)}">${p.ovr}</td>
        <td><span class="jersey">#${jerseyNum(p)}</span> ${p.name} <button type="button" class="btn btn-sm" data-profile="${p.id}" title="Full profile" onclick="event.stopPropagation()">▣</button></td>
        <td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td>
        <td>${p.age}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="4" class="help">No players match.</td></tr>`;
    $("player-body").querySelectorAll("[data-pid]").forEach((row) => {
      row.onclick = () => {
        if (state.mode === "single" && state.userTeamId && currentDraftTeam().id !== state.userTeamId) {
          toast("CPU is on the clock. Hit Sim to your pick.");
          return;
        }
        userDraft(row.getAttribute("data-pid"));
      };
    });
    bindScoutHover($("player-body"));
    // Rec card scout on the recommended player name only (not the Draft button)
    if (rec) {
      const recCard = $("rec-box") && $("rec-box").querySelector(".rec-card");
      if (recCard) {
        recCard.removeAttribute("data-scout");
        const h3 = recCard.querySelector("h3");
        if (h3) {
          h3.setAttribute("data-scout", rec.id);
          h3.style.cursor = "pointer";
          h3.title = "Tap for scout card";
        }
        bindScoutHover($("rec-box"));
      }
    }
    bindScoutHover($("pick-feed"));
    let pager = $("board-pager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "board-pager";
      pager.className = "board-pager";
      const tableWrap = $("player-body") && $("player-body").closest(".table-wrap, .player-table, table");
      const host = ($("player-body") && $("player-body").parentElement) || null;
      if (host) host.appendChild(pager);
    }
    if (pager) {
      pager.innerHTML = pool.length
        ? `<button class="btn btn-sm" id="board-prev" ${ui.boardPage <= 0 ? "disabled" : ""}>Prev</button>
           <span class="help">${pageStart + 1}–${Math.min(pool.length, pageStart + pageSize)} of ${pool.length} prospects</span>
           <button class="btn btn-sm" id="board-next" ${ui.boardPage >= maxPage ? "disabled" : ""}>Next</button>`
        : "";
      const prev = $("board-prev");
      const next = $("board-next");
      if (prev) prev.onclick = () => { ui.boardPage = Math.max(0, ui.boardPage - 1); renderDraft(); };
      if (next) next.onclick = () => { ui.boardPage = Math.min(maxPage, ui.boardPage + 1); renderDraft(); };
    }

    const feed = state.picks.slice().reverse().slice(0, 24);
    $("pick-feed").innerHTML = feed.map((pk) => {
      const tm = teamById(pk.teamId);
      const pl = playerById(pk.playerId);
      return `<div class="pick-item" data-scout="${pk.playerId}" data-player-id="${pk.playerId}">
        <div class="n">${pk.pick}</div>
        ${logoImg(tm, "sm")}
        <div><strong data-profile="${pk.playerId}">${pl.name}</strong><div class="city">${tm.abbr} · ${pl.pos} ${pl.ovr}</div></div>
      </div>`;
    }).join("") || `<p class="help">Picks will land here.</p>`;

    syncDraftNav();
    renderDraftRosterTabs();
    startClock();
    if (state.mode === "single") {
      ensureSingleDesks();
      const onClock = snakeTeamId(state.draftPick);
      if ((state.desks[onClock] || "manual") === "auto") {
        setTimeout(() => processAutoRun(), 30);
      }
    }
  }

  /* ---------- SCHEDULE / SIM ---------- */
  /** NFL: 18 weeks, 17 games/team, 1 bye in weeks 5–14 (2 or 4 byes/week), ~8/9 home. */
  function generateSchedule() {
    const year = state.seasonYear || 2027;
    const rng = rngFrom(hashStr("sched28b:" + year + ":" + (state.draftOrder || []).join(",")));
    const ids = TEAMS.map((t) => t.id);
    const flip = year % 2;
    const homeTarget = {};
    ids.forEach((id, i) => { homeTarget[id] = ((i + flip) % 2 === 0) ? 9 : 8; });
    const homeCount = {}; ids.forEach((id) => { homeCount[id] = 0; });

    // Bye weeks 5–14 only; each week 2 or 4 byes (even active set). 6×4 + 4×2 = 32.
    const byeSlots = [];
    for (let w = BYE_WEEK_MIN; w <= BYE_WEEK_MAX; w++) byeSlots.push(w);
    const capacity = byeSlots.map((w, i) => (i < 6 ? 4 : 2)); // first 6 → 4 byes, last 4 → 2
    // Shuffle capacity assignment across weeks
    for (let i = capacity.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = capacity[i]; capacity[i] = capacity[j]; capacity[j] = t;
    }
    const byeWeek = {}; // team -> week number
    const buckets = {}; byeSlots.forEach((w, i) => { buckets[w] = { cap: capacity[i], list: [] }; });
    const order = ids.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    order.forEach((id) => {
      // Prefer emptiest relative to cap
      const slot = byeSlots.slice().sort((a, b) => (buckets[a].list.length / buckets[a].cap) - (buckets[b].list.length / buckets[b].cap)
        || buckets[a].list.length - buckets[b].list.length)[0];
      buckets[slot].list.push(id);
      byeWeek[id] = slot;
    });
    // Enforce caps exactly by moving extras
    byeSlots.forEach((w) => {
      while (buckets[w].list.length > buckets[w].cap) {
        const dest = byeSlots.find((x) => buckets[x].list.length < buckets[x].cap);
        if (!dest) break;
        const id = buckets[w].list.pop();
        buckets[dest].list.push(id);
        byeWeek[id] = dest;
      }
    });

    const meet = {}; // sorted pair -> count
    function mKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
    function meetN(a, b) { return meet[mKey(a, b)] || 0; }
    function bump(a, b) { const k = mKey(a, b); meet[k] = (meet[k] || 0) + 1; }
    function isDiv(a, b) {
      const A = teamById(a), B = teamById(b);
      return A.conference === B.conference && A.division === B.division;
    }

    function pairWeek(active, weekNo) {
      // Multiple random-restart greedy matchings; score by novelty + home need
      let best = null, bestScore = -1e99;
      for (let attempt = 0; attempt < 40; attempt++) {
        const pool = active.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        const pairs = [];
        const left = new Set(pool);
        let score = 0;
        let stuck = false;
        while (left.size) {
          const it = left.values();
          const a = it.next().value;
          left.delete(a);
          let cand = [...left];
          // Prefer: unmet div rematch (need 2), then fresh, then any
          cand.sort((x, y) => {
            const dx = isDiv(a, x) ? (meetN(a, x) < 2 ? -2 : 2) : (meetN(a, x) === 0 ? -1 : meetN(a, x));
            const dy = isDiv(a, y) ? (meetN(a, y) < 2 ? -2 : 2) : (meetN(a, y) === 0 ? -1 : meetN(a, y));
            if (dx !== dy) return dx - dy;
            return (homeTarget[x] - homeCount[x]) - (homeTarget[y] - homeCount[y]);
          });
          // Slight noise on first few attempts
          if (attempt > 0 && cand.length > 1 && rng() < 0.35) {
            const j = Math.floor(rng() * Math.min(3, cand.length));
            const t = cand[0]; cand[0] = cand[j]; cand[j] = t;
          }
          const b = cand[0];
          if (!b) { stuck = true; break; }
          left.delete(b);
          // Home/away
          let home = a, away = b;
          const needA = homeTarget[a] - homeCount[a];
          const needB = homeTarget[b] - homeCount[b];
          if (needB > needA || (needB === needA && rng() < 0.5)) { home = b; away = a; }
          // Division rematches: alternate home if second meeting
          if (isDiv(a, b) && meetN(a, b) === 1) {
            // Flip relative to... we don't store prior home; use year parity
            if ((hashStr(a + b + year) + weekNo) % 2) { home = a; away = b; }
            else { home = b; away = a; }
          }
          pairs.push({ home, away });
          score += isDiv(a, b) && meetN(a, b) < 2 ? 5 : 0;
          score += meetN(a, b) === 0 ? 3 : (meetN(a, b) === 1 && isDiv(a, b) ? 4 : -meetN(a, b));
          score += Math.max(0, homeTarget[home] - homeCount[home]);
        }
        if (!stuck && pairs.length === active.length / 2 && score > bestScore) {
          bestScore = score; best = pairs;
        }
      }
      return best;
    }

    const schedule = Array.from({ length: SEASON_WEEKS }, () => []);
    for (let wi = 0; wi < SEASON_WEEKS; wi++) {
      const weekNo = wi + 1;
      const byes = ids.filter((id) => byeWeek[id] === weekNo);
      const active = ids.filter((id) => byeWeek[id] !== weekNo);
      if (active.length % 2) {
        // Should never happen with even bye counts — repair by moving one bye
        const donor = byes[0];
        const dest = byeSlots.find((w) => w !== weekNo && ids.filter((id) => byeWeek[id] === w).length < 4
          && ids.filter((id) => byeWeek[id] === w).length % 2 === 0);
        // simpler: swap one bye team into a week with 4 byes → make both 3? bad.
        // Move donor to a week that currently has 2 byes → becomes 3 (odd). Prefer weeks with capacity.
        // Instead drop donor from this week's bye list conceptually — force them active and pull someone else.
        // Fallback: activate one bye team (they'll play 18 — trim later). Rare.
        if (donor) {
          // find week with 2 byes and move someone from a 4-bye week... skip; make donor active
          byeWeek[donor] = BYE_WEEK_MIN; // temporary; fixed below after season? 
          // Actually remove this bye for donor and assign to a week that has room keeping even:
          const target = byeSlots.find((w) => {
            const n = ids.filter((id) => byeWeek[id] === w).length;
            return w !== weekNo && (n === 2 || n === 0);
          });
          // Just force donor active this week by clearing — reassign bye to any week with 2 byes → 3 invalid.
          // Safest repair: swap donor with an active team that already has bye elsewhere — no.
          // Keep even: move TWO teams. For now pop one bye and one from another week of size 4 to a holding...
          byes.shift();
          const rebuilt = ids.filter((id) => byeWeek[id] === weekNo && id !== donor);
          // cancel donor bye — assign new bye week with current size 2 (→3). BAD.
          // Assign donor to same week as another single move from size-4 to size-2: size-4→3, size-2→3 still odd.
          // Move 2 from a 4-bye week to a 2-bye week: 4→2, 2→4. Even!
        }
      }
      const active2 = ids.filter((id) => byeWeek[id] !== weekNo);
      // Ensure even
      let act = active2.slice();
      if (act.length % 2) {
        // Pull a bye team into active (they lose bye this week — reassign later)
        const victim = ids.find((id) => byeWeek[id] === weekNo);
        if (victim) {
          // Move victim's bye to a week where adding keeps even and within 5-14
          const dest = byeSlots.find((w) => {
            if (w === weekNo) return false;
            const n = ids.filter((x) => byeWeek[x] === w).length;
            return n === 2; // 2→3 odd... 
          });
          // Swap byes with someone playing this week who can take this bye
          const swap = act.find((id) => {
            const theirBye = byeWeek[id];
            // after swap: weekNo byes unchanged count if we swap one-for-one
            return true;
          });
          if (swap && victim) {
            const old = byeWeek[swap];
            byeWeek[swap] = weekNo;
            byeWeek[victim] = old;
            act = ids.filter((id) => byeWeek[id] !== weekNo);
          }
        }
      }
      if (act.length % 2) {
        // Last resort: sit an arbitrary extra (will fail validator — better than hang)
        act = act.slice(0, act.length - 1);
      }
      const pairs = pairWeek(act, weekNo);
      if (!pairs) {
        // Emergency circle pairing
        const arr = act.slice();
        for (let i = 0; i < arr.length; i += 2) {
          if (!arr[i + 1]) break;
          let home = arr[i], away = arr[i + 1];
          if (homeTarget[away] - homeCount[away] > homeTarget[home] - homeCount[home]) {
            home = arr[i + 1]; away = arr[i];
          }
          schedule[wi].push({ home, away, played: false, hs: null, as: null });
          homeCount[home]++; bump(home, away);
        }
      } else {
        pairs.forEach((p) => {
          schedule[wi].push({ home: p.home, away: p.away, played: false, hs: null, as: null });
          homeCount[p.home]++; bump(p.home, p.away);
        });
      }
      schedule[wi].byes = ids.filter((id) => byeWeek[id] === weekNo);
    }

    // Home/away flip pass toward exact 8/9 targets
    function recountHomes() {
      ids.forEach((id) => { homeCount[id] = 0; });
      schedule.forEach((week) => week.forEach((g) => { homeCount[g.home]++; }));
    }
    for (let pass = 0; pass < 24; pass++) {
      recountHomes();
      let flipped = 0;
      schedule.forEach((week) => {
        week.forEach((g) => {
          const needH = homeTarget[g.home] - homeCount[g.home];
          const needA = homeTarget[g.away] - homeCount[g.away];
          // Flip when home is over target and away is under (or home over and away not over)
          if (needH < 0 && needA >= 0) {
            homeCount[g.home]--; homeCount[g.away]++;
            const t = g.home; g.home = g.away; g.away = t;
            flipped++;
          }
        });
      });
      if (!flipped) break;
    }
    // Force-fix any stragglers still outside 8–9 by flipping vs a complementary partner
    recountHomes();
    ids.forEach((id) => {
      let guard = 0;
      while ((homeCount[id] < 8 || homeCount[id] > 9) && guard++ < 40) {
        let flipped = false;
        for (const week of schedule) {
          for (const g of week) {
            if (g.home !== id && g.away !== id) continue;
            if (homeCount[id] > 9 && g.home === id) {
              // give away a home
              homeCount[g.home]--; homeCount[g.away]++;
              const t = g.home; g.home = g.away; g.away = t;
              flipped = true; break;
            }
            if (homeCount[id] < 8 && g.away === id) {
              // take a home
              homeCount[g.home]--; homeCount[g.away]++;
              const t = g.home; g.home = g.away; g.away = t;
              flipped = true; break;
            }
          }
          if (flipped) break;
        }
        if (!flipped) break;
      }
    });
    recountHomes();

    return schedule;
  }

  /** Validate schedule invariants. Returns {ok, errors[]}. */
  function validateSchedule(schedule, opts) {
    opts = opts || {};
    const errors = [];
    const ids = TEAMS.map((t) => t.id);
    if (!schedule || schedule.length !== SEASON_WEEKS) {
      errors.push("expected " + SEASON_WEEKS + " weeks, got " + (schedule ? schedule.length : 0));
      return { ok: false, errors };
    }
    const gamesByTeam = {}; const homes = {}; const byeOf = {};
    ids.forEach((id) => { gamesByTeam[id] = 0; homes[id] = 0; });
    schedule.forEach((week, wi) => {
      const weekNo = wi + 1;
      const playing = new Set();
      const byes = week.byes || [];
      if (byes.length % 2 !== 0) errors.push("odd bye count week " + weekNo);
      byes.forEach((id) => {
        if (byeOf[id] != null) errors.push(id + " has multiple byes");
        byeOf[id] = weekNo;
        if (weekNo < BYE_WEEK_MIN || weekNo > BYE_WEEK_MAX) errors.push(id + " bye outside 5-14 (week " + weekNo + ")");
      });
      (week || []).forEach((g) => {
        if (!g || !g.home || !g.away) return;
        if (g.home === g.away) errors.push("self-game " + g.home);
        if (playing.has(g.home) || playing.has(g.away)) errors.push("double-book week " + weekNo + " " + g.home + "/" + g.away);
        if (byes.indexOf(g.home) >= 0 || byes.indexOf(g.away) >= 0) errors.push("plays on bye week " + weekNo);
        playing.add(g.home); playing.add(g.away);
        gamesByTeam[g.home]++; gamesByTeam[g.away]++;
        homes[g.home]++;
      });
      ids.forEach((id) => {
        const onBye = byes.indexOf(id) >= 0;
        const plays = playing.has(id);
        if (onBye && plays) errors.push(id + " bye+play week " + weekNo);
        if (!onBye && !plays && opts.strictIdle !== false) errors.push(id + " idle without bye week " + weekNo);
      });
    });
    ids.forEach((id) => {
      if (gamesByTeam[id] !== GAMES_PER_TEAM) errors.push(id + " has " + gamesByTeam[id] + " games (want " + GAMES_PER_TEAM + ")");
      if (byeOf[id] == null) errors.push(id + " missing bye");
      if (!(homes[id] === 8 || homes[id] === 9)) errors.push(id + " has " + homes[id] + " home (want 8 or 9)");
    });
    return { ok: errors.length === 0, errors: errors.slice(0, 40), gamesByTeam, homes, byeOf };
  }

  function teamPower(teamId) {
    const roster = activeRosterForSim(teamId);
    if (!roster.length) return 28; // empty / undrafted clubs are helpless
    if (roster.length < 11) return 35 + roster.length;
    const sorted = roster.slice().sort((a, b) => playerEffectiveOvr(b) - playerEffectiveOvr(a));
    const top = sorted.slice(0, 22);
    let avg = top.reduce((s, p) => s + playerEffectiveOvr(p), 0) / top.length;
    const star = playerEffectiveOvr(top[0]);
    const dc = dynCoach(teamId);
    let bonus = 0;
    if (dc && window.AFACoaches && typeof AFACoaches.teamPowerBonus === "function") {
      bonus = AFACoaches.teamPowerBonus(dc, roster) || 0;
      if (typeof AFACoaches.schemeBonus === "function") {
        avg = top.reduce((s, p) => s + playerEffectiveOvr(p) * (AFACoaches.schemeBonus(dc, p) || 1), 0) / top.length;
      }
    } else {
      const coach = coachById(state.coachAssign[teamId]);
      bonus = coach ? (coach.ovr - 80) * 0.28 : 0;
    }
    return avg * 0.68 + star * 0.28 + bonus;
  }

  function ensurePlayerSeasonStats(pid) {
    if (!state.playerStats) state.playerStats = {};
    if (!state.playerStats[pid]) {
      state.playerStats[pid] = {
        season: state.seasonYear || state.draftYear || 2026,
        passYds: 0, passTd: 0, passInt: 0, passAtt: 0, passCmp: 0,
        rushYds: 0, rushTd: 0, rushAtt: 0,
        rec: 0, recYds: 0, recTd: 0, targets: 0,
        tackles: 0, sacks: 0, int: 0, forcedFum: 0,
        games: 0, gamesStarted: 0
      };
    }
    return state.playerStats[pid];
  }

  function accrueSimStats(teamId, scored, allowed, isHome) {
    const lu = buildLineup(teamId, ui.formation || "11");
    const qb = (lu.offense.find((s) => s.slot === "QB") || {}).player;
    const rb = (lu.offense.find((s) => s.slot === "HB" || s.slot === "RB") || {}).player;
    const wrs = lu.offense.filter((s) => s.role === "WR" && s.player).map((s) => s.player);
    const tes = lu.offense.filter((s) => s.role === "TE" && s.player).map((s) => s.player);
    const passShare = 0.62 + (Math.random() - 0.5) * 0.08;
    const teamPass = Math.round((280 + (scored - 21) * 6 + (Math.random() - 0.5) * 60) * passShare / passShare);
    const teamRush = Math.round(110 + (scored - 21) * 2.5 + (Math.random() - 0.5) * 40);
    const passYds = Math.max(120, Math.min(520, Math.round(250 + (scored - allowed) * 4 + (Math.random() - 0.5) * 80)));
    const rushYds = Math.max(40, Math.min(260, teamRush));
    const passTd = Math.max(0, Math.min(5, Math.round(scored / 10) + (Math.random() > 0.7 ? 1 : 0) - (Math.random() > 0.85 ? 1 : 0)));
    const rushTd = Math.max(0, scored >= 24 ? 1 : 0) + (Math.random() > 0.75 && scored >= 28 ? 1 : 0);
    const ints = Math.random() < 0.35 ? 1 : (Math.random() < 0.08 ? 2 : 0);
    if (qb) {
      const st = ensurePlayerSeasonStats(qb.id);
      const att = 28 + Math.round(Math.random() * 12);
      const cmp = Math.round(att * (0.58 + Math.random() * 0.14));
      st.passAtt += att; st.passCmp += cmp; st.passYds += passYds; st.passTd += passTd; st.passInt += ints;
      st.games += 1; st.gamesStarted += 1;
    }
    if (rb) {
      const st = ensurePlayerSeasonStats(rb.id);
      const att = 12 + Math.round(Math.random() * 10);
      st.rushAtt += att; st.rushYds += Math.round(rushYds * 0.75); st.rushTd += rushTd;
      st.rec += Math.round(Math.random() * 4); st.recYds += Math.round(Math.random() * 35);
      st.games += 1; st.gamesStarted += 1;
    }
    const receivers = wrs.concat(tes);
    let yLeft = Math.round(passYds * 0.85);
    let tdLeft = passTd;
    receivers.forEach((pl, i) => {
      const st = ensurePlayerSeasonStats(pl.id);
      const share = i === 0 ? 0.38 : i === 1 ? 0.28 : i === 2 ? 0.2 : 0.14;
      const y = Math.round(yLeft * share * (0.85 + Math.random() * 0.3));
      const tds = tdLeft > 0 && Math.random() < 0.45 ? 1 : 0;
      if (tds) tdLeft -= 1;
      const rec = Math.max(1, Math.round(y / (11 + Math.random() * 5)));
      st.rec += rec; st.recYds += y; st.recTd += tds; st.targets += rec + Math.round(Math.random() * 2);
      st.games += 1; if (i < 3) st.gamesStarted += 1;
    });
    lu.defense.filter((s) => s.player).forEach((s) => {
      const st = ensurePlayerSeasonStats(s.player.id);
      st.tackles += Math.round(2 + Math.random() * 6);
      if (s.role === "DE" || s.role === "DT" || s.role === "LB") st.sacks += Math.random() < 0.18 ? 1 : 0;
      if (s.role === "CB" || s.role === "S") st.int += Math.random() < 0.08 ? 1 : 0;
      st.games += 1;
    });
  }

  function rollInjuriesForTeam(teamId, gameSeed) {
    const Inj = window.AFASystems && window.AFASystems.injuries;
    if (!Inj) return [];
    const roster = activeRosterForSim(teamId);
    const teamIR = ensureTeamIR(teamId);
    const events = Inj.rollTeamGame(roster, { seed: gameSeed + ":" + teamId, week: state.week });
    (events || []).forEach((ev) => {
      const p = playerById(ev.playerId || (ev.player && ev.player.id));
      if (!p) return;
      Inj.applyInjury(p, ev, teamIR);
    });
    return events || [];
  }

  function legacySimGame(g) {
    const hp = teamPower(g.home);
    const ap = teamPower(g.away);
    let edge = 0, gd = null;
    try {
      ensureStadiums();
      if (window.AFAStadiums && state.stadiums && state.stadiums[g.home]) {
        const r = records(), hr = r[g.home] || { w: 0, l: 0, t: 0 };
        const gp = hr.w + hr.l + hr.t;
        const rival = teamById(g.home).division === teamById(g.away).division;
        gd = AFAStadiums.gameDay(state.stadiums[g.home], {
          winPct: gp ? (hr.w + hr.t / 2) / gp : 0.5, week: state.week, rival,
          stakes: Math.min(1, state.week / SEASON_WEEKS), margin: (hp - ap) * 0.4
        });
        edge = gd.homePoints || 0;
      }
    } catch (e) {}
    let h = Math.round(21 + (hp - ap) * 0.4 + edge / 2 + (Math.random() - 0.42) * 16);
    let a = Math.round(21 + (ap - hp) * 0.4 - edge / 2 + (Math.random() - 0.42) * 16);
    h = Math.max(3, Math.min(55, Math.round(h * 0.92 + 2)));
    a = Math.max(3, Math.min(55, Math.round(a * 0.92 + 2)));
    if (h === a) {
      // Overtime — sudden-death-ish; ~18% of remaining ties stay tied after OT rare
      if (Math.random() < 0.55) h += (Math.random() < 0.5 ? 3 : 6);
      else if (Math.random() < 0.55) a += (Math.random() < 0.5 ? 3 : 6);
      else if (Math.random() > 0.12) { if (Math.random() < 0.5) h += 3; else a += 3; }
      // else true tie after OT
      g.overtime = true;
    }
    g.hs = h; g.as = a; g.played = true;
    if (gd) {
      try {
        const pen = AFAStadiums.rollVisitorPenalties ? AFAStadiums.rollVisitorPenalties(gd.noise, 62) : {};
        g.stadium = { att: gd.attendance.attendance, cap: gd.attendance.capacity, db: gd.noise.db,
          visFalseStarts: pen.falseStarts, visDelays: pen.delays, rev: gd.revenue };
      } catch (e) {}
    }
    try {
      accrueSimStats(g.home, h, a, true);
      accrueSimStats(g.away, a, h, false);
      const seed = (state.seasonYear || 2026) + "-W" + state.week + "-" + g.home + "-" + g.away;
      g.injuries = [].concat(rollInjuriesForTeam(g.home, seed), rollInjuriesForTeam(g.away, seed));
      const Inj = window.AFASystems && window.AFASystems.injuries;
      if (Inj) [g.home, g.away].forEach((tid) => Inj.advanceWeek(rosterOf(tid), ensureTeamIR(tid), { week: state.week }));
    } catch (e) { console.warn("legacy sim accrue", e); }
    try {
      if (window.AFAStadiums && state.stadiums && state.stadiums[g.home]) {
        const r = records()[g.home] || { w: 0, l: 0, t: 0 };
        const gp = r.w + r.l + r.t;
        const res = AFAStadiums.recordHomeGame(state.stadiums[g.home], {
          won: h > a ? true : h < a ? false : null, margin: h - a,
          rival: teamById(g.home).division === teamById(g.away).division,
          playoff: !!(g.playoff), week: state.week, winPct: gp ? (r.w + r.t / 2) / gp : 0.5
        });
        g.stadium = Object.assign(g.stadium || {}, { att: res.attendance, fill: res.fill, loyalty: res.loyalty });
      }
    } catch (e) {}
  }

  function simGame(g, opts) {
    opts = opts || {};
    ensureStadiums();
    ensureDynasty();
    if (!window.AFAGameDay || typeof AFAGameDay.simulateGame !== "function") {
      return legacySimGame(g);
    }
    const homeSide = buildGameDaySide(g.home);
    const awaySide = buildGameDaySide(g.away);
    if (!homeSide.roster.length && !awaySide.roster.length) {
      g.hs = 0; g.as = 0; g.played = true; g.emptyRosters = true; return;
    }
    const rec = records();
    const hr = rec[g.home] || { w: 0, l: 0, t: 0 };
    const gp = hr.w + hr.l + hr.t;
    const isUserGame = !!(state.userTeamId && (g.home === state.userTeamId || g.away === state.userTeamId));
    const wantTimeline = opts.timeline != null ? opts.timeline : (isUserGame && ui.replayView !== "off");
    const isPlayoff = !!(g.playoff || opts.playoff);
    let result;
    try {
      result = AFAGameDay.simulateGame(homeSide, awaySide, {
        seed: hashStr([g.home, g.away, state.week, state.seasonYear || 0, g.round || "", opts.seedTag || ""].join(":")),
        week: state.week,
        stadiumState: state.stadiums && state.stadiums[g.home],
        rival: teamById(g.home).division === teamById(g.away).division,
        stakes: isPlayoff ? 0.85 : Math.min(1, state.week / SEASON_WEEKS),
        homeWinPct: gp ? (hr.w + hr.t / 2) / gp : 0.5,
        injuries: opts.injuries != null ? opts.injuries : true,
        timeline: wantTimeline,
        playoff: isPlayoff
      });
    } catch (e) {
      console.warn("AFAGameDay failed, legacy fallback", e);
      return legacySimGame(g);
    }
    g.hs = result.score.home;
    g.as = result.score.away;
    g.played = true;
    g.pbp = result.plays;
    g.box = result.boxScore;
    g.attribution = result.attribution;
    g.timeline = result.timeline;
    g.injuries = result.injuries;
    g.stadium = result.stadium;
    g.totals = result.totals;
    g.overtime = !!(result.totals && result.totals.overtime) || (result.plays || []).some((p) => p.period > 4 || p.quarter > 4);
    if (isUserGame) state.lastWatchedGame = g;

    foldStatLines(result.playerStatLines && result.playerStatLines.home);
    foldStatLines(result.playerStatLines && result.playerStatLines.away);

    // Apply injuries via AFASystems (engine may already attach; re-apply safely)
    try {
      const Inj = window.AFASystems && window.AFASystems.injuries;
      if (Inj && opts.injuries !== false) {
        (result.injuries || []).forEach((ev) => {
          const tid = ev.team === "away" || ev.side === "away" ? g.away : g.home;
          const p = playerById(ev.playerId);
          if (p) Inj.applyInjury(p, ev, ensureTeamIR(tid));
        });
        [g.home, g.away].forEach((tid) => Inj.advanceWeek(rosterOf(tid), ensureTeamIR(tid), { week: state.week }));
      }
    } catch (e) { console.warn("injury apply", e); }

    // Fan economy after home game
    try {
      if (window.AFAStadiums && state.stadiums && state.stadiums[g.home]) {
        const r2 = records()[g.home] || { w: 0, l: 0, t: 0 };
        const gp2 = r2.w + r2.l + r2.t;
        const res = AFAStadiums.recordHomeGame(state.stadiums[g.home], {
          won: g.hs > g.as ? true : g.hs < g.as ? false : null,
          margin: g.hs - g.as,
          rival: teamById(g.home).division === teamById(g.away).division,
          playoff: !!(g.playoff), week: state.week,
          winPct: gp2 ? (r2.w + r2.t / 2) / gp2 : 0.5
        });
        g.stadium = Object.assign(g.stadium || {}, { att: res.attendance, fill: res.fill, loyalty: res.loyalty });
      }
    } catch (e) {}

    try {
      if (window.AFABridge && window.AFABridge.hooks) window.AFABridge.hooks.run("onGameSim", { game: g, result });
    } catch (e) {}
  }

  function records() {
    const rec = {};
    TEAMS.forEach((t) => { rec[t.id] = { w: 0, l: 0, t: 0, pf: 0, pa: 0 }; });
    (state.schedule || []).forEach((week) => {
      (week || []).forEach((g) => {
        if (!g.played) return;
        rec[g.home].pf += g.hs; rec[g.home].pa += g.as;
        rec[g.away].pf += g.as; rec[g.away].pa += g.hs;
        if (g.hs > g.as) { rec[g.home].w++; rec[g.away].l++; }
        else if (g.as > g.hs) { rec[g.away].w++; rec[g.home].l++; }
        else { rec[g.home].t++; rec[g.away].t++; }
      });
    });
    return rec;
  }

  function endSeasonRecalibrate() {
    const G = window.AFAGrading;
    if (!G) return;
    try {
      const leagueLines = [];
      Object.keys(state.playerStats || {}).forEach((pid) => {
        const p = playerById(pid);
        const st = state.playerStats[pid];
        if (!p || !st) return;
        const line = G.deriveLine ? G.deriveLine(p, st) : Object.assign({ pos: p.pos, playerId: pid }, st);
        leagueLines.push(line);
      });
      if (leagueLines.length) {
        const norms = G.recalibrate(state.seasonYear || state.draftYear, leagueLines, {});
        state.gradingNorms = G.exportNorms ? G.exportNorms() : norms;
      }
      const pack = state.playerStats || {};
      allPlayersList().forEach((p) => {
        if (!pack[p.id]) return;
        const g = G.gradePlayer({ pos: p.pos, age: p.age, ovr: p.ovrBase != null ? p.ovrBase : p.ovr }, [pack[p.id]], { applyAge: true });
        p.grade = g;
        if (state.useStatGrades && g && g.confidence > 0.5) {
          // Grades are informational-first; tiny ovr nudge only so YoY PPG stays near 22
          const base = p.ovrBase != null ? p.ovrBase : p.ovr;
          p.ovr = Math.round(0.92 * base + 0.08 * g.overall);
          if (p.ovrBase == null) p.ovrBase = base;
          // Keep grade.overall near roster ovr so any legacy grade readers stay safe
          g.overall = Math.round(g.overall * 0.25 + p.ovr * 0.75);
          p.grade = g;
        }
      });
    } catch (e) { console.warn("endSeasonRecalibrate", e); }
    try {
      // Heal before postseason so playoff games aren't played with emptied IR rosters
      clearLeagueInjuries();
      if (!state.playoffs || state.playoffs.year !== state.seasonYear) runPlayoffs();
      dynastyEndSeason();
      stadiumOffseason();
      refillRostersFromFA();
      clearLeagueInjuries();
      // Soft chemistry mean-reversion so Y2+ scoring stays near target (continuity decays, units drift to 55)
      if (state.chemistry) {
        Object.keys(state.chemistry).forEach((tid) => {
          const c = state.chemistry[tid]; if (!c) return;
          ["ol","qbWr","secondary","frontSeven","specialTeams"].forEach((k) => {
            if (typeof c[k] === "number") c[k] = Math.round(c[k] * 0.7 + 55 * 0.3);
          });
          if (typeof c.continuity === "number") c.continuity = Math.round(c.continuity * 0.85 + 50 * 0.15);
        });
      }
      // Re-anchor ratings toward founding ovrBase so attrition doesn't crater PPG
      allPlayersList().forEach((p) => {
        if (p.ovrBase != null && typeof p.ovr === "number") {
          p.ovr = Math.round(p.ovr * 0.35 + p.ovrBase * 0.65);
        }
      });
      ensureCoachPool(true); // refresh FA coach board for next carousel
      if (window.AFABridge && window.AFABridge.hooks) window.AFABridge.hooks.run("onSeasonEnd", { state, year: state.seasonYear });
    } catch (e) { console.warn("season end modules", e); }
  }

  function simWeek() {
    if (state.seasonDone) { toast("Regular season is over."); return; }
    const week = state.schedule[state.week - 1];
    if (!week) return;
    week.forEach((g) => { if (!g.played) simGame(g); });
    if (state.week >= SEASON_WEEKS) {
      state.seasonDone = true;
      endSeasonRecalibrate();
      toast("Regular season complete. Grades recalibrated from season stats.");
    } else {
      state.week += 1;
      toast("Week " + (state.week - 1) + " is final.");
    }
    save();
    ui.hubTab = "slate";
    renderHub();
  }

  /** Yielding rest-of-season sim so the UI stays responsive. */
  function simRestOfSeason(opts) {
    opts = opts || {};
    if (state.seasonDone) { toast("Regular season is over."); return Promise.resolve(); }
    const chunk = opts.chunk || 2;
    return new Promise((resolve) => {
      function step() {
        let n = 0;
        while (!state.seasonDone && n < chunk) {
          const week = state.schedule[state.week - 1];
          if (!week) { state.seasonDone = true; break; }
          week.forEach((g) => { if (!g.played) simGame(g); });
          if (state.week >= SEASON_WEEKS) {
            state.seasonDone = true;
            endSeasonRecalibrate();
          } else state.week += 1;
          n++;
        }
        save();
        if (opts.onProgress) opts.onProgress(state.week, state.seasonDone);
        if (state.seasonDone) {
          toast("Season sim complete.");
          if (opts.render !== false) { ui.hubTab = "standings"; renderHub(); }
          resolve();
        } else {
          setTimeout(step, 0);
        }
      }
      step();
    });
  }

  /* ---------- HUB ---------- */
  function viewTeamId() {
    return ui.viewTeamId || state.userTeamId || TEAMS[0].id;
  }

  function renderHub() {
    // Old saves may already be on hub while the founding draft era is still open
    if (draftInProgress()) {
      toast("Draft still open.");
      goDraftRoom();
      return;
    }
    state.phase = "hub";
    save();
    showScreen("hub");
    clearInterval(clockTimer);
    syncHubDraftTab();

    const vt = teamById(viewTeamId());
    $("hub-team-select").innerHTML = TEAMS.map((t) =>
      `<option value="${t.id}" ${t.id === vt.id ? "selected" : ""}>${displayName(t)}</option>`
    ).join("");
    $("hub-team-logo").innerHTML = logoImg(vt);
    const hc = coachById(state.coachAssign[vt.id]);
    $("hub-team-meta").innerHTML = `<strong>${displayName(vt)}</strong><div class="city">${vt.conference} · ${vt.division}${hc ? " · HC " + hc.name : ""}${state.dynasty && state.dynasty.coaches && state.dynasty.coaches[vt.id] ? " · " + state.dynasty.coaches[vt.id].offScheme + " / " + state.dynasty.coaches[vt.id].defScheme : ""}${state.sleeperImport && vt.id === state.userTeamId ? ` · <span class="import-badge">${state.sleeperImport.league} import</span>` : ""}</div>`;

    $("hub-week-chip").textContent = state.collegeDraft ? (state.collegeDraft.year + " College Draft") : (state.seasonDone ? "Season final" : "Week " + state.week);
    document.querySelectorAll("#hub-nav [data-tab]").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-tab") === ui.hubTab);
    });

    const body = $("hub-body");
    if (ui.hubTab === "home") body.innerHTML = renderLeagueHomeHTML(vt);
    else if (ui.hubTab === "standings") body.innerHTML = renderStandingsHTML();
    else if (ui.hubTab === "slate") body.innerHTML = renderSlateHTML();
    else if (ui.hubTab === "roster") body.innerHTML = renderRosterHTML(vt);
    else if (ui.hubTab === "players") {
      body.innerHTML = '<div id="players-tab" style="height:75vh"></div>';
      if (window.AFAPlayersTab) {
        try { AFAPlayersTab.mount("players-tab", state); } catch (e) { console.warn("players tab", e); }
      } else body.innerHTML = '<p class="help">Players module not loaded.</p>';
    }
    else if (ui.hubTab === "lineup") body.innerHTML = renderHubLineupHTML(vt);
    else if (ui.hubTab === "trades") body.innerHTML = renderTradesHTML();
    else if (ui.hubTab === "signings") body.innerHTML = renderSigningsHTML(vt);
    else if (ui.hubTab === "stadium") body.innerHTML = renderStadiumHTML(vt);
    else if (ui.hubTab === "dynasty") body.innerHTML = renderDynastyHTML(vt);
    else if (ui.hubTab === "gameday") body.innerHTML = renderGameDayHTML(vt);
    else if (ui.hubTab === "sim") body.innerHTML = renderSimHTML();
    else if (ui.hubTab === "college") body.innerHTML = renderCollegeDraftHTML();
    else body.innerHTML = renderLeagueHomeHTML(vt);

    bindHubEvents();
    bindScoutHover(body);
  }


  function nextGameFor(teamId) {
    if (!state.schedule || !state.schedule.length) return null;
    const start = Math.max(0, (state.week || 1) - 1);
    for (let w = start; w < state.schedule.length; w++) {
      const hit = (state.schedule[w] || []).find((g) => !g.played && (g.home === teamId || g.away === teamId));
      if (hit) return { week: w + 1, game: hit };
    }
    return null;
  }


  const POS_BAR_COLORS = {
    QB:"#7c5cff", RB:"#ff7a59", WR:"#5cb0ff", TE:"#3dd68c", OT:"#e0b145", OG:"#d4a017", C:"#c4a574",
    DE:"#ff4b3a", DT:"#ef6b6b", LB:"#ff9f43", CB:"#5ce1e6", S:"#7dffb0", K:"#b388ff", P:"#9eb0c8"
  };

  function teamPosStrength(teamId) {
    const roster = rosterOf(teamId);
    const by = {};
    roster.forEach((p) => {
      if (!by[p.pos]) by[p.pos] = [];
      by[p.pos].push(p.ovr);
    });
    return POSITIONS.map((pos) => {
      const arr = (by[pos] || []).slice().sort((a, b) => b - a);
      const top = arr.slice(0, Math.min(3, arr.length));
      const avg = top.length ? Math.round(top.reduce((s, n) => s + n, 0) / top.length) : 0;
      return { pos, avg, count: arr.length, best: arr[0] || 0 };
    });
  }

  function svgPosBars(teamId, opts) {
    const data = teamPosStrength(teamId);
    const w = (opts && opts.width) || 420;
    const rowH = 18;
    const h = data.length * rowH + 8;
    const labelW = 28;
    const maxBar = w - labelW - 36;
    const rows = data.map((d, i) => {
      const y = 4 + i * rowH;
      const bw = Math.round((d.avg / 99) * maxBar);
      const color = POS_BAR_COLORS[d.pos] || "#5cb0ff";
      return `<g>
        <text x="0" y="${y + 12}" fill="#9eb0c8" font-size="10" font-family="IBM Plex Mono,monospace">${d.pos}</text>
        <rect x="${labelW}" y="${y + 3}" width="${maxBar}" height="11" rx="3" fill="rgba(255,255,255,0.06)"/>
        <rect x="${labelW}" y="${y + 3}" width="${bw}" height="11" rx="3" fill="${color}"/>
        <text x="${labelW + maxBar + 4}" y="${y + 12}" fill="#e8eef6" font-size="10" font-family="IBM Plex Mono,monospace">${d.avg || "—"}</text>
      </g>`;
    }).join("");
    return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Positional strength">${rows}</svg>`;
  }

  function draftPosBreakdown(teamId) {
    const counts = posCounts(teamId);
    const entries = POSITIONS.map((pos) => ({ pos, n: counts[pos] || 0 })).filter((e) => e.n > 0);
    const total = entries.reduce((s, e) => s + e.n, 0) || 1;
    const w = 360, h = 120, pad = 8;
    let x = pad;
    const segs = entries.map((e) => {
      const bw = Math.max(2, Math.round((e.n / total) * (w - pad * 2)));
      const color = POS_BAR_COLORS[e.pos] || "#5cb0ff";
      const showLabel = bw >= 18;
      const showCount = bw >= 12;
      const g = `<rect x="${x}" y="28" width="${bw}" height="28" fill="${color}"/>
        ${showLabel ? `<text x="${x + bw / 2}" y="22" text-anchor="middle" fill="#c5d0e0" font-size="9">${e.pos}</text>` : ""}
        ${showCount ? `<text x="${x + bw / 2}" y="48" text-anchor="middle" fill="#0b1018" font-size="10" font-weight="700">${e.n}</text>` : ""}`;
      x += bw;
      return g;
    }).join("");
    const roster = rosterOf(teamId);
    const avg = roster.length ? Math.round(roster.reduce((s, p) => s + p.ovr, 0) / roster.length) : 0;
    const grade = avg >= 88 ? "A" : avg >= 84 ? "B+" : avg >= 80 ? "B" : avg >= 76 ? "C+" : avg >= 72 ? "C" : "D";
    return `<div class="draft-team-summary">
      <div class="dts-meta"><strong>Your draft haul</strong> · Avg ${avg} OVR · Grade <span class="grade-pill grade-${grade[0]}">${grade}</span> · ${roster.length} players</div>
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Picks by position">${segs}
        <text x="${pad}" y="${h - 12}" fill="#8b9bb0" font-size="10">Picks by position</text>
      </svg>
      <div class="help" style="margin-top:6px;font-size:11px">${entries.map((e) => e.pos + " " + e.n).join(" · ")}</div>
    </div>`;
  }

  function seasonTrendSVG(teamId) {
    const rec = records()[teamId] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    const games = [];
    function pushGame(g, weekNum) {
      if (!g || !g.played) return;
      if (g.home !== teamId && g.away !== teamId) return;
      const mine = g.home === teamId ? (g.hs ?? g.homeScore) : (g.as ?? g.awayScore);
      const theirs = g.home === teamId ? (g.as ?? g.awayScore) : (g.hs ?? g.homeScore);
      if (mine == null || theirs == null || Number.isNaN(Number(mine)) || Number.isNaN(Number(theirs))) return;
      games.push({ week: weekNum, pf: Number(mine), pa: Number(theirs), win: mine > theirs, tie: mine === theirs });
    }
    (state.schedule || []).forEach((week, wi) => {
      (week || []).forEach((g) => pushGame(g, wi + 1));
    });
    if (!games.length && Array.isArray(state.lastSeasonGames)) {
      state.lastSeasonGames.forEach((g) => pushGame(g, g.week || 0));
    }
    if (!games.length) {
      return `<p class="help">No games played yet — sim a week to unlock the W-L / scoring trend.</p>`;
    }
    const w = 420, h = 110, padL = 28, padR = 8, padT = 12, padB = 22;
    const maxPts = Math.max(30, ...games.map((g) => Math.max(g.pf, g.pa)));
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const step = games.length > 1 ? plotW / (games.length - 1) : plotW;
    function yScale(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || !maxPts) return padT + plotH;
      return padT + plotH - (n / maxPts) * plotH;
    }
    const pfLine = games.map((g, i) => `${i === 0 ? "M" : "L"}${padL + i * step},${yScale(g.pf)}`).join(" ");
    const paLine = games.map((g, i) => `${i === 0 ? "M" : "L"}${padL + i * step},${yScale(g.pa)}`).join(" ");
    const dots = games.map((g, i) => {
      const x = padL + i * step;
      const color = g.tie ? "#e0b145" : g.win ? "#3dd68c" : "#ef6b6b";
      return `<circle cx="${x}" cy="${yScale(g.pf)}" r="3.5" fill="${color}"/>`;
    }).join("");
    return `<div class="trend-meta">${rec.w}-${rec.l}${rec.t ? "-" + rec.t : ""} · PF ${rec.pf} · PA ${rec.pa} · Diff ${rec.pf - rec.pa >= 0 ? "+" : ""}${rec.pf - rec.pa}</div>
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="Season scoring trend">
        <path d="${paLine}" fill="none" stroke="#ef6b6b" stroke-width="2" stroke-dasharray="4 3" opacity="0.85"/>
        <path d="${pfLine}" fill="none" stroke="#5cb0ff" stroke-width="2.5"/>
        ${dots}
        <text x="${padL}" y="${h - 6}" fill="#8b9bb0" font-size="9">PF solid · PA dashed · dots = result</text>
      </svg>`;
  }

  function renderLeagueHomeHTML(team) {
    const roster = rosterOf(team.id);
    const avg = roster.length ? Math.round(roster.reduce((s, p) => s + p.ovr, 0) / roster.length) : 0;
    const hc = coachById(state.coachAssign[team.id]);
    const rec = records()[team.id] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
    const next = nextGameFor(team.id);
    let nextHtml = `<p class="help">No upcoming game on the slate.</p>`;
    if (next) {
      const g = next.game;
      const oppId = g.home === team.id ? g.away : g.home;
      const opp = teamById(oppId);
      const homeAway = g.home === team.id ? "vs" : "@";
      nextHtml = `<div class="home-next">
        <div class="eyebrow">Week ${next.week} · ${homeAway} ${opp.abbr}</div>
        <div class="home-next-row">${logoImg(team)} <span class="vs">vs</span> ${logoImg(opp)}</div>
        <div class="help">${displayName(team)} ${homeAway} ${displayName(opp)}</div>
      </div>`;
    }
    ensurePicks();
    const myPicks = picksOwnedBy(team.id).slice(0, 12);
    const picksHtml = myPicks.length
      ? `<div class="panel" style="margin-top:12px"><div class="panel-h"><strong>Draft capital</strong><span class="help">${picksOwnedBy(team.id).length} owned</span></div>
        <div class="panel-b" style="display:flex;flex-wrap:wrap;gap:6px">${myPicks.map((pk) => `<span class="sel-pill pick-pill">${pickLabel(pk)}</span>`).join("")}</div></div>`
      : "";
    const stars = roster.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 6);
    const starHtml = stars.map((p) =>
      `<div class="home-star" data-scout="${p.id}" data-player-id="${p.id}"><span class="jersey">#${jerseyNum(p)}</span> <strong data-profile="${p.id}">${p.name}</strong> <span class="pos-pill pos-${p.pos}">${p.pos}</span> <span class="${ovrClass(p.ovr)}">${p.ovr}</span></div>`
    ).join("") || `<p class="help">No roster yet.</p>`;

    return `<div class="league-home">
      <div class="home-study" role="navigation" aria-label="Real NFL study">
        <button type="button" class="study-card" id="btn-hub-players"><span class="eyebrow">Directory</span><strong>Players</strong><span>Real NFL teams, stats, and photos.</span></button>
        <button type="button" class="study-card" id="btn-hub-scouting"><span class="eyebrow">Workspace</span><strong>Scouting</strong><span>NFL grades, plus OGFFL or Dynasty kept apart.</span></button>
      </div>
      <div class="home-hero" style="--club:${team.primary}">
        <div class="home-hero-main">
          ${logoImg(team, "lg")}
          <div>
            <div class="eyebrow">AFA Franchise · ${(state.seasonYear || 2027) - 1} season</div>
            <h1>${displayName(team)}</h1>
            <div class="help">${team.conference} · ${team.division}${hc ? " · HC " + hc.name : ""}</div>
            <div class="home-rec">${rec.w}-${rec.l}${rec.t ? "-" + rec.t : ""} · Roster ${roster.length} · Avg ${avg} OVR</div>
          </div>
        </div>
        <div class="home-hero-next">${nextHtml}</div>
      </div>
      ${collegeCtaHTML()}
      <div class="home-actions">
        <button class="btn btn-primary" data-home-tab="lineup">Set Lineup</button>
        <button class="btn" data-home-tab="trades">Make a Trade</button>
        <button class="btn" data-home-tab="roster">Edit Roster</button>
        <button class="btn" data-home-tab="signings">Free Agency</button>
        <button class="btn" data-home-tab="slate">View Schedule</button>
        <button class="btn btn-live" data-home-tab="sim">Play Week</button>
      </div>
      <div class="home-grid">
        <div class="panel">
          <div class="panel-h"><strong>Top talent</strong><span class="help">Tap for scout card</span></div>
          <div class="panel-b home-stars">${starHtml}</div>${picksHtml}
        </div>
        <div class="panel">
          <div class="panel-h"><strong>GM desk</strong></div>
          <div class="panel-b">
            <p class="help">Madden-style franchise hub. Build your lineup, swing trades, sign free agents, then sim the week when you’re ready.</p>
            <ul class="home-checklist">
              <li>Review depth on <strong>Lineup</strong></li>
              <li>Shop the board on <strong>Trades</strong> / <strong>Free Agency</strong></li>
              <li>Advance the season from <strong>Play Week</strong></li>
            </ul>
          </div>
        </div>
      </div>
      <details class="chart-panel" open>
        <summary>Positional strength <span class="help">top-3 avg OVR by spot</span></summary>
        <div class="chart-body">${svgPosBars(team.id)}</div>
      </details>
      <details class="chart-panel">
        <summary>Season trend <span class="help">W-L · points for/against</span></summary>
        <div class="chart-body">${seasonTrendSVG(team.id)}</div>
      </details>
    </div>`;
  }


  function renderStadiumHTML(team) {
    ensureStadiums();
    if (!window.AFAStadiums || !window.AFAStadiumUI) {
      return `<p class="help">Stadium module not loaded.</p>`;
    }
    const st = state.stadiums[team.id];
    const r = records()[team.id] || { w: 0, l: 0, t: 0 };
    const gp = r.w + r.l + r.t;
    return `<div class="hub-stadium"><div id="stadiumMount"></div>
      <script>
      /* mount deferred via bindHubEvents */
      </script></div>`;
  }

  function mountStadiumUI(team) {
    if (!window.AFAStadiumUI || !state.stadiums) return;
    const el = document.getElementById("stadiumMount");
    if (!el) return;
    const r = records()[team.id] || { w: 0, l: 0, t: 0 };
    const gp = r.w + r.l + r.t;
    AFAStadiumUI.mount(el, state.stadiums[team.id], {
      primary: team.primary, secondary: team.secondary,
      winPct: gp ? (r.w + r.t * 0.5) / gp : 0.5,
      league: state.stadiums,
      onChange: () => { save(); }
    });
  }

  function renderDynastyHTML(team) {
    ensureDynasty();
    ensureCoachPool();
    if (!window.AFADynasty || !AFADynasty.ui) {
      return `<p class="help">Dynasty module not loaded.</p>`;
    }
    const fr = state.dynasty.teams[team.id];
    if (state.coachAssign[team.id]) syncCoachToDynasty(team.id, state.coachAssign[team.id]);
    const coach = dynCoach(team.id);
    const employed = Object.values(state.dynasty.coaches || {});
    const avail = (window.AFACoaches && AFACoaches.availableCoaches)
      ? AFACoaches.availableCoaches(employed, state.coachPool || []).slice(0, 8)
      : (state.coachPool || []).slice(0, 8);
    const interview = `<div class="panel" style="margin-top:12px"><div class="panel-h"><strong>Coaching carousel · interview board</strong><span class="help">${(state.coachPool || []).length} FA HCs</span></div>
      <div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
        ${avail.map((c) => `<div class="dyn-card" style="padding:10px">
          <strong>${c.name}</strong> <span class="help">OVR ${c.ovr} · age ${c.age || "?"}</span>
          <div class="help">${c.offScheme || ""} / ${c.defScheme || ""}</div>
          <div class="help">Pass ${c.tendencies && c.tendencies.passRate != null ? Math.round(c.tendencies.passRate * 100) + "%" : "—"} · 4th ${c.tendencies && c.tendencies.goRate4th != null ? Math.round(c.tendencies.goRate4th * 100) + "%" : "—"}</div>
          <button class="btn btn-sm btn-primary" data-interview-hire="${c.id}" ${team.id !== state.userTeamId ? "disabled" : ""}>Interview & hire</button>
        </div>`).join("") || "<p class='help'>Pool empty — refreshes next offseason.</p>"}
      </div></div>`;
    return `<div class="hub-dynasty">${AFADynasty.ui.dashboardHTML(fr, coach)}${interview}</div>`;
  }

  function watchLiveGame(forceView) {
    const next = nextGameFor(state.userTeamId || viewTeamId());
    if (!next || !next.game) { toast("No upcoming game on the slate."); return null; }
    const g = next.game;
    if (forceView) {
      ui.replayView = forceView;
      if (window.AFAGameDay && AFAGameDay.setSettings) AFAGameDay.setSettings({ replayView: forceView });
    }
    const view = ui.replayView || "aerial";
    function timelineReady(tl) {
      return !!(tl && ((Array.isArray(tl) && tl.length) || (tl.events && tl.events.length)));
    }
    if (!g.played) simGame(g, { timeline: view !== "off" });
    else if (!timelineReady(g.timeline) && view !== "off") {
      const shadow = { home: g.home, away: g.away, played: false, playoff: !!g.playoff };
      simGame(shadow, { timeline: true, injuries: false });
      g.timeline = shadow.timeline;
      g.pbp = g.pbp || shadow.pbp;
      g.box = g.box || shadow.box;
      if (shadow.hs != null && g.hs == null) { g.hs = shadow.hs; g.as = shadow.as; }
    }
    state.lastWatchedGame = g;
    save();
    return g;
  }

  function renderGameDayHTML(team) {
    if (!window.AFAGameDay) return `<p class="help">GameDay module not loaded.</p>`;
    const settings = AFAGameDay.getSettings ? AFAGameDay.getSettings() : { replayView: ui.replayView || "aerial" };
    ui.replayView = settings.replayView || ui.replayView || "aerial";
    const g = state.lastWatchedGame;
    const views = ["aerial", "sideline", "suite", "off"];
    const toggle = `<div class="lineup-toggle" id="replay-view-toggle">
      ${views.map((v) => `<button class="btn btn-sm ${ui.replayView === v ? "on" : ""}" data-replay="${v}">${v}</button>`).join("")}
      <button class="btn btn-sm btn-primary" id="btn-watch-next">Watch next slate game</button>
      <button class="btn btn-sm" id="btn-watch-all-views">Prep all views</button>
    </div>`;
    let body = `<div class="madden-head"><h2>Game Day</h2>${toggle}</div>
      <p class="help">Use <strong>Watch next slate game</strong> for a live timeline. Toggle aerial / sideline / suite / off.</p>
      <div id="gamedayMount"></div>`;
    if (g && g.timeline && (g.timeline.events || g.timeline).length && ui.replayView !== "off") {
      body += `<div class="panel" style="margin-top:12px"><div class="panel-h"><strong>Last watched · ${displayName(teamById(g.home))} ${g.hs}–${g.as} ${displayName(teamById(g.away))}</strong> · ${ui.replayView}</div>
        <div class="panel-b"><canvas id="gameday-replay" width="960" height="540" style="width:100%;background:#0a1a10;border-radius:8px"></canvas></div></div>`;
    } else if (g) {
      body += `<div class="panel" style="margin-top:12px"><div class="panel-b">
        <strong>${displayName(teamById(g.home))} ${g.hs}–${g.as} ${displayName(teamById(g.away))}</strong>
        <p class="help">${ui.replayView === "off" ? "Replay off — box only." : "No timeline yet — click Watch next slate game."}</p>
        <pre style="white-space:pre-wrap;font-size:11px;opacity:.8">${JSON.stringify(g.box || {}, null, 2).slice(0, 1200)}</pre>
      </div></div>`;
    } else {
      body += `<p class="help">Click <strong>Watch next slate game</strong> to sim your upcoming matchup with a full timeline.</p>`;
    }
    // philosophy / chemistry editors (lightweight)
    const phil = teamPhilosophy(team.id) || { offense: {}, defense: {} };
    body += `<div class="panel" style="margin-top:12px"><div class="panel-h"><strong>Team philosophy · ${displayName(team)}</strong></div>
      <div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
        <label>Run/Pass <input type="range" min="0.35" max="0.75" step="0.01" id="phil-runpass" value="${phil.offense.runPass ?? 0.57}"></label>
        <label>Aggro <input type="range" min="0" max="1" step="0.01" id="phil-agg" value="${phil.offense.aggressiveness ?? 0.5}"></label>
        <label>Risk <input type="range" min="0" max="1" step="0.01" id="phil-risk" value="${phil.offense.risk ?? 0.4}"></label>
        <label>Blitz <input type="range" min="0" max="0.6" step="0.01" id="phil-blitz" value="${phil.defense.blitzRate ?? 0.28}"></label>
        <button class="btn btn-sm btn-primary" id="btn-save-phil">Save philosophy</button>
      </div></div>`;
    return body;
  }

  function renderHubLineupHTML(team) {
    // Reuse Madden depth + O/D lineup builders from the draft room
    const depth = renderDepthHTML(team).replace(/<button[^>]*data-back-board[^>]*>[\s\S]*?<\/button>/, "");
    const lineup = renderLineupHTML(team).replace(/<button[^>]*data-back-board[^>]*>[\s\S]*?<\/button>/, "");
    return `<div class="hub-lineup">
      <p class="help" style="margin-top:0">Set your club the way you would in Madden Franchise — depth chart left, offensive / defensive lineup below. Numbers are real NFL jerseys.</p>
      ${depth}
      <div style="height:16px"></div>
      ${lineup}
    </div>`;
  }

  function renderStandingsHTML() {
    const rec = records();
    const sortFn = (a, b) => {
      const ra = rec[a.id]; const rb = rec[b.id];
      const pa = ra.w + ra.t * 0.5; const pb = rb.w + rb.t * 0.5;
      if (pb !== pa) return pb - pa;
      return (rb.pf - rb.pa) - (ra.pf - ra.pa);
    };
    const you = state.userTeamId;
    const confHTML = ["Eastern", "Western"].map((conf) => {
      const divs = DIVISIONS[conf].map((div) => {
        const rows = TEAMS.filter((t) => t.conference === conf && t.division === div).sort(sortFn);
        return `<table class="div-table">
          <caption>${div}</caption>
          <thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr></thead>
          <tbody>
            ${rows.map((t, i) => {
              const r = rec[t.id];
              return `<tr class="${t.id === you ? "you" : ""}">
                <td style="display:flex;align-items:center;gap:8px">${i + 1}. ${logoImg(t, "sm")} ${t.city} ${t.nick}</td>
                <td class="rec">${r.w}</td><td class="rec">${r.l}</td><td class="rec">${r.t}</td>
                <td class="rec">${r.pf}</td><td class="rec">${r.pa}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`;
      }).join("");
      return `<div class="conf-block"><h2>${conf} Conference</h2>${divs}</div>`;
    }).join("");
    let bracket = "";
    if (state.playoffs && state.playoffs.year === state.seasonYear) {
      const po = state.playoffs;
      const gLine = (g) => {
        if (!g) return "";
        const h = teamById(g.home); const a = teamById(g.away);
        const w = g.winner ? teamById(g.winner) : null;
        return `<div class="match" style="margin:6px 0"><div class="wk">${g.round}${g.seedH ? " · #" + g.seedH + " vs #" + g.seedA : ""}</div>
          <div class="side ${g.winner===g.away?"winner":""}"><div class="nm">${logoImg(a,"sm")} ${a.abbr}</div><div class="sc">${g.as}</div></div>
          <div class="side ${g.winner===g.home?"winner":""}"><div class="nm">${logoImg(h,"sm")} ${h.abbr}</div><div class="sc">${g.hs}</div></div>
          ${w ? `<div class="help">Winner: ${w.city} ${w.nick}</div>` : ""}</div>`;
      };
      bracket = `<div class="panel-b" style="margin-top:16px"><h2>Playoffs · ${po.year}</h2>` +
        ["Eastern","Western"].map((conf) => {
          const c = po.conferences[conf];
          const seeds = (c.seeds||[]).map((s) => "#" + s.seed + " " + teamById(s.id).abbr + (s.divWinner?" (div)":"")).join(" · ");
          return `<div class="conf-block"><h3>${conf}</h3><p class="help">${seeds}</p>
            <div class="help">Wild Card</div>${(c.wildcard||[]).map(gLine).join("")}
            <div class="help">Divisional</div>${(c.divisional||[]).map(gLine).join("")}
            <div class="help">Conference</div>${gLine(c.conference)}</div>`;
        }).join("") +
        `<div class="conf-block"><h3>AFA Championship</h3>${gLine(po.championship)}</div></div>`;
    }
    return `<div class="standings-wrap">${confHTML}${bracket}</div>`;
  }

  function renderSlateHTML() {
    const idx = Math.min(state.week, SEASON_WEEKS) - 1;
    const week = state.schedule[idx] || [];
    const label = state.seasonDone ? ("Week " + SEASON_WEEKS + " (final)") : "Week " + state.week;
    const byes = week.byes || [];
    return `<div class="panel-h"><strong>${label} slate</strong><span class="help">${week.length} games${byes.length ? " · Byes: " + byes.map((id) => teamById(id).abbr).join(", ") : ""}</span></div>
      <div class="slate" style="margin-top:12px">
        ${week.map((g) => {
          const h = teamById(g.home); const a = teamById(g.away);
          const hw = g.played && g.hs > g.as;
          const aw = g.played && g.as > g.hs;
          const mine = state.userTeamId && (g.home === state.userTeamId || g.away === state.userTeamId);
          return `<div class="match">
            <div class="wk">${g.played ? "Final" : "Upcoming"} · ${a.abbr} @ ${h.abbr}${mine ? ' · <button class="btn btn-sm" data-watch-game="' + g.home + '|' + g.away + '">Watch</button>' : ""}</div>
            <div class="side ${aw ? "winner" : ""}"><div class="nm">${logoImg(a, "sm")} ${a.city} ${a.nick}</div><div class="sc">${g.played ? g.as : ""}</div></div>
            <div class="side ${hw ? "winner" : ""}"><div class="nm">${logoImg(h, "sm")} ${h.city} ${h.nick}</div><div class="sc">${g.played ? g.hs : ""}</div></div>
          </div>`;
        }).join("")}
      </div>`;
  }

  function renderRosterHTML(team) {
    const roster = rosterOf(team.id).sort((a, b) => {
      const pa = POSITIONS.indexOf(a.pos); const pb = POSITIONS.indexOf(b.pos);
      if (pa !== pb) return pa - pb;
      return b.ovr - a.ovr;
    });
    const hc = coachById(state.coachAssign[team.id]);
    const groups = Object.keys(POS_GROUPS).map((g) => {
      const blocks = POS_GROUPS[g].map((pos) => {
        const at = roster.filter((p) => p.pos === pos);
        const rows = at.length
          ? at.map((p) => `<div class="depth-row" data-scout="${p.id}" data-player-id="${p.id}"><span data-profile="${p.id}"><span class="jersey">#${jerseyNum(p)}</span> ${p.name}${gradeDeltaBadge(p)}${p.onIR ? " <span class=\"ir-tag\">IR</span>" : ""}</span><span><span class="pos-pill pos-${p.pos}">${p.pos}</span> <span class="${ovrClass(p.ovr)}">${p.ovr}</span>${p.contract ? " <span class=\"cap-chip\">" + formatMoney(p.contract.capHit) + "</span>" : ""}
              <button class="btn btn-sm" data-cut="${p.id}">Cut</button></span></div>`).join("")
          : `<div class="depth-row empty">No ${pos} on roster</div>`;
        return `<div class="pos-block"><div class="lab">${pos}</div>${rows}</div>`;
      }).join("");
      return `<div><h3>${g}</h3>${blocks}</div>`;
    }).join("");
    const avg = roster.length ? Math.round(roster.reduce((s, p) => s + p.ovr, 0) / roster.length) : "—";
    const hit = teamCapHit(team.id);
    const cap = state.salaryCap || AFA_CAP;
    const over = hit > cap;
    return `<p class="help">Head coach: ${hc ? hc.name + " (" + hc.ovr + " OVR, " + hc.style + ")" : "Vacant"} · Roster ${roster.length} · Avg ${avg} OVR · Cap ${formatMoney(hit)} / ${formatMoney(cap)}${over ? " <span class=\"cap-over\">OVER CAP</span>" : ""}</p>
      <div class="depth">${groups}</div>`;
  }

  // Madden Franchise-style trade value (tiers, age, depth, cornerstones)
  function scarcityWeight(pos) {
    const w = { QB: 1.35, OT: 1.18, DE: 1.15, CB: 1.12, WR: 1.08, DT: 1.06, TE: 1.05, LB: 1.04, S: 1.03, OG: 1.02, C: 1.02, RB: 0.92, K: 0.55, P: 0.5 };
    return w[pos] || 1;
  }

  function playerTradeValue(p) {
    if (!p) return 0;
    const M = window.AFASystems && window.AFASystems.market;
    if (M && typeof M.playerMarketValue === "function") {
      try {
        const v = M.playerMarketValue(p, { afaCap: state.salaryCap || AFA_CAP });
        if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.round(v));
        if (v && typeof v.value === "number") return Math.max(0, Math.round(v.value));
        if (v && typeof v.total === "number") return Math.max(0, Math.round(v.total));
      } catch (e) { console.warn("market value", e); }
    }
    const o = Number(p.ovr) || 60;
    let tier;
    if (o >= 97) tier = 180 + (o - 97) * 35;
    else if (o >= 94) tier = 130 + (o - 94) * 16;
    else if (o >= 90) tier = 95 + (o - 90) * 8;
    else if (o >= 85) tier = 62 + (o - 85) * 6;
    else if (o >= 80) tier = 40 + (o - 80) * 4;
    else if (o >= 75) tier = 26 + (o - 75) * 2.5;
    else if (o >= 70) tier = 16 + (o - 70) * 1.8;
    else tier = Math.max(4, o * 0.18);
    const age = Number(p.age) || 27;
    let ageMul = 1;
    if (age <= 23) ageMul = 1.18;
    else if (age <= 26) ageMul = 1.1;
    else if (age <= 29) ageMul = 1.0;
    else if (age <= 32) ageMul = 0.88;
    else if (age <= 34) ageMul = 0.72;
    else ageMul = 0.55;
    return Math.round(tier * scarcityWeight(p.pos) * ageMul);
  }

  function depthAtPos(teamId, pos) {
    return rosterOf(teamId).filter((p) => p.pos === pos).slice().sort((a, b) => b.ovr - a.ovr);
  }

  function isCornerstone(teamId, p) {
    if (!p) return false;
    if (p.ovr >= 95) return true;
    if (p.pos === "QB" && p.ovr >= 88) {
      const qbs = depthAtPos(teamId, "QB");
      return qbs[0] && qbs[0].id === p.id;
    }
    const depth = depthAtPos(teamId, p.pos);
    return !!(depth[0] && depth[0].id === p.id && p.ovr >= 90);
  }

  function positionalNeedBonus(teamId, incoming, outgoingIds) {
    // Value of adding `incoming` after removing outgoing from this club
    const keep = rosterOf(teamId).filter((p) => !outgoingIds.includes(p.id));
    const atPos = keep.filter((p) => p.pos === incoming.pos).sort((a, b) => b.ovr - a.ovr);
    const starter = atPos[0];
    let bonus = 0;
    if (!starter) bonus += Math.round(playerTradeValue(incoming) * 0.35);
    else if (incoming.ovr >= starter.ovr + 3) bonus += Math.round(playerTradeValue(incoming) * 0.22);
    else if (incoming.ovr >= starter.ovr - 1 && atPos.length < 2) bonus += Math.round(playerTradeValue(incoming) * 0.08);
    else if (incoming.ovr + 4 < starter.ovr && atPos.length >= 2) bonus -= Math.round(playerTradeValue(incoming) * 0.12);
    // Cap roster bloat at a position
    if (atPos.length >= 4 && incoming.ovr < (starter ? starter.ovr - 2 : 99)) bonus -= 18;
    return bonus;
  }

  function giveAwayPenalty(teamId, leaving) {
    // CPU hates dumping a starter / cornerstone without a big haul
    let pen = 0;
    if (isCornerstone(teamId, leaving)) pen += Math.round(playerTradeValue(leaving) * 0.45);
    const depth = depthAtPos(teamId, leaving.pos);
    if (depth[0] && depth[0].id === leaving.id) {
      const next = depth[1];
      const drop = next ? leaving.ovr - next.ovr : leaving.ovr - 60;
      if (drop >= 8) pen += Math.round(playerTradeValue(leaving) * 0.2);
      else if (drop >= 4) pen += Math.round(playerTradeValue(leaving) * 0.1);
      if (!next) pen += 25;
    }
    return pen;
  }

  function packageFairness(givePlayers, getPlayers) {
    // Madden-ish: lopsided star-for-nobody packages get crushed
    const giveMax = Math.max(0, ...givePlayers.map((p) => p.ovr));
    const getMax = Math.max(0, ...getPlayers.map((p) => p.ovr));
    if (giveMax >= 90 && getMax < giveMax - 8 && getPlayers.length < 2) return -Math.round((giveMax - getMax) * 4);
    if (getMax >= 90 && giveMax < getMax - 8 && givePlayers.length < 2) return Math.round((getMax - giveMax) * 4);
    return 0;
  }

  function evaluateTradeForClub(clubId, receiveIds, sendIds, receivePickIds, sendPickIds) {
    const receive = receiveIds.map(playerById).filter(Boolean);
    const send = sendIds.map(playerById).filter(Boolean);
    const receivePicks = (receivePickIds || []).map(pickById).filter(Boolean);
    const sendPicks = (sendPickIds || []).map(pickById).filter(Boolean);
    let gain = 0;
    let loss = 0;
    const notes = [];
    // Cap: CPU refuses deals that push them over the salary cap
    let proj = teamCapHit(clubId);
    (sendIds || []).forEach((id) => { const p = playerById(id); if (p && p.contract) proj -= Number(p.contract.capHit) || 0; });
    (receiveIds || []).forEach((id) => { const p = playerById(id); if (p && p.contract) proj += Number(p.contract.capHit) || 0; });
    if (proj > (state.salaryCap || AFA_CAP)) {
      return { status: "reject", label: "OVER CAP", detail: "Club would be over the salary cap at " + formatMoney(proj) + ".", gain: 0, loss: 9999, meter: 5 };
    }

    receive.forEach((p) => {
      const base = playerTradeValue(p);
      const need = positionalNeedBonus(clubId, p, sendIds);
      gain += base + need;
      if (need >= 20) notes.push("fills a need at " + p.pos);
    });
    send.forEach((p) => {
      const base = playerTradeValue(p);
      const pen = giveAwayPenalty(clubId, p);
      loss += base + pen;
      if (isCornerstone(clubId, p)) notes.push("protects cornerstone " + p.name);
    });
    receivePicks.forEach((pk) => { gain += pickTradeValue(pk); });
    sendPicks.forEach((pk) => {
      const v = pickTradeValue(pk);
      // CPU guards its own upcoming 1st a bit more (Madden AI)
      loss += v + (pk.round === 1 && pk.year === (state.draftYear || 2027) ? Math.round(v * 0.08) : 0);
    });
    if (receivePicks.some((pk) => pk.round === 1)) notes.push("adds a 1st-round pick");
    const fair = packageFairness(send, receive);
    // A pick haul counts as the "return" for a star — soften the star-for-nobody penalty when picks come back
    // Star-for-nobody fairness only applies to player-only deals; picks are the return otherwise
    if (!receivePicks.length && !sendPicks.length) gain += fair;
    const hasReceive = receive.length + receivePicks.length > 0;
    const hasSend = send.length + sendPicks.length > 0;

    const net = gain - loss;
    // CPU wants a slight surplus (Madden AI greed ~8–15%)
    const greed = Math.max(8, Math.round(loss * 0.1));
    let status = "reject";
    let label = "Rejected";
    let detail = "";
    if (!hasReceive && !hasSend) {
      status = "empty";
      label = "Build an offer";
      detail = "Add players or picks on both sides like Madden Franchise.";
    } else if (!hasReceive || !hasSend) {
      status = "reject";
      label = "Rejected";
      detail = "One-sided deals never clear the clubhouse.";
    } else if (send.some((p) => isCornerstone(clubId, p)) && net < greed + 40) {
      status = "reject";
      label = "Rejected — cornerstone";
      const star = send.find((p) => isCornerstone(clubId, p));
      detail = displayName(teamById(clubId)) + " will not move " + star.name + " without a clear overpay.";
    } else if (net >= greed + 12) {
      status = "accept";
      label = "Accepted";
      detail = "Fair value plus a bit of surplus — this is how Madden CPU clubs green-light a deal.";
    } else if (net >= greed - 6) {
      status = "close";
      label = "Close";
      detail = "Almost there. Add a little more value (or drop a ask) and they’ll take it.";
    } else if (net >= -Math.max(20, loss * 0.15)) {
      status = "reject";
      label = "Rejected — lowball";
      detail = "Not enough coming back for what they’re sending.";
    } else {
      status = "reject";
      label = "Rejected — insulting";
      detail = "Way off. Rebuild the package.";
    }

    const meter = Math.max(0, Math.min(100, Math.round(50 + (net / Math.max(40, loss || 40)) * 50)));
    return {
      clubId,
      gain: Math.round(gain),
      loss: Math.round(loss),
      net: Math.round(net),
      greed,
      status,
      label,
      detail,
      meter,
      notes
    };
  }

  function analyzeTrade(leftId, rightId, offerIds, askIds, offerPickIds, askPickIds) {
    // offer = left -> right, ask = right -> left (players + picks)
    // CPU acceptance = every non-user club must accept
    const op = offerPickIds || [];
    const ap = askPickIds || [];
    const leftEval = evaluateTradeForClub(leftId, askIds, offerIds, ap, op);
    const rightEval = evaluateTradeForClub(rightId, offerIds, askIds, op, ap);
    const userId = state.mode === "single" ? state.userTeamId : null;
    const cpuEvals = [];
    if (!userId || leftId !== userId) cpuEvals.push(leftEval);
    if (!userId || rightId !== userId) cpuEvals.push(rightEval);
    // all-32 commissioner: both must find it fair enough
    if (!userId) {
      cpuEvals.length = 0;
      cpuEvals.push(leftEval, rightEval);
    }
    const blockers = cpuEvals.filter((e) => e.status !== "accept");
    const accepted = cpuEvals.length > 0 && blockers.length === 0;
    const primary = (cpuEvals.find((e) => e.status === "reject")
      || cpuEvals.find((e) => e.status === "close")
      || cpuEvals[0]
      || rightEval);
    return { leftEval, rightEval, accepted, primary, cpuEvals };
  }

  function playerValue(p, receiverId) {
    // kept for any legacy call sites
    return playerTradeValue(p) + Math.max(0, positionalNeedBonus(receiverId, p, []));
  }

  function renderTradesHTML() {
    const left = teamById(ui.tradeLeft || viewTeamId());
    const right = teamById(ui.tradeRight || TEAMS.find((t) => t.id !== left.id).id);
    ui.tradeLeft = left.id;
    ui.tradeRight = right.id;
    const opts = (sel) => TEAMS.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${displayName(t)}</option>`).join("");
    ui.offerPicks = (ui.offerPicks || []).filter((id) => { const pk = pickById(id); return pk && pk.ownerTeamId === left.id; });
    ui.askPicks = (ui.askPicks || []).filter((id) => { const pk = pickById(id); return pk && pk.ownerTeamId === right.id; });
    const side = (team, bucket, key) => {
      const selected = bucket.map(playerById).filter(Boolean);
      const pbucket = key === "offer" ? ui.offerPicks : ui.askPicks;
      const selPicks = pbucket.map(pickById).filter(Boolean);
      const owned = picksOwnedBy(team.id);
      return `<div class="panel trade-side">
        <div class="panel-h"><strong>${displayName(team)}</strong><span class="help">Tap to add · value shown</span></div>
        <div class="panel-b">
          <div id="${key}-sel">
            ${selected.map((p) => `<div class="sel-pill"><span class="jersey">#${jerseyNum(p)}</span> ${p.name} · ${p.pos} ${p.ovr} · TV ${playerTradeValue(p)}<button class="btn btn-sm" data-un${key}="${p.id}">×</button></div>`).join("")}
            ${selPicks.map((pk) => `<div class="sel-pill pick-pill">${pickLabel(pk)} · TV ${pickTradeValue(pk)}<button class="btn btn-sm" data-un${key}pick="${pk.id}">×</button></div>`).join("")}
            ${selected.length || selPicks.length ? "" : "<p class='help'>No players or picks on this side yet.</p>"}
          </div>
          <table class="player-table"><thead><tr><th>OVR</th><th>Player</th><th>Pos</th><th>TV</th></tr></thead><tbody>
            ${rosterOf(team.id).map((p) => {
              const on = bucket.includes(p.id) ? " on-offer" : "";
              return `<tr class="${on}" data-${key}="${p.id}" data-scout="${p.id}" data-player-id="${p.id}"><td class="${ovrClass(p.ovr)}">${p.ovr}</td><td data-profile="${p.id}"><span class="jersey">#${jerseyNum(p)}</span> ${p.name}${isCornerstone(team.id, p) ? ' <span class="corner-tag">★</span>' : ""}</td><td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td><td class="tv">${playerTradeValue(p)}</td></tr>`;
            }).join("")}
          </tbody></table>
          <div class="pick-section">
            <div class="eyebrow" style="margin:12px 0 6px">Future picks (${owned.length})</div>
            <table class="player-table pick-table"><thead><tr><th>Year</th><th>Pick</th><th>TV</th></tr></thead><tbody>
              ${owned.map((pk) => `<tr class="pick-row${pbucket.includes(pk.id) ? " on-offer" : ""}" data-${key}pick="${pk.id}"><td>${pk.year}</td><td>${pickLabel(pk, true)}</td><td class="tv">${pickTradeValue(pk)}</td></tr>`).join("") || "<tr><td colspan='3' class='help'>No picks owned.</td></tr>"}
            </tbody></table>
          </div>
        </div>
      </div>`;
    };
    const analysis = analyzeTrade(left.id, right.id, ui.offer, ui.ask, ui.offerPicks, ui.askPicks);
    const primary = analysis.primary;
    const statusClass = analysis.accepted ? "yes" : (primary.status === "close" ? "close" : (primary.status === "empty" ? "idle" : "no"));
    const meter = primary.meter || 0;
    const ready = analysis.accepted && (ui.offer.length + ui.offerPicks.length) > 0 && (ui.ask.length + ui.askPicks.length) > 0;
    const leftUser = state.mode === "single" && left.id === state.userTeamId;
    const rightUser = state.mode === "single" && right.id === state.userTeamId;
    const cpuName = (!rightUser ? displayName(right) : displayName(left));
    return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <label>Your side <select id="trade-left">${opts(left.id)}</select></label>
        <label>Trade partner <select id="trade-right">${opts(right.id)}</select></label>
        <span class="help">Madden rules: CPU only accepts fair value. Cornerstones (★) need a clear overpay.</span>
      </div>
      <div class="trade-grid">${side(left, ui.offer, "offer")}${side(right, ui.ask, "ask")}</div>
      <div class="verdict ${statusClass}">
        <div class="trade-analyzer">
          <div class="ta-top">
            <strong>Trade Analyzer</strong>
            <span class="ta-status">${analysis.accepted ? "ACCEPTED" : primary.label}</span>
          </div>
          <div class="ta-meter" aria-label="Interest meter">
            <div class="ta-fill" style="width:${meter}%"></div>
            <div class="ta-mark" style="left:58%" title="Accept threshold"></div>
          </div>
          <div class="ta-vals">
            <span>${displayName(left)} gets TV ${analysis.leftEval.gain} / sends ${analysis.leftEval.loss}</span>
            <span>${displayName(right)} gets TV ${analysis.rightEval.gain} / sends ${analysis.rightEval.loss}</span>
          </div>
          <p class="ta-detail">${primary.detail}${analysis.accepted ? " " + cpuName + " will take this deal." : ""}</p>
        </div>
        <div class="btn-row" style="justify-content:flex-start;margin-top:10px">
          <button class="btn btn-primary" id="btn-execute-trade" ${ready ? "" : "disabled"}>${ready ? "Confirm trade" : "Offer not accepted"}</button>
          <button class="btn" id="btn-clear-trade">Clear</button>
        </div>
      </div>`;
  }

  function renderSigningsHTML(team) {
    const fa = (state.fa || []).map(playerById).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
    const canSign = state.mode !== "single" || team.id === state.userTeamId;
    return `<div class="sign-grid">
      <div class="panel">
        <div class="panel-h"><strong>Free agents</strong><span>${fa.length} available</span></div>
        <div class="panel-b">
          <p class="help">${canSign ? "Sign a player to " + displayName(team) + "." : "Single-franchise mode: switch to your club to sign."}</p>
          <table class="player-table"><thead><tr><th>OVR</th><th>Player</th><th>Pos</th><th></th></tr></thead>
          <tbody>
            ${fa.map((p) => `<tr data-scout="${p.id}" data-player-id="${p.id}">
              <td class="${ovrClass(p.ovr)}">${p.ovr}</td>
              <td data-profile="${p.id}"><span class="jersey">#${jerseyNum(p)}</span> ${p.name}</td>
              <td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td>
              <td><button class="btn btn-sm btn-primary" data-sign="${p.id}" ${canSign ? "" : "disabled"}>Sign</button></td>
            </tr>`).join("") || "<tr><td colspan='4' class='help'>No free agents left. Cut a player to populate the market.</td></tr>"}
          </tbody></table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-h"><strong>${displayName(team)} roster</strong></div>
        <div class="panel-b">
          ${rosterOf(team.id).map((p) => `<div class="depth-row" data-scout="${p.id}" data-player-id="${p.id}"><span data-profile="${p.id}">${p.name} · ${p.pos}</span><span class="${ovrClass(p.ovr)}">${p.ovr}</span></div>`).join("") || "<p class='help'>Empty roster.</p>"}
        </div>
      </div>
    </div>`;
  }

  function renderSimHTML() {
    return `<div class="panel" style="max-width:640px">
      <div class="panel-h"><strong>Simulation desk</strong></div>
      <div class="panel-b">
        <p class="help">Scores use roster averages, a star-player bump, and the head coach's overall — plus weekly variance. This is a v0.1 stub, not a full engine.</p>
        <p>Current: ${state.seasonDone ? "Regular season complete" : "Week " + state.week + " of " + SEASON_WEEKS}</p>
        <div class="btn-row" style="justify-content:flex-start;margin-top:16px">
          <button class="btn btn-primary" id="btn-sim-week" ${state.seasonDone ? "disabled" : ""}>Sim this week</button>
          <button class="btn" id="btn-sim-rest" ${state.seasonDone ? "disabled" : ""}>Sim rest of season</button>
        </div>
        ${collegeCtaHTML()}
      </div>
    </div>`;
  }

  function bindHubEvents() {
    $("hub-team-select").onchange = () => {
      ui.viewTeamId = $("hub-team-select").value;
      if (ui.hubTab === "trades") ui.tradeLeft = ui.viewTeamId;
      renderHub();
    };
    const hubPlayers = $("btn-hub-players");
    const hubScout = $("btn-hub-scouting");
    if (hubPlayers) hubPlayers.onclick = openDirectory;
    if (hubScout) hubScout.onclick = openScouting;
    document.querySelectorAll("[data-home-tab]").forEach((b) => {
      b.onclick = () => {
        ui.hubTab = b.getAttribute("data-home-tab");
        renderHub();
      };
    });
    const lineupToggle = $("lineup-side-toggle");
    if (lineupToggle) {
      lineupToggle.querySelectorAll("[data-side]").forEach((b) => {
        b.onclick = () => { ui.lineupSide = b.getAttribute("data-side"); renderHub(); };
      });
    }
    const formToggle = $("lineup-form-toggle");
    if (formToggle) {
      formToggle.querySelectorAll("[data-form]").forEach((b) => {
        b.onclick = () => { ui.formation = b.getAttribute("data-form"); renderHub(); };
      });
      formToggle.querySelectorAll("[data-defform]").forEach((b) => {
        b.onclick = () => { ui.defFormation = b.getAttribute("data-defform"); renderHub(); };
      });
      formToggle.querySelectorAll("[data-stform]").forEach((b) => {
        b.onclick = () => { ui.stFormation = b.getAttribute("data-stform"); renderHub(); };
      });
    }
    if (ui.hubTab === "stadium") mountStadiumUI(teamById(viewTeamId()));
    const rvt = $("replay-view-toggle");
    if (rvt) {
      rvt.querySelectorAll("[data-replay]").forEach((b) => {
        b.onclick = () => {
          ui.replayView = b.getAttribute("data-replay");
          if (window.AFAGameDay && AFAGameDay.setSettings) AFAGameDay.setSettings({ replayView: ui.replayView });
          if (ui.replayView !== "off") {
            const g = state.lastWatchedGame;
            if (g && !(g.timeline && (g.timeline.events || g.timeline).length)) watchLiveGame(ui.replayView);
          }
          renderHub();
        };
      });
    }
    const wn = $("btn-watch-next");
    if (wn) wn.onclick = () => { watchLiveGame(); ui.hubTab = "gameday"; renderHub(); };
    const wa = $("btn-watch-all-views");
    if (wa) wa.onclick = () => {
      const g = watchLiveGame("aerial");
      if (g && g.timeline) toast("Timeline ready for aerial / sideline / suite.");
      ui.hubTab = "gameday"; renderHub();
    };
    document.querySelectorAll("[data-watch-game]").forEach((b) => {
      b.onclick = () => {
        const [home, away] = b.getAttribute("data-watch-game").split("|");
        const week = state.schedule[Math.min(state.week, SEASON_WEEKS) - 1] || [];
        const g = week.find((x) => x.home === home && x.away === away);
        if (!g) return;
        if (!g.played) simGame(g, { timeline: ui.replayView !== "off" });
        else if (!g.timeline) {
          const shadow = { home, away, played: false };
          simGame(shadow, { timeline: true, injuries: false });
          g.timeline = shadow.timeline;
        }
        state.lastWatchedGame = g;
        ui.hubTab = "gameday";
        renderHub();
      };
    });
    document.querySelectorAll("[data-interview-hire]").forEach((b) => {
      b.onclick = () => {
        const id = b.getAttribute("data-interview-hire");
        const cand = (state.coachPool || []).find((c) => c.id === id);
        if (!cand || !state.userTeamId) return;
        const prev = dynCoach(state.userTeamId);
        syncCoachToDynasty(state.userTeamId, cand);
        state.coachPool = (state.coachPool || []).filter((c) => c.id !== id);
        if (prev && window.AFAStadiums && state.stadiums[state.userTeamId]) {
          try { AFAStadiums.fanEvent(state.stadiums[state.userTeamId], "coachFired"); } catch (e) {}
        }
        toast("Hired " + cand.name + " after interview.");
        save(); renderHub();
      };
    });
    const sp = $("btn-save-phil");
    if (sp) sp.onclick = () => {
      const tid = viewTeamId();
      const phil = teamPhilosophy(tid);
      phil.offense.runPass = Number($("phil-runpass").value);
      phil.offense.aggressiveness = Number($("phil-agg").value);
      phil.offense.risk = Number($("phil-risk").value);
      phil.defense.blitzRate = Number($("phil-blitz").value);
      save(); toast("Philosophy saved.");
    };
    // Mount gameday UI + replay if present
    if (ui.hubTab === "gameday" && window.AFAGameDay) {
      const mount = $("gamedayMount");
      if (mount && AFAGameDay.ui && AFAGameDay.ui.mount) {
        try {
          AFAGameDay.ui.mount(mount, {
            seed: state.week, homeRoster: activeRosterForSim(viewTeamId()),
            awayRoster: activeRosterForSim(TEAMS.find((t) => t.id !== viewTeamId()).id),
            stadiumId: viewTeamId()
          });
        } catch (e) { console.warn("gameday ui", e); }
      }
      const canvas = $("gameday-replay");
      const g = state.lastWatchedGame;
      if (canvas && g && g.timeline && ui.replayView !== "off" && AFAGameDay.replay) {
        try {
          const player = AFAGameDay.replay.createReplay(canvas, g.timeline, { view: ui.replayView });
          player.start();
          window._gdReplay = player;
        } catch (e) { console.warn("replay", e); }
      }
    }
    document.querySelectorAll("[data-cut]").forEach((b) => {
      b.onclick = () => cutPlayer(viewTeamId(), b.getAttribute("data-cut"));
    });
    document.querySelectorAll("[data-sign]").forEach((b) => {
      b.onclick = () => signPlayer(viewTeamId(), b.getAttribute("data-sign"));
    });
    const tl = $("trade-left"); const tr = $("trade-right");
    if (tl) tl.onchange = () => { ui.tradeLeft = tl.value; ui.offer = []; ui.offerPicks = []; renderHub(); };
    if (tr) tr.onchange = () => { ui.tradeRight = tr.value; ui.ask = []; ui.askPicks = []; renderHub(); };
    document.querySelectorAll("[data-offerpick]").forEach((row) => {
      row.onclick = () => toggleId(ui.offerPicks, row.getAttribute("data-offerpick")) && renderHub();
    });
    document.querySelectorAll("[data-askpick]").forEach((row) => {
      row.onclick = () => toggleId(ui.askPicks, row.getAttribute("data-askpick")) && renderHub();
    });
    document.querySelectorAll("[data-unofferpick]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); ui.offerPicks = ui.offerPicks.filter((id) => id !== b.getAttribute("data-unofferpick")); renderHub(); };
    });
    document.querySelectorAll("[data-unaskpick]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); ui.askPicks = ui.askPicks.filter((id) => id !== b.getAttribute("data-unaskpick")); renderHub(); };
    });
    bindCollegeEvents();
    document.querySelectorAll("[data-offer]").forEach((row) => {
      row.onclick = () => toggleId(ui.offer, row.getAttribute("data-offer")) && renderHub();
    });
    document.querySelectorAll("[data-ask]").forEach((row) => {
      row.onclick = () => toggleId(ui.ask, row.getAttribute("data-ask")) && renderHub();
    });
    document.querySelectorAll("[data-unoffer]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); ui.offer = ui.offer.filter((id) => id !== b.getAttribute("data-unoffer")); renderHub(); };
    });
    document.querySelectorAll("[data-unask]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); ui.ask = ui.ask.filter((id) => id !== b.getAttribute("data-unask")); renderHub(); };
    });
    const ex = $("btn-execute-trade");
    if (ex) ex.onclick = executeTrade;
    const cl = $("btn-clear-trade");
    if (cl) cl.onclick = () => { ui.offer = []; ui.ask = []; ui.offerPicks = []; ui.askPicks = []; renderHub(); };
    const sw = $("btn-sim-week");
    if (sw) sw.onclick = simWeek;
    const sr = $("btn-sim-rest");
    if (sr) sr.onclick = () => {
      sr.disabled = true;
      sr.textContent = "Simming…";
      simRestOfSeason({ chunk: 2, onProgress: (w, done) => {
        sr.textContent = done ? "Sim rest of season" : ("Week " + w + "…");
      }}).then(() => { sr.disabled = false; sr.textContent = "Sim rest of season"; });
    };
  }

  /* ---------- FUTURE DRAFT PICKS (Madden-style) ---------- */
  const PICK_YEARS_AHEAD = 3;
  const COLLEGE_ROUNDS = 7;
  function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
  function makePickObj(year, round, teamId) {
    return { id: "pick_" + year + "_r" + round + "_" + teamId, year, round, originalTeamId: teamId, ownerTeamId: teamId };
  }
  function buildPicksForYear(year) {
    const out = [];
    for (let r = 1; r <= COLLEGE_ROUNDS; r++) TEAMS.forEach((t) => out.push(makePickObj(year, r, t.id)));
    return out;
  }
  function ensurePicks() {
    if (!state) return;
    if (typeof state.seasonYear !== "number") state.seasonYear = 2027;
    if (typeof state.draftYear !== "number") state.draftYear = state.seasonYear;
    if (!Array.isArray(state.collegeDrafted)) state.collegeDrafted = [];
    if (!Array.isArray(state.ownedPicks) || !state.ownedPicks.length) {
      state.ownedPicks = [];
      for (let y = state.draftYear; y < state.draftYear + PICK_YEARS_AHEAD; y++) state.ownedPicks = state.ownedPicks.concat(buildPicksForYear(y));
    }
    registerCollegeProspects();
  }
  function pickById(id) { return (state.ownedPicks || []).find((pk) => pk.id === id) || null; }
  function picksOwnedBy(teamId) {
    return (state.ownedPicks || []).filter((pk) => pk.ownerTeamId === teamId)
      .sort((a, b) => a.year - b.year || a.round - b.round || String(a.originalTeamId).localeCompare(String(b.originalTeamId)));
  }
  function pickLabel(pk, short) {
    const base = (short ? "" : pk.year + " ") + ordinal(pk.round);
    const orig = teamById(pk.originalTeamId);
    if (pk.originalTeamId !== pk.ownerTeamId) return base + " via " + (orig ? orig.abbr : pk.originalTeamId);
    return base + " (" + (orig ? orig.abbr : pk.originalTeamId) + ")";
  }
  const PICK_CHART = { 1: [120, 100, 85], 2: [55, 45, 38], 3: [28, 22, 18], 4: [14, 11, 9], 5: [8, 6, 5], 6: [5, 4, 3], 7: [3, 2, 2] };
  function standingsOrder() {
    // worst -> best (NFL draft order)
    const rec = records();
    const pct = (r) => { const g = r.w + r.l + r.t; return g ? (r.w + r.t * 0.5) / g : 0.5; };
    return TEAMS.slice().sort((a, b) => {
      const ra = rec[a.id], rb = rec[b.id];
      return pct(ra) - pct(rb) || ra.pf - rb.pf || a.abbr.localeCompare(b.abbr);
    }).map((t) => t.id);
  }
  function pickTradeValue(pk) {
    if (!pk) return 0;
    const M = window.AFASystems && window.AFASystems.market;
    if (M && typeof M.pickMarketValue === "function") {
      try {
        const v = M.pickMarketValue(pk, { draftYear: state.draftYear || 2027, standingsOrder: standingsOrder() });
        if (typeof v === "number" && isFinite(v)) return Math.max(1, Math.round(v));
        if (v && typeof v.value === "number") return Math.max(1, Math.round(v.value));
      } catch (e) {}
    }
    const out = Math.max(0, Math.min(2, pk.year - (state.draftYear || 2027)));
    let v = (PICK_CHART[pk.round] || [2, 2, 2])[out];
    const played = (state.schedule || []).some((w) => (w || []).some((g) => g.played));
    if (played && out <= 1) {
      const idx = standingsOrder().indexOf(pk.originalTeamId);
      if (idx >= 0) v *= 1 + ((31 - idx) / 31) * (out === 0 ? 0.2 : 0.1) - (out === 0 ? 0.08 : 0.04);
    }
    return Math.max(1, Math.round(v));
  }

  /* ---------- COLLEGE DRAFT ---------- */
  let collegeRegistered = false;
  function collegePool() { return (window.AFA_COLLEGE_PROSPECTS || []); }
  function registerCollegeProspects() {
    if (collegeRegistered) return;
    collegeRegistered = true;
    if (window.AFA && typeof window.AFA.registerPlayers === "function") window.AFA.registerPlayers(collegePool());
  }
  function collegeYear() { return state.draftYear || state.seasonYear || 2027; }
  function rehydrateGeneratedClasses() {
    const gc = state && state.generatedClasses;
    if (!gc || !window.AFA || typeof AFA.registerPlayers !== "function") return;
    Object.keys(gc).forEach((y) => { if (Array.isArray(gc[y])) AFA.registerPlayers(gc[y]); });
  }
  function ensureGeneratedClass(year) {
    if (!state.generatedClasses) state.generatedClasses = {};
    if (!Array.isArray(state.generatedClasses[year]) || !state.generatedClasses[year].length) {
      const avoid = [];
      (PLAYERS || []).forEach((p) => avoid.push(p));
      collegePool().forEach((p) => avoid.push(p));
      Object.keys(state.generatedClasses).forEach((y) => (state.generatedClasses[y] || []).forEach((p) => avoid.push(p)));
      state.generatedClasses[year] = window.AFADraft ? AFADraft.generateProspectClass(year, avoid) : [];
    }
    if (window.AFA && typeof AFA.registerPlayers === "function") AFA.registerPlayers(state.generatedClasses[year]);
    return state.generatedClasses[year];
  }
  function identityBlocked() {
    const list = [];
    const pushId = (id) => { const p = playerById(id); if (p) list.push(p); };
    TEAMS.forEach((t) => (state.rosters[t.id] || []).forEach(pushId));
    (state.fa || []).forEach(pushId);
    (state.picks || []).forEach((pk) => { if (pk) pushId(pk.playerId); });
    (state.collegeDrafted || []).forEach(pushId);
    (PLAYERS || []).forEach((p) => { if (p && p.retired) list.push(p); });
    if (state.collegeDraft && state.collegeDraft.picks) state.collegeDraft.picks.forEach((pk) => pushId(pk.playerId));
    return list;
  }
  function prospectsClashingWithPros() {
    if (proClashIds) return proClashIds;
    proClashIds = new Set();
    if (!window.AFADraft) return proClashIds;
    const byNpc = new Map();
    const bySleeper = new Map();
    (PLAYERS || []).forEach((p) => {
      if (!p) return;
      if (p.sleeperId) bySleeper.set(String(p.sleeperId), p);
      const key = AFADraft.foldName(p.name) + "|" + p.pos + "|" + AFADraft.schoolKey(p.college);
      if (!byNpc.has(key)) byNpc.set(key, []);
      byNpc.get(key).push(p);
    });
    collegePool().forEach((p) => {
      if (!p || AFADraft.isDuplicateListing(p.id)) return;
      if (p.sleeperId && bySleeper.has(String(p.sleeperId))) { proClashIds.add(p.id); return; }
      const key = AFADraft.foldName(p.name) + "|" + p.pos + "|" + AFADraft.schoolKey(p.college);
      const hits = byNpc.get(key) || [];
      if (hits.some((h) => AFADraft.peopleClash(p, h))) proClashIds.add(p.id);
    });
    return proClashIds;
  }
  function prospectsForYear(year) {
    if (!window.AFADraft) {
      const used = new Set(state.collegeDrafted || []);
      return collegePool().filter((p) => (p.year || p.draftClass) === year && !used.has(p.id));
    }
    const policy = AFADraft.classPolicy(year, collegePool());
    let source = [];
    if (policy === "real") {
      source = collegePool().filter((p) => Number(p.year || p.draftClass) === Number(year) && !p.generated && !p.fictional && p.real !== false && !AFADraft.isDuplicateListing(p.id));
    } else if (policy === "generated") {
      source = (state.generatedClasses && state.generatedClasses[year]) || [];
    } else return [];
    const blocked = identityBlocked();
    const pros = prospectsClashingWithPros();
    return source.filter((p) => p && !pros.has(p.id) && !AFADraft.clashesWithAny(p, blocked));
  }
  function collegeCtaHTML() {
    if (!state.seasonDone && !state.collegeDraft) return "";
    const year = state.collegeDraft ? state.collegeDraft.year : collegeYear();
    const policy = window.AFADraft ? AFADraft.classPolicy(year, collegePool()) : "real";
    const available = prospectsForYear(year);
    const has = !!state.collegeDraft || policy === "generated" || available.length > 0;
    const realYears = window.AFADraft ? AFADraft.realClassYears(collegePool()) : [];
    const lastReal = realYears.length ? realYears[realYears.length - 1] : null;
    let help = "7 rounds · reverse standings. Traded picks follow their owners.";
    if (!state.collegeDraft && policy === "real") help = "7 rounds · reverse standings · real " + year + " prospects (" + available.length + " still available). Traded picks follow their owners.";
    else if (!state.collegeDraft && policy === "generated") help = "No real " + year + " class is on file. Entering uses labeled fictional prospects only — no biography and no stats.";
    else if (!state.collegeDraft) help = "No compiled class for " + year + (lastReal ? " (last real class on file: " + lastReal + ")" : "") + ". Nothing is invented for this season.";
    return `<div class="panel college-cta" style="margin:12px 0">
      <div class="panel-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:220px"><div class="eyebrow">Offseason</div>
          <strong>${year} AFA College Draft</strong>
          <div class="help">${help}</div></div>
        ${has ? `<button class="btn btn-primary" id="btn-enter-college">${state.collegeDraft ? "Resume" : "Enter"} AFA College Draft</button>` : `<button class="btn btn-primary" id="btn-skip-college">Skip to next season</button>`}
      </div></div>`;
  }
  function startCollegeDraft() {
    ensurePicks();
    const year = collegeYear();
    const policy = window.AFADraft ? AFADraft.classPolicy(year, collegePool()) : "real";
    if (policy === "unavailable") {
      const years = AFADraft.realClassYears(collegePool());
      const last = years.length ? years[years.length - 1] : "none";
      toast("No compiled " + year + " prospect class. Last real class on file: " + last + ". No players were invented.");
      ui.hubTab = "home";
      renderHub();
      return;
    }
    if (policy === "generated") ensureGeneratedClass(year);
    const pool = prospectsForYear(year);
    if (!pool.length) {
      toast(policy === "real" ? ("Real " + year + " prospects are already in the league — none left to draft.") : "No prospects available.");
      ui.hubTab = "home";
      renderHub();
      return;
    }
    if (!state.collegeDraft) {
      const slotOrder = standingsOrder();
      const order = [];
      for (let r = 1; r <= COLLEGE_ROUNDS; r++) {
        slotOrder.forEach((orig, k) => {
          const pk = pickById("pick_" + year + "_r" + r + "_" + orig);
          order.push({ overall: order.length + 1, round: r, pick: k + 1, originalTeamId: orig, ownerTeamId: pk ? pk.ownerTeamId : orig, pickId: pk ? pk.id : null });
        });
      }
      state.collegeDraft = { year, order, idx: 0, board: pool.map((p) => p.id), picks: [], pos: "ALL" };
      save();
    }
    ui.hubTab = "college";
    renderHub();
  }
  function collegeUserControls(teamId) {
    if (state.mode === "single" && state.userTeamId) return teamId === state.userTeamId;
    return true; // all-32 commissioner: you pick for whoever is on the clock
  }
  function collegeScore(p, teamId) {
    if (!window.AFADraft) return p ? p.ovr : 0;
    const cd = state.collegeDraft;
    const round = cd && cd.order && cd.order[cd.idx] ? cd.order[cd.idx].round : 1;
    return AFADraft.scoreProspect(p, rosterOf(teamId), round, schemeContext(teamId));
  }
  function collegeMakePick(playerId) {
    const cd = state.collegeDraft;
    if (!cd || !window.AFADraft || cd.idx >= cd.order.length) return false;
    const slot = cd.order[cd.idx];
    const already = (cd.picks || []).some((pk) => pk && pk.playerId === playerId);
    const res = AFADraft.commitCollegePick({
      year: cd.year, order: cd.order, idx: cd.idx, board: cd.board, picks: cd.picks, rosters: state.rosters
    }, {
      playerId: playerId,
      expectedTeamId: slot.ownerTeamId,
      lookup: playerById,
      ownedPlayers: identityBlocked()
    });
    if (res.reason === "owned" && res.draft) cd.board = res.draft.board;
    if (!res.ok) return false;
    if (res.reason !== "idempotent") {
      cd.board = res.draft.board;
      cd.picks = res.draft.picks;
      cd.idx = res.draft.idx;
      state.rosters = res.draft.rosters;
      if (state.collegeDrafted.indexOf(playerId) < 0) state.collegeDrafted.push(playerId);
      const pl = playerById(playerId);
      if (pl) {
        attachRookieContract(pl, slot.overall, cd.year);
        if (pl.ovrBase == null) pl.ovrBase = pl.ovr;
        try {
          if (window.AFABridge && window.AFABridge.hooks) window.AFABridge.hooks.run("onCollegePick", { player: pl, slot: slot, year: cd.year });
        } catch (e) {}
      }
    } else if (!already) return true;
    return true;
  }
  function collegeAiPick() {
    const cd = state.collegeDraft;
    if (!cd || cd.idx >= cd.order.length) return false;
    const slot = cd.order[cd.idx];
    const board = cd.board.map(playerById).filter(Boolean);
    const best = window.AFADraft ? AFADraft.recommendProspect({
      board: board, roster: rosterOf(slot.ownerTeamId), teamId: slot.ownerTeamId, round: slot.round, scheme: schemeContext(slot.ownerTeamId)
    }) : null;
    return best ? collegeMakePick(best.id) : false;
  }
  function collegeSim(untilUser) {
    const cd = state.collegeDraft;
    if (!cd) return;
    let guard = 0;
    while (cd.idx < cd.order.length && guard++ < 400) {
      if (!cd.board.length) { cd.exhausted = cd.idx < cd.order.length; break; }
      if (untilUser && state.mode === "single" && cd.order[cd.idx].ownerTeamId === state.userTeamId) break;
      if (untilUser && state.mode !== "single" && guard > 1) break;
      if (!collegeAiPick()) break;
    }
    if (cd.idx >= cd.order.length || !cd.board.length) { finishCollegeDraft(); return; }
    save();
    renderHub();
  }
  function collegeUserPick(pid) {
    const cd = state.collegeDraft;
    if (!cd) return;
    const slot = cd.order[cd.idx];
    if (!collegeUserControls(slot.ownerTeamId)) { toast("CPU is on the clock — Sim to your pick."); return; }
    if (!collegeMakePick(pid)) { toast("Can't draft that prospect."); return; }
    toast(displayName(teamById(slot.ownerTeamId)) + " select " + playerById(pid).name);
    if (cd.idx >= cd.order.length || !cd.board.length) { finishCollegeDraft(); return; }
    if (state.mode === "single") { collegeSim(true); return; }
    save();
    renderHub();
  }
  function finishCollegeDraft(skipped) {
    ensurePicks();
    const year = state.collegeDraft ? state.collegeDraft.year : collegeYear();
    const policy = window.AFADraft ? AFADraft.classPolicy(year, collegePool()) : "real";
    const made = state.collegeDraft && state.collegeDraft.picks ? state.collegeDraft.picks.length : 0;
    const slots = state.collegeDraft && state.collegeDraft.order ? state.collegeDraft.order.length : 0;
    const unfilled = Math.max(0, slots - made);
    // Undrafted college players hit free agency. Real classes are not backfilled.
    if (state.collegeDraft) {
      (state.collegeDraft.board || []).forEach((id) => {
        if (state.fa.indexOf(id) < 0) state.fa.push(id);
        if (state.collegeDrafted.indexOf(id) < 0) state.collegeDrafted.push(id);
      });
    }
    state.ownedPicks = (state.ownedPicks || []).filter((pk) => pk.year !== year);
    const maxYear = state.ownedPicks.reduce((m, pk) => Math.max(m, pk.year), year);
    for (let y = maxYear + 1; y <= year + PICK_YEARS_AHEAD; y++) state.ownedPicks = state.ownedPicks.concat(buildPicksForYear(y));
    state.lastCollegeDraft = state.collegeDraft ? { year: year, picks: state.collegeDraft.picks, unfilled: unfilled, policy: policy } : null;
    state.collegeDraft = null;
    // Back to 53. Cut surplus bodies before the last starter at a position.
    TEAMS.forEach((tm) => {
      const players = (state.rosters[tm.id] || []).map(playerById).filter(Boolean);
      if (players.length <= 53 || !window.AFADraft) return;
      const trimmed = AFADraft.trimRoster(players, 53);
      const keep = {};
      trimmed.keep.forEach((p) => { keep[p.id] = true; });
      state.rosters[tm.id] = (state.rosters[tm.id] || []).filter((id) => keep[id]);
      trimmed.cut.forEach((p) => { if (state.fa.indexOf(p.id) < 0) state.fa.push(p.id); });
    });
    // Unfilled college slots stay empty. Clubs under 53 may sign real free agents
    // already in the pool. This does not create prospects.
    try { refillRostersFromFA(); } catch (e) { console.warn("fa refill", e); }
    state.seasonYear = (state.seasonYear || year) + 1;
    state.draftYear = state.seasonYear;
    state.seasonDone = false;
    state.week = 1;
    state.seasonStarted = true;
    // Keep last season scoring for trend charts on league home
    state.lastSeasonGames = [];
    (state.schedule || []).forEach((week, wi) => {
      (week || []).forEach((g) => {
        if (g.played) state.lastSeasonGames.push({ week: wi + 1, home: g.home, away: g.away, hs: g.hs, as: g.as, played: true });
      });
    });
    state.schedule = generateSchedule();
    ui.offerPicks = [];
    ui.askPicks = [];
    ui.hubTab = "home";
    save();
    let msg = skipped ? (year + " College Draft skipped") : (year + " College Draft complete");
    if (!skipped && unfilled > 0 && policy === "real") msg += ". Real class exhausted — " + unfilled + " picks unfilled. No fictional players were added";
    if (!skipped && policy === "generated") msg += " (fictional class, labeled)";
    toast(msg + " · " + state.seasonYear + " season underway");
    renderHub();
  }
  function renderCollegeDraftHTML() {
    const cd = state.collegeDraft;
    if (!cd) return collegeCtaHTML() || `<p class="help">No college draft in progress.</p>`;
    const slot = cd.order[cd.idx];
    if (!slot) return `<p class="help">Draft complete.</p>`;
    const team = teamById(slot.ownerTeamId);
    const orig = teamById(slot.originalTeamId);
    const mine = collegeUserControls(slot.ownerTeamId);
    const pos = cd.pos || "ALL";
    let pool = cd.board.map(playerById).filter(Boolean);
    if (pos !== "ALL") pool = pool.filter((p) => p.pos === pos);
    pool.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
    const myNext = state.mode === "single" ? cd.order.slice(cd.idx).filter((s) => s.ownerTeamId === state.userTeamId).slice(0, 7) : [];
    const feed = cd.picks.slice().reverse().slice(0, 16).map((pk) => {
      const t = teamById(pk.teamId), pl = playerById(pk.playerId);
      return `<div class="pick-item" data-scout="${pk.playerId}"><div class="n">${pk.overall}</div>${logoImg(t, "sm")}<div><strong>${pl ? pl.name : "?"}${pl && pl.fictional ? " (Fictional)" : ""}</strong><div class="city">${t.abbr}${pk.originalTeamId !== pk.teamId ? " (via " + teamById(pk.originalTeamId).abbr + ")" : ""} · ${pl ? pl.pos + " · " + (pl.fictional ? "Fictional" : (pl.college || "—")) : ""}</div></div></div>`;
    }).join("") || `<p class="help">Picks will land here.</p>`;
    return `<div class="college-draft">
      <div class="panel"><div class="panel-b" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        ${logoImg(team, "lg")}
        <div style="flex:1;min-width:220px">
          <div class="eyebrow">${cd.year} AFA College Draft · ${mine ? "Your pick" : "CPU on the clock"}</div>
          <h2 style="margin:2px 0">${displayName(team)}</h2>
          <div class="help">Round ${slot.round} · Pick ${slot.pick} · Overall ${slot.overall} of ${cd.order.length}${slot.originalTeamId !== slot.ownerTeamId ? " · via " + orig.abbr : ""}</div>
          ${myNext.length ? `<div class="help">Your picks: ${myNext.map((s) => "#" + s.overall).join(", ")}</div>` : ""}
        </div>
        <div class="btn-row" style="margin:0;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btn-college-next">${state.mode === "single" ? "Sim to your pick" : "Auto-pick this slot"}</button>
          <button class="btn btn-sim-draft btn-sm" id="btn-college-sim">Sim Draft</button>
        </div>
      </div></div>
      <div class="trade-grid">
        <div class="panel"><div class="panel-h"><strong>Prospect board</strong><span class="help">${cd.board.length} available · click to draft</span></div>
          <div class="panel-b">
            <div class="chips">${["ALL"].concat(POSITIONS).map((p) => `<button class="chip ${pos === p ? "on" : ""}" data-cpos="${p}">${p}</button>`).join("")}</div>
            <table class="player-table"><thead><tr><th>OVR</th><th>Prospect</th><th>Pos</th><th>College</th></tr></thead><tbody>
              ${pool.slice(0, 120).map((p) => `<tr data-cpick="${p.id}" data-scout="${p.id}" data-player-id="${p.id}" class="${mine ? "" : "dim"}"><td class="${ovrClass(p.ovr)}">${p.ovr}</td><td>${p.name}${p.fictional ? " <span class='help'>(Fictional)</span>" : ""} <button type="button" class="btn btn-sm" data-profile="${p.id}" title="Full profile" onclick="event.stopPropagation()">▣</button></td><td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td><td>${p.fictional ? "Fictional" : (p.college || "—")}</td></tr>`).join("") || "<tr><td colspan='4' class='help'>No prospects match.</td></tr>"}
            </tbody></table>
          </div></div>
        <div class="panel"><div class="panel-h"><strong>Pick feed</strong></div><div class="panel-b">${feed}</div></div>
      </div>
    </div>`;
  }
  function bindCollegeEvents() {
    const en = $("btn-enter-college"); if (en) en.onclick = startCollegeDraft;
    const sk = $("btn-skip-college"); if (sk) sk.onclick = () => finishCollegeDraft(true);
    const nx = $("btn-college-next"); if (nx) nx.onclick = () => collegeSim(true);
    const sm = $("btn-college-sim"); if (sm) sm.onclick = () => collegeSim(false);
    document.querySelectorAll("[data-cpos]").forEach((b) => { b.onclick = () => { state.collegeDraft.pos = b.getAttribute("data-cpos"); renderHub(); }; });
    document.querySelectorAll("[data-cpick]").forEach((r) => { r.onclick = () => collegeUserPick(r.getAttribute("data-cpick")); });
  }

  function toggleId(arr, id) {
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    return true;
  }

  function executeTrade() {
    const left = ui.tradeLeft;
    const right = ui.tradeRight;
    if (left === right) { toast("Pick two different clubs."); return; }
    if (state.mode === "single" && left !== state.userTeamId && right !== state.userTeamId) {
      toast("In single-franchise mode you must be involved.");
      return;
    }
    ui.offerPicks = ui.offerPicks || [];
    ui.askPicks = ui.askPicks || [];
    if (!(ui.offer.length + ui.offerPicks.length) || !(ui.ask.length + ui.askPicks.length)) {
      toast("Both sides need at least one player or pick.");
      return;
    }
    // Ownership / double-trade guards
    const leftRoster = new Set(state.rosters[left] || []);
    const rightRoster = new Set(state.rosters[right] || []);
    if (ui.offer.some((id) => !leftRoster.has(id)) || ui.ask.some((id) => !rightRoster.has(id))) {
      toast("A player in this offer is no longer on that roster.");
      return;
    }
    const dup = ui.offer.filter((id) => ui.ask.includes(id));
    if (dup.length) { toast("Same player listed on both sides."); return; }
    // Cap overflow projection
    function projectedCap(teamId, addIds, remIds) {
      let hit = teamCapHit(teamId);
      (remIds || []).forEach((id) => { const p = playerById(id); if (p && p.contract) hit -= Number(p.contract.capHit) || 0; });
      (addIds || []).forEach((id) => { const p = playerById(id); if (p && p.contract) hit += Number(p.contract.capHit) || 0; });
      return hit;
    }
    const leftCap = projectedCap(left, ui.ask, ui.offer);
    const rightCap = projectedCap(right, ui.offer, ui.ask);
    const cap = state.salaryCap || AFA_CAP;
    if (leftCap > cap || rightCap > cap) {
      toast("Trade rejected — would put a club over the salary cap (" +
        (leftCap > cap ? displayName(teamById(left)) + " " + formatMoney(leftCap) : "") +
        (rightCap > cap ? (leftCap > cap ? " · " : "") + displayName(teamById(right)) + " " + formatMoney(rightCap) : "") +
        " / " + formatMoney(cap) + ").");
      return;
    }
    const analysis = analyzeTrade(left, right, ui.offer, ui.ask, ui.offerPicks, ui.askPicks);
    if (!analysis.accepted) {
      toast(analysis.primary.label + " — " + (analysis.primary.detail || "CPU rejected the offer."));
      renderHub();
      return;
    }
    ui.offer.forEach((id) => movePlayer(left, right, id));
    ui.ask.forEach((id) => movePlayer(right, left, id));
    const movedPicks = [];
    ui.offerPicks.forEach((id) => { const pk = pickById(id); if (pk && pk.ownerTeamId === left) { pk.ownerTeamId = right; movedPicks.push(pk); } });
    ui.askPicks.forEach((id) => { const pk = pickById(id); if (pk && pk.ownerTeamId === right) { pk.ownerTeamId = left; movedPicks.push(pk); } });
    const nPlayers = ui.offer.length + ui.ask.length;
    ui.offer = [];
    ui.ask = [];
    ui.offerPicks = [];
    ui.askPicks = [];
    save();
    toast("Trade processed · " + nPlayers + " player" + (nPlayers === 1 ? "" : "s") + (movedPicks.length ? " + " + movedPicks.length + " pick" + (movedPicks.length === 1 ? "" : "s") + " (" + movedPicks.map((pk) => pickLabel(pk)).join(", ") + ")" : "") + ".");
    renderHub();
  }

  function movePlayer(from, to, pid) {
    state.rosters[from] = (state.rosters[from] || []).filter((id) => id !== pid);
    if (!state.rosters[to].includes(pid)) state.rosters[to].push(pid);
  }

  function cutPlayer(teamId, pid) {
    if (state.mode === "single" && teamId !== state.userTeamId) {
      toast("You can only cut players on your club.");
      return;
    }
    const cut = playerById(pid);
    state.rosters[teamId] = (state.rosters[teamId] || []).filter((id) => id !== pid);
    if (!state.fa.includes(pid)) state.fa.push(pid);
    try {
      if (cut && window.AFAStadiums && state.stadiums && state.stadiums[teamId] && cut.ovr >= 88) {
        AFAStadiums.fanEvent(state.stadiums[teamId], "starCut", { ovr: cut.ovr });
      }
    } catch (e) {}
    save();
    toast((cut && cut.name) || "Player" + " released.");
    renderHub();
  }

  function signPlayer(teamId, pid) {
    if (state.mode === "single" && teamId !== state.userTeamId) {
      toast("Switch to your franchise to sign.");
      return;
    }
    if (!state.fa.includes(pid)) return;
    if ((state.rosters[teamId] || []).length >= 53) {
      toast("Roster is full (53). Cut a player before signing.");
      return;
    }
    const pl = playerById(pid);
    if (pl && !pl.contract) {
      const vet = window.AFABridge && window.AFABridge.veteranContractFor;
      pl.contract = vet ? vet(pl) : { apy: 1500000, capHit: 1500000, yearsRemaining: 2, kind: "veteran-fa" };
    }
    const hit = teamCapHit(teamId) + ((pl && pl.contract && pl.contract.capHit) || 0);
    if (hit > (state.salaryCap || AFA_CAP)) {
      toast("Signing blocked — over the salary cap (" + formatMoney(hit) + " / " + formatMoney(state.salaryCap || AFA_CAP) + ").");
      return;
    }
    if (isOwned(pid)) { state.fa = state.fa.filter((id) => id !== pid); toast("That player is already on a roster."); save(); renderHub(); return; }
    state.fa = state.fa.filter((id) => id !== pid);
    state.rosters[teamId].push(pid);
    try {
      if (window.AFAStadiums && state.stadiums && state.stadiums[teamId] && pl && pl.ovr >= 88) {
        AFAStadiums.fanEvent(state.stadiums[teamId], "starSigned", { ovr: pl.ovr });
      }
    } catch (e) {}
    save();
    toast(playerById(pid).name + " signed with " + displayName(teamById(teamId)));
    renderHub();
  }

  /* ---------- RESET ---------- */
  function resetLeague() {
    if (!window.confirm("Erase this AFA save and return to the menu?")) return;
    state = freshState();
    save();
    ui.selectedTeam = null;
    ui.selectedCoach = null;
    ui.viewTeamId = null;
    ui.offer = [];
    ui.ask = [];
    ui.offerPicks = [];
    ui.askPicks = [];
    renderMenu();
  }

  /* ---------- INIT ---------- */
  function bindSaveFabHover() {
    const fab = $("btn-save-anywhere");
    if (!fab) return;
    const dimOn = () => document.body.classList.add("save-cta-hover");
    const dimOff = () => document.body.classList.remove("save-cta-hover");
    const watch = (el) => {
      if (!el || el.dataset.saveDimBound) return;
      el.dataset.saveDimBound = "1";
      el.addEventListener("mouseenter", dimOn);
      el.addEventListener("mouseleave", dimOff);
      el.addEventListener("focusin", dimOn);
      el.addEventListener("focusout", dimOff);
    };
    // Primary CTAs that live near screen edges — Keep Save ghosted while you aim at these
    [
      "btn-sim-coaches",
      "btn-lock-coaches",
      "btn-enter-draft",
      "btn-sim-draft",
      "btn-sim-manual",
      "btn-sim-week",
      "btn-sim-rest",
      "btn-sim-now",
      "btn-play-story",
      "btn-continue",
      "btn-mode-all32",
      "btn-mode-single"
    ].forEach((id) => watch($(id)));
    document.querySelectorAll(".coach-footer, .btn-sim, .mode-tile button, .draft-intro-card .btn").forEach(watch);
    // Re-bind after re-renders that inject new CTAs
    const mo = new MutationObserver(() => {
      [
        "btn-sim-draft",
      "btn-sim-manual",
        "btn-sim-week",
        "btn-sim-rest",
        "btn-enter-draft"
      ].forEach((id) => watch($(id)));
      document.querySelectorAll(".btn-sim, .coach-footer .btn, #hub-pane .btn-primary, .draft-intro-card .btn").forEach(watch);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function bindChrome() {
    $("btn-play-story").onclick = confirmNewStory;
    if ($("btn-open-players")) $("btn-open-players").onclick = openDirectory;
    if ($("btn-open-scouting")) $("btn-open-scouting").onclick = openScouting;
    if ($("btn-directory-back")) $("btn-directory-back").onclick = renderMenu;
    if ($("btn-scouting-back")) $("btn-scouting-back").onclick = renderMenu;
    $("btn-continue").onclick = () => resumePhase();
    $("btn-reset-menu").onclick = resetLeague;
    const bindSave = (id) => { const el = $(id); if (el) el.onclick = manualSave; };
    bindSave("btn-save-anywhere");
    bindSave("btn-save-menu");
    bindSave("btn-save-coaches");
    bindSave("btn-save-draft");
    bindSave("btn-save-hub");
    if ($("btn-draft-room")) $("btn-draft-room").onclick = goDraftRoom;
    if ($("btn-hub-draft-room")) $("btn-hub-draft-room").onclick = goDraftRoom;
    bindSaveFabHover();
    $("btn-mode-all32").onclick = chooseAll32;
    $("btn-mode-single").onclick = openFranchisePicker;
    $("btn-mode-back").onclick = renderMenu;
    $("btn-story-continue").onclick = continueFromStory;
    $("btn-assist-coach").onclick = assistCoach;
    $("btn-clear-coach").onclick = unassignSelected;
    $("btn-lock-coaches").onclick = lockCoaches;
    // Delegated scout card for hub / dynamic lists (hover + tap)
    if (!document.body._scoutDelegate) {
      document.body._scoutDelegate = true;
      document.body.addEventListener("mouseover", (e) => {
        if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
        const el = e.target.closest("[data-pid], [data-scout]");
        if (!el || el._scoutBound) return;
        const pid = el.getAttribute("data-pid") || el.getAttribute("data-scout");
        const p = playerById(pid);
        if (!p) return;
        el.classList.add("scout-hot");
        showScoutCard(p, e);
        const move = (ev) => moveScoutCard(ev);
        const leave = () => {
          el.classList.remove("scout-hot");
          hideScoutCard();
          el.removeEventListener("mousemove", move);
          el.removeEventListener("mouseleave", leave);
        };
        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", leave);
      });
      document.body.addEventListener("click", (e) => {
        const touchy = (window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches) || ("ontouchstart" in window);
        if (!touchy) return;
        const el = e.target.closest("[data-pid], [data-scout]");
        if (!el) return;
        const pid = el.getAttribute("data-pid") || el.getAttribute("data-scout");
        const p = playerById(pid);
        if (!p) return;
        const card = $("scout-card");
        showScoutCard(p, e);
        if (card) card.classList.add("pinned");
      }, true);
    }

    if ($("btn-sim-coaches")) $("btn-sim-coaches").onclick = coachFooterAction;
    if ($("btn-enter-draft")) $("btn-enter-draft").onclick = enterDraftRoom;
    $("search-players").oninput = (e) => { ui.query = e.target.value; renderDraft(); };
    document.querySelectorAll("#hub-nav [data-tab]").forEach((b) => {
      b.onclick = () => { ui.hubTab = b.getAttribute("data-tab"); renderHub(); };
    });
    $("btn-hub-reset").onclick = resetLeague;
    $("btn-sim-now").onclick = () => { ui.hubTab = "sim"; renderHub(); };
  }

  function init() {
    registerCollegeProspects();
    if (!load()) {
      state = freshState();
      try { seedGradesAndContracts(true); } catch (e) { console.warn("seed fresh", e); }
    }
    try { ensureStadiums(); ensureDynasty(); } catch (e) { console.warn("module init", e); }
    bindChrome();
    try {
      if (window.AFAPlayersTab && AFAPlayersTab.enableGlobalHooks) {
        AFAPlayersTab.enableGlobalHooks({ useScoutAttr: false }); // data-profile only; hover scout untouched
      }
    } catch (e) { console.warn("careers hooks", e); }
    syncHubDraftTab();
    updateDraftRoomFab();
    const params = new URLSearchParams(location.search);
    if (params.get("screen") === "players") { openDirectory(); return; }
    if (params.get("screen") === "scouting") { openScouting(); return; }
    startBoot();
  }

  window.AFAWorkspaceHooks = {
    setLiveEffects: function (on) {
      state.liveDataEffects = !!on;
      save();
    },
    confirmRealStatus: function (on) {
      if (!window.AFARealStatus) return { applied: false, reason: "module missing" };
      if (!on) {
        state.realWorldStatus = AFARealStatus.blank();
        save();
        return { applied: false, enabled: false };
      }
      const result = AFARealStatus.confirmExisting(state, (window.AFA && AFA.PLAYERS) || [], window.AFA_NFL_AVAIL || null, [], true);
      if (result.applied) save();
      return result;
    },
    openRealNews: function () {
      openScouting();
      if (window.AFAScouting && AFAScouting.showTab) AFAScouting.showTab("news");
    }
  };

  window.FB = {
    resetLeague, confirmNewStory, resumePhase,
    buildLineup, validateAllLineups: function () {
      const FORMATIONS = (window.AFABridge && window.AFABridge.FORMATIONS) || {};
      const DEF = (window.AFABridge && window.AFABridge.DEFENSE_FORMATIONS) || {};
      const ST = (window.AFABridge && window.AFABridge.SPECIAL_FORMATIONS) || {};
      const out = [];
      const savedForm = ui.formation, savedDef = ui.defFormation, savedSt = ui.stFormation;
      TEAMS.forEach((t) => {
        Object.keys(FORMATIONS).forEach((fid) => {
          ui.formation = fid;
          const lu = buildLineup(t.id, fid);
          (lu.geometryIssues || []).forEach((iss) => out.push({ team: t.id, unit: "offense", formation: fid, issue: iss }));
        });
        Object.keys(DEF).forEach((fid) => {
          ui.defFormation = fid;
          const lu = buildLineup(t.id, ui.formation || "11");
          (lu.defenseIssues || []).forEach((iss) => out.push({ team: t.id, unit: "defense", formation: fid, issue: iss }));
        });
        Object.keys(ST).forEach((fid) => {
          ui.stFormation = fid;
          const lu = buildLineup(t.id, ui.formation || "11");
          (lu.specialIssues || []).forEach((iss) => out.push({ team: t.id, unit: "special", formation: fid, issue: iss }));
        });
      });
      ui.formation = savedForm; ui.defFormation = savedDef; ui.stFormation = savedSt;
      return out;
    },
    seedGradesAndContracts, simRestOfSeason, endSeasonRecalibrate, simGame, legacySimGame,
    ensureStadiums, ensureDynasty, dynastyEndSeason, stadiumOffseason, runPlayoffs, playoffResult, ensureCoachPool, clearLeagueInjuries, hireReplacementCoach, refillRostersFromFA, rebuildFreeAgency, syncCoachToDynasty, watchLiveGame, picksOwnedBy, ensurePicks, generateSchedule, validateSchedule, SEASON_WEEKS, GAMES_PER_TEAM,
    teamCapHit, playerTradeValue, getState: () => state, getUi: () => ui, showScoutCard, hideScoutCard, bindScoutHover,
    foldStatLines, teamPower, AFA_CAP, hashStr, TEAMS: () => TEAMS, rosterOf, playerById
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
