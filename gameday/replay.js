/**
 * AFAGameDay.replay — optional cinematic views over a shared timeline.
 * Views: aerial (top-down), sideline (pseudo-3D), suite (elevated stands), off (no render).
 * Switching is instant; all views read the same Player cursor.
 */
(function (root) {
  "use strict";

  const GD = root.AFAGameDay;
  if (!GD) {
    console.warn("AFAGameDay.engine must load before replay.js");
  }

  /* ---------- Shared helpers ---------- */
  const raf = (typeof requestAnimationFrame !== "undefined")
    ? requestAnimationFrame.bind(typeof window !== "undefined" ? window : globalThis)
    : (fn) => setTimeout(() => fn(Date.now()), 16);
  const caf = (typeof cancelAnimationFrame !== "undefined")
    ? cancelAnimationFrame.bind(typeof window !== "undefined" ? window : globalThis)
    : (id) => clearTimeout(id);

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /** Field geometry in yards: x = 0..100 (own→opp for offense), hash width ~53.3 yd */
  const FIELD = { length: 100, width: 53.3, endzone: 10 };

  function playProgress(ev, t) {
    if (!ev) return 0;
    const d = ev.t1 - ev.t0;
    if (d <= 0) return 1;
    return clamp((t - ev.t0) / d, 0, 1);
  }

  function eventAt(timeline, t) {
    const evs = timeline.events;
    if (!evs.length) return null;
    if (t <= evs[0].t0) return evs[0];
    for (let i = 0; i < evs.length; i++) {
      if (t <= evs[i].t1) return evs[i];
    }
    return evs[evs.length - 1];
  }

  /* Synthetic 11-on-11 positions for a play (yards). Offense marches +x. */
  function formation(play, u /* 0..1 progress */) {
    const los = play.ballStart;
    const end = play.ballEnd;
    const ballX = lerp(los, end, easeInOut(u));
    const dir = 1; // always draw offense going right; flip in camera if away
    const offY = FIELD.width / 2;
    const players = [];
    // OL
    for (let i = -2; i <= 2; i++) players.push({ team: "O", x: los - 0.5, y: offY + i * 1.6, n: 60 + i + 2, role: "OL" });
    // QB / RB
    players.push({ team: "O", x: los - 4, y: offY, n: play.jersey.qb || 12, role: "QB" });
    players.push({ team: "O", x: los - 6, y: offY + 1.2, n: play.jersey.bc || 22, role: "RB" });
    // WRs / TE with faint routes
    const routes = [];
    const wrTargets = [
      { x: los + 8, y: 4, n: play.jersey.wr || play.jersey.tgt || 11 },
      { x: los + 6, y: FIELD.width - 4, n: 80 },
      { x: los + 4, y: offY + 4, n: 87 }
    ];
    wrTargets.forEach((w, i) => {
      const start = { x: los, y: w.y };
      const mid = { x: lerp(los, w.x, 0.5), y: w.y + (i === 1 ? -2 : 1) };
      const endP = { x: w.x + (play.kind === "pass" ? Math.max(0, play.yards - 4) : 2), y: w.y };
      routes.push({ a: start, b: mid, c: endP });
      const px = u < 0.5 ? lerp(start.x, mid.x, u * 2) : lerp(mid.x, endP.x, (u - 0.5) * 2);
      const py = u < 0.5 ? lerp(start.y, mid.y, u * 2) : lerp(mid.y, endP.y, (u - 0.5) * 2);
      players.push({ team: "O", x: px, y: py, n: w.n, role: "WR" });
    });
    // Defense
    for (let i = -2; i <= 2; i++) players.push({ team: "D", x: los + 1.2, y: offY + i * 1.7, n: 90 + i, role: "DL" });
    players.push({ team: "D", x: los + 3, y: offY - 5, n: 54, role: "LB" });
    players.push({ team: "D", x: los + 3, y: offY + 5, n: 52, role: "LB" });
    players.push({ team: "D", x: los + 10, y: 5, n: 21, role: "CB" });
    players.push({ team: "D", x: los + 10, y: FIELD.width - 5, n: 27, role: "CB" });
    players.push({ team: "D", x: los + 14, y: offY, n: 33, role: "S" });

    // Ball carrier / ball
    let ball = { x: ballX, y: offY };
    if (play.kind === "pass") {
      if (u < 0.35) ball = { x: los - 4, y: offY }; // in QB hands
      else if (!play.complete && !play.sack) {
        // incomplete — ball arcs then drops
        const uu = (u - 0.35) / 0.65;
        ball = { x: lerp(los - 4, los + Math.max(8, play.yards || 12), uu), y: offY + Math.sin(uu * Math.PI) * 3 };
      } else if (play.sack) {
        ball = { x: lerp(los - 4, end, easeInOut(u)), y: offY };
      } else {
        const catchU = 0.45;
        if (u < catchU) {
          const uu = u / catchU;
          ball = { x: lerp(los - 4, end, uu), y: offY + Math.sin(uu * Math.PI) * 4 };
        } else {
          ball = { x: end, y: offY + 2 };
        }
      }
    } else if (play.kind === "run") {
      ball = { x: ballX, y: offY + Math.sin(u * 4) * 0.8 };
    } else {
      ball = { x: ballX, y: offY };
    }

    return { players, routes, ball, los, dir };
  }

  /* ---------- Player (timeline controller) ---------- */
  function Player(timeline, opts) {
    opts = opts || {};
    this.timeline = timeline;
    this.t = 0;
    this.speed = opts.speed || 1;
    this.paused = !!opts.paused;
    this.view = opts.view || (GD && GD.getSettings ? GD.getSettings().replayView : "aerial");
    this._raf = 0;
    this._last = 0;
    this._listeners = { time: [], view: [], end: [] };
    this.renderers = {}; // view -> renderer
    this.active = null;
    this.canvas = opts.canvas || null;
    this.overlay = opts.overlay || null;
    this.highlightsOnly = false;
  }
  Player.prototype.on = function (ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    return this;
  };
  Player.prototype._emit = function (ev, data) {
    (this._listeners[ev] || []).forEach((fn) => fn(data));
  };
  Player.prototype.register = function (name, renderer) {
    this.renderers[name] = renderer;
    if (name === this.view) this.active = renderer;
    return this;
  };
  Player.prototype.setView = function (name) {
    if (name !== "off" && !this.renderers[name] && name !== this.view) {
      // allow off always
    }
    const prev = this.view;
    this.view = REPLAY_SAFE(name);
    if (GD && GD.setSettings) GD.setSettings({ replayView: this.view });
    this.active = this.view === "off" ? null : this.renderers[this.view] || null;
    // Instant switch — same t; clear canvas once
    if (this.canvas) {
      const ctx = this.canvas.getContext("2d");
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.view === "off") {
      this._drawOffSummary();
    } else if (this.active) {
      this.active.draw(this.t);
    }
    this._emit("view", { view: this.view, prev, t: this.t });
    return this;
  };
  Player.prototype._drawOffSummary = function () {
    if (!this.overlay) return;
    // overlay host fills summary via UI; mark data attr
    this.overlay.dataset.view = "off";
  };
  Player.prototype.setSpeed = function (s) { this.speed = clamp(s, 0.25, 8); return this; };
  Player.prototype.pause = function () { this.paused = true; return this; };
  Player.prototype.resume = function () { this.paused = false; this._last = 0; return this; };
  Player.prototype.toggle = function () { this.paused = !this.paused; this._last = 0; return this; };
  Player.prototype.seek = function (t) {
    this.t = clamp(t, 0, this.timeline.duration);
    if (this.active) this.active.draw(this.t);
    this._emit("time", { t: this.t });
    return this;
  };
  Player.prototype.skipHighlights = function () {
    const evs = this.timeline.events.filter((e) => e.key);
    const next = evs.find((e) => e.t0 > this.t + 0.05);
    if (next) this.seek(next.t0);
    else if (evs.length) this.seek(evs[0].t0);
    return this;
  };
  Player.prototype.start = function () {
    const self = this;
    if (this.view === "off") { this._drawOffSummary(); return this; }
    const loop = (now) => {
      self._raf = raf(loop);
      if (!self._last) self._last = now;
      const dt = (now - self._last) / 1000;
      self._last = now;
      if (!self.paused && self.view !== "off") {
        self.t += dt * self.speed;
        if (self.t >= self.timeline.duration) {
          self.t = self.timeline.duration;
          self.paused = true;
          self._emit("end", { t: self.t });
        }
        self._emit("time", { t: self.t });
      }
      if (self.view !== "off" && self.active) self.active.draw(self.t);
    };
    this._raf = raf(loop);
    return this;
  };
  Player.prototype.stop = function () {
    if (this._raf) caf(this._raf);
    this._raf = 0;
    return this;
  };
  Player.prototype.destroy = function () {
    this.stop();
    this.renderers = {};
    this.active = null;
  };

  function REPLAY_SAFE(v) {
    const ok = ["aerial", "sideline", "suite", "off"];
    return ok.includes(v) ? v : "aerial";
  }

  /* ---------- Scorebug / HUD (DOM-light; called by UI, data from player) ---------- */
  function hudState(timeline, t) {
    const ev = eventAt(timeline, t);
    if (!ev) return null;
    const p = ev.play;
    return {
      home: timeline.home, away: timeline.away,
      homeScore: p.homeScore, awayScore: p.awayScore,
      down: p.down, distance: p.distance,
      quarter: p.quarter, clock: p.clockAfter != null ? p.clockAfter : p.clockBefore,
      yardline: p.postYardline, label: ev.label,
      key: ev.key, wp: p.wpAfter, momentum: p.momentumAfter,
      noiseDb: p.noiseDb, side: p.side
    };
  }

  /* ---------- Base canvas sizing ---------- */
  function fitCanvas(canvas) {
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: canvas.width || 640, height: canvas.height || 360 };
    const w = Math.max(320, Math.floor((rect.width || canvas.width || 640) * dpr));
    const h = Math.max(180, Math.floor((rect.height || canvas.height || 360) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    return { w, h, dpr };
  }

  /* =========================================================
   * AERIAL — top-down
   * ========================================================= */
  function AerialRenderer(canvas, timeline) {
    this.canvas = canvas;
    this.timeline = timeline;
    this.trail = [];
  }
  AerialRenderer.prototype.draw = function (t) {
    const canvas = this.canvas;
    const { w, h } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const ev = eventAt(this.timeline, t);
    if (!ev) return;
    const u = playProgress(ev, t);
    const play = ev.play;
    const form = formation(play, u);

    // camera: slight pan toward ball
    const pad = 0.08;
    const marginX = w * pad, marginY = h * pad;
    const fieldW = w - marginX * 2, fieldH = h - marginY * 2;
    const toXY = (yardsX, yardsY) => {
      // flip if away offense so they still go right visually? keep absolute home→away left→right
      const xAbs = play.side === "home" ? yardsX : 100 - yardsX;
      const yAbs = play.side === "home" ? yardsY : FIELD.width - yardsY;
      return {
        x: marginX + (xAbs / 100) * fieldW,
        y: marginY + (yAbs / FIELD.width) * fieldH
      };
    };

    ctx.clearRect(0, 0, w, h);
    // turf
    ctx.fillStyle = "#1a5c2e";
    ctx.fillRect(0, 0, w, h);
    // endzones
    const homeC = this.timeline.home.primary || "#2244aa";
    const awayC = this.timeline.away.primary || "#aa2222";
    const ez0 = toXY(-FIELD.endzone, 0), ez1 = toXY(0, FIELD.width);
    const ez2 = toXY(100, 0), ez3 = toXY(100 + FIELD.endzone, FIELD.width);
    // simplify: draw endzone bands
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = homeC;
    ctx.fillRect(marginX - fieldW * 0.1, marginY, fieldW * 0.1, fieldH);
    ctx.fillStyle = awayC;
    ctx.fillRect(marginX + fieldW, marginY, fieldW * 0.1, fieldH);
    ctx.globalAlpha = 1;

    // yard lines
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let yrd = 0; yrd <= 100; yrd += 10) {
      const a = toXY(yrd, 0), b = toXY(yrd, FIELD.width);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // hashes
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    for (let yrd = 0; yrd <= 100; yrd += 1) {
      const y1 = FIELD.width / 2 - 3.1, y2 = FIELD.width / 2 + 3.1;
      const p1 = toXY(yrd, y1), p2 = toXY(yrd, y1 + 0.6);
      const p3 = toXY(yrd, y2), p4 = toXY(yrd, y2 - 0.6);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }

    // routes faint
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    form.routes.forEach((r) => {
      const a = toXY(r.a.x, r.a.y), b = toXY(r.b.x, r.b.y), c = toXY(r.c.x, r.c.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, c.x, c.y); ctx.stroke();
    });
    ctx.restore();

    // LOS
    const losA = toXY(form.los, 0), losB = toXY(form.los, FIELD.width);
    ctx.strokeStyle = "rgba(255,220,50,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(losA.x, losA.y); ctx.lineTo(losB.x, losB.y); ctx.stroke();

    // players
    const r = Math.max(5, w * 0.008);
    form.players.forEach((pl) => {
      const pt = toXY(pl.x, pl.y);
      ctx.beginPath();
      ctx.fillStyle = pl.team === "O" ? play.offColor : play.defColor;
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + Math.max(8, r) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pl.n), pt.x, pt.y);
    });

    // ball + trail
    const b = toXY(form.ball.x, form.ball.y);
    this.trail.push(b);
    if (this.trail.length > 18) this.trail.shift();
    ctx.strokeStyle = "rgba(255,140,0,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.trail.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.stroke();
    ctx.fillStyle = "#f4a460";
    ctx.beginPath(); ctx.ellipse(b.x, b.y, r * 0.7, r * 0.45, 0.4, 0, Math.PI * 2); ctx.fill();

    // key label
    if (ev.key && u > 0.2) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const tw = ((ctx.measureText && ctx.measureText(ev.label)) || { width: (ev.label||"").length * 8 }).width + 24;
      ctx.fillRect(w / 2 - tw / 2, 12, tw, 28);
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold " + Math.max(12, w * 0.018) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ev.label, w / 2, 32);
    }
  };

  /* =========================================================
   * SIDELINE — pseudo-3D perspective from the sideline
   * ========================================================= */
  function SidelineRenderer(canvas, timeline) {
    this.canvas = canvas;
    this.timeline = timeline;
    this.camX = 50;
    this.zoom = 1;
  }
  SidelineRenderer.prototype.project = function (xYds, yYds, camX, zoom, w, h) {
    // camera on south sideline looking north; x along field, y into field
    const relX = (xYds - camX) * zoom;
    const depth = (yYds + 4) / (FIELD.width + 8); // 0 near, 1 far
    const persp = 0.45 + depth * 0.55;
    const x = w * 0.5 + relX * (w * 0.009) * persp;
    const y = h * 0.78 - depth * h * 0.62 * zoom - (1 - persp) * 20;
    const scale = (0.9 - depth * 0.5) * zoom;
    return { x, y, scale, depth };
  };
  SidelineRenderer.prototype.draw = function (t) {
    const canvas = this.canvas;
    const { w, h } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const ev = eventAt(this.timeline, t);
    if (!ev) return;
    const u = playProgress(ev, t);
    const play = ev.play;
    const form = formation(play, u);

    // absolute field coords (home left)
    const abs = (x, y) => play.side === "home" ? { x, y } : { x: 100 - x, y: FIELD.width - y };
    const ballA = abs(form.ball.x, form.ball.y);

    // camera pans to ball; zoom on big plays
    const targetZoom = (ev.key ? 1.35 : 1.05) * (play.touchdown || play.interception ? 1.15 : 1);
    this.zoom = lerp(this.zoom, targetZoom, 0.08);
    this.camX = lerp(this.camX, ballA.x, 0.12);
    // slow-mo feel is handled by timeline duration; slight extra hold via zoom

    ctx.clearRect(0, 0, w, h);
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    sky.addColorStop(0, "#6ec3ff");
    sky.addColorStop(1, "#cfefff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.45);

    // stands far
    ctx.fillStyle = "#3a3a48";
    ctx.fillRect(0, h * 0.28, w, h * 0.12);
    ctx.fillStyle = "rgba(200,60,60,0.25)";
    for (let i = 0; i < 40; i++) {
      ctx.fillRect((i / 40) * w, h * 0.28 + (i % 3) * 4, w / 50, 8);
    }

    // field trapezoid
    const nearL = this.project(this.camX - 55, 0, this.camX, this.zoom, w, h);
    const nearR = this.project(this.camX + 55, 0, this.camX, this.zoom, w, h);
    const farL = this.project(this.camX - 55, FIELD.width, this.camX, this.zoom, w, h);
    const farR = this.project(this.camX + 55, FIELD.width, this.camX, this.zoom, w, h);
    ctx.fillStyle = "#2a7a3a";
    ctx.beginPath();
    ctx.moveTo(nearL.x, nearL.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(farR.x, farR.y); ctx.lineTo(farL.x, farL.y);
    ctx.closePath(); ctx.fill();

    // yard lines
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let yrd = 0; yrd <= 100; yrd += 10) {
      const a = this.project(yrd, 0, this.camX, this.zoom, w, h);
      const b = this.project(yrd, FIELD.width, this.camX, this.zoom, w, h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // endzone tint
    const homeC = this.timeline.home.primary || "#2244aa";
    const awayC = this.timeline.away.primary || "#aa2222";
    ctx.globalAlpha = 0.35;
    [[-5, homeC], [105, awayC]].forEach(([x, c]) => {
      const a = this.project(x - 5, 0, this.camX, this.zoom, w, h);
      const b = this.project(x + 5, 0, this.camX, this.zoom, w, h);
      const c1 = this.project(x + 5, FIELD.width, this.camX, this.zoom, w, h);
      const d = this.project(x - 5, FIELD.width, this.camX, this.zoom, w, h);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(d.x, d.y); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // sort players by depth
    const drawn = form.players.map((pl) => {
      const a = abs(pl.x, pl.y);
      const pr = this.project(a.x, a.y, this.camX, this.zoom, w, h);
      return { pl, pr };
    }).sort((a, b) => a.pr.depth - b.pr.depth);

    drawn.forEach(({ pl, pr }) => {
      const rr = 7 * pr.scale;
      ctx.fillStyle = pl.team === "O" ? play.offColor : play.defColor;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, Math.PI * 2); ctx.fill();
      // simple body
      ctx.fillRect(pr.x - rr * 0.5, pr.y - rr * 2.2, rr, rr * 1.6);
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + Math.max(8, 9 * pr.scale) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(pl.n), pr.x, pr.y - rr * 1.2);
    });

    // ball
    const bp = this.project(ballA.x, ballA.y, this.camX, this.zoom, w, h);
    ctx.fillStyle = "#d2691e";
    ctx.beginPath(); ctx.ellipse(bp.x, bp.y - 4 * bp.scale, 5 * bp.scale, 3 * bp.scale, 0.3, 0, Math.PI * 2); ctx.fill();

    // sideline foreground (blur of benches)
    ctx.fillStyle = "rgba(20,20,28,0.35)";
    ctx.fillRect(0, h * 0.88, w, h * 0.12);

    if (ev.key && u > 0.15) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(w * 0.5 - 120, h * 0.08, 240, 36);
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ev.label, w * 0.5, h * 0.08 + 24);
    }
  };

  /* =========================================================
   * SUITE — elevated club suite / upper stands
   * Foreground glass + railing, crowd from attendance fill, flash from noise dB
   * ========================================================= */
  function SuiteRenderer(canvas, timeline) {
    this.canvas = canvas;
    this.timeline = timeline;
    this.camX = 50;
    this.zoom = 0.85; // wider
    this.flash = 0;
    this.crowdSeed = 1;
  }
  SuiteRenderer.prototype.project = function (xYds, yYds, camX, zoom, w, h) {
    // elevated: look down-angle from upper deck on the side
    const relX = (xYds - camX) * zoom;
    const depth = (yYds + 2) / (FIELD.width + 6);
    const elev = 0.55; // higher camera
    const persp = 0.5 + depth * 0.5;
    const x = w * 0.5 + relX * (w * 0.008) * persp;
    const y = h * 0.62 - depth * h * 0.48 * zoom - elev * 40;
    const scale = (0.75 - depth * 0.35) * zoom;
    return { x, y, scale, depth };
  };
  SuiteRenderer.prototype.draw = function (t) {
    const canvas = this.canvas;
    const { w, h } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const ev = eventAt(this.timeline, t);
    if (!ev) return;
    const u = playProgress(ev, t);
    const play = ev.play;
    const form = formation(play, u);
    const abs = (x, y) => play.side === "home" ? { x, y } : { x: 100 - x, y: FIELD.width - y };
    const ballA = abs(form.ball.x, form.ball.y);

    // slower wider camera
    this.zoom = lerp(this.zoom, ev.key ? 0.95 : 0.82, 0.05);
    this.camX = lerp(this.camX, ballA.x, 0.06);

    // crowd params from stadium
    const st = this.timeline.stadium || {};
    const att = st.attendance || {};
    const fill = att.fill != null ? att.fill : (st.noise && st.noise.index != null ? 0.5 + st.noise.index * 0.4 : 0.75);
    const noiseDb = play.noiseDb || (st.noise && st.noise.db) || 105;
    const noiseIdx = clamp((noiseDb - 100) / 30, 0, 1);
    if (ev.key && u > 0.3 && u < 0.7) this.flash = Math.max(this.flash, 0.35 + noiseIdx * 0.5);
    this.flash *= 0.92;

    ctx.clearRect(0, 0, w, h);

    // night/day sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    sky.addColorStop(0, "#1a2740");
    sky.addColorStop(1, "#4a6a8a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // far upper deck crowd band
    this._drawCrowdBand(ctx, w, h * 0.18, h * 0.14, fill, noiseIdx, t, 1);

    // field (similar trapezoid but from higher angle)
    const nearL = this.project(this.camX - 60, 0, this.camX, this.zoom, w, h);
    const nearR = this.project(this.camX + 60, 0, this.camX, this.zoom, w, h);
    const farL = this.project(this.camX - 60, FIELD.width, this.camX, this.zoom, w, h);
    const farR = this.project(this.camX + 60, FIELD.width, this.camX, this.zoom, w, h);
    ctx.fillStyle = "#246b34";
    ctx.beginPath();
    ctx.moveTo(nearL.x, nearL.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(farR.x, farR.y); ctx.lineTo(farL.x, farL.y);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    for (let yrd = 0; yrd <= 100; yrd += 10) {
      const a = this.project(yrd, 0, this.camX, this.zoom, w, h);
      const b = this.project(yrd, FIELD.width, this.camX, this.zoom, w, h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // players (smaller from suite)
    const drawn = form.players.map((pl) => {
      const a = abs(pl.x, pl.y);
      const pr = this.project(a.x, a.y, this.camX, this.zoom, w, h);
      return { pl, pr };
    }).sort((a, b) => a.pr.depth - b.pr.depth);
    drawn.forEach(({ pl, pr }) => {
      const rr = 5.5 * pr.scale;
      ctx.fillStyle = pl.team === "O" ? play.offColor : play.defColor;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold " + Math.max(7, 8 * pr.scale) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(pl.n), pr.x, pr.y + 1);
    });
    const bp = this.project(ballA.x, ballA.y, this.camX, this.zoom, w, h);
    ctx.fillStyle = "#e09040";
    ctx.beginPath(); ctx.ellipse(bp.x, bp.y, 4 * bp.scale, 2.5 * bp.scale, 0.4, 0, Math.PI * 2); ctx.fill();

    // near-side crowd (between field and suite)
    this._drawCrowdBand(ctx, w, h * 0.58, h * 0.16, fill, noiseIdx, t, 2);

    // suite glass + railing foreground
    // glass tint
    ctx.fillStyle = "rgba(160, 200, 230, 0.12)";
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    // glass reflection streaks
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(w * (0.1 + i * 0.18), h * 0.72);
      ctx.lineTo(w * (0.05 + i * 0.18), h);
      ctx.stroke();
    }
    // railing
    ctx.strokeStyle = "rgba(220,220,230,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, h * 0.74); ctx.lineTo(w, h * 0.74); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) {
      const x = (i / 29) * w;
      ctx.beginPath(); ctx.moveTo(x, h * 0.74); ctx.lineTo(x, h * 0.80); ctx.stroke();
    }
    // suite ledge
    ctx.fillStyle = "rgba(40,40,50,0.85)";
    ctx.fillRect(0, h * 0.80, w, h * 0.20);
    // cocktail table hint
    ctx.fillStyle = "rgba(80,60,40,0.7)";
    ctx.fillRect(w * 0.05, h * 0.88, w * 0.12, h * 0.04);

    // camera flash / crowd pop on big plays
    if (this.flash > 0.02) {
      ctx.fillStyle = "rgba(255,255,220," + (this.flash * 0.35).toFixed(3) + ")";
      ctx.fillRect(0, 0, w, h * 0.7);
      // sparkle dots
      ctx.fillStyle = "rgba(255,255,255," + (this.flash * 0.8).toFixed(3) + ")";
      for (let i = 0; i < Math.floor(12 * noiseIdx * this.flash * 3); i++) {
        const sx = ((i * 97 + t * 30) % 100) / 100 * w;
        const sy = h * 0.2 + ((i * 53) % 100) / 100 * h * 0.35;
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (ev.key && u > 0.2) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(w * 0.5 - 130, h * 0.1, 260, 34);
      ctx.fillStyle = "#ffe566";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ev.label, w * 0.5, h * 0.1 + 22);
    }
  };
  SuiteRenderer.prototype._drawCrowdBand = function (ctx, w, y0, bandH, fill, noiseIdx, t, layer) {
    const rows = 4;
    const density = clamp(fill, 0.15, 1);
    const homeC = this.timeline.home.primary || "#3355cc";
    const awayC = this.timeline.away.primary || "#cc3333";
    for (let row = 0; row < rows; row++) {
      const y = y0 + (row / rows) * bandH;
      const n = Math.floor(40 + density * 80);
      for (let i = 0; i < n; i++) {
        const x = ((i + row * 0.3 + layer) / n) * w + Math.sin(t * (1 + noiseIdx) + i) * noiseIdx * 2;
        const colorMix = (i + row) % 5 === 0 ? awayC : homeC;
        ctx.fillStyle = colorMix;
        ctx.globalAlpha = 0.35 + density * 0.45;
        const bob = Math.sin(t * 6 * (0.5 + noiseIdx) + i * 0.7 + layer) * (1 + noiseIdx * 3) * (evKeyBob(noiseIdx));
        ctx.fillRect(x, y - 3 + bob, 2.2, 5.5);
      }
    }
    ctx.globalAlpha = 1;
  };
  function evKeyBob(noiseIdx) { return 0.6 + noiseIdx * 0.8; }

  /* ---------- Factory ---------- */
  function createReplay(canvas, timeline, opts) {
    opts = opts || {};
    const player = new Player(timeline, Object.assign({ canvas }, opts));
    player.register("aerial", new AerialRenderer(canvas, timeline));
    player.register("sideline", new SidelineRenderer(canvas, timeline));
    player.register("suite", new SuiteRenderer(canvas, timeline));
    player.setView(opts.view || player.view);
    return player;
  }

  const replayApi = {
    Player, AerialRenderer, SidelineRenderer, SuiteRenderer,
    createReplay, eventAt, playProgress, hudState, formation, FIELD
  };

  if (root.AFAGameDay) root.AFAGameDay.replay = replayApi;
  root.AFAGameDayReplay = replayApi;
  if (typeof module !== "undefined" && module.exports) module.exports = replayApi;
})(typeof window !== "undefined" ? window : globalThis);
