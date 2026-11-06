/* GM Franchise Builder — scout profiles (face + Madden / PFF / GMFB grades)
   GMFB grade algorithm is intentionally versioned (v0.1) so we can iterate. */
(function (root) {
  const AFA = root.AFA;
  if (!AFA || !AFA.PLAYERS) return;

  const GMFB_ALGO = {
    version: "0.2",
    label: "GMFB grade · algo v0.2",
    note: "Blend of Madden OVR, estimated PFF-style overall, athleticism, age curve, plus a capped Sleeper ADP consideration (12% weight, max ±3)."
  };

  const COLLEGES = [
    "Alabama","Georgia","Ohio State","Michigan","Texas","Oregon","Penn State","LSU",
    "USC","Notre Dame","Florida","Florida State","Miami","Clemson","Oklahoma","Texas A&M",
    "Tennessee","Wisconsin","Iowa","Utah","Washington","Oregon State","Auburn","Missouri",
    "Ole Miss","Mississippi State","Arkansas","Kentucky","South Carolina","North Carolina",
    "NC State","Duke","Wake Forest","Virginia Tech","Pitt","West Virginia","Louisville",
    "Cincinnati","UCF","Boise State","Fresno State","San Diego State","Colorado","UCLA",
    "Stanford","Cal","Arizona State","Arizona","BYU","Tulsa","Memphis","SMU","Tulane"
  ];

  const POS_SIZE = {
    QB: [74, 78, 210, 235], RB: [68, 73, 195, 230], WR: [69, 76, 180, 220],
    TE: [74, 79, 240, 265], OT: [76, 81, 305, 340], OG: [74, 79, 305, 335],
    C: [73, 77, 295, 320], DE: [74, 79, 255, 295], DT: [73, 78, 300, 340],
    LB: [72, 76, 225, 255], CB: [69, 74, 180, 205], S: [70, 75, 195, 220],
    K: [70, 75, 180, 215], P: [72, 77, 190, 225]
  };

  const POS_SKILLS = {
    QB: [["THP","Throw Power"],["SAC","Short Acc."],["MAC","Med Acc."],["DAC","Deep Acc."],["RUN","Speed"],["PAC","Play Action"],["TUP","Throw Under Pressure"],["AWR","Awareness"]],
    RB: [["SPD","Speed"],["ACC","Acceleration"],["AGI","Agility"],["ELU","Elusiveness"],["BCV","Ball Carrier Vision"],["CAR","Carrying"],["TRK","Trucking"],["JKM","Juke Move"]],
    WR: [["SPD","Speed"],["ACC","Acceleration"],["CTH","Catching"],["CIT","Catch in Traffic"],["SPC","Spectacular Catch"],["SRR","Short Routes"],["MRR","Med Routes"],["REL","Release"]],
    TE: [["CTH","Catching"],["CIT","Catch in Traffic"],["STR","Strength"],["RBK","Run Block"],["PBK","Pass Block"],["SRR","Short Routes"],["SPD","Speed"],["AWR","Awareness"]],
    OT: [["PBK","Pass Block"],["RBK","Run Block"],["STR","Strength"],["AWR","Awareness"],["PBKPOW","PBK Power"],["PBKFEN","PBK Finesse"],["RBKPOW","RBK Power"],["IBK","Impact Block"]],
    OG: [["PBK","Pass Block"],["RBK","Run Block"],["STR","Strength"],["AWR","Awareness"],["PBKPOW","PBK Power"],["RBKPOW","RBK Power"],["AGI","Agility"],["IBK","Impact Block"]],
    C: [["PBK","Pass Block"],["RBK","Run Block"],["STR","Strength"],["AWR","Awareness"],["PBKPOW","PBK Power"],["RBKPOW","RBK Power"],["IQ","Football IQ"],["IBK","Impact Block"]],
    DE: [["PMV","Power Moves"],["FMV","Finesse Moves"],["BSH","Block Shed"],["PUR","Pursuit"],["SPD","Speed"],["STR","Strength"],["PRC","Play Rec"],["AWR","Awareness"]],
    DT: [["PMV","Power Moves"],["BSH","Block Shed"],["STR","Strength"],["PUR","Pursuit"],["TCK","Tackle"],["PRC","Play Rec"],["AWR","Awareness"],["FMV","Finesse Moves"]],
    LB: [["TCK","Tackle"],["PUR","Pursuit"],["PRC","Play Rec"],["ZCV","Zone Cover"],["MCV","Man Cover"],["BSH","Block Shed"],["SPD","Speed"],["AWR","Awareness"]],
    CB: [["MCV","Man Cover"],["ZCV","Zone Cover"],["PRS","Press"],["SPD","Speed"],["ACC","Acceleration"],["PRC","Play Rec"],["CTH","Catching"],["AWR","Awareness"]],
    S: [["ZCV","Zone Cover"],["MCV","Man Cover"],["HIT","Hit Power"],["PUR","Pursuit"],["PRC","Play Rec"],["SPD","Speed"],["TCK","Tackle"],["AWR","Awareness"]],
    K: [["KPW","Kick Power"],["KAC","Kick Accuracy"],["AWR","Awareness"],["STR","Strength"],["SPD","Speed"],["ACC","Acceleration"],["AGI","Agility"],["JMP","Jump"]],
    P: [["KPW","Punt Power"],["KAC","Punt Accuracy"],["AWR","Awareness"],["STR","Strength"],["SPD","Speed"],["ACC","Acceleration"],["AGI","Agility"],["JMP","Jump"]]
  };

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round1(n) { return Math.round(n * 10) / 10; }

  function inchesToHt(total) {
    const ft = Math.floor(total / 12);
    const inch = total % 12;
    return ft + "'" + inch + '"';
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  function jerseyLabel(player) {
    const rawNum = player.number;
    if (rawNum != null && Number(rawNum) > 0) return String(Number(rawNum));
    return "—";
  }

  function headshotUrl(player) {
    if (player.sleeperId) return "https://sleepercdn.com/content/nfl/players/" + player.sleeperId + ".jpg";
    if (player.espnId) return "https://a.espncdn.com/i/headshots/nfl/players/full/" + player.espnId + ".png";
    return null;
  }

  // Fallback plate only when no real headshot — NEVER invent a jersey number
  function faceSvg(player) {
    const h = hashStr(player.id + "|" + player.name);
    const jerseys = ["#0a2a4a", "#6b1d1d", "#14532d", "#4a2c6a", "#1b365d", "#8b3a1a", "#1a1a1a", "#0e6b6b"];
    const jersey = jerseys[(h >>> 7) % jerseys.length];
    const num = jerseyLabel(player);
    const ini = initials(player.name);
    return (
      '<svg class="scout-face" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="sg' + player.id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#2a3344"/><stop offset="100%" stop-color="#0d121a"/></linearGradient></defs>' +
      '<rect width="120" height="140" rx="14" fill="url(#sg' + player.id + ')"/>' +
      '<rect x="18" y="36" width="84" height="86" rx="12" fill="' + jersey + '"/>' +
      '<text x="60" y="96" text-anchor="middle" font-size="42" font-weight="900" fill="#f0d078" font-family="Arial Black, Arial, sans-serif">' + num + '</text>' +
      '<rect x="8" y="8" width="36" height="18" rx="6" fill="rgba(0,0,0,0.45)"/>' +
      '<text x="26" y="21" text-anchor="middle" font-size="10" font-weight="700" fill="#e8eef8" font-family="Arial,sans-serif">' + ini + '</text>' +
      '<text x="112" y="20" text-anchor="end" font-size="11" font-weight="800" fill="#f0d078" font-family="Arial,sans-serif">' + player.pos + '</text>' +
      '</svg>'
    );
  }

  function faceHtml(player) {
    const num = jerseyLabel(player);
    const url = headshotUrl(player);
    const fallback = faceSvg(player);
    if (!url) {
      return '<div class="scout-face-wrap">' + fallback +
        '<span class="scout-jnum">#' + num + '</span></div>';
    }
    // Real NFL headshot = correct skin tone / likeness. Jersey badge always shows real #.
    return (
      '<div class="scout-face-wrap">' +
        '<img class="scout-face-photo" src="' + url + '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
          'onerror="this.remove();var f=this.parentNode&&this.parentNode.querySelector(\'.scout-face-fallback\');if(f)f.hidden=false;"/>' +
        '<div class="scout-face-fallback" hidden>' + fallback + '</div>' +
        '<span class="scout-jnum">#' + num + '</span>' +
        '<span class="scout-pos-badge">' + player.pos + '</span>' +
      '</div>'
    );
  }

  function buildAttrs(player, rng) {
    const ovr = player.ovr;
    const keys = POS_SKILLS[player.pos] || POS_SKILLS.WR;
    const base = clamp(ovr + Math.round((rng() - 0.5) * 4), 40, 99);
    const attrs = {};
    // Core athleticism always present
    attrs.SPD = clamp(base + Math.round((rng() - 0.45) * 18) - (["OT","OG","C","DT"].includes(player.pos) ? 12 : 0), 40, 99);
    attrs.ACC = clamp(attrs.SPD + Math.round((rng() - 0.5) * 8), 40, 99);
    attrs.AGI = clamp(attrs.SPD + Math.round((rng() - 0.5) * 10) - (["OT","OG","C","DT"].includes(player.pos) ? 10 : 0), 40, 99);
    attrs.STR = clamp(base + Math.round((rng() - 0.4) * 14) + (["OT","OG","C","DT","DE","TE"].includes(player.pos) ? 6 : -4), 40, 99);
    attrs.AWR = clamp(base + Math.round((rng() - 0.5) * 10) + (player.age >= 28 ? 3 : -1), 40, 99);
    keys.forEach(([code], i) => {
      if (attrs[code] != null) return;
      const wobble = Math.round((rng() - 0.5) * 16);
      const bias = (i < 3 ? 2 : -1);
      attrs[code] = clamp(base + wobble + bias, 40, 99);
    });
    return { keys, attrs };
  }

  function pffBundle(player, attrs, rng) {
    // PFF-style 0–100 with one decimal; overall tracks Madden with scout noise
    const overall = round1(clamp(38 + (player.ovr - 48) * 1.15 + (rng() - 0.5) * 6, 42, 99.5));
    const offense = ["QB","RB","WR","TE","OT","OG","C","K","P"].includes(player.pos);
    const side = offense ? "offense" : "defense";
    const grade = round1(clamp(overall + (rng() - 0.5) * 4, 40, 99.4));
    const pass = round1(clamp((attrs.attrs.AWR || player.ovr) * 0.9 + (rng() - 0.5) * 8, 40, 99));
    const run = round1(clamp((attrs.attrs.STR || player.ovr) * 0.88 + (rng() - 0.5) * 8, 40, 99));
    return {
      overall,
      side,
      grade,
      pass,
      run,
      label: offense ? "Offense" : "Defense",
      estimated: true,
      disclaimer: "Estimate — official PFF grades are paywalled"
    };
  }

  function gmfbGrade(player, maddenOvr, pffOverall, attrs) {
    const a = attrs.attrs;
    const athleticism = (a.SPD + a.ACC + a.AGI) / 3;
    const skillKeys = (attrs.keys || []).slice(0, 4).map((k) => k[0]);
    const skillVals = skillKeys.map((k) => a[k]).filter((n) => n != null);
    const skill = skillVals.length ? skillVals.reduce((s, n) => s + n, 0) / skillVals.length : maddenOvr;
    const age = player.age || 25;
    const ageFactor = age <= 23 ? 5 : age <= 26 ? 3 : age <= 29 ? 1 : age <= 32 ? -2 : -5;
    const raw = 0.40 * maddenOvr + 0.30 * pffOverall + 0.18 * athleticism + 0.12 * skill + ageFactor;
    const base = clamp(Math.round(raw), 40, 99);
    const sl = sleeperFactor(player, base);
    player._gmfbBase = base;
    player._sleeperFactor = sl;
    return sl ? clamp(Math.round(base + sl.adj), 40, 99) : base;
  }

  /* v0.1.21 Sleeper pillar ("market consideration"), ~12% of composite, capped.
   *  sleeperScore = 55 + 44 * positionalPct(ADP)      (adp_idp for defenders, adp_ppr for offense/K)
   *  if dynasty ADP valid: sleeperScore = 0.75*that + 0.25*(55 + 44*dynPct)   (small horizon nudge; age already in GMFB)
   *  composite = 0.88 * GMFB_base + 0.12 * sleeperScore
   *  adj = clamp(composite - GMFB_base, -3, +3)  → Sleeper never moves GMFB more than 3 points.
   *  Missing / 999 ADP → no adjustment (no penalty). search_rank is display-only. pts_ppr never used. */
  const SLEEPER_W = 0.12, SLEEPER_CAP = 3;
  function sleeperEntry(player) {
    const S = root.AFA_SLEEPER;
    return S && S.players ? S.players[player.id] || null : null;
  }
  function sleeperFactor(player, base) {
    const e = sleeperEntry(player);
    if (!e || e.adp == null || e.adpPct == null) return null;
    let score = 55 + 44 * e.adpPct;
    if (e.dynPct != null) score = 0.75 * score + 0.25 * (55 + 44 * e.dynPct);
    const comp = (1 - SLEEPER_W) * base + SLEEPER_W * score;
    const adj = Math.max(-SLEEPER_CAP, Math.min(SLEEPER_CAP, comp - base));
    return { score: Math.round(score), adj: Math.round(adj * 10) / 10, weight: SLEEPER_W, cap: SLEEPER_CAP };
  }
  const SL_LABELS = { gp: "GP", gs: "GS", pass_att: "Att", pass_cmp: "Cmp", pass_yd: "Pass yds", pass_td: "Pass TD", pass_int: "INT",
    rush_att: "Car", rush_yd: "Rush yds", rush_td: "Rush TD", rec_tgt: "Tgt", rec: "Rec", rec_yd: "Rec yds", rec_td: "Rec TD", fum_lost: "Fum lost",
    fgm: "FGM", fga: "FGA", xpm: "XPM", punts: "Punts", idp_tkl_solo: "Solo", idp_tkl_ast: "Ast", idp_tkl_loss: "TFL", idp_sack: "Sacks",
    idp_qb_hit: "QB hits", idp_pass_def: "PD", idp_int: "INT", idp_ff: "FF", idp_fum_rec: "FR", idp_def_td: "Def TD" };
  function sleeperHtml(player) {
    const S = root.AFA_SLEEPER, e = sleeperEntry(player);
    const NR = '<span class="sl-nr">Not on record</span>';
    if (!S) return "";
    if (!e) return `<div class="scout-section-label">Sleeper (${S.meta.season})</div><div class="sl-box">${NR} — no confident Sleeper match</div>`;
    const f = player._sleeperFactor;
    const snap = (a, b) => (e.st[a] && e.st[b] ? Math.round((100 * e.st[a]) / e.st[b]) + "%" : null);
    const sn = snap("off_snp", "tm_off_snp") || snap("def_snp", "tm_def_snp");
    const cells = Object.keys(SL_LABELS).filter((k) => e.st[k] != null && k !== "gs").slice(0, 9)
      .map((k) => `<div class="sl-stat"><span>${SL_LABELS[k]}</span><b>${Math.round(e.st[k] * 10) / 10}</b></div>`).join("");
    const chip = (cls, lab, val, sub) => `<div class="sl-chip ${cls}"><span>${lab}</span><b>${val}</b>${sub ? `<i>${sub}</i>` : ""}</div>`;
    return `<div class="scout-section-label">Sleeper market &amp; ${S.meta.season} stats <span class="est-tag">thru wk ${S.meta.week}</span></div>
      <div class="sl-box">
        <div class="sl-chips">
          ${chip("adp", "Sleeper ADP (" + e.adpKind + ")", e.adp != null ? e.adp.toFixed(1) : "Unranked", e.adpPct != null ? "top " + Math.max(1, Math.round((1 - e.adpPct) * 100)) + "% at pos" : "")}
          ${e.adpKind === "PPR" ? chip("dyn", "Dynasty ADP", e.dyn != null ? e.dyn.toFixed(1) : "Unranked", "") : ""}
          ${chip("pop", "Sleeper popularity", e.sr != null ? "#" + e.sr : "—", "search rank")}
          ${chip("adj", "GMFB Sleeper adj", f ? (f.adj > 0 ? "+" : "") + f.adj : "0", f ? "max ±" + f.cap : "no valid ADP")}
        </div>
        <div class="sl-meta">${e.team ? e.team : "Free Agent"} · ${e.dc ? e.dc + (e.dco ? " #" + e.dco : "") : "Depth: Not on record"}${sn ? " · Snaps " + sn : ""}${e.inj ? ` · <span class="sl-inj">${e.inj}${e.injPart ? " (" + e.injPart + ")" : ""}</span>` : ""}${e.yx != null ? " · Yr " + (e.yx + 1) : ""}</div>
        <div class="sl-stats">${cells || NR}</div>
        <div class="sl-src">Sleeper public API · ${String(S.meta.fetchedAt).slice(0, 10)} · ADP/popularity are market signals; GMFB stays the grade.</div>
      </div>`;
  }

  function enrichPlayer(player) {
    if (player.scout && player.scout.schema === 4) return player;
    player.scout = null;
    const rng = mulberry32(hashStr(player.id + ":scout:" + player.pos));
    const size = POS_SIZE[player.pos] || POS_SIZE.WR;
    const htIn = size[0] + Math.floor(rng() * (size[1] - size[0] + 1));
    const wt = size[2] + Math.floor(rng() * (size[3] - size[2] + 1));
    const college = COLLEGES[hashStr(player.id + "college") % COLLEGES.length];
    const built = buildAttrs(player, rng);
    const maddenOvr = player.ovr;
    const pff = pffBundle(player, built, rng);
    const gmfb = gmfbGrade(player, maddenOvr, pff.overall, built);
    // Prefer real NFL bio fields when present (from players-nfl.js)
    if (!player.height) player.height = inchesToHt(htIn);
    if (!player.weight) player.weight = wt;
    if (!player.college) player.college = college;
    if (player.number == null || Number(player.number) === 0) {
      player.number = null; // no verified NFL number — show em dash in UI
    } else {
      player.number = Number(player.number);
    }
    if (!player.hand) player.hand = rng() > 0.12 ? "Right" : "Left";
    player.scout = {
      schema: 4,
      face: faceHtml(player),
      madden: {
        ovr: maddenOvr,
        attrs: built.attrs,
        keys: built.keys
      },
      pff: pff,
      gmfb: {
        ovr: gmfb,
        base: player._gmfbBase,
        sleeper: player._sleeperFactor || null,
        version: GMFB_ALGO.version,
        label: GMFB_ALGO.label,
        note: GMFB_ALGO.note
      }
    };
    return player;
  }

  AFA.PLAYERS.forEach(enrichPlayer);
  // rebuild id index in case references changed (same objects)
  if (AFA.playerById) {
    /* playerById already points at enriched objects */
  }

  AFA.enrichPlayer = enrichPlayer;
  AFA.GMFB_ALGO = GMFB_ALGO;
  AFA.sleeperHtml = sleeperHtml;
  AFA.sleeperEntry = sleeperEntry;
  AFA.scoutFace = faceHtml;
  AFA.jerseyLabel = jerseyLabel;

  root.AFA = AFA;
})(window);
