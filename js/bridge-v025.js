/* AFA bridge v0.1.15 / v025 — formations (O/D/ST), geometry, hooks, gameday helpers */
(function (root) {
  "use strict";
  const prev = root.AFABridge || {};
  const AFA_CAP = prev.AFA_CAP || 279200000;

  const OFFENSE = prev.FORMATIONS || {};
  // Ensure 10/11/12/21 exist even if prev missing
  if (!OFFENSE["11"]) {
    /* fallback minimal — prefer loaded v024 */
  }

  const DEFENSE = {
    "base43": { label: "Base 4-3",
      slots: [
        { role: "DE", slot: "LE", from: "DE", ord: 0, x: 18, y: 28 },
        { role: "DT", slot: "DT", from: "DT", ord: 0, x: 38, y: 28 },
        { role: "DT", slot: "NT", from: "DT", ord: 1, x: 62, y: 28 },
        { role: "DE", slot: "RE", from: "DE", ord: 1, x: 82, y: 28 },
        { role: "LB", slot: "LOLB", from: "LB", ord: 0, x: 22, y: 48 },
        { role: "LB", slot: "MLB", from: "LB", ord: 1, x: 50, y: 48 },
        { role: "LB", slot: "ROLB", from: "LB", ord: 2, x: 78, y: 48 },
        { role: "CB", slot: "CB1", from: "CB", ord: 0, x: 8, y: 68 },
        { role: "CB", slot: "CB2", from: "CB", ord: 1, x: 92, y: 68 },
        { role: "S", slot: "FS", from: "S", ord: 0, x: 36, y: 80 },
        { role: "S", slot: "SS", from: "S", ord: 1, x: 64, y: 80 }
      ]},
    "nickel": { label: "Nickel 4-2-5",
      slots: [
        { role: "DE", slot: "LE", from: "DE", ord: 0, x: 18, y: 28 },
        { role: "DT", slot: "DT", from: "DT", ord: 0, x: 38, y: 28 },
        { role: "DT", slot: "NT", from: "DT", ord: 1, x: 62, y: 28 },
        { role: "DE", slot: "RE", from: "DE", ord: 1, x: 82, y: 28 },
        { role: "LB", slot: "MLB", from: "LB", ord: 0, x: 40, y: 48 },
        { role: "LB", slot: "WLB", from: "LB", ord: 1, x: 60, y: 48 },
        { role: "CB", slot: "NB", from: "CB", ord: 2, x: 50, y: 58 },
        { role: "CB", slot: "CB1", from: "CB", ord: 0, x: 8, y: 68 },
        { role: "CB", slot: "CB2", from: "CB", ord: 1, x: 92, y: 68 },
        { role: "S", slot: "FS", from: "S", ord: 0, x: 36, y: 80 },
        { role: "S", slot: "SS", from: "S", ord: 1, x: 64, y: 80 }
      ]},
    "dime": { label: "Dime 4-1-6",
      slots: [
        { role: "DE", slot: "LE", from: "DE", ord: 0, x: 20, y: 28 },
        { role: "DT", slot: "DT", from: "DT", ord: 0, x: 40, y: 28 },
        { role: "DT", slot: "NT", from: "DT", ord: 1, x: 60, y: 28 },
        { role: "DE", slot: "RE", from: "DE", ord: 1, x: 80, y: 28 },
        { role: "LB", slot: "MLB", from: "LB", ord: 0, x: 50, y: 46 },
        { role: "CB", slot: "NB", from: "CB", ord: 2, x: 30, y: 58 },
        { role: "CB", slot: "DB", from: "CB", ord: 3, x: 70, y: 58 },
        { role: "CB", slot: "CB1", from: "CB", ord: 0, x: 8, y: 68 },
        { role: "CB", slot: "CB2", from: "CB", ord: 1, x: 92, y: 68 },
        { role: "S", slot: "FS", from: "S", ord: 0, x: 36, y: 82 },
        { role: "S", slot: "SS", from: "S", ord: 1, x: 64, y: 82 }
      ]}
  };

  const SPECIAL = {
    "fg": { label: "FG unit",
      slots: [
        { role: "K", slot: "K", from: "K", ord: 0, x: 50, y: 78 },
        { role: "P", slot: "H", from: "P", ord: 0, x: 50, y: 68 },
        { role: "C", slot: "LS", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 38, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 62, y: 46 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 26, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 74, y: 46 },
        { role: "TE", slot: "TE", from: "TE", ord: 0, x: 86, y: 46 },
        { role: "LB", slot: "LE", from: "LB", ord: 0, x: 14, y: 46 },
        { role: "WR", slot: "SE", from: "WR", ord: 0, x: 6, y: 44 },
        { role: "S", slot: "WING", from: "S", ord: 0, x: 94, y: 44 }
      ]},
    "punt": { label: "Punt unit",
      slots: [
        { role: "P", slot: "P", from: "P", ord: 0, x: 50, y: 78 },
        { role: "C", slot: "LS", from: "C", ord: 0, x: 50, y: 46 },
        { role: "OG", slot: "LG", from: "OG", ord: 0, x: 38, y: 46 },
        { role: "OG", slot: "RG", from: "OG", ord: 1, x: 62, y: 46 },
        { role: "OT", slot: "LT", from: "OT", ord: 0, x: 26, y: 46 },
        { role: "OT", slot: "RT", from: "OT", ord: 1, x: 74, y: 46 },
        { role: "TE", slot: "TE", from: "TE", ord: 0, x: 86, y: 46 },
        { role: "LB", slot: "PLB", from: "LB", ord: 0, x: 14, y: 46 },
        { role: "WR", slot: "GUN1", from: "WR", ord: 0, x: 8, y: 30 },
        { role: "WR", slot: "GUN2", from: "WR", ord: 1, x: 92, y: 30 },
        { role: "S", slot: "PP", from: "S", ord: 0, x: 50, y: 62 }
      ]},
    "ko": { label: "Kickoff",
      slots: [
        { role: "K", slot: "K", from: "K", ord: 0, x: 50, y: 70 },
        { role: "LB", slot: "L1", from: "LB", ord: 0, x: 12, y: 50 },
        { role: "LB", slot: "L2", from: "LB", ord: 1, x: 28, y: 50 },
        { role: "S", slot: "L3", from: "S", ord: 0, x: 40, y: 50 },
        { role: "S", slot: "R3", from: "S", ord: 1, x: 60, y: 50 },
        { role: "CB", slot: "R2", from: "CB", ord: 0, x: 72, y: 50 },
        { role: "CB", slot: "R1", from: "CB", ord: 1, x: 88, y: 50 },
        { role: "WR", slot: "W1", from: "WR", ord: 0, x: 20, y: 58 },
        { role: "WR", slot: "W2", from: "WR", ord: 1, x: 80, y: 58 },
        { role: "RB", slot: "FB", from: "RB", ord: 0, x: 50, y: 58 },
        { role: "TE", slot: "TE", from: "TE", ord: 0, x: 34, y: 42 }
      ]}
  };

  function validateLineupGeometry(slots) {
    const issues = [];
    const pts = (slots || []).filter((s) => s && s.x != null);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (dist < 5.5) issues.push("overlap " + pts[i].slot + "/" + pts[j].slot + " d=" + dist.toFixed(1));
      }
    }
    const xSlot = pts.find((s) => s.slot === "X");
    const zSlot = pts.find((s) => s.slot === "Z");
    if (xSlot && Math.abs(xSlot.y - 46) > 10) issues.push("X should be on/near LOS");
    if (zSlot && zSlot.y >= 40) issues.push("Z should be off LOS (flanker)");
    const te = pts.find((s) => s.slot === "Y" || s.slot === "TE");
    if (te && te.x > 40 && te.x < 60 && te.role === "TE") issues.push("TE should not sit in center of field");
    // OL monotonic x
    const ol = ["LT","LG","C","RG","RT"].map((id) => pts.find((s) => s.slot === id)).filter(Boolean);
    for (let i = 1; i < ol.length; i++) {
      if (ol[i].x <= ol[i - 1].x) issues.push("OL order " + ol[i - 1].slot + "/" + ol[i].slot);
    }
    // CB sides
    const cb1 = pts.find((s) => s.slot === "CB1");
    const cb2 = pts.find((s) => s.slot === "CB2");
    if (cb1 && cb2 && cb1.x >= cb2.x) issues.push("CB1 should be left of CB2");
    return issues;
  }

  const hooks = prev.hooks || {
    stadiums: null, dynasty: null, gameday: null,
    onWeekSim: [], onSeasonEnd: [], onCollegePick: [], onGameSim: [],
    run: function (name, payload) {
      (this[name] || []).forEach(function (fn) { try { fn(payload); } catch (e) { console.warn("hook", name, e); } });
    }
  };

  root.AFABridge = Object.assign({}, prev, {
    version: "0.1.15",
    AFA_CAP: AFA_CAP,
    FORMATIONS: OFFENSE,
    DEFENSE_FORMATIONS: DEFENSE,
    SPECIAL_FORMATIONS: SPECIAL,
    validateLineupGeometry: validateLineupGeometry,
    hooks: hooks,
    veteranContractFor: prev.veteranContractFor,
    formatMoney: prev.formatMoney,
    gradeDeltaBadge: prev.gradeDeltaBadge
  });
})(typeof window !== "undefined" ? window : globalThis);
