/**
 * AFASystems.rookieScale — 2011+ CBA rookie wage scale mirror
 * Public API: rookieContract(overallPick, year, capScale)
 */
(function (root) {
  "use strict";

  const REF_CAP = 279200000; // NFL 2025 official cap

  function getData() {
    const pack = root.AFASystemsData || (typeof require !== "undefined" ? require("./systems-data-bundle.js") : null);
    if (!pack) throw new Error("AFASystemsData missing — load systems/data-bundle.js first");
    return pack["rookie-scale-2025"];
  }

  function clampPick(n) {
    n = Math.round(Number(n) || 0);
    if (n <= 0) return 0; // UDFA sentinel
    return Math.max(1, Math.min(257, n));
  }

  function scaleMoney(x, capScale) {
    const scale = capScale == null ? 1 : Number(capScale);
    return Math.round(Number(x) * scale);
  }

  /**
   * capScale: absolute AFA cap / REF_CAP, OR pass { afaCap } / { capScale }.
   * If app has no cap yet, default scale = 1 (2025 NFL dollars).
   */
  function resolveCapScale(capScale) {
    if (capScale == null) return 1;
    if (typeof capScale === "number") {
      // Heuristic: values > 1000 are absolute caps
      if (capScale > 1000) return capScale / REF_CAP;
      return capScale;
    }
    if (typeof capScale === "object") {
      if (capScale.capScale != null) return Number(capScale.capScale);
      if (capScale.afaCap != null) return Number(capScale.afaCap) / REF_CAP;
      if (capScale.cap != null) return Number(capScale.cap) / REF_CAP;
    }
    return 1;
  }

  function fifthYearOptionPrice(pos, tier, capScale) {
    const data = getData();
    const tiers = data.fifthYearOption.tiersByPos[pos] || data.fifthYearOption.tiersByPos.WR;
    const key = tier || "playtime";
    const raw = tiers[key] != null ? tiers[key] : tiers.playtime;
    return {
      amount: scaleMoney(raw, capScale),
      tier: key,
      fullyGuaranteed: true,
      status: tiers.status || "otc-projection",
      rules: data.fifthYearOption.rules
    };
  }

  function undraftedContract(year, capScale) {
    const data = getData();
    const u = data.udfa.typicalUdfaDeal;
    const min = data.udfa.rookieMinimum2025;
    const sc = resolveCapScale(capScale);
    const total = scaleMoney(u.totalValue, sc);
    const sb = scaleMoney(u.signingBonus, sc);
    const years = u.years;
    // Rough even base after SB
    const basePool = total - sb;
    const yearlyBase = [];
    for (let i = 0; i < years; i++) {
      yearlyBase.push(scaleMoney(Math.round(basePool / years), 1));
    }
    // Ensure at least scaled minimum in year 1
    const y1min = scaleMoney(min, sc);
    if (yearlyBase[0] < y1min) yearlyBase[0] = y1min;
    const prorate = Math.round(sb / years);
    const capHits = yearlyBase.map((b) => b + prorate);
    return {
      overallPick: null,
      undrafted: true,
      year: year || 2025,
      years: years,
      yearsRemaining: years,
      totalValue: total,
      signingBonus: sb,
      signingBonusProration: prorate,
      signingBonusStatus: u.signingBonusStatus,
      yearlyBase: yearlyBase,
      yearlyCapHits: capHits,
      apy: Math.round(total / years),
      capHit: capHits[0],
      fullyGuaranteed: false,
      fifthYearOption: null,
      slotStatus: "udfa-estimate",
      capScale: sc,
      referenceCap: REF_CAP
    };
  }

  /**
   * rookieContract(overallPick, year, capScale)
   * overallPick: 1..257 for drafted; 0/null/undefined → UDFA
   */
  function rookieContract(overallPick, year, capScale) {
    const sc = resolveCapScale(capScale);
    const pick = clampPick(overallPick);
    if (!pick) return undraftedContract(year, sc);

    const data = getData();
    const slot = data.slots[String(pick)];
    if (!slot) throw new Error("No rookie scale slot for pick " + pick);

    const total = scaleMoney(slot.totalValue, sc);
    const sb = scaleMoney(slot.signingBonus, sc);
    const prorate = scaleMoney(slot.signingBonusProration, sc);
    const yearly = slot.yearly.map((y) => scaleMoney(y, sc));
    // Spotrac yearly columns sum to total (cash profile). Cap hit ≈ yearly for model;
    // also expose explicit base≈ yearly - prorate (floored at 0) for clarity.
    const yearlyBase = yearly.map((y) => Math.max(0, y - prorate));
    const isFirst = pick <= 32;
    const fullyG = !!slot.fullyGuaranteedLikely; // R1 typically structured fully guaranteed

    return {
      overallPick: pick,
      undrafted: false,
      year: year || data.meta.year || 2025,
      years: 4,
      yearsRemaining: 4,
      totalValue: total,
      signingBonus: sb,
      signingBonusProration: prorate,
      signingBonusStatus: slot.signingBonusStatus,
      yearlyBase: yearlyBase,
      yearlyCapHits: yearly,
      apy: Math.round(total / 4),
      capHit: yearly[0],
      fullyGuaranteed: fullyG,
      fifthYearOptionEligible: isFirst,
      fifthYearOption: isFirst
        ? {
            eligible: true,
            // Price depends on position + performance tier at exercise time
            priceFor: function (pos, tier) {
              return fifthYearOptionPrice(pos, tier, sc);
            },
            rules: data.fifthYearOption.rules
          }
        : null,
      slotStatus: slot.slotStatus,
      capScale: sc,
      referenceCap: REF_CAP,
      meta: {
        sourceYear: data.meta.year,
        sources: data.meta.sources
      }
    };
  }

  /** Sum of slot totals for picks 1..n (useful for pool checks). */
  function rookiePoolSum(fromPick, toPick, capScale) {
    const sc = resolveCapScale(capScale);
    let sum = 0;
    for (let p = fromPick; p <= toPick; p++) {
      sum += rookieContract(p, 2025, sc).totalValue;
    }
    return sum;
  }

  const api = {
    REF_CAP,
    REF_CAP_2025: REF_CAP,
    REF_CAP_2026: 301200000,
    resolveCapScale,
    rookieContract,
    undraftedContract,
    fifthYearOptionPrice,
    rookiePoolSum
  };

  root.AFASystems = root.AFASystems || {};
  root.AFASystems.rookieScale = api;
  // Convenience top-level alias requested by brief
  root.AFASystems.rookieContract = rookieContract;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
