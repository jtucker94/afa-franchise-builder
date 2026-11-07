/* Real NFL / college headline ticker. Not the AFA draft ticker.
 * The crawl is animation only. A fresh fetch happens on the existing
 * 5-minute Eastern window, or when the reader asks. Headlines are not invented.
 */
(function (root) {
  "use strict";
  var HIDE_KEY = "afa-real-news-ticker-hidden";
  var hiddenPref = false;
  var headlines = [];
  var status = "";
  var freshnessText = "Headline time is not loaded yet. A missing live check is not a five-minute update.";
  var timer = null;
  var rendering = false;
  var renders = 0;
  var renderWindowStart = 0;
  var stopped = false;

  function prefersStill() {
    return root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function suppressed() {
    var body = document.body;
    if (!body) return true;
    if (body.classList.contains("screen-boot-active")) return true;
    if (hiddenPref) return true;
    var intro = document.getElementById("draft-intro");
    if (intro && !intro.hidden && body.classList.contains("screen-draft-active")) return true;
    var done = document.getElementById("draft-complete");
    if (done && !done.hidden) return true;
    var scout = document.getElementById("scout-card");
    if (scout && !scout.hidden) return true;
    return false;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function markNodes(teams) {
    var wrap = el("span", "rnt-marks");
    (teams || []).slice(0, 2).forEach(function (team) {
      var slot = el("span", "rnt-mark");
      slot.title = team.label + " · " + team.source + " · " + (team.role === "current" ? "current team" : "named in the headline, not a current-team assignment");
      if (team.url) {
        var img = document.createElement("img");
        img.className = "rnt-logo";
        img.alt = team.label + " logo";
        img.width = 20;
        img.height = 20;
        img.decoding = "async";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.src = team.url;
        img.addEventListener("error", function () {
          img.remove();
          slot.appendChild(el("span", "rnt-logo-fallback", team.abbr || team.label));
        });
        slot.appendChild(img);
      } else {
        slot.appendChild(el("span", "rnt-logo-fallback", team.abbr || team.label));
      }
      wrap.appendChild(slot);
    });
    return wrap;
  }

  function render() {
    if (stopped || rendering) return;
    var now = Date.now();
    if (!renderWindowStart || now - renderWindowStart > 1000) {
      renderWindowStart = now;
      renders = 0;
    }
    renders += 1;
    root.__tickerRenders = (root.__tickerRenders || 0) + 1;
    if (renders > 8) {
      stopped = true;
      var bar = document.getElementById("real-news-ticker");
      if (bar) {
        bar.hidden = false;
        bar.textContent = "";
        bar.appendChild(el("p", "rnt-empty", "Ticker stopped: too many redraws. No headlines were invented."));
      }
      return;
    }
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
  }

  function renderNow() {
    var bar = document.getElementById("real-news-ticker");
    if (!bar) return;
    bar.textContent = "";
    var hide = suppressed() || !headlines.length && status === "";
    if (suppressed()) {
      bar.hidden = true;
      document.body.classList.remove("has-real-ticker");
      return;
    }
    bar.hidden = false;
    document.body.classList.add("has-real-ticker");
    if (prefersStill()) bar.classList.add("is-still"); else bar.classList.remove("is-still");
    bindHold(bar);

    bar.setAttribute("aria-label", "Real NFL and college headlines");
    bar.appendChild(el("p", "rnt-fresh", freshnessText));
    var row = el("div", "rnt-row");
    bar.appendChild(row);
    row.appendChild(el("span", "rnt-kicker", "Real news"));
    if (!headlines.length) {
      var empty = el("p", "rnt-empty", status || "Real NFL and college headlines are unavailable. No sample stories are shown.");
      row.appendChild(empty);
    } else {
      var viewport = el("div", "rnt-viewport");
      var track = el("div", "rnt-track");
      track.setAttribute("aria-hidden", "true");
      var staticList = el("ul", "rnt-static");
      function fill(target, duplicate) {
        headlines.forEach(function (item) {
          var piece = el(target.tagName === "UL" ? "li" : "span", "rnt-item");
          piece.appendChild(el("span", "rnt-cat", item.category));
          if (item.flag === "rumor") piece.appendChild(el("span", "rnt-flag", "Rumor"));
          else if (item.flag === "verified") piece.appendChild(el("span", "rnt-flag", "Verified"));
          piece.appendChild(markNodes(item.teams));
          var link = document.createElement("a");
          link.className = "rnt-link";
          link.href = item.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = item.title;
          if (item.publishedAt) link.title = "Published " + item.publishedAt + (item.retrievedAt ? ". Retrieved " + item.retrievedAt : "");
          piece.appendChild(link);
          target.appendChild(piece);
        });
      }
      fill(track, true);
      fill(track, true);
      fill(staticList, false);
      viewport.appendChild(track);
      row.appendChild(viewport);
      row.appendChild(staticList);
    }
    var hideBtn = el("button", "rnt-btn");
    hideBtn.type = "button";
    hideBtn.setAttribute("aria-label", "Hide the news bar");
    hideBtn.appendChild(el("span", "rnt-btn-label", "Hide"));
    hideBtn.addEventListener("click", function () {
      hiddenPref = true;
      try { localStorage.setItem(HIDE_KEY, "1"); } catch (e) {}
      render();
    });
    row.appendChild(hideBtn);
    void hide;
  }

  function bindHold(bar) {
    if (!bar || bar.getAttribute("data-hold") === "1") return;
    bar.setAttribute("data-hold", "1");
    function down() { bar.classList.add("is-held"); }
    function up() { bar.classList.remove("is-held"); }
    bar.addEventListener("pointerdown", down);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    bar.addEventListener("pointerleave", up);
  }

  function show() {
    hiddenPref = false;
    try { localStorage.removeItem(HIDE_KEY); } catch (e) {}
    render();
  }

  function setFreshness(text) {
    var next = text || "Headline time is not loaded yet. A missing live check is not a five-minute update.";
    if (next === freshnessText) return;
    freshnessText = next;
    render();
  }

  function setHeadlines(items, note) {
    var Logos = root.AFATeamLogos;
    headlines = Logos ? Logos.prepareHeadlines(items) : [];
    status = note || (headlines.length ? "" : "Real NFL and college headlines are unavailable. No sample stories are shown.");
    render();
  }

  function loadCache() {
    return fetch("data/news-cache.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      var items = (data && data.items) || [];
      items.forEach(function (item) { if (!item.retrievedAt && data.fetchedAt) item.retrievedAt = data.fetchedAt; });
      var note = items.length ? "" : "The saved headline cache is empty. No sample stories are shown.";
      if (data && data.fetchedAt && items.length) note = "";
      setHeadlines(items, note);
      if (root.AFANews && root.AFANews.freshness) {
        var fresh = root.AFANews.freshness({ snapshotAt: data && data.fetchedAt, lastSuccessAt: null, lastError: null });
        setFreshness(fresh.short || fresh.banner);
      }
      if (data && data.errors && data.errors.length && !items.length) {
        status = "Headline feeds failed (" + data.errors.map(function (e) { return e.league || e.error || "error"; }).join(", ") + "). No sample stories are shown.";
        render();
      }
    }).catch(function () {
      setHeadlines([], "Real NFL and college headlines are unavailable offline. No sample stories are shown.");
    });
  }

  function maybeRefresh() {
    if (!root.AFANews || !root.AFARefreshClock || !root.AFARefreshClock.inNewsWindow(new Date())) return;
    if (root.AFAScouting && root.AFAScouting.checkNews) root.AFAScouting.checkNews(false);
  }

  function armRefresh() {
    if (timer) clearTimeout(timer);
    var wait = root.AFARefreshClock ? root.AFARefreshClock.NEWS_INTERVAL_MS : 300000;
    timer = setTimeout(function () {
      timer = null;
      maybeRefresh();
      armRefresh();
    }, wait);
  }

  function start() {
    try { hiddenPref = localStorage.getItem(HIDE_KEY) === "1"; } catch (e) { hiddenPref = false; }
    try {
      if (new URLSearchParams(root.location.search).get("ticker") === "off") hiddenPref = true;
    } catch (e) {}
    loadCache();
    armRefresh();
  }

  root.AFANewsTicker = {
    start: start,
    render: render,
    onScreen: render,
    setHeadlines: setHeadlines,
    setFreshness: setFreshness,
    show: show,
    loadCache: loadCache,
    stopped: function () { return stopped; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window);
