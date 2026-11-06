/* AFA bridge v0.1.14 — grading seed, systems helpers, formations, hooks for stadiums/dynasty */
(function (root) {
  'use strict';
  const AFA_CAP = 279200000;

  const FORMATIONS = {
    "11": { label: "11 personnel · 3WR 1TE 1RB",
      slots: [
        { role: "WR", slot: "X", label: "X (SE)", from: "WR", ord: 0, x: 6, y: 44 },
        { role: "WR", slot: "SL", label: "Slot", from: "WR", ord: 2, x: 24, y: 30 },
        { role: "TE", slot: "Y", label: "Y (TE)", from: "TE", ord: 0, x: 90, y: 46 },
        { role: "WR", slot: "Z", label: "Z (FL)", from: "WR", ord: 1, x: 94, y: 28 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 28, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 39, y: 46 },
        { role: "C", slot: "C", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 61, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 72, y: 46 },
        { role: "QB", slot: "QB", from: "QB", ord: 0, x: 50, y: 62 },
        { role: "RB", slot: "HB", from: "RB", ord: 0, x: 50, y: 76 }
      ]},
    "12": { label: "12 personnel · 2WR 2TE 1RB",
      slots: [
        { role: "WR", slot: "X", label: "X (SE)", from: "WR", ord: 0, x: 6, y: 44 },
        { role: "TE", slot: "Y", label: "Y (TE)", from: "TE", ord: 0, x: 18, y: 46 },
        { role: "TE", slot: "U", label: "U (TE)", from: "TE", ord: 1, x: 84, y: 46 },
        { role: "WR", slot: "Z", label: "Z (FL)", from: "WR", ord: 1, x: 94, y: 28 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 30, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 40, y: 46 },
        { role: "C", slot: "C", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 60, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 70, y: 46 },
        { role: "QB", slot: "QB", from: "QB", ord: 0, x: 50, y: 62 },
        { role: "RB", slot: "HB", from: "RB", ord: 0, x: 50, y: 76 }
      ]},
    "21": { label: "21 personnel · 2WR 1TE 2RB",
      slots: [
        { role: "WR", slot: "X", label: "X (SE)", from: "WR", ord: 0, x: 6, y: 44 },
        { role: "TE", slot: "Y", label: "Y (TE)", from: "TE", ord: 0, x: 84, y: 46 },
        { role: "WR", slot: "Z", label: "Z (FL)", from: "WR", ord: 1, x: 94, y: 28 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 28, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 39, y: 46 },
        { role: "C", slot: "C", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 61, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 72, y: 46 },
        { role: "QB", slot: "QB", from: "QB", ord: 0, x: 50, y: 60 },
        { role: "RB", slot: "HB", from: "RB", ord: 0, x: 42, y: 74 },
        { role: "RB", slot: "FB", from: "RB", ord: 1, x: 58, y: 70 }
      ]},
    "10": { label: "10 personnel · 4WR 0TE 1RB",
      slots: [
        { role: "WR", slot: "X", label: "X (SE)", from: "WR", ord: 0, x: 5, y: 44 },
        { role: "WR", slot: "SL", label: "Slot L", from: "WR", ord: 2, x: 22, y: 30 },
        { role: "WR", slot: "SR", label: "Slot R", from: "WR", ord: 3, x: 78, y: 30 },
        { role: "WR", slot: "Z", label: "Z (FL)", from: "WR", ord: 1, x: 95, y: 28 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 28, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 39, y: 46 },
        { role: "C", slot: "C", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 61, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 72, y: 46 },
        { role: "QB", slot: "QB", from: "QB", ord: 0, x: 50, y: 62 },
        { role: "RB", slot: "HB", from: "RB", ord: 0, x: 50, y: 76 }
      ]}
  };

  function validateLineupGeometry(slots) {
    const issues = [];
    const pts = (slots || []).filter((s) => s && s.x != null);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (dist < 6) issues.push("overlap " + pts[i].slot + "/" + pts[j].slot + " d=" + dist.toFixed(1));
      }
    }
    pts.filter((s) => ["LT","LG","C","RG","RT"].includes(s.slot)).forEach((s) => {
      if (s.y < 40 || s.y > 52) issues.push("OL " + s.slot + " not on LOS y=" + s.y);
    });
    const xSlot = pts.find((s) => s.slot === "X");
    const zSlot = pts.find((s) => s.slot === "Z");
    if (xSlot && Math.abs(xSlot.y - 46) > 8) issues.push("X should be on/near LOS");
    if (zSlot && zSlot.y >= 40) issues.push("Z should be off LOS (flanker)");
    const te = pts.find((s) => s.slot === "Y" || s.slot === "TE");
    if (te && te.x > 40 && te.x < 60) issues.push("TE should not sit in center of field");
    return issues;
  }

  function veteranContractFor(p) {
    const ovr = p.ovrBase != null ? p.ovrBase : (p.ovr || 70);
    const age = p.age || 27;
    const posMul = ({ QB: 1.55, WR: 1.15, OT: 1.2, DE: 1.18, CB: 1.1, TE: 1.05, RB: 0.85, K: 0.35, P: 0.32 })[p.pos] || 1;
    // Founding-league scale: tuned so a balanced 53-man sits near AFA_CAP (~$279.2M)
    let apy = 750000;
    if (ovr >= 95) apy = 22000000;
    else if (ovr >= 90) apy = 14000000;
    else if (ovr >= 85) apy = 8500000;
    else if (ovr >= 80) apy = 4800000;
    else if (ovr >= 75) apy = 2400000;
    else if (ovr >= 70) apy = 1400000;
    else apy = 850000;
    apy = Math.round(apy * posMul);
    if (age >= 32) apy = Math.round(apy * 0.85);
    if (age >= 35) apy = Math.round(apy * 0.75);
    const years = age >= 33 ? 1 : age >= 30 ? 2 : ovr >= 88 ? 4 : 3;
    return { apy: apy, capHit: apy, yearsRemaining: years, totalValue: apy * years, signingBonus: Math.round(apy * 0.2), kind: "veteran-founding" };
  }

  function formatMoney(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + n;
  }

  function gradeDeltaBadge(p) {
    if (!p || p.ovrBase == null) return "";
    const d = (p.ovr | 0) - (p.ovrBase | 0);
    if (d >= 2) return '<span class="grade-badge up" title="Stat grade vs base">▲' + d + "</span>";
    if (d <= -2) return '<span class="grade-badge down" title="Stat grade vs base">▼' + Math.abs(d) + "</span>";
    return '<span class="grade-badge flat" title="Near base">•</span>';
  }

  /** Hook registry — stadiums/ and dynasty/ modules register here later without editing core. */
  const hooks = {
    stadiums: null,
    dynasty: null,
    onWeekSim: [],
    onSeasonEnd: [],
    onCollegePick: [],
    run: function (name, payload) {
      (this[name] || []).forEach(function (fn) { try { fn(payload); } catch (e) { console.warn("hook", name, e); } });
      if (name === "onSeasonEnd" && this.stadiums && typeof this.stadiums.onSeasonEnd === "function") this.stadiums.onSeasonEnd(payload);
      if (name === "onSeasonEnd" && this.dynasty && typeof this.dynasty.onSeasonEnd === "function") this.dynasty.onSeasonEnd(payload);
    }
  };

  root.AFABridge = {
    version: "0.1.14",
    AFA_CAP: AFA_CAP,
    FORMATIONS: FORMATIONS,
    validateLineupGeometry: validateLineupGeometry,
    veteranContractFor: veteranContractFor,
    formatMoney: formatMoney,
    gradeDeltaBadge: gradeDeltaBadge,
    hooks: hooks
  };
})(typeof window !== "undefined" ? window : globalThis);
