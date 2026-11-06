/* AFA careers stats-table renderer. Requires careers-data.js (window.AFACareers). */
(function (W) {
  const NR = "Not on record";
  const GROUPS = [
    { id: "pass", label: "Passing", test: (s) => s.att, cols: [["g","G"],["cmp","CMP"],["att","ATT"],["pct","CMP%"],["pyds","YDS"],["ypa","Y/A"],["ptd","TD"],["int","INT"],["sk","SK"]] },
    { id: "rush", label: "Rushing", test: (s) => s.car, cols: [["g","G"],["car","ATT"],["ryds","YDS"],["ypc","Y/C"],["rtd","TD"],["fum","FUM"],["fl","LST"]] },
    { id: "rec", label: "Receiving", test: (s) => s.rec || s.tgt, cols: [["g","G"],["tgt","TGT"],["rec","REC"],["recyds","YDS"],["ypr","Y/R"],["rectd","TD"]] },
    { id: "def", label: "Defense", test: (s) => s.solo || s.ast || s.dsk || s.dint || s.pd, cols: [["g","G"],["tot","TOT"],["solo","SOLO"],["ast","AST"],["tfl","TFL"],["dsk","SACK"],["qbh","QBH"],["dint","INT"],["pd","PD"],["ff","FF"],["fr","FR"],["inttd","INT TD"]] },
    { id: "kick", label: "Kicking", test: (s) => s.fga || s.xpa, cols: [["g","G"],["fgm","FGM"],["fga","FGA"],["fgpct","FG%"],["fglng","LNG"],["xpm","XPM"],["xpa","XPA"]] },
    { id: "punt", label: "Punting", test: (s) => s.punts, cols: [["g","G"],["punts","PUNTS"],["puntyds","YDS"],["pavg","AVG"],["puntlng","LNG"],["pin20","IN20"]] },
    { id: "ret", label: "Returns", test: (s) => s.kr || s.pr, cols: [["g","G"],["kr","KR"],["kryds","KR YDS"],["krtd","KR TD"],["pr","PR"],["pryds","PR YDS"],["prtd","PR TD"]] },
    { id: "snaps", label: "Snaps (PFR, 2012+)", test: (s) => s.snp, cols: [["gp_snaps","GP"],["off","OFF"],["def","DEF"],["st","ST"]] }
  ];
  const ORDER = { QB:["pass","rush"], RB:["rush","rec","ret"], WR:["rec","rush","ret"], TE:["rec"], K:["kick"], P:["punt"] };
  function derive(s) {
    const d = Object.assign({}, s, s.snp || {});
    const r = (a, b, n) => (b ? (a / b).toFixed(n) : "—");
    d.pct = s.att ? r(100 * (s.cmp || 0), s.att, 1) : "—"; d.ypa = r(s.pyds || 0, s.att, 1);
    d.ypc = r(s.ryds || 0, s.car, 1); d.ypr = r(s.recyds || 0, s.rec, 1);
    d.tot = (s.solo || 0) + (s.ast || 0); d.fgpct = s.fga ? r(100 * (s.fgm || 0), s.fga, 1) : "—";
    d.pavg = r(s.puntyds || 0, s.punts, 1);
    return d;
  }
  function groupsFor(c) {
    const all = (c.seasons || []).concat(c.career ? [c.career] : []);
    const pref = ORDER[c.pos] || [];
    const ids = GROUPS.filter((g) => all.some((s) => g.test(Object.assign({}, s)))).map((g) => g.id);
    return ids.sort((a, b) => (pref.indexOf(a) < 0 ? 99 : pref.indexOf(a)) - (pref.indexOf(b) < 0 ? 99 : pref.indexOf(b)));
  }
  function careerSnaps(c) {
    const t = { gp_snaps: 0, off: 0, def: 0, st: 0 }; let any = false;
    (c.seasons || []).forEach((s) => { if (s.snp) { any = true; t.gp_snaps += s.gp_snaps || 0; t.off += s.snp.off; t.def += s.snp.def; t.st += s.snp.st; } });
    return any ? t : null;
  }
  function tableHtml(c, gid) {
    const g = GROUPS.find((x) => x.id === gid);
    const rows = (c.seasons || []).filter((s) => (gid === "snaps" ? !!s.snp : !!g.test(s)));
    const fmt = (v) => (v == null || v === "" ? 0 : v);
    const tr = (s, lab, team, cls) => {
      const d = derive(s);
      const ck = s.corr ? Object.keys(s.corr).filter((k) => ["solo","ast","ff"].indexOf(k) < 0) : [];
      const flag = ck.length ? ` <span class="afc-corr" title="Corrected to ESPN official: ${ck.map((k)=>k+' was '+s.corr[k]).join(', ')}">✓</span>` : (s.src === "ESPN" ? ' <span class="afc-corr" title="Season from ESPN (missing in nflverse)">E</span>' : "");
      return `<tr class="${cls||""}"><td>${lab}${flag}</td><td>${team || ""}</td>${g.cols.map(([k]) => `<td>${fmt(d[k])}</td>`).join("")}</tr>`;
    };
    let tot = gid === "snaps" ? careerSnaps(c) : c.career;
    return `<div class="afc-group"><div class="afc-glabel">${g.label}</div><div class="afc-scroll"><table class="afc-table"><thead><tr><th>Season</th><th>Team</th>${g.cols.map(([,l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rows.map((s) => tr(s, s.season, s.team)).join("")}${tot ? tr(tot, "Career", (c.career && c.career.seasons ? c.career.seasons + " yrs" : ""), "afc-total") : ""}</tbody></table></div></div>`;
  }
  function statsHtml(playerId) {
    const c = (W.AFACareers || {})[playerId];
    if (!c) return `<div class="afc-empty">${NR}</div>`;
    if (c.status === "unmatched") return `<div class="afc-empty">NFL stats ${NR} (player id could not be matched to NFL stat sources)</div>`;
    if (c.status === "no_stats") return `<div class="afc-empty">No NFL regular-season stats</div>`;
    const gs = groupsFor(c);
    const note = c.status === "snaps_only" ? `<div class="afc-note">Played (PFR snap counts) — no recorded counting stats.</div>` : "";
    return `<div class="afc-wrap">${note}${gs.map((g) => tableHtml(c, g)).join("")}<div class="afc-src">Regular season only. Source: nflverse player_stats (1999–2026 to date) + PFR snap counts; verified against ESPN; ✓ = corrected to ESPN official value. Tackles = ESPN official.</div></div>`;
  }
  W.AFACareersUI = { statsHtml, groupsFor, derive, GROUPS };
})(window);
