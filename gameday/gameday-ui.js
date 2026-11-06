/**
 * AFAGameDay.ui — mountable demo/hub controls for philosophy, chemistry, calls, replay.
 */
(function (root) {
  "use strict";
  const GD = root.AFAGameDay;
  const Replay = (GD && GD.replay) || root.AFAGameDayReplay;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function mount(rootEl, opts) {
    opts = opts || {};
    if (!GD) throw new Error("AFAGameDay missing");
    rootEl.classList.add("afa-gd");
    rootEl.innerHTML = "";
    const shell = el("div", "afa-gd-shell");
    rootEl.appendChild(shell);

    const settings = GD.getSettings();
    const state = {
      homePhil: Object.assign(GD.defaultPhilosophy(), opts.homePhilosophy || {}),
      awayPhil: Object.assign(GD.defaultPhilosophy(), opts.awayPhilosophy || {}),
      homeChem: Object.assign(GD.defaultChemistry(), opts.homeChemistry || {}),
      awayChem: Object.assign(GD.defaultChemistry(), opts.awayChemistry || {}),
      homePlan: Object.assign(GD.defaultGamePlan(), opts.homePlan || {}),
      result: null,
      player: null,
      view: settings.replayView || "aerial",
      seed: opts.seed || 42
    };

    // Top bar + view toggle
    const top = el("div", "afa-gd-top");
    top.appendChild(el("div", "afa-gd-title", "AFA Game Day"));
    const toggle = el("div", "afa-gd-toggle");
    ["aerial", "sideline", "suite", "off"].forEach((v) => {
      const b = el("button", state.view === v ? "active" : "", labelView(v));
      b.dataset.view = v;
      b.onclick = () => setView(v);
      toggle.appendChild(b);
    });
    top.appendChild(toggle);
    shell.appendChild(top);

    // Stage
    const stage = el("div", "afa-gd-stage" + (state.view === "off" ? " off-mode" : ""));
    const canvas = el("canvas");
    canvas.setAttribute("aria-label", "Game replay");
    const scorebug = el("div", "afa-gd-scorebug", "");
    const label = el("div", "afa-gd-label", "");
    const meters = el("div", "afa-gd-meters");
    meters.innerHTML = '<div class="meter">Win prob<div class="bar wp"><i id="gdWp"></i></div></div>'
      + '<div class="meter">Momentum<div class="bar"><i id="gdMom"></i></div></div>';
    const drive = el("div", "afa-gd-drive");
    const summary = el("div", "afa-gd-summary");
    stage.appendChild(canvas);
    stage.appendChild(scorebug);
    stage.appendChild(label);
    stage.appendChild(meters);
    stage.appendChild(drive);
    stage.appendChild(summary);
    shell.appendChild(stage);

    // Controls
    const controls = el("div", "afa-gd-controls");
    const btnPlay = el("button", "", "Play");
    const btnPause = el("button", "", "Pause");
    const btnSkip = el("button", "", "Highlights");
    const speed = el("input"); speed.type = "range"; speed.min = "0.5"; speed.max = "8"; speed.step = "0.5"; speed.value = "1";
    const scrub = el("input"); scrub.type = "range"; scrub.min = "0"; scrub.max = "1000"; scrub.value = "0"; scrub.style.flex = "1";
    const btnSim = el("button", "", "Sim game");
    const seedInput = el("input"); seedInput.type = "number"; seedInput.value = state.seed; seedInput.style.width = "72px";
    controls.appendChild(btnSim);
    controls.appendChild(seedInput);
    controls.appendChild(btnPlay);
    controls.appendChild(btnPause);
    controls.appendChild(btnSkip);
    controls.appendChild(el("span", "", "Speed"));
    controls.appendChild(speed);
    controls.appendChild(scrub);
    shell.appendChild(controls);

    // Grid: philosophy / chemistry / box
    const grid = el("div", "afa-gd-grid");
    const left = el("div", "afa-gd-panel");
    left.innerHTML = "<h3>Home philosophy & chemistry</h3>";
    const sliders = el("div", "afa-gd-sliders");
    left.appendChild(sliders);
    buildPhilSliders(sliders, state.homePhil, () => {});
    const chemBox = el("div", "afa-gd-chem");
    left.appendChild(el("h3", "", "Chemistry"));
    left.appendChild(chemBox);
    renderChem(chemBox, state.homeChem);
    const attr = el("div", "afa-gd-attr");
    left.appendChild(el("h3", "", "Post-game attribution"));
    left.appendChild(attr);

    const right = el("div", "afa-gd-panel");
    right.innerHTML = "<h3>Box score</h3>";
    const boxMount = el("div");
    right.appendChild(boxMount);
    right.appendChild(el("h3", "", "Key plays"));
    const keyMount = el("div", "afa-gd-keyplays");
    right.appendChild(keyMount);
    grid.appendChild(left);
    grid.appendChild(right);
    shell.appendChild(grid);

    function labelView(v) {
      return ({ aerial: "Aerial", sideline: "Sideline", suite: "Suite", off: "Off" })[v] || v;
    }
    function setView(v) {
      state.view = v;
      toggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
      stage.classList.toggle("off-mode", v === "off");
      GD.setSettings({ replayView: v });
      if (state.player) state.player.setView(v);
      if (v === "off" && state.result) fillSummary(summary, state.result);
      meters.style.display = v === "off" ? "none" : "";
      drive.style.display = v === "off" ? "none" : "";
      label.classList.remove("show");
    }

    function runSim() {
      state.seed = Number(seedInput.value) || 42;
      if (state.player) { state.player.stop(); state.player.destroy(); state.player = null; }
      const homeRoster = opts.homeRoster || GD.makeDemoRoster(state.seed, 78);
      const awayRoster = opts.awayRoster || GD.makeDemoRoster(state.seed + 7, 74);
      let coachH = null, coachA = null;
      if (root.AFACoaches) {
        coachH = root.AFACoaches.createCoach({ id: "h", name: "Home Coach", ovr: 86, style: "West Coast" }, { seed: state.seed });
        coachA = root.AFACoaches.createCoach({ id: "a", name: "Away Coach", ovr: 82, style: "Wide-9 pressure" }, { seed: state.seed + 1 });
      }
      let stadiumState = null;
      if (root.AFAStadiums && root.AFAStadiums.defaultStadium) {
        stadiumState = root.AFAStadiums.defaultStadium(opts.stadiumId || "oma");
      }
      const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      state.result = GD.simulateGame(
        { id: "home", name: opts.homeName || "Des Moines Growers", abbr: "DMG", primary: "#2f6b3c", secondary: "#f0e6d0",
          roster: homeRoster, philosophy: state.homePhil, chemistry: state.homeChem, gamePlan: state.homePlan, coach: coachH },
        { id: "away", name: opts.awayName || "Omaha Plainsmen", abbr: "OMA", primary: "#8b1e1e", secondary: "#f5f0e6",
          roster: awayRoster, philosophy: state.awayPhil, chemistry: state.awayChem, coach: coachA },
        { seed: state.seed, week: opts.week || 5, stadiumState, rival: true, stakes: 0.6, homeWinPct: 0.55, injuries: true }
      );
      const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      renderResult(ms);
    }

    function renderResult(ms) {
      const r = state.result;
      attr.innerHTML = "<b>" + r.home.abbr + " " + r.score.home + "</b> – <b>" + r.away.abbr + " " + r.score.away + "</b>"
        + " · sim " + ms.toFixed(1) + " ms · " + r.totals.homePlays + "/" + r.totals.awayPlays + " plays<br>"
        + (r.attribution.blurb || "")
        + "<br>chem home " + signed(r.attribution.home.chemistry) + " · phil " + signed(r.attribution.home.philosophy)
        + " · HFA " + signed(r.attribution.home.stadium);
      boxMount.innerHTML = boxHtml(r);
      keyMount.innerHTML = (r.keyPlays || []).slice(0, 14).map((p) =>
        "<div><strong>" + esc(p.label) + "</strong> · Q" + p.quarter + " · " + p.offCall + " vs " + p.defCall + "</div>"
      ).join("") || "<div>No key plays</div>";
      fillSummary(summary, r);
      paintDrive(drive, r);
      updateScorebug(scorebug, {
        home: r.home, away: r.away, homeScore: r.score.home, awayScore: r.score.away,
        down: 1, distance: 10, quarter: 4, clock: 0, yardline: 50
      }, true);

      if (state.view !== "off" && Replay) {
        state.player = Replay.createReplay(canvas, r.timeline, { view: state.view, paused: true });
        state.player.on("time", (e) => {
          const hud = Replay.hudState(r.timeline, e.t);
          if (hud) {
            updateScorebug(scorebug, hud);
            document.getElementById("gdWp").style.width = (hud.wp * 100).toFixed(1) + "%";
            document.getElementById("gdMom").style.width = (hud.momentum).toFixed(1) + "%";
            if (hud.key && hud.label) { label.textContent = hud.label; label.classList.add("show"); }
            else label.classList.remove("show");
          }
          scrub.value = String(Math.round((e.t / r.timeline.duration) * 1000));
        });
        state.player.seek(0);
      } else {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    btnSim.onclick = runSim;
    btnPlay.onclick = () => { if (state.view === "off") return; if (state.player) state.player.resume(); };
    btnPause.onclick = () => { if (state.player) state.player.pause(); };
    btnSkip.onclick = () => { if (state.player) state.player.skipHighlights(); };
    speed.oninput = () => { if (state.player) state.player.setSpeed(Number(speed.value)); };
    scrub.oninput = () => {
      if (!state.player || !state.result) return;
      state.player.seek((Number(scrub.value) / 1000) * state.result.timeline.duration);
    };

    // auto first sim
    runSim();
    if (state.player) state.player.start();

    return {
      resim: runSim,
      getResult: () => state.result,
      setView,
      getPlayer: () => state.player
    };
  }

  function buildPhilSliders(mount, phil, onChange) {
    const defs = [
      ["offense.runPass", "Run ← → Pass", phil.offense.runPass],
      ["offense.aggressiveness", "Offense aggressiveness", phil.offense.aggressiveness],
      ["offense.tempo", "Tempo", phil.offense.tempo],
      ["offense.risk", "Risk", phil.offense.risk],
      ["defense.blitzRate", "Blitz rate", phil.defense.blitzRate],
      ["defense.coverageShell", "Zone ← → Man", phil.defense.coverageShell],
      ["defense.aggressiveness", "Defense aggressiveness", phil.defense.aggressiveness]
    ];
    defs.forEach(([path, name, val]) => {
      const lab = el("label");
      const span = el("span", "", name);
      const valEl = el("span", "", Number(val).toFixed(2));
      const inp = el("input"); inp.type = "range"; inp.min = "0"; inp.max = "1"; inp.step = "0.01"; inp.value = val;
      inp.oninput = () => {
        const v = Number(inp.value); valEl.textContent = v.toFixed(2);
        const [side, key] = path.split(".");
        phil[side][key] = v; onChange(phil);
      };
      lab.appendChild(span); lab.appendChild(valEl); lab.appendChild(inp);
      mount.appendChild(lab);
    });
  }
  function renderChem(mount, chem) {
    mount.innerHTML = "";
    Object.keys(chem).forEach((k) => {
      mount.appendChild(el("span", "", k + " " + Math.round(chem[k])));
    });
  }
  function signed(n) { n = Number(n) || 0; return (n >= 0 ? "+" : "") + n.toFixed(1); }
  function esc(s) { return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  function updateScorebug(node, hud, final) {
    if (!hud) return;
    node.innerHTML = '<div class="team"><i class="swatch" style="background:' + hud.home.primary + '"></i>'
      + hud.home.abbr + " <b>" + hud.homeScore + "</b></div>"
      + '<div class="team"><i class="swatch" style="background:' + hud.away.primary + '"></i>'
      + hud.away.abbr + " <b>" + hud.awayScore + "</b></div>"
      + '<div class="meta">' + (final ? "FINAL" : ("Q" + hud.quarter + " " + GD.clockFmt(hud.clock || 0)
        + " · " + hud.down + "&" + hud.distance)) + "</div>";
  }

  function paintDrive(driveEl, result) {
    driveEl.innerHTML = "";
    const plays = result.plays.filter((p) => p.kind === "run" || p.kind === "pass");
    const n = Math.max(1, plays.length);
    plays.forEach((p, i) => {
      const s = el("div", "seg");
      s.style.left = ((i / n) * 100) + "%";
      s.style.width = (100 / n) + "%";
      s.style.background = p.side === "home" ? result.home.primary : result.away.primary;
      s.style.opacity = p.touchdown || p.interception ? "1" : "0.55";
      driveEl.appendChild(s);
    });
  }

  function boxHtml(r) {
    const rows = (side) => (r.boxScore[side].players || []).filter((p) =>
      p.attempts || p.carries || p.receptions || p.def_sacks || p.fg_att
    ).slice(0, 12).map((p) => {
      let stat = "";
      if (p.attempts) stat = p.completions + "/" + p.attempts + ", " + p.passing_yards + " yd, " + p.passing_tds + " TD";
      else if (p.carries) stat = p.carries + " car, " + p.rushing_yards + " yd";
      else if (p.receptions) stat = p.receptions + " rec, " + p.receiving_yards + " yd";
      else if (p.def_sacks) stat = p.def_sacks + " sack";
      else if (p.fg_att) stat = p.fg_made + "/" + p.fg_att + " FG";
      return "<tr data-player-id=\"" + (p.playerId||"") + "\"><td data-profile=\"" + (p.playerId||"") + "\">" + esc(p.name) + " <small>" + p.pos + "</small></td><td>" + esc(stat) + "</td></tr>";
    }).join("");
    return "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'>"
      + "<div><b>" + r.home.abbr + "</b> " + r.boxScore.home.totalYds + " yd<table class='afa-gd-box'>" + rows("home") + "</table></div>"
      + "<div><b>" + r.away.abbr + "</b> " + r.boxScore.away.totalYds + " yd<table class='afa-gd-box'>" + rows("away") + "</table></div></div>";
  }

  function fillSummary(node, r) {
    node.innerHTML = "<h2 style='margin:0 0 8px'>" + r.home.abbr + " " + r.score.home + " – " + r.away.abbr + " " + r.score.away + "</h2>"
      + "<p style='color:#8b9bb8'>" + esc(r.attribution.blurb) + " · " + esc(r.weather.label) + "</p>"
      + boxHtml(r)
      + "<h3>Key plays</h3>"
      + (r.keyPlays || []).slice(0, 10).map((p) => "<div>Q" + p.quarter + " · <b>" + esc(p.label) + "</b></div>").join("");
  }

  const ui = { mount, boxHtml, updateScorebug };
  if (GD) GD.ui = ui;
  root.AFAGameDayUI = ui;
  if (typeof module !== "undefined" && module.exports) module.exports = ui;
})(typeof window !== "undefined" ? window : globalThis);
