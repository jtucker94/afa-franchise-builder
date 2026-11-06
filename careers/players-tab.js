/* AFA Players tab + full player profile.
 * Needs: players-nfl.js (AFA_NFL_PLAYERS), careers-data.js (AFACareers), profiles-data.js (AFAProfiles), careers-ui.js.
 * API: AFAPlayersTab.mount(el, state?)  AFAPlayersTab.openProfile(playerId, state?)  AFAPlayersTab.close()
 * Real data only; anything missing renders "Not on record". */
(function (W) {
  const NR = '<span class="apt-nr">Not on record</span>';
  const ROW_H = 46;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const P = () => W.AFAProfiles || {};
  const C = () => W.AFACareers || {};
  function getState(st) { return st || (W.FB && W.FB.getState && W.FB.getState()) || null; }
  function A() { return W.AFA || {}; }
  function livePlayer(id, st) {
    const a = A(); let p = a.playerById ? a.playerById(id) : null;
    if (!p) p = (W.AFA_NFL_PLAYERS || []).find((x) => x.id === id);
    return p || null;
  }
  function afaTeamOf(id, st) {
    st = getState(st); if (!st || !st.rosters) return null;
    for (const tid in st.rosters) if ((st.rosters[tid] || []).indexOf(id) >= 0) return (A().teamById && A().teamById(tid)) || { id: tid, city: tid, nick: "" };
    return null;
  }
  function teamIndex(st) {
    st = getState(st); const m = {};
    if (st && st.rosters) for (const tid in st.rosters) (st.rosters[tid] || []).forEach((id) => (m[id] = tid));
    return m;
  }
  function money(n) { if (n == null) return null; n = Number(n); return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1e3) + "K"; }
  function age(bd) { if (!bd) return null; const d = new Date(bd), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; }
  function hexA(h, a) { h = (h || "#334").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

  /* ---------- list ---------- */
  let LIST = null;
  function buildIndex(st) {
    const tix = teamIndex(st); const pr = P();
    return (W.AFA_NFL_PLAYERS || []).map((p) => {
      const tid = tix[p.id]; const t = tid && A().teamById ? A().teamById(tid) : null;
      const lp = livePlayer(p.id, st) || p;
      return { id: p.id, name: p.name, pos: p.pos, nfl: p.nflTeam || "FA", afa: t ? t.abbr || tid : "", afaId: tid || "", college: p.college || (pr[p.id] || {}).college || "", ovr: lp.ovr, age: p.age, photo: (pr[p.id] || {}).photo, lc: (p.name + " " + (p.college || "")).toLowerCase() };
    });
  }
  function mount(el, st) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    const idx = buildIndex(st); LIST = idx;
    const uniq = (k) => [...new Set(idx.map((r) => r[k]).filter(Boolean))].sort();
    const opt = (arr, lab) => `<option value="">${lab}</option>` + arr.map((v) => `<option>${esc(v)}</option>`).join("");
    el.innerHTML = `<div class="apt-root">
      <div class="apt-filters">
        <input class="apt-q" placeholder="Search name or college…">
        <select data-f="pos">${opt(uniq("pos"), "All positions")}</select>
        <select data-f="nfl">${opt(uniq("nfl"), "All NFL teams")}</select>
        <select data-f="afa">${opt(["(Unsigned)"].concat(uniq("afa")), "All AFA teams")}</select>
        <select data-f="college">${opt(uniq("college"), "All colleges")}</select>
        <select data-f="sort"><option value="ovr">Sort: OVR</option><option value="name">Name</option><option value="age">Age</option><option value="pos">Position</option></select>
        <span class="apt-count"></span>
      </div>
      <div class="apt-head"><span></span><span>Player</span><span>Pos</span><span>OVR</span><span>Age</span><span>NFL</span><span>AFA</span><span>College</span></div>
      <div class="apt-vp"><div class="apt-spacer"></div><div class="apt-rows"></div></div></div>`;
    const vp = el.querySelector(".apt-vp"), sp = el.querySelector(".apt-spacer"), rowsEl = el.querySelector(".apt-rows"), cnt = el.querySelector(".apt-count");
    let view = idx;
    const f = {};
    function apply() {
      const q = el.querySelector(".apt-q").value.trim().toLowerCase();
      el.querySelectorAll("select[data-f]").forEach((s) => (f[s.dataset.f] = s.value));
      view = idx.filter((r) => (!q || r.lc.includes(q)) && (!f.pos || r.pos === f.pos) && (!f.nfl || r.nfl === f.nfl) && (!f.college || r.college === f.college) && (!f.afa || (f.afa === "(Unsigned)" ? !r.afa : r.afa === f.afa)));
      const k = f.sort || "ovr";
      view.sort((a, b) => (k === "ovr" ? (b.ovr || 0) - (a.ovr || 0) : k === "age" ? (a.age || 0) - (b.age || 0) : String(a[k]).localeCompare(String(b[k]))));
      cnt.textContent = view.length + " players"; sp.style.height = view.length * ROW_H + "px"; vp.scrollTop = 0; draw();
    }
    function draw() {
      const top = vp.scrollTop, h = vp.clientHeight || 600;
      const a = Math.max(0, Math.floor(top / ROW_H) - 6), b = Math.min(view.length, Math.ceil((top + h) / ROW_H) + 6);
      let html = "";
      for (let i = a; i < b; i++) {
        const r = view[i];
        html += `<div class="apt-row" data-pid="${r.id}" style="transform:translateY(${i * ROW_H}px)"><span>${r.photo ? `<img loading="lazy" src="${esc(r.photo)}" alt="">` : ""}</span><span class="apt-n">${esc(r.name)}</span><span><b class="pos-pill pos-${r.pos}">${r.pos}</b></span><span>${r.ovr ?? "—"}</span><span>${r.age ?? "—"}</span><span>${esc(r.nfl)}</span><span>${esc(r.afa || "—")}</span><span class="apt-c">${esc(r.college)}</span></div>`;
      }
      rowsEl.innerHTML = html;
    }
    let raf = 0; vp.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
    let t; el.querySelector(".apt-q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(apply, 90); });
    el.querySelectorAll("select").forEach((s) => s.addEventListener("change", apply));
    rowsEl.addEventListener("click", (e) => { const r = e.target.closest(".apt-row"); if (r) openProfile(r.dataset.pid, st); });
    apply();
  }

  /* ---------- profile pieces ---------- */
  function kv(label, val) { return `<div class="apt-kv"><span>${label}</span><b>${val == null || val === "" ? NR : val}</b></div>`; }
  function bar(label, val, pct, sub) {
    const p = Math.max(0, Math.min(100, pct || 0)); const tone = p >= 80 ? "hi" : p >= 50 ? "mid" : "lo";
    return `<div class="apt-bar"><span class="l">${label}</span><div class="t"><i class="${tone}" style="width:${p}%"></i></div><span class="v">${val}</span>${sub ? `<span class="s">${sub}</span>` : ""}</div>`;
  }
  const COMBINE = [["forty", "40-yd dash", "s", 4.2, 5.6, true], ["vertical", "Vertical", '"', 20, 46], ["broad_jump", "Broad jump", '"', 90, 145], ["bench", "Bench (225)", " reps", 0, 45], ["cone", "3-cone", "s", 6.4, 8.3, true], ["shuttle", "Shuttle", "s", 3.9, 5.0, true]];
  function combineHtml(pr) {
    const c = pr.combine;
    if (!c) return `<div class="apt-card"><h4>NFL Combine</h4>${NR}<div class="apt-src">nflverse combine data (PFR) has no entry for this player.</div></div>`;
    const bars = COMBINE.map(([k, l, u, lo, hi, inv]) => c[k] == null ? kv(l, null) : bar(l, c[k] + u, ((inv ? hi - c[k] : c[k] - lo) / (hi - lo)) * 100, "scale " + lo + "–" + hi)).join("");
    return `<div class="apt-card"><h4>${c.year} NFL Combine <small>${esc(c.school || "")}</small></h4>
      ${kv("Height", c.ht)}${kv("Weight", c.wt ? c.wt + " lbs" : null)}${bars}${kv("Arm length", null)}${kv("Hand size", null)}${kv("Wonderlic", null)}
      <div class="apt-src">Bars are a fixed reference scale, not a percentile. Source: ${esc(pr.src.combine)}. Arm/hand/Wonderlic not in source.</div></div>`;
  }
  function pctHtml(pr) {
    const x = pr.percentiles; const L = { pyds: "Pass yds", ptd: "Pass TD", int: "INT (low=better)", cmp: "Completions", ryds: "Rush yds", rtd: "Rush TD", car: "Carries", rec: "Receptions", recyds: "Rec yds", rectd: "Rec TD", tgt: "Targets", dsk: "Sacks", solo: "Solo tkl", ast: "Ast tkl", tfl: "TFL", qbh: "QB hits", ff: "Forced fum", dint: "INT", pd: "Passes def", fgm: "FG made", fga: "FG att", xpm: "XP made", fglng: "Long FG", punts: "Punts", puntyds: "Punt yds", pin20: "Inside 20", g: "Games" };
    if (!x) return `<div class="apt-card"><h4>Percentiles vs position</h4>${NR}<div class="apt-src">Requires 6+ games in the 2025 regular season.</div></div>`;
    return `<div class="apt-card"><h4>${x.season} percentile vs ${pr.pos} <small>n=${x.n}</small></h4>${Object.entries(x.vals).map(([k, o]) => bar(L[k] || k, o.v, o.pct, o.pct + "th")).join("")}<div class="apt-src">${esc(pr.src.percentiles)}</div></div>`;
  }
  function chartHtml(c) {
    if (!c || !c.seasons || !c.seasons.length) return "";
    const pos = c.pos; const key = { QB: ["pyds", "Passing yards"], RB: ["ryds", "Rushing yards"], WR: ["recyds", "Receiving yards"], TE: ["recyds", "Receiving yards"], K: ["fgm", "FG made"], P: ["puntyds", "Punt yards"], DE: ["dsk", "Sacks"], DT: ["dsk", "Sacks"], LB: ["solo", "Solo tackles"], CB: ["pd", "Passes defended"], S: ["solo", "Solo tackles"] }[pos] || ["g", "Games"];
    const pts = c.seasons.map((s) => [s.season, key[0] === "g" ? (s.g || s.gp_snaps || 0) : s[key[0]] || 0]);
    if (pts.length < 2 && !pts.some((p) => p[1])) return "";
    const W_ = 520, H = 150, pad = 28, max = Math.max(1, ...pts.map((p) => p[1]));
    const x = (i) => pad + (pts.length === 1 ? (W_ - 2 * pad) / 2 : (i * (W_ - 2 * pad)) / (pts.length - 1));
    const y = (v) => H - pad - (v / max) * (H - 2 * pad);
    const line = pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ");
    return `<div class="apt-card"><h4>${key[1]} by season</h4><svg class="apt-chart" viewBox="0 0 ${W_} ${H}"><line x1="${pad}" y1="${H - pad}" x2="${W_ - pad}" y2="${H - pad}" class="ax"/><polyline points="${line}" class="ln"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="3.5"/><text x="${x(i)}" y="${H - 10}" class="xl">${String(p[0]).slice(2)}</text><text x="${x(i)}" y="${y(p[1]) - 7}" class="vl">${p[1]}</text>`).join("")}</svg></div>`;
  }
  function statCards(c) {
    if (!c || !c.career) return "";
    const k = c.career; const D = W.AFACareersUI ? W.AFACareersUI.derive(k) : k;
    const sets = { QB: [["pyds", "Pass YDS"], ["ptd", "Pass TD"], ["int", "INT"], ["pct", "CMP%"]], RB: [["ryds", "Rush YDS"], ["rtd", "Rush TD"], ["ypc", "Y/C"], ["recyds", "Rec YDS"]], WR: [["rec", "REC"], ["recyds", "Rec YDS"], ["rectd", "Rec TD"], ["ypr", "Y/R"]], TE: [["rec", "REC"], ["recyds", "Rec YDS"], ["rectd", "Rec TD"], ["ypr", "Y/R"]], K: [["fgm", "FGM"], ["fgpct", "FG%"], ["fglng", "Long"], ["xpm", "XPM"]], P: [["punts", "Punts"], ["pavg", "Avg"], ["puntlng", "Long"], ["pin20", "In 20"]] };
    const def = [["tot", "Tackles"], ["dsk", "Sacks"], ["dint", "INT"], ["ff", "FF"]];
    const ol = [["g", "Games"], ["seasons", "Seasons"]];
    const s = sets[c.pos] || (["OT", "OG", "C"].includes(c.pos) ? ol : def);
    return `<div class="apt-statcards">${s.map(([key, l]) => `<div class="apt-sc"><b>${D[key] ?? 0}</b><span>Career ${l}</span></div>`).join("")}</div>`;
  }
  function collegeHtml(pr) {
    const cs = pr.college_stats; if (!cs || !cs.length) return `<div class="afc-empty">College stats: Not on record (no ESPN college stat line).</div>`;
    const by = {}; cs.forEach((r) => (by[r.cat] = by[r.cat] || []).push(r));
    return Object.entries(by).map(([cat, rows]) => `<div class="afc-group"><div class="afc-glabel">${esc(cat)}</div><div class="afc-scroll"><table class="afc-table"><thead><tr><th>Season</th>${(rows[0].labels || rows[0].names).map((n) => `<th>${esc(n)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td>${r.season}</td>${r.stats.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("") + `<div class="afc-src">Source: ESPN college athlete stats API. Coverage is mostly FBS; FCS/D-II seasons may be absent.</div>`;
  }
  function afaPanel(id, st, team, lp) {
    st = getState(st);
    if (!team) return `<div class="apt-card"><h4>AFA status</h4>${kv("Team", "Unsigned / available")}${lp && lp.ovr != null ? bar("Game OVR", lp.ovr, lp.ovr) : ""}</div>`;
    let role = null;
    try { if (W.FB && W.FB.buildLineup) { const lu = W.FB.buildLineup(team.id); const all = [].concat(lu.offense || [], lu.defense || [], lu.special || []); const s = all.find((x) => x.player && x.player.id === id); role = s ? "Starter · " + (s.slot || s.role) : "Reserve"; } } catch (e) {}
    const ct = lp && lp.contract; const ps = st && st.playerStats && st.playerStats[id]; const gr = lp && lp.grade;
    const psRows = ps ? Object.entries(ps).filter(([k, v]) => k !== "season" && v).map(([k, v]) => `<div class="apt-sc sm"><b>${v}</b><span>${k}</span></div>`).join("") : "";
    return `<div class="apt-card afa"><h4>${esc(team.city)} ${esc(team.nick)} <small>AFA</small></h4>
      ${kv("Jersey", lp && lp.number != null ? "#" + lp.number : null)}${kv("Depth / role", role)}${kv("Contract", ct ? `${money(ct.apy)}/yr · cap ${money(ct.capHit)} · ${ct.yearsRemaining ?? "?"} yrs left` : null)}${lp && lp.onIR ? kv("Status", "Injured reserve") : ""}
      ${lp && lp.ovr != null ? bar("Game OVR", lp.ovr, lp.ovr) : ""}${gr ? bar("AFA grade", gr.overall, gr.overall, "conf " + Math.round((gr.confidence || 0) * 100) + "%") : ""}
      <div class="apt-sub">AFA ${ps ? ps.season || "" : ""} season stats</div><div class="apt-statcards">${psRows || NR}</div>
      <div class="apt-src">Game-state values (simulated AFA league), not real NFL data.</div></div>`;
  }
  function attrsHtml(lp) {
    const s = lp && lp.scout && lp.scout.madden; if (!s) return "";
    return `<div class="apt-card"><h4>Game attributes <small>AFA ratings</small></h4>${(s.keys || []).slice(0, 12).map(([k, l]) => bar(l, s.attrs[k], s.attrs[k])).join("")}<div class="apt-src">In-game ratings (not real measurements).</div></div>`;
  }

  /* ---------- profile ---------- */
  let modal = null;
  function close() { if (modal) { modal.remove(); modal = null; document.removeEventListener("keydown", onKey); } }
  function onKey(e) { if (e.key === "Escape") close(); }
  let _profilesPromise = null;
  function ensureProfilesLoaded() {
    if (W.AFAProfiles) return Promise.resolve(W.AFAProfiles);
    if (_profilesPromise) return _profilesPromise;
    _profilesPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "careers/profiles-data.js?v=031";
      s.async = true;
      s.onload = () => resolve(W.AFAProfiles || {});
      s.onerror = () => reject(new Error("profiles-data.js failed to load"));
      document.head.appendChild(s);
    });
    return _profilesPromise;
  }
  function openProfile(id, st) {
    if (!W.AFAProfiles) {
      ensureProfilesLoaded().then(() => openProfile(id, st)).catch((e) => console.warn(e));
      return;
    }
    const pr = P()[id] || {}; const c = C()[id]; const lp = livePlayer(id, st) || {};
    if (!pr.name && !lp.name) return;
    try { if (!lp.scout && A().enrichPlayer) A().enrichPlayer(lp); } catch (e) {}
    const team = afaTeamOf(id, st);
    const c1 = team ? team.primary : "#1d2a3a", c2 = team ? team.secondary : "#4a6a8a";
    const logo = team && team.logo ? `<img class="apt-logo" src="logos/${esc(team.logo)}" alt="" onerror="this.remove()">` : "";
    const bp = pr.birthplace ? [pr.birthplace.city, pr.birthplace.state, pr.birthplace.country !== "USA" ? pr.birthplace.country : ""].filter(Boolean).join(", ") : null;
    const d = pr.draft; const draft = !d ? null : d.udfa ? `Undrafted free agent${d.year ? " (" + d.year + ")" : ""}` : `${d.year} · Rd ${d.round}, Pick ${d.pick}${d.team ? " · " + esc(d.team) : ""}`;
    const hs = pr.high_school ? esc(pr.high_school.name) + (pr.high_school.location ? " (" + esc(pr.high_school.location) + ")" : "") : null;
    const sb = pr.senior_bowl ? `${pr.senior_bowl.year} · ${esc(pr.senior_bowl.team || "")} #${esc(pr.senior_bowl.number)} ${esc(pr.senior_bowl.pos)} · listed ${esc(pr.senior_bowl.listed_htwt)}${pr.senior_bowl.notes ? " · " + esc(pr.senior_bowl.notes) : ""}` : (pr.senior_bowl_status ? esc(pr.senior_bowl_status) : null);
    const aw = pr.awards ? `Pro Bowls: ${pr.awards.probowls} · All-Pro: ${pr.awards.allpro}` : null;
    const jh = (pr.jersey_history || []).map((j) => `<span class="apt-jer">${j.season} ${esc(j.team)} #${j.numbers.join("/")}</span>`).join("");
    const wi = (pr.weigh_ins || []).map((w) => `${esc(w.event)}: ${esc(w.ht || "—")}, ${w.wt ? w.wt + " lbs" : "—"}`).join("<br>");
    modal = document.createElement("div"); modal.className = "apt-modal";
    modal.innerHTML = `<div class="apt-sheet">
      <div class="apt-hero" style="background:linear-gradient(115deg,${c1} 0%,${c1} 55%,${c2} 140%)">
        <button class="apt-x" aria-label="Close">×</button>
        <div class="apt-shot">${pr.photo ? `<img src="${esc(pr.photo)}" alt="" onerror="this.remove()">` : ""}</div>
        <div class="apt-id"><div class="apt-num">${lp.number != null ? "#" + lp.number : ""}</div><h2>${esc(pr.name || lp.name)}</h2>
          <div class="apt-meta">${esc(pr.pos || lp.pos)} · ${team ? esc(team.city + " " + team.nick) : "AFA: unsigned"} · NFL: ${esc(pr.nflTeam || "—")}</div>
          <div class="apt-meta2">${esc(pr.height || "—")} · ${pr.weight ? pr.weight + " lbs" : "—"} · Age ${age(pr.birthdate) ?? pr.age ?? "—"} · ${esc(pr.college || "—")}</div></div>
        ${logo}${lp.ovr != null ? `<div class="apt-ovr" style="border-color:${c2}"><b>${lp.ovr}</b><span>OVR</span></div>` : ""}
      </div>
      ${statCards(c)}
      <div class="apt-tabs">${["Overview", "NFL Stats", "College", "High School", "Bio & History"].map((t, i) => `<button data-t="${i}" class="${i ? "" : "on"}">${t}</button>`).join("")}</div>
      <div class="apt-body">
        <section data-t="0" class="on"><div class="apt-grid">${afaPanel(id, st, team, lp)}${W.AFA && W.AFA.sleeperHtml && lp ? `<div class="apt-card apt-sleeper">${W.AFA.sleeperHtml(lp)}</div>` : ""}${pctHtml(pr)}${combineHtml(pr)}${attrsHtml(lp)}
          <div class="apt-card"><h4>Honors & grades</h4>${kv("Awards", aw)}<div class="apt-src">${pr.awards ? esc(pr.awards.asOf) : "Awards: Not on record (undrafted players are not covered by the source)."}</div>${kv("PFF grade", null)}<div class="apt-src">Not on record (PFF paywalled)</div></div></div>${chartHtml(c)}</section>
        <section data-t="1">${W.AFACareersUI ? W.AFACareersUI.statsHtml(id) : NR}</section>
        <section data-t="2">${collegeHtml(pr)}</section>
        <section data-t="3"><div class="apt-card">${kv("High school", hs)}${kv("HS stats", null)}<div class="apt-src">No public structured high-school stat source is available. ${pr.src && pr.src.high_school ? "HS: " + esc(pr.src.high_school) : ""}</div></div></section>
        <section data-t="4"><div class="apt-grid"><div class="apt-card"><h4>Bio</h4>${kv("Born", pr.birthdate)}${kv("Birthplace", bp && esc(bp))}${kv("High school", hs)}${kv("College", esc(pr.college || ""))}${kv("Draft", draft)}${kv("Senior Bowl", sb)}${kv("Weigh-ins", wi)}</div>
          <div class="apt-card"><h4>Jersey history</h4>${jh || NR}<div class="apt-src">nflverse weekly rosters (1999–2026)</div></div>
          <div class="apt-card"><h4>Sources</h4>${Object.entries(pr.src || {}).map(([k, v]) => kv(k, esc(v))).join("")}</div></div></section>
      </div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.classList.contains("apt-x")) close(); const b = e.target.closest(".apt-tabs button"); if (b) { modal.querySelectorAll(".apt-tabs button,.apt-body section").forEach((x) => x.classList.toggle("on", x.dataset.t === b.dataset.t)); } });
    document.addEventListener("keydown", onKey);
  }
  /* Delegated opener: any element with data-profile="<playerId>" (or data-scout, opt-in) opens the profile on click. */
  function enableGlobalHooks(opts) {
    opts = opts || {};
    document.addEventListener("click", (e) => {
      const el = e.target.closest(opts.useScoutAttr ? "[data-profile],[data-scout]" : "[data-profile]");
      if (!el || e.target.closest(".apt-modal")) return;
      const id = el.getAttribute("data-profile") || el.getAttribute("data-scout");
      if (id && (P()[id] || C()[id])) { e.preventDefault(); openProfile(id); }
    });
  }
  W.AFAPlayersTab = { mount, openProfile, close, enableGlobalHooks, ensureProfilesLoaded };
})(window);
