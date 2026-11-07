/* Players directory and Scouting workspace. Real NFL data stays off the AFA roster. */
(function (root) {
  "use strict";
  var D = function () { return root.AFAWorkspaceData; };
  var PAGE = 40;
  var dirState = { page: 0, pos: "", team: "", sort: "name", text: "", selected: null };
  var scoutState = { league: "nfl", tab: "overview", compare: [], watch: [], occupiedBy: {}, newsFails: 0, snapshotAt: null };
  var newsTimer = null;
  var newsItems = [];
  var newsCursor = null;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function players() { return root.AFA_NFL_PLAYERS || []; }
  function sleeperMap() { return (root.AFA_SLEEPER && root.AFA_SLEEPER.players) || {}; }
  function byId() {
    var m = {};
    players().forEach(function (p) { if (p && p.id) m[p.id] = p; });
    return m;
  }
  function saveState() { return root.FB && root.FB.getState ? root.FB.getState() : (root.state || null); }
  function afaClub(id) {
    var st = saveState();
    if (!st || !st.liveDataEffects || !st.rosters) return null;
    var teams = root.AFA && root.AFA.TEAMS;
    for (var tid in st.rosters) {
      if ((st.rosters[tid] || []).indexOf(id) >= 0) {
        var t = teams && teams.find(function (x) { return x.id === tid; });
        return t ? t.abbr : tid;
      }
    }
    return null;
  }
  function loadWatch() {
    try { scoutState.watch = JSON.parse(localStorage.getItem("afa-scout-watchlist-v1") || "[]"); }
    catch (e) { scoutState.watch = []; }
    if (!Array.isArray(scoutState.watch)) scoutState.watch = [];
  }
  function storeWatch() {
    try { localStorage.setItem("afa-scout-watchlist-v1", JSON.stringify(scoutState.watch.slice(0, 80))); } catch (e) {}
  }

  function photoHtml(player) {
    var shot = D().headshot(player);
    if (!shot.url) return '<div class="ws-photo ws-photo-missing" role="img" aria-label="Photo unavailable">No photo</div>';
    return '<img class="ws-photo" alt="" src="' + esc(shot.url) + '" referrerpolicy="no-referrer" data-photo-source="' + esc(shot.source) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'ws-photo ws-photo-missing\',textContent:\'Photo unavailable\'}))">';
  }
  function logoHtml(abbr) {
    var Logos = root.AFATeamLogos;
    var mark = Logos && Logos.currentNfl ? Logos.currentNfl(abbr) : null;
    if (!mark) {
      var label = !abbr || abbr === "FA" ? "FA" : String(abbr);
      var aria = label === "FA" ? "Free agent, no team logo" : label + ", logo unavailable";
      return '<span class="ws-logo ws-logo-missing" role="img" aria-label="' + esc(aria) + '">' + esc(label) + '</span>';
    }
    return '<img class="ws-logo" width="36" height="36" alt="' + esc(mark.label + " logo") + '" title="' + esc(mark.label + " · " + mark.source) + '" src="' + esc(mark.url) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ws-logo ws-logo-missing\',textContent:\'' + esc(mark.abbr) + '\',title:\'Logo failed to load\'}))">';
  }
  function storyMarksHtml(text) {
    var Logos = root.AFATeamLogos;
    if (!Logos) return "";
    return Logos.storyTeams(text).map(function (team) {
      var note = team.label + " · named in the headline, not assigned as the current team · " + team.source;
      return '<img class="ws-logo" width="20" height="20" alt="' + esc(team.label + " logo") + '" title="' + esc(note) + '" src="' + esc(team.url) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ws-logo ws-logo-missing\',textContent:\'' + esc(team.abbr) + '\'}))">';
    }).join("");
  }

  function listed(p) {
    return root.AFARatings && p ? AFARatings.lookup(p) : null;
  }
  function ratingLabel(p) {
    var src = listed(p);
    if (src) return "Madden NFL 27 list " + esc(src.ovr);
    return "AFA pool " + esc(p && p.ovr != null ? p.ovr : "Not on record");
  }
  function ratingHelp(p) {
    var src = listed(p);
    if (src) return "Madden NFL 27 overall " + src.ovr + " from " + (src.compiler || "the published list") + ", retrieved " + src.retrievedAt + ". Not an EA file. PFF is not on record.";
    return "No Madden list match. The number is the AFA pool overall, not a Madden or PFF grade.";
  }
  function withListedRatings(rows) {
    if (!root.AFARatings) return rows;
    var ids = byId();
    rows.forEach(function (r) {
      var src = AFARatings.lookup(ids[r.id]);
      if (!src) { r.basis = "afa-pool"; return; }
      r.ovr = src.ovr;
      r.basis = "madden-nfl27-list";
    });
    return rows;
  }
  function rowsNow() {
    return D().filterSort(withListedRatings(D().directoryRows(players(), sleeperMap(), root.AFA_NFL_AVAIL || null)), dirState);
  }

  function mountDirectory(el) {
    if (!el) return;
    var all = D().directoryRows(players(), sleeperMap(), root.AFA_NFL_AVAIL || null);
    var positions = [];
    var teams = [];
    all.forEach(function (r) {
      if (r.pos && positions.indexOf(r.pos) < 0) positions.push(r.pos);
      if (r.nfl && teams.indexOf(r.nfl) < 0) teams.push(r.nfl);
    });
    positions.sort();
    teams.sort();
    el.innerHTML = '<div class="ws-toolbar">' +
      '<input id="dir-q" class="search" type="search" placeholder="Search name, team, college" aria-label="Search players" value="' + esc(dirState.text) + '">' +
      '<select id="dir-pos" aria-label="Position"><option value="">All positions</option>' + positions.map(function (p) { return '<option' + (dirState.pos === p ? " selected" : "") + '>' + esc(p) + '</option>'; }).join("") + '</select>' +
      '<select id="dir-team" aria-label="Real NFL team"><option value="">All NFL teams</option>' + teams.map(function (t) { return '<option value="' + esc(t) + '"' + (dirState.team === t ? " selected" : "") + '>' + esc(t === "FA" ? "Free agent" : t) + '</option>'; }).join("") + '</select>' +
      '<select id="dir-sort" aria-label="Sort"><option value="name">Name</option><option value="ovr">Game rating</option><option value="pos">Position</option><option value="team">NFL team</option><option value="status">Status</option></select>' +
      '</div>' +
      '<p class="help" id="dir-count"></p>' +
      '<label class="ws-toggle"><input type="checkbox" id="dir-live"' + ((saveState() && saveState().liveDataEffects) ? " checked" : "") + '> Show this save\'s AFA club beside the real NFL team. This box does not change ratings or availability.</label>' +
      realStatusHtml() +
      '<div class="ws-split"><div class="ws-list" id="dir-list" role="list"></div><div class="ws-detail" id="dir-detail"><p class="help">Select a player. The team shown is the real NFL team, not an AFA assignment.</p></div></div>' +
      '<div class="ws-pager"><button type="button" class="btn" id="dir-prev">Previous</button><span id="dir-page"></span><button type="button" class="btn" id="dir-next">Next</button></div>';
    $("dir-sort").value = dirState.sort;
    $("dir-q").addEventListener("input", function () { dirState.text = $("dir-q").value; dirState.page = 0; paintDirectory(); });
    $("dir-pos").addEventListener("change", function () { dirState.pos = $("dir-pos").value; dirState.page = 0; paintDirectory(); });
    $("dir-team").addEventListener("change", function () { dirState.team = $("dir-team").value; dirState.page = 0; paintDirectory(); });
    $("dir-sort").addEventListener("change", function () { dirState.sort = $("dir-sort").value; dirState.page = 0; paintDirectory(); });
    $("dir-prev").onclick = function () { dirState.page -= 1; paintDirectory(); };
    $("dir-next").onclick = function () { dirState.page += 1; paintDirectory(); };
    $("dir-live").onchange = function () {
      var st = saveState();
      if (!st) { $("dir-live").checked = false; return; }
      if (root.AFAWorkspaceHooks && root.AFAWorkspaceHooks.setLiveEffects) root.AFAWorkspaceHooks.setLiveEffects(!!$("dir-live").checked);
      else st.liveDataEffects = !!$("dir-live").checked;
      paintDirectory();
    };
    var applyBtn = $("btn-apply-real");
    if (applyBtn) applyBtn.onclick = onApplyReal;
    $("dir-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-dir]");
      if (!btn) return;
      dirState.selected = btn.getAttribute("data-dir");
      paintDirectory();
    });
    paintDirectory();
  }

  function realStatusHtml() {
    var st = saveState();
    var rs = st && st.realWorldStatus;
    var on = !!(rs && rs.enabled);
    var form = root.AFARealStatus ? root.AFARealStatus.formAdjustment() : { reason: "No evidence to adjust." };
    var line = on
      ? "Verified availability is on for this save (" + (rs.scope || "on") + ", source " + (rs.sourceFetchedAt || "time not stored") + "). Base ratings were not rewritten. Holds: " + Object.keys(rs.holds || {}).length + "."
      : "Verified availability is off for this save. Nothing has been written onto the AFA timeline.";
    return '<p class="help" id="real-status-line">' + esc(line) + " " + esc(form.reason) + '</p>' +
      '<button type="button" class="btn" id="btn-apply-real">' + (on ? "Turn off verified availability" : "Apply verified availability to this save") + '</button>';
  }

  function onApplyReal() {
    var st = saveState();
    var on = !!(st && st.realWorldStatus && st.realWorldStatus.enabled);
    if (on) {
      if (!window.confirm("Turn off the real-world availability overlay on this save? Base ratings and any AFA injury already stored stay as they are.")) return;
      if (root.AFAWorkspaceHooks && root.AFAWorkspaceHooks.confirmRealStatus) root.AFAWorkspaceHooks.confirmRealStatus(false);
    } else {
      var when = (root.AFA_NFL_AVAIL && root.AFA_NFL_AVAIL.fetchedAt) || "the loaded snapshot";
      if (!window.confirm("Apply verified NFL availability from " + when + " to this existing save?\n\nBase GMFB ratings stay the same. Rumors are ignored. Players who already have an AFA injury keep that injury record. Out, IR, PUP, and suspension marks are stored beside the save and keep those players out of the active lineup. This does not replace the season timeline.")) return;
      var result = root.AFAWorkspaceHooks && root.AFAWorkspaceHooks.confirmRealStatus && root.AFAWorkspaceHooks.confirmRealStatus(true);
      if (!result || !result.applied) window.alert((result && result.reason) || "The snapshot was not applied.");
    }
    var host = document.querySelector("#directory-root");
    if (host) mountDirectory(host);
  }

  function paintDirectory() {
    var filtered = rowsNow();
    var slice = D().pageSlice(filtered, dirState.page, PAGE);
    dirState.page = slice.page;
    var count = $("dir-count");
    if (count) count.textContent = slice.total + " real NFL players in this pool. Page " + (slice.page + 1) + " of " + slice.pages + ".";
    var list = $("dir-list");
    if (list) {
      list.innerHTML = slice.rows.map(function (r) {
        var club = afaClub(r.id);
        return '<button type="button" class="ws-row' + (dirState.selected === r.id ? " on" : "") + '" data-dir="' + esc(r.id) + '" role="listitem">' +
          logoHtml(r.nfl) + '<span class="ws-row-name">' + esc(r.name) + '</span>' +
          '<span class="pos-pill pos-' + esc(r.pos) + '">' + esc(r.pos) + '</span>' +
          '<span>' + esc(r.nflLabel) + '</span>' +
          '<span>' + esc(r.status) + '</span>' +
          (club ? '<span class="help">AFA ' + esc(club) + '</span>' : '') +
          '</button>';
      }).join("") || '<p class="help">No players match.</p>';
    }
    var page = $("dir-page");
    if (page) page.textContent = (slice.page + 1) + " / " + slice.pages;
    if ($("dir-prev")) $("dir-prev").disabled = slice.page <= 0;
    if ($("dir-next")) $("dir-next").disabled = slice.page >= slice.pages - 1;
    paintDetail();
  }

  function paintDetail() {
    var host = $("dir-detail");
    if (!host) return;
    var p = byId()[dirState.selected];
    if (!p) { host.innerHTML = '<p class="help">Select a player. Photos and logos that fail to load are marked unavailable. Nothing is invented.</p>'; return; }
    var sl = sleeperMap()[p.id] || null;
    var team = D().nflTeam(p, sl, root.AFA_NFL_AVAIL || null);
    var avail = D().availability(p, sl, root.AFA_NFL_AVAIL || null);
    var line = D().seasonLine(root.AFA_STATS_2025, p.id);
    var sheet = D().statSheet(p, line);
    var shot = D().headshot(p);
    var club = afaClub(p.id);
    host.innerHTML = '<article class="ws-card">' +
      photoHtml(p) +
      '<div><p class="eyebrow">Real NFL · ' + esc(team.source) + '</p><h2>' + esc(p.name) + '</h2>' +
      '<p>' + logoHtml(team.abbr) + ' <strong>' + esc(team.label) + '</strong> · <span class="pos-pill pos-' + esc(p.pos) + '">' + esc(p.pos) + '</span> · ' + ratingLabel(p) + '</p>' +
      '<p class="help">Status: ' + esc(avail.text) + '. ' + (avail.kind === "unknown" ? "Unknown is not healthy. " : "") + (club ? 'In this save only: AFA ' + esc(club) + '. ' : '') + '</p>' +
      '<p class="help">Photo: ' + (shot.url ? esc(shot.source) : 'No photo id on file.') + '</p></div></article>' +
      '<h3>2025 regular-season stats</h3>' +
      '<p class="help">' + (sheet.season ? 'Season ' + esc(sheet.season) + ' · source file stats-2025.js' : 'No 2025 line for this id.') + ' ' + esc(sheet.note || '') + '</p>' +
      '<div class="ws-stats">' + (sheet.cells || []).map(function (c) {
        return '<div><span>' + esc(c.label) + '</span><b class="ws-' + c.cell.kind + '">' + esc(c.cell.text) + '</b></div>';
      }).join("") + '</div>' +
      '<h3>2026 Sleeper snapshot</h3>' + sleeperStatsHtml(sl) +
      '<p class="help">' + ratingHelp(p) + ' ' + esc((root.AFARealStatus ? root.AFARealStatus.formAdjustment() : { reason: "No evidence to adjust." }).reason) + ' Sleeper ADP is a market signal. Popularity is not skill.</p>';
  }

  function sleeperStatsHtml(sl) {
    if (!sl) return '<p class="help">Not in the Sleeper snapshot matched to this pool.</p>';
    var meta = (root.AFA_SLEEPER && root.AFA_SLEEPER.meta) || {};
    var bits = [];
    if (sl.st) Object.keys(sl.st).forEach(function (k) { bits.push('<div><span>' + esc(k) + '</span><b>' + esc(sl.st[k]) + '</b></div>'); });
    var adp = (sl.adp == null || sl.adp >= 999) ? 'Unranked' : sl.adp;
    return '<p class="help">Sleeper ' + esc(meta.season || "") + ' ' + esc(meta.seasonType || "") + ' week ' + esc(meta.week == null ? "Not on record" : meta.week) + ' · fetched ' + esc(String(meta.fetchedAt || "").slice(0, 10)) + ' · ADP ' + esc(adp) + ' (' + esc(sl.adpKind || "n/a") + ')</p>' +
      (bits.length ? '<div class="ws-stats">' + bits.join("") + '</div>' : '<p class="help">No counting stats in the snapshot for this player. That is missing, not zero.</p>');
  }

  function settings() { return root.AFA_LEAGUE_SETTINGS || null; }
  function leagueRecord(key) {
    var live = settings() && settings().leagues && settings().leagues[key];
    var snap = root.AFA_SLEEPER_LEAGUES && root.AFA_SLEEPER_LEAGUES.leagues && root.AFA_SLEEPER_LEAGUES.leagues[key];
    return live || snap || null;
  }

  function mountScouting(el) {
    if (!el) return;
    loadWatch();
    if (!newsCursor && root.AFANews) newsCursor = root.AFANews.blankCursor();
    el.innerHTML = '<div class="ws-switch" role="tablist" aria-label="League">' +
      '<button type="button" class="btn" data-lg="nfl">NFL</button>' +
      '<button type="button" class="btn" data-lg="ogffl">OGFFL</button>' +
      '<button type="button" class="btn" data-lg="dd">Dynasty Domination</button></div>' +
      '<div class="ws-tabs" role="tablist" aria-label="Scouting sections">' +
      ["overview", "evaluation", "compare", "news", "stats", "watch"].map(function (t) {
        return '<button type="button" class="btn" data-tab="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>';
      }).join("") + '</div><div id="scout-panel"></div>';
    el.querySelector(".ws-switch").addEventListener("click", function (e) {
      var b = e.target.closest("[data-lg]");
      if (!b) return;
      scoutState.league = b.getAttribute("data-lg");
      paintScouting();
    });
    el.querySelector(".ws-tabs").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab]");
      if (!b) return;
      scoutState.tab = b.getAttribute("data-tab");
      paintScouting();
    });
    $("scout-panel").addEventListener("click", onScoutClick);
    $("scout-panel").addEventListener("change", function (e) {
      var id = e.target.getAttribute && e.target.getAttribute("data-note");
      if (!id) return;
      scoutState.watch.forEach(function (w) { if (w.id === id) w.note = e.target.value; });
      storeWatch();
    });
    paintScouting();
    fetch("data/league-settings.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (data) { root.AFA_LEAGUE_SETTINGS = data; if (scoutState.tab === "overview" || scoutState.tab === "stats") paintScouting(); }
    }).catch(function () {});
    fetch("data/nfl-availability.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (data) root.AFA_NFL_AVAIL = data;
    }).catch(function () {});
    loadNewsCache();
    if (newsTimer) clearInterval(newsTimer);
    var wait = root.AFARefreshClock ? root.AFARefreshClock.NEWS_INTERVAL_MS : 300000;
    newsTimer = setInterval(function () { if (scoutState.tab === "news") checkNews(false); }, wait);
  }

  function paintScouting() {
    var rootEl = document.querySelector("#scouting-root");
    if (!rootEl) return;
    rootEl.querySelectorAll("[data-lg]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-lg") === scoutState.league); b.setAttribute("aria-selected", b.classList.contains("on") ? "true" : "false"); });
    rootEl.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === scoutState.tab); });
    var panel = $("scout-panel");
    if (!panel) return;
    var fn = { overview: tabOverview, evaluation: tabEval, compare: tabCompare, news: tabNews, stats: tabStats, watch: tabWatch }[scoutState.tab] || tabOverview;
    panel.innerHTML = fn();
  }

  function activeLeague() {
    if (scoutState.league === "nfl") return null;
    return leagueRecord(scoutState.league);
  }

  function tabOverview() {
    var lg = activeLeague();
    if (!lg) {
      return '<article class="ws-card"><div><h2>NFL scouting</h2><p>Game ratings are GMFB. Sleeper ADP is a market overlay, capped when the scout card is open, and it is not the grade. PFF numbers in that card are estimates, not a paid PFF feed.</p><p class="help">Pick OGFFL or Dynasty Domination for that league only. They are never mixed.</p></div></article>';
    }
    var slice = D().leagueSlice(lg, byId());
    var slots = D().slotCounts(lg.rosterPositions || []);
    var have = D().haveCounts(slice.mine);
    var slotHtml = Object.keys(slots).map(function (pos) {
      return '<div><span>' + esc(pos) + ' lineup slots</span><b>' + slots[pos] + '</b></div>';
    }).join("");
    var haveHtml = Object.keys(have).sort().map(function (pos) {
      return '<div><span>' + esc(pos) + ' on roster</span><b>' + have[pos] + '</b></div>';
    }).join("");
    var fmt = root.AFALeagueScout ? root.AFALeagueScout.formatLabel(lg.settingsType, lg.league || lg.name) : { note: "Format module missing.", settingsType: lg.settingsType };
    var typeNote = "Sleeper settings.type is " + esc(fmt.settingsType == null ? "not in this file" : fmt.settingsType) + ". " + esc(fmt.note || "") + " Taxi slots: " + esc(lg.taxiSlots == null ? "n/a" : lg.taxiSlots) + ".";
    var scoreKeys = ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "sack"];
    var scoreHtml = scoreKeys.filter(function (k) { return lg.scoring && lg.scoring[k] != null; }).map(function (k) {
      return '<div><span>' + esc(k) + '</span><b>' + esc(lg.scoring[k]) + '</b></div>';
    }).join("");
    return '<article class="ws-card"><div><p class="eyebrow">' + esc(lg.league || lg.name) + '</p><h2>' + esc(lg.teamName || "Your club") + '</h2>' +
      '<p>Roster ' + esc(lg.rosterId) + ' · ' + esc(lg.owner || "") + ' · season ' + esc(lg.season || "") + ' · ' + esc(lg.status || "status not on record") + '</p>' +
      '<p class="help">Fetched ' + esc(String(lg.fetchedAt || (settings() && settings().fetchedAt) || "").slice(0, 16)) + '. Source api.sleeper.app. ' + typeNote + '</p>' +
      '<p class="help">Matched players ' + slice.mine.length + '. Ids missing from the GMFB pool: ' + slice.missing.length + '. Skipped non-pool rows: ' + slice.skipped.length + '.</p></div></article>' +
      '<h3>Scoring settings on file</h3><div class="ws-stats">' + (scoreHtml || '<p class="help">Those scoring keys are not in this snapshot. Missing keys are omitted, not treated as zero.</p>') + '</div>' +
      '<p class="help">Shown only for this league. They are not added to GMFB game ratings.</p>' +
      '<h3>Lineup slots from the league settings</h3><div class="ws-stats">' + (slotHtml || '<p class="help">Roster positions were not in the file.</p>') + '</div>' +
      '<h3>Your roster by real position</h3><div class="ws-stats">' + haveHtml + '</div>' +
      lineupAnalysisHtml(lg, slice.mine) +
      '<h3>Your roster</h3>' +
      '<ul class="ws-roster">' + slice.mine.map(function (p) {
        var team = D().nflTeam(p, sleeperMap()[p.id], root.AFA_NFL_AVAIL || null);
        var pts = recordedFor(p, lg);
        return '<li><button type="button" class="btn" data-add="' + esc(p.id) + '">Compare</button> ' + esc(p.name) + ' · ' + esc(p.pos) + ' · ' + esc(team.label) + ' · rating ' + esc(p.ovr) +
          ' · recorded ' + (pts.total == null ? 'not scored' : esc(pts.total)) + (pts.season ? ' (' + esc(pts.season) + ')' : '') + '</li>';
      }).join("") + '</ul>' +
      faHtml(lg, slice.mine) +
      '<h3>Advanced projections</h3><p class="help">' + esc((root.AFALeagueScout ? root.AFALeagueScout.projections() : { label: "Unavailable." }).label) + '</p>';
  }

  function recordedFor(player, lg) {
    if (!root.AFALeagueScout) return { total: null, season: null, parts: [], note: "" };
    var line = D().seasonLine(root.AFA_STATS_2025, player.id);
    return root.AFALeagueScout.recordedPoints(line, lg && lg.scoring);
  }

  function lineupAnalysisHtml(lg, mine) {
    if (!root.AFALeagueScout) return "";
    var report = root.AFALeagueScout.analyzeLineup(lg.rosterPositions || [], mine);
    var rows = (report.slots || []).map(function (row) {
      var text = row.filled == null ? (row.note || "not counted") : (row.filled + " filled, " + row.short + " short");
      return '<div><span>' + esc(row.slot) + ' (' + esc(row.slots) + ')</span><b>' + esc(text) + '</b></div>';
    }).join("");
    var depth = report.depth || {};
    var depthHtml = Object.keys(depth).filter(function (k) { return depth[k]; }).map(function (k) {
      return '<div><span>' + esc(k) + ' left after starters and flex</span><b>' + esc(depth[k]) + '</b></div>';
    }).join("");
    return '<h3>Lineup fit for this roster</h3><p class="help">Dedicated slots are filled first. FLEX uses leftover RB, WR, and TE. IDP_FLEX uses leftover DL, LB, and DB. Short means the roster does not cover that slot. This is not a start/sit pick.</p>' +
      '<div class="ws-stats">' + rows + '</div>' +
      (depthHtml ? '<h3>Depth after those slots</h3><div class="ws-stats">' + depthHtml + '</div>' : '');
  }

  function faHtml(lg, mine) {
    var bag = scoutState.occupiedBy[lg.leagueId] || null;
    var btn = '<p><button type="button" class="btn" id="btn-load-rosters">Load public league rosters</button></p>';
    if (!bag) {
      return '<h3>Available in this league</h3><p class="help">Not loaded. The snapshot has your roster only, so other clubs\' players are not labeled free agents. ' + esc(scoutState.faNote || "") + '</p>' + btn;
    }
    var free = root.AFALeagueScout.leagueFreeAgents(players(), bag.ids);
    var report = root.AFALeagueScout.analyzeLineup(lg.rosterPositions || [], mine);
    var short = {};
    (report.slots || []).forEach(function (row) { if (row.short > 0) short[row.slot] = true; });
    var ranked = free.players.filter(function (p) {
      var g = root.AFALeagueScout.groupOf(p.pos);
      if (!g) return false;
      if (short[g]) return true;
      if (short.FLEX && (g === "RB" || g === "WR" || g === "TE")) return true;
      if (short.IDP_FLEX && (g === "DL" || g === "LB" || g === "DB")) return true;
      return false;
    });
    var hole = ranked.length > 0;
    if (!ranked.length) ranked = free.players.filter(function (p) { return !!root.AFALeagueScout.groupOf(p.pos); });
    ranked.sort(function (a, b) { return (b.ovr || 0) - (a.ovr || 0) || String(a.name).localeCompare(String(b.name)); });
    var shown = ranked.slice(0, 12);
    return '<h3>Available in this league</h3><p class="help">' + esc(free.reason) + ' Loaded ' + esc(bag.at) + ' from api.sleeper.app. ' +
      (hole ? 'These names can fill a short lineup slot. ' : 'No lineup slot is short, so this is the highest stored rating among unrostered pool players, not a recommendation. ') +
      esc(free.players.length) + ' pool players are off every roster in that response. Showing ' + shown.length + '.</p>' + btn +
      '<ul class="ws-roster">' + shown.map(function (p) {
        return '<li><button type="button" class="btn" data-add="' + esc(p.id) + '">Compare</button> ' + esc(p.name) + ' · ' + esc(p.pos) + ' · rating ' + esc(p.ovr) + '</li>';
      }).join("") + '</ul>';
  }

  function tabEval() {
    return '<article class="ws-card"><div><h2>How a grade is built</h2><p>The number on a player is the GMFB game rating already stored on the roster pool. It is not rewritten by headlines.</p><ul><li>Sleeper ADP, when it is a real rank under 999, is a market signal. The scout card may nudge the displayed grade by at most 3 points. Unranked ADP is not a penalty.</li><li>Search rank and popularity are not skill.</li><li>PFF figures inside the scout card are labeled estimates. There is no official PFF or ESPN grade in this build.</li><li>Fantasy points exist only inside a chosen league, and only as that league\'s scoring settings. They are not added to the GMFB rating.</li></ul></div></article>';
  }

  function tabCompare() {
    var ids = scoutState.compare.slice(0, 2);
    var cards = ids.map(function (id) {
      var p = byId()[id];
      if (!p) return '';
      var sl = sleeperMap()[p.id];
      var adp = sl && sl.adp != null && sl.adp < 999 ? sl.adp : null;
      var lg = activeLeague();
      var pts = recordedFor(p, lg);
      var partHtml = (pts.parts || []).slice(0, 8).map(function (part) {
        return '<div><span>' + esc(part.key) + ' ' + esc(part.stat) + ' × ' + esc(part.rate) + '</span><b>' + esc(part.points) + '</b></div>';
      }).join("");
      return '<article class="ws-card"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.pos) + ' · ' + esc(D().nflTeam(p, sl, root.AFA_NFL_AVAIL || null).label) + '</p><p>Stored game rating ' + esc(p.ovr) + '</p><p>Sleeper ADP ' + (adp == null ? 'Unranked' : esc(adp)) + '</p>' +
        '<p>Recorded points ' + (pts.total == null ? 'not scored' : esc(pts.total)) + (pts.season ? ' in ' + esc(pts.season) : '') + '. ' + esc(pts.note || '') + '</p>' +
        (partHtml ? '<div class="ws-stats">' + partHtml + '</div>' : '') +
        '<p class="help">' + esc((root.AFARealStatus ? root.AFARealStatus.formAdjustment() : { reason: "No evidence to adjust." }).reason) + '</p>' +
        '<button type="button" class="btn" data-drop="' + esc(p.id) + '">Remove</button></div></article>';
    }).join("");
    var lgName = activeLeague();
    return '<p class="help">Add up to two players. Stored rating, ADP, and recorded points use ' + (lgName ? esc(lgName.league || lgName.name) + ' scoring only' : 'no league scoring until you open OGFFL or Dynasty Domination') + '. The two leagues are not mixed. This is not a projection.</p>' +
      (cards || '<p class="help">Nobody in the compare slots.</p>') +
      '<p class="help">Open Overview on a league and use Compare on a roster row.</p>';
  }

  function tabNews() {
    var cov = root.AFANews ? root.AFANews.coverage() : null;
    var rows = newsItems.slice(0, 30).map(function (n) {
      return '<article class="ws-news"><p>' + storyMarksHtml((n.title || "") + " " + (n.summary || "")) + ' <strong>' + esc(n.title) + '</strong> <span class="ws-flag ws-flag-' + esc(n.flag) + '">' + esc(n.flag) + '</span></p>' +
        '<p class="help">' + esc(n.league || "") + ' · ' + esc(n.division || "") + ' · ' + esc(n.source || "") + '</p>' +
        '<p class="help">Published ' + esc(n.publishedAt || "Not on record") + ' · Retrieved ' + esc(n.retrievedAt || "Not on record") + '</p>' +
        (n.sourceUrl ? '<p><a href="' + esc(n.sourceUrl) + '" rel="noopener noreferrer">Source</a></p>' : '') +
        '</article>';
    }).join("");
    var fresh = root.AFANews ? root.AFANews.freshness({
      snapshotAt: scoutState.snapshotAt,
      lastSuccessAt: newsCursor && newsCursor.lastSuccessAt,
      lastError: newsCursor && newsCursor.lastError && newsCursor.lastError.message,
      backoffUntil: root.__newsBackoffUntil ? new Date(root.__newsBackoffUntil).toISOString() : null
    }) : null;
    return '<p class="help">' + esc(fresh ? fresh.banner : '') + '</p>' +
      '<p class="help">' + esc(cov ? cov.check + ' ' + cov.notGuaranteed : '') + '</p>' +
      '<p class="help">' + esc(cov ? cov.ncaaf : '') + ' ' + esc(cov ? cov.dailySeparated : '') + '</p>' +
      '<button type="button" class="btn btn-primary" id="btn-news-now">Check headlines now</button>' +
      '<div id="news-status" class="help">' + esc(scoutState.newsStatus || "") + '</div>' + rows;
  }

  function tabStats() {
    var lg = activeLeague();
    if (!lg) return '<p class="help">Choose OGFFL or Dynasty Domination to see that roster\'s 2025 lines. NFL-wide stat browsing is on the Players screen.</p>';
    var slice = D().leagueSlice(lg, byId());
    return slice.mine.map(function (p) {
      var sheet = D().statSheet(p, D().seasonLine(root.AFA_STATS_2025, p.id));
      return '<h3>' + esc(p.name) + ' · ' + esc(p.pos) + '</h3><p class="help">' + esc(sheet.note || '') + (sheet.season ? ' Season ' + esc(sheet.season) : '') + '</p><div class="ws-stats">' +
        (sheet.cells || []).map(function (c) { return '<div><span>' + esc(c.label) + '</span><b class="ws-' + c.cell.kind + '">' + esc(c.cell.text) + '</b></div>'; }).join("") + '</div>';
    }).join("") || '<p class="help">No matched players.</p>';
  }

  function tabWatch() {
    if (!scoutState.watch.length) return '<p class="help">The watchlist is empty. It is stored in this browser only, not in the franchise save.</p>';
    return '<ul class="ws-roster">' + scoutState.watch.map(function (w) {
      var p = byId()[w.id];
      return '<li><button type="button" class="btn" data-add="' + esc(w.id) + '">Compare</button> ' + esc(p ? p.name : w.name || w.id) +
        '<label class="ws-note">Note <input data-note="' + esc(w.id) + '" value="' + esc(w.note || "") + '" aria-label="Note for ' + esc(p ? p.name : w.id) + '"></label></li>';
    }).join("") + '</ul>';
  }

  function onScoutClick(e) {
    var add = e.target.closest("[data-add]");
    if (add) {
      var id = add.getAttribute("data-add");
      if (scoutState.compare.indexOf(id) < 0) scoutState.compare.unshift(id);
      scoutState.compare = scoutState.compare.slice(0, 2);
      if (!scoutState.watch.some(function (w) { return w.id === id; })) {
        var p = byId()[id];
        scoutState.watch.unshift({ id: id, name: p ? p.name : id, note: "" });
        storeWatch();
      }
      scoutState.tab = "compare";
      paintScouting();
      return;
    }
    var drop = e.target.closest("[data-drop]");
    if (drop) {
      scoutState.compare = scoutState.compare.filter(function (id) { return id !== drop.getAttribute("data-drop"); });
      paintScouting();
      return;
    }
    if (e.target.id === "btn-news-now") checkNews(true);
    if (e.target.id === "btn-load-rosters") loadLeagueRosters();
  }

  function loadLeagueRosters() {
    var lg = activeLeague();
    if (!lg || !lg.leagueId || !root.AFALeagueScout) return;
    scoutState.faNote = "Loading rosters from api.sleeper.app…";
    fetch("https://api.sleeper.app/v1/league/" + encodeURIComponent(lg.leagueId) + "/rosters").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (rosters) {
      scoutState.occupiedBy[lg.leagueId] = {
        at: new Date().toISOString(),
        ids: root.AFALeagueScout.occupiedFromRosters(rosters)
      };
      scoutState.faNote = "";
      paintScouting();
    }).catch(function (err) {
      scoutState.faNote = "League rosters did not load (" + ((err && err.message) || "failed") + "). Other clubs' players are not labeled free agents.";
      paintScouting();
    });
  }

  function loadNewsCache() {
    fetch("data/news-cache.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.items) return;
      newsItems = data.items;
      scoutState.snapshotAt = data.fetchedAt || null;
      if (root.AFANewsTicker && root.AFANewsTicker.setFreshness && root.AFANews) {
        root.AFANewsTicker.setFreshness(root.AFANews.freshness({ snapshotAt: data.fetchedAt }).banner);
      }
      if (scoutState.tab === "news") paintScouting();
    }).catch(function () {});
  }

  function publishFreshness(errorText) {
    if (!root.AFANews || !root.AFANewsTicker || !root.AFANewsTicker.setFreshness) return;
    var until = root.__newsBackoffUntil ? new Date(root.__newsBackoffUntil).toISOString() : null;
    root.AFANewsTicker.setFreshness(root.AFANews.freshness({
      snapshotAt: scoutState.snapshotAt,
      lastSuccessAt: newsCursor && newsCursor.lastSuccessAt,
      lastError: errorText || (newsCursor && newsCursor.lastError && newsCursor.lastError.message) || null,
      backoffUntil: until
    }).banner);
  }

  function checkNews(force) {
    if (!root.AFANews || !root.AFARefreshClock) return;
    var now = new Date();
    if (!force && root.__newsBackoffUntil && Date.now() < root.__newsBackoffUntil) {
      scoutState.newsStatus = "Last live check failed. Waiting until " + new Date(root.__newsBackoffUntil).toISOString() + " before another request. The snapshot stays on screen.";
      publishFreshness(scoutState.newsStatus);
      if (scoutState.tab === "news") paintScouting();
      return;
    }
    if (!root.AFARefreshClock.inNewsWindow(now)) {
      scoutState.newsStatus = force
        ? "Outside 8:00 AM–10:55 PM Eastern. A manual check was not sent, so a closed window is not reported as an empty news day."
        : "Outside 8:00 AM–10:55 PM Eastern. No headline check was sent.";
      publishFreshness(null);
      if (scoutState.tab === "news") paintScouting();
      return;
    }
    var cursor = newsCursor || root.AFANews.blankCursor();
    Promise.all(root.AFANews.FEEDS.map(function (feed) {
      return fetch(feed.url).then(function (r) {
        if (!r.ok) return { feed: feed, ok: false, error: "HTTP " + r.status };
        return r.text().then(function (xml) { return { feed: feed, ok: true, xml: xml }; });
      }).catch(function (err) {
        return { feed: feed, ok: false, error: (err && err.message) || "fetch failed" };
      });
    })).then(function (results) {
      var added = [];
      var outages = [];
      results.forEach(function (res) {
        if (!res.ok) {
          var fail = root.AFANews.ingest([], cursor, { retrievedAt: now.toISOString(), failed: true, error: res.error, feedId: res.feed.id, league: res.feed.league, source: res.feed.source });
          cursor = fail.cursor;
          outages.push(res.feed.league + ": " + res.error);
          return;
        }
        var done = root.AFANews.ingest(root.AFANews.parseRss(res.xml, res.feed), cursor, { retrievedAt: now.toISOString(), feedId: res.feed.id, league: res.feed.league, division: res.feed.division, source: res.feed.source });
        cursor = done.cursor;
        added = added.concat(done.added);
      });
      newsCursor = cursor;
      var seen = {};
      newsItems.forEach(function (n) { seen[n.id] = true; });
      added.forEach(function (n) { if (!seen[n.id]) newsItems.unshift(n); });
      var liveOk = results.some(function (res) { return res.ok; });
      if (liveOk) {
        scoutState.newsFails = 0;
        root.__newsBackoffUntil = 0;
      } else {
        scoutState.newsFails = (scoutState.newsFails || 0) + 1;
        root.__newsBackoffUntil = Date.now() + root.AFANews.backoffMs(scoutState.newsFails);
      }
      scoutState.newsStatus = (liveOk ? "Live response " + now.toISOString() : "Live request failed " + now.toISOString()) + ". New headlines " + added.length + "." + (outages.length ? " Outage: " + outages.join("; ") + "." : "") + " Snapshot " + (scoutState.snapshotAt || "not loaded") + ". Base ratings were not changed. This is not a five-minute guarantee.";
      if (added.length && root.AFANewsTicker && root.AFANewsTicker.setHeadlines) root.AFANewsTicker.setHeadlines(newsItems, "");
      publishFreshness(liveOk ? null : outages.join("; "));
      if (scoutState.tab === "news") paintScouting();
    });
  }

  root.AFADirectory = { mount: mountDirectory };
  root.AFAScouting = {
    mount: mountScouting,
    showTab: function (tab) { scoutState.tab = tab || "news"; paintScouting(); },
    checkNews: checkNews
  };
})(window);
