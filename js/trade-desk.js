/* Trade window and CPU reply words. The 2026 NFL deadline was
 * Tuesday, Nov 10, 2026, 4:00 PM America/New_York, after Week 10.
 * This league uses that shape: open through Week 10, locked after,
 * open again once the regular season is over.
 */
(function (root) {
  "use strict";

  var DEADLINE_NOTE = "The 2026 NFL trade deadline was Tuesday, Nov 10, 2026, at 4:00 PM ET, after Week 10.";

  function tradeWindow(state) {
    state = state || {};
    var week = state.week | 0;
    var inSeason = !!(state.seasonStarted && !state.seasonDone);
    if (!inSeason) {
      return { open: true, label: "Offseason. Trades are open.", detail: DEADLINE_NOTE, weeksLeft: null };
    }
    if (week > 10) {
      return { open: false, label: "Trade deadline has passed.", detail: DEADLINE_NOTE + " Deals lock after Week 10 and reopen in the offseason.", weeksLeft: 0 };
    }
    var left = 11 - week;
    return {
      open: true,
      label: left <= 1 ? "Deadline week. Trades lock after Week 10." : left + " weeks until the Week 10 deadline.",
      detail: DEADLINE_NOTE,
      weeksLeft: left
    };
  }

  function cpuReply(evaluation) {
    var primary = (evaluation && evaluation.primary) || {};
    var status = primary.status;
    if (evaluation && evaluation.accepted) {
      return { decision: "Accept", reason: "Fair value." };
    }
    if (status === "close") {
      return { decision: "Counter", reason: "not enough value" };
    }
    if (status === "empty") {
      return { decision: "Decline", reason: "Add players or picks on both sides." };
    }
    var detail = String(primary.detail || "");
    if (/cornerstone|need/i.test(detail) || (primary.notes || []).some(function (n) { return /need|cornerstone/.test(n); })) {
      return { decision: "Decline", reason: "positional need" };
    }
    return { decision: "Decline", reason: "not enough value" };
  }

  root.AFATradeDesk = {
    DEADLINE_NOTE: DEADLINE_NOTE,
    tradeWindow: tradeWindow,
    cpuReply: cpuReply
  };
})(typeof window !== "undefined" ? window : globalThis);
