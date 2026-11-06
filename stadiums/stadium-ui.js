/* AFA Stadium designer UI. Requires stadium-data.js + stadiums.js + stadium.css.
   AFAStadiumUI.mount(el, stadium, {primary, secondary, winPct, onChange(stadium), league:{id:stadium}}) */
(function (root) {
  const S = root.AFAStadiums;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const M = (n) => "$" + (n / 1e6).toFixed(1) + "M";
  function opts(obj, cur) { return Object.keys(obj).map((k) => `<option value="${k}"${k === cur ? " selected" : ""}>${obj[k].label}</option>`).join(""); }

  function svg(s, o, att) {
    const p = o.primary || "#1e4d8c", q = o.secondary || "#f2c14e";
    const cap = att.capacity, rings = cap > 85000 ? 3 : cap > 65000 ? 2 : 1;
    const w = 360, h = 230, cx = 180, cy = 118; let out = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Stadium preview"><rect width="${w}" height="${h}" rx="12" fill="${s.roof === "open" ? "#7ec8e3" : "#24324a"}"/>`;
    const open = s.bowl === "horseshoe";
    for (let i = rings; i >= 1; i--) {
      const rx = 70 + i * 32 - (s.bowl === "steep" ? 6 * i : 0), ry = 42 + i * 22;
      const fillc = i % 2 ? p : q;
      out += open ? `<path d="M ${cx + rx * 0.6} ${cy - ry * 0.8} A ${rx} ${ry} 0 1 0 ${cx + rx * 0.6} ${cy + ry * 0.8} Z" fill="${fillc}" opacity="${0.55 + 0.15 * i}"/>`
        : `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fillc}" opacity="${0.55 + 0.15 * i}"/>`;
    }
    // empty seats as grey dots
    const empty = Math.round((1 - att.fill) * 40);
    for (let i = 0; i < empty; i++) { const a = i / 40 * 6.283; out += `<circle cx="${cx + Math.cos(a) * 118}" cy="${cy + Math.sin(a) * 72}" r="3" fill="#888"/>`; }
    const turf = s.surface === "turf" ? "#3fa34d" : s.surface === "hybrid" ? "#2f9443" : "#2e7d32";
    out += `<rect x="${cx - 70}" y="${cy - 30}" width="140" height="60" rx="4" fill="${turf}" stroke="#fff"/><line x1="${cx}" y1="${cy - 30}" x2="${cx}" y2="${cy + 30}" stroke="#fff"/>`;
    out += `<rect x="${cx - 70}" y="${cy - 30}" width="14" height="60" fill="${p}"/><rect x="${cx + 56}" y="${cy - 30}" width="14" height="60" fill="${p}"/>`;
    const bw = s.board === "mega" ? 120 : s.board === "hd" ? 70 : 40;
    out += `<rect x="${cx - bw / 2}" y="6" width="${bw}" height="16" rx="3" fill="#111" stroke="${q}"/><text x="${cx}" y="18" fill="${q}" font-size="10" text-anchor="middle">${att.attendance.toLocaleString()}</text>`;
    if (s.roof !== "open") out += `<ellipse cx="${cx}" cy="${cy}" rx="172" ry="104" fill="#cfd8e3" opacity="${s.roof === "dome" ? 0.35 : 0.18}" stroke="#cfd8e3" ${s.roof === "retractable" ? 'stroke-dasharray="8 6"' : ""}/>`;
    for (let i = 0; i < Math.min(12, Math.round(s.suites / 8)); i++) out += `<rect x="${cx - 60 + i * 10}" y="${cy + 85}" width="7" height="5" fill="#f2c14e"/>`;
    return out + `<text x="10" y="${h - 8}" fill="#fff" font-size="12" font-weight="700">${esc(s.name)}</text></svg>`;
  }
  function chart(s) {
    const pts = [0.2, 0.35, 0.5, 0.65, 0.8].map((wp) => { const r = S.seasonRevenue(s, { winPct: wp }); return { wp, att: r.avgAttendance, rev: r.total }; });
    const cap = S.capacity(s), maxR = Math.max.apply(null, pts.map((p) => p.rev));
    let out = `<svg viewBox="0 0 300 110" width="100%"><text x="4" y="10" fill="#9fb2c8" font-size="9">Avg attendance (bars) & revenue (line) by win %</text>`;
    pts.forEach((p, i) => { const bh = 80 * p.att / cap; out += `<rect x="${20 + i * 55}" y="${98 - bh}" width="30" height="${bh}" fill="#4a7ab5"/><text x="${35 + i * 55}" y="108" fill="#9fb2c8" font-size="8" text-anchor="middle">${Math.round(p.wp * 100)}%</text>`; });
    out += `<polyline fill="none" stroke="#f2c14e" stroke-width="2" points="${pts.map((p, i) => (35 + i * 55) + "," + (98 - 80 * p.rev / maxR)).join(" ")}"/>`;
    return out + "</svg>";
  }
  function leagueChart(league, wps) {
    const rows = S.leagueTable(league, wps); const max = Math.max.apply(null, rows.map((r) => r.capacity));
    return `<table><tr><th>Team</th><th>Cap</th><th>Avg att</th><th>Fill</th><th>dB</th><th>Revenue</th><th>Upg</th></tr>${rows.map((r) =>
      `<tr><td>${r.teamId.toUpperCase()}</td><td><svg width="50" height="8"><rect width="${50 * r.capacity / max}" height="8" fill="#4a7ab5"/></svg> ${(r.capacity / 1000).toFixed(1)}k</td><td>${(r.avgAtt / 1000).toFixed(1)}k</td><td>${Math.round(r.fill * 100)}%</td><td>${r.noiseDb}</td><td>${M(r.revenue)}</td><td>${r.upgrades}</td></tr>`).join("")}</table>`;
  }

  function meter(v) { const col = v >= 65 ? "#2e7d32" : v >= 45 ? "#f2c14e" : "#e07a5f"; return `<div class="afs-meter" title="Fan loyalty/satisfaction (0-100)"><div style="width:${v}%;background:${col}"></div><span>Fan loyalty ${v}/100</span></div>`; }
  function fanPanel(s, wp, att) {
    const d = S.diagnose(s), F = s.fans;
    const tiers = ["upper", "lower", "club"].map((k) => { const t = att.tiers[k]; const col = t.price > t.fair.high ? "#e07a5f" : t.price < t.fair.low ? "#7ec8e3" : "#9fe09f";
      return `<label>${k[0].toUpperCase() + k.slice(1)} $${t.price} <span style="color:${col}">fair $${t.fair.low}-$${t.fair.high}</span> · ${t.sold.toLocaleString()}/${t.seats.toLocaleString()} sold</label>
        <input type="range" min="${Math.round(t.fair.mid * 0.4)}" max="${Math.round(t.fair.mid * 2.2)}" data-price="${k}" value="${t.price}">`; }).join("");
    const alert = d.alert && d.reasons.length ? `<div class="afs-alert" title="${d.reasons.map((r) => r.reason + ": " + r.pct + "% of recent fan losses").join("\n")}">⚠ ${d.message}<br>${d.reasons.map((r) => r.fix.action === "roster" || r.fix.action === "upgrades" ? `<span class="lock">Fix: ${r.fix.label}</span>` : `<button data-fix="${r.fix.action}">${r.fix.label}</button>`).join(" ")}</div>` : "";
    return `${meter(d.loyalty)}${alert}
      <div class="lock">Season-ticket holders ${F.sth.toLocaleString()} · casual ${F.casual.toLocaleString()} · bandwagon ${F.bandwagon.toLocaleString()}${F.seasons && F.seasons.length ? " · last renewal " + Math.round(F.seasons[F.seasons.length - 1].renewal * 100) + "%" : ""}</div>
      <h3 style="margin-top:10px">Ticket pricing</h3>${tiers}
      <div class="lock">Projected/game: ${att.attendance.toLocaleString()} fans (${Math.round(att.fill * 100)}%) · ${M(S.gameRevenue(s, att))} gate</div>
      <button data-fix="setFairPrices">Set fair prices</button>
      <label>Community programs (cash ${M(s.cash)})</label><select data-comm><option value="1000000">$1M</option><option value="2000000" selected>$2M</option><option value="5000000">$5M</option></select><button data-fix="communityInvest">Invest</button>`;
  }
  function mount(el, s, o) {
    o = o || {};
    function render() {
      const wp = o.winPct == null ? 0.5 : o.winPct;
      S.ensureFans(s); const att = S.attendance(s, { winPct: wp }); const rev = S.seasonRevenue(s, { winPct: wp });
      const gd = S.gameDay(s, { winPct: wp, stakes: 0.5, margin: 3 });
      const ups = S.availableUpgrades(s, rev.total, wp); const tier = S.unlockedTier(s, rev.total, wp);
      el.innerHTML = `<div class="afs"><div>
        <h3>Stadium Designer</h3>
        <label>Name</label><input data-k="name" value="${esc(s.name)}">
        <label>Roof</label><select data-k="roof">${opts(S.ROOFS, s.roof)}</select>
        <label>Seating bowl</label><select data-k="bowl">${opts(S.BOWLS, s.bowl)}</select>
        ${fanPanel(s, wp, att)}
        <details><summary>Advanced</summary>
          <label>Surface</label><select data-k="surface">${opts(S.SURFACES, s.surface)}</select>
          <label>Video board</label><select data-k="board">${opts(S.BOARDS, s.board)}</select>
          <label>Luxury suites: ${s.suites} (−40 seats each)</label><input type="range" min="0" max="150" data-k="suites" value="${s.suites}">
          <label>Club seats: ${s.clubSeats}</label><input type="range" min="0" max="12000" step="500" data-k="clubSeats" value="${s.clubSeats}">
          <label><input type="checkbox" data-k="namingRights" ${s.namingRights ? "checked" : ""} style="width:auto"> Sell naming rights</label>
        </details>
        <details open><summary>Upgrades — tier ${tier} unlocked · cash ${M(s.cash)}</summary>
          ${ups.map((u) => `<div class="upg"><span>${esc(u.name)}<br><span class="lock">${u.reason || M(u.cost) + " · " + u.build + " offseason(s)"}</span></span><button data-up="${u.id}" ${u.ok ? "" : "disabled"}>Build</button></div>`).join("")}
          ${s.pending.length ? `<div class="lock">Under construction: ${s.pending.map((p) => p.id + " (" + p.left + ")").join(", ")}</div>` : ""}
        </details></div>
      <div>${svg(s, o, att)}
        <div class="stats"><div class="stat"><b>${att.capacity.toLocaleString()}</b><span>Capacity</span></div><div class="stat"><b>${Math.round(att.fill * 100)}%</b><span>Fill (${att.attendance.toLocaleString()})</span></div>
        <div class="stat"><b>${gd.noise.db} dB</b><span>Crowd noise</span></div><div class="stat"><b>+${gd.homePoints.toFixed(1)}</b><span>HFA pts</span></div>
        <div class="stat"><b>${(gd.noise.falseStartProb * 100).toFixed(1)}%</b><span>Opp false start/snap</span></div><div class="stat"><b>${M(rev.total)}</b><span>Season revenue</span></div>
        <div class="stat"><b>${M(rev.suites + rev.club)}</b><span>Premium</span></div><div class="stat"><b>${S.faAppeal(s)}</b><span>FA appeal</span></div></div>
        ${chart(s)}${o.league ? `<details><summary>League stadium comparison</summary>${leagueChart(o.league, o.winPcts)}</details>` : ""}</div></div>`;
      el.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener(inp.type === "range" ? "input" : "change", () => {
        const k = inp.dataset.k; s[k] = inp.type === "checkbox" ? inp.checked : inp.type === "range" ? +inp.value : inp.value;
        if (k === "roof" && s.roof !== "open" && !s.built.includes("roofR") && !s.built.includes("roofD") && !o.freeDesign) { /* design mode allows free change pre-season */ }
        o.onChange && o.onChange(s); render();
      }));
      el.querySelectorAll("[data-price]").forEach((inp) => inp.addEventListener("change", () => { const p = {}; p[inp.dataset.price] = +inp.value; S.setPrices(s, p); o.onChange && o.onChange(s); render(); }));
      el.querySelectorAll("[data-fix]").forEach((b) => b.addEventListener("click", () => { const a = b.dataset.fix;
        if (a === "communityInvest") S.investCommunity(s, +el.querySelector("[data-comm]").value); else S.applyFix(s, a); o.onChange && o.onChange(s); render(); }));
      el.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => { S.startUpgrade(s, b.dataset.up, rev.total, wp); o.onChange && o.onChange(s); render(); }));
    }
    render(); return { render };
  }
  root.AFAStadiumUI = { mount, svg, chart, leagueChart };
})(window);
