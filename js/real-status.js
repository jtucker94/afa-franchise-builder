/* Verified real-world availability. Separate from base GMFB talent.
 * Injuries and confirmed suspensions can mark a player unavailable.
 * They never rewrite player.ovr, currentInjury, or onIR.
 * Rumors never apply. A headline with no player id is not status evidence.
 * Dated counting stats are not a form rating: form delta stays empty.
 */
(function (root) {
  "use strict";

  var UNAVAILABLE = { OUT: true, IR: true, PUP: true, SUS: true, SUSPENDED: true, SUSPENSION: true };

  function formAdjustment() {
    return {
      delta: null,
      cap: 3,
      applied: false,
      reason: "No evidence to adjust. Dated counting stats are on the player card. They are not a rate-versus-baseline model, so the stored GMFB overall stays as it is."
    };
  }

  function blank() {
    return {
      enabled: false,
      scope: null,
      confirmedAt: null,
      sourceFetchedAt: null,
      source: null,
      holds: {},
      form: formAdjustment()
    };
  }

  function fromInjury(injury) {
    if (injury == null || injury === "") {
      return { unavailable: false, evidence: "none", text: "Not listed" };
    }
    var key = String(injury).trim().toUpperCase();
    if (UNAVAILABLE[key]) {
      return { unavailable: true, evidence: "verified-status", text: String(injury) };
    }
    return { unavailable: false, evidence: "listed", text: String(injury) };
  }

  function evidenceFromNews(item) {
    if (!item) return { apply: false, reason: "no item" };
    if (item.flag === "rumor") return { apply: false, reason: "rumor" };
    if (!item.playerId) return { apply: false, reason: "no status evidence" };
    if (item.flag !== "verified") return { apply: false, reason: "not verified" };
    var text = [item.title, item.summary, item.status].filter(Boolean).join(" ");
    var confirmed = /\b(ruled out|on ir|injured reserve|suspended|suspension)\b/i.test(text);
    var soft = /\b(questionable|doubtful|game[- ]time)\b/i.test(text);
    if (!confirmed) return { apply: false, reason: soft ? "listed, not confirmed out" : "no status evidence" };
    return { apply: true, status: "verified-headline", reason: "verified headline includes a player id" };
  }

  function buildOverlay(players, avail, newsItems) {
    var newsByPlayer = {};
    (newsItems || []).forEach(function (item) {
      var ev = evidenceFromNews(item);
      if (ev.apply && item.playerId && !newsByPlayer[item.playerId]) newsByPlayer[item.playerId] = ev;
    });
    var holds = {};
    (players || []).forEach(function (p) {
      if (!p || !p.id) return;
      var base = p.ovr;
      var row = null;
      if (avail && avail.bySleeperId && p.sleeperId != null) row = avail.bySleeperId[String(p.sleeperId)] || null;
      var injury = fromInjury(row && row.injury);
      var newsEv = newsByPlayer[p.id];
      var unavailable = injury.unavailable || !!(newsEv && newsEv.apply);
      if (!unavailable) return;
      holds[p.id] = {
        unavailable: true,
        status: injury.unavailable ? injury.text : "verified-headline",
        evidence: injury.unavailable ? injury.evidence : "verified-headline",
        asOf: (avail && avail.fetchedAt) || null,
        source: (avail && avail.source) || "verified headline",
        baseOvr: base
      };
    });
    return { holds: holds, form: formAdjustment(), baseTalentChanged: false };
  }

  function snapshotBodies(players) {
    return (players || []).map(function (p) {
      return { id: p && p.id, ovr: p && p.ovr, onIR: p && p.onIR, injury: p && p.currentInjury };
    });
  }

  function bodiesSame(before, players) {
    var after = snapshotBodies(players);
    if (before.length !== after.length) return false;
    for (var i = 0; i < before.length; i++) {
      if (before[i].id !== after[i].id) return false;
      if (before[i].ovr !== after[i].ovr) return false;
      if (before[i].onIR !== after[i].onIR) return false;
      if (before[i].injury !== after[i].injury) return false;
    }
    return true;
  }

  function writeStatus(state, scope, avail, built, confirmedAt) {
    state.realWorldStatus = {
      enabled: true,
      scope: scope,
      confirmedAt: confirmedAt,
      sourceFetchedAt: (avail && avail.fetchedAt) || null,
      source: (avail && avail.source) || null,
      holds: built.holds,
      form: built.form
    };
    return state.realWorldStatus;
  }

  function enableNew(state, players, avail, newsItems, optedIn, nowIso) {
    if (!state) return blank();
    if (!optedIn) {
      state.realWorldStatus = blank();
      return { applied: false, status: state.realWorldStatus, reason: "opt-in off" };
    }
    if (!avail || !avail.bySleeperId) {
      state.realWorldStatus = blank();
      return { applied: false, status: state.realWorldStatus, reason: "snapshot missing" };
    }
    var before = snapshotBodies(players);
    var built = buildOverlay(players, avail, newsItems);
    writeStatus(state, "new-franchise", avail, built, nowIso || new Date().toISOString());
    return {
      applied: true,
      status: state.realWorldStatus,
      holds: Object.keys(built.holds).length,
      talentUntouched: bodiesSame(before, players)
    };
  }

  function confirmExisting(state, players, avail, newsItems, confirmed, nowIso) {
    if (!state) return { applied: false, reason: "no save" };
    if (!confirmed) return { applied: false, reason: "not confirmed", status: state.realWorldStatus || blank() };
    if (!avail || !avail.bySleeperId) return { applied: false, reason: "snapshot missing" };
    var before = snapshotBodies(players);
    var built = buildOverlay(players, avail, newsItems);
    writeStatus(state, "existing-save", avail, built, nowIso || new Date().toISOString());
    return {
      applied: true,
      status: state.realWorldStatus,
      holds: Object.keys(built.holds).length,
      talentUntouched: bodiesSame(before, players),
      timelineUntouched: bodiesSame(before, players)
    };
  }

  function migrate(state) {
    if (!state) return blank();
    var cur = state.realWorldStatus;
    if (!cur || typeof cur.enabled !== "boolean" || !cur.holds) {
      state.realWorldStatus = blank();
      return state.realWorldStatus;
    }
    if (cur.enabled && cur.scope !== "new-franchise" && cur.scope !== "existing-save") {
      cur.enabled = false;
    }
    if (!cur.form) cur.form = formAdjustment();
    return cur;
  }

  function blocks(status, playerOrId) {
    if (!status || !status.enabled || !status.holds) return false;
    var id = typeof playerOrId === "string" ? playerOrId : (playerOrId && playerOrId.id);
    var hold = id && status.holds[id];
    return !!(hold && hold.unavailable);
  }

  function retainImportIds(ids, lookup) {
    var out = [];
    var seen = {};
    var droppedDuplicate = 0;
    var droppedMissing = 0;
    (ids || []).forEach(function (id) {
      var p = lookup ? lookup(id) : null;
      if (!p || !p.id) { droppedMissing++; return; }
      if (seen[p.id]) { droppedDuplicate++; return; }
      seen[p.id] = true;
      out.push(p.id);
    });
    return { ids: out, droppedDuplicate: droppedDuplicate, droppedMissing: droppedMissing, droppedForInjury: 0 };
  }

  root.AFARealStatus = {
    UNAVAILABLE: UNAVAILABLE,
    formAdjustment: formAdjustment,
    blank: blank,
    fromInjury: fromInjury,
    evidenceFromNews: evidenceFromNews,
    buildOverlay: buildOverlay,
    enableNew: enableNew,
    confirmExisting: confirmExisting,
    migrate: migrate,
    blocks: blocks,
    retainImportIds: retainImportIds
  };
})(typeof window !== "undefined" ? window : globalThis);
