/* AFA Franchise Builder — mobile chrome, PWA registration, tap scout */
(function () {
  const MQ = window.matchMedia("(max-width: 900px)");
  const COARSE = window.matchMedia("(hover: none), (pointer: coarse)");

  function $(id) { return document.getElementById(id); }

  function isMobile() { return MQ.matches; }
  function isTouch() { return COARSE.matches || ("ontouchstart" in window); }

  /* ---------- Service worker ---------- */
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    const swUrl = new URL("sw.js", window.location.href).href;
    navigator.serviceWorker.register(swUrl, { scope: "./" }).then((reg) => {
      window.__AFA_SW = reg;
      reg.update().catch(() => {});
    }).catch((err) => {
      console.warn("[AFA PWA] SW register failed", err);
    });
  }

  /* ---------- Install hint (iOS Add to Home Screen) ---------- */
  function maybeShowInstallHint() {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return;
      if (window.navigator.standalone) return;
      const dismissed = localStorage.getItem("afa-pwa-hint-v029");
      if (dismissed === "1") return;
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!isIos && !isMobile()) return;
      let el = $("pwa-install-hint");
      if (!el) {
        el = document.createElement("div");
        el.id = "pwa-install-hint";
        el.className = "pwa-install-hint";
        el.innerHTML = "<strong>Install AFA Franchise</strong><br>" +
          (isIos
            ? "In Safari tap Share → Add to Home Screen for a full-screen app icon."
            : "Use your browser menu to Install app / Add to Home Screen.") +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-sm" id="pwa-hint-dismiss">Got it</button></div>';
        document.body.appendChild(el);
        el.querySelector("#pwa-hint-dismiss").onclick = () => {
          localStorage.setItem("afa-pwa-hint-v029", "1");
          el.classList.remove("show");
        };
      }
      // Delay so it doesn't fight the splash
      setTimeout(() => el.classList.add("show"), 4500);
    } catch (_) {}
  }

  /* ---------- Hamburger / more drawer for hub tabs ---------- */
  const PRIMARY_TABS = ["home", "roster", "trades", "slate", "gameday", "sim"];

  function ensureMobileChrome() {
    const hub = $("screen-hub");
    const topbar = hub && hub.querySelector(".topbar");
    if (!hub || !topbar) return;

    let btn = $("mobile-menu-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "mobile-menu-btn";
      btn.className = "mobile-menu-btn";
      btn.setAttribute("aria-label", "More tabs");
      btn.textContent = "☰";
      topbar.appendChild(btn);
      btn.addEventListener("click", () => {
        const d = $("mobile-drawer");
        if (d) d.classList.toggle("open");
        syncDrawer();
      });
    }

    let drawer = $("mobile-drawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.id = "mobile-drawer";
      drawer.className = "mobile-drawer";
      drawer.innerHTML = '<div class="mobile-drawer-panel" role="dialog" aria-label="Hub tabs">' +
        "<h3>Hub menu</h3><div id=\"mobile-drawer-tabs\"></div>" +
        '<button type="button" class="btn btn-ghost" id="mobile-drawer-close">Close</button></div>';
      document.body.appendChild(drawer);
      drawer.addEventListener("click", (e) => {
        if (e.target === drawer) drawer.classList.remove("open");
      });
      drawer.querySelector("#mobile-drawer-close").onclick = () => drawer.classList.remove("open");
    }
  }

  function syncDrawer() {
    const nav = $("hub-nav");
    const mount = $("mobile-drawer-tabs");
    if (!nav || !mount) return;
    mount.innerHTML = "";
    nav.querySelectorAll("button[data-tab], #btn-hub-draft-room").forEach((b) => {
      if (b.hidden) return;
      const clone = document.createElement("button");
      clone.type = "button";
      clone.className = "btn" + (b.classList.contains("on") ? " btn-primary" : "");
      clone.textContent = b.textContent.trim();
      clone.onclick = () => {
        b.click();
        $("mobile-drawer")?.classList.remove("open");
      };
      mount.appendChild(clone);
    });
  }

  function prioritizeHubTabs() {
    if (!isMobile()) return;
    const nav = $("hub-nav");
    if (!nav) return;
    const buttons = Array.from(nav.querySelectorAll("button[data-tab]"));
    // Keep primary tabs visually first; others still scrollable in the bar
    buttons.sort((a, b) => {
      const ai = PRIMARY_TABS.indexOf(a.getAttribute("data-tab"));
      const bi = PRIMARY_TABS.indexOf(b.getAttribute("data-tab"));
      const av = ai === -1 ? 99 : ai;
      const bv = bi === -1 ? 99 : bi;
      return av - bv;
    });
    buttons.forEach((b) => nav.appendChild(b));
    // Draft room tab first if visible
    const draft = $("btn-hub-draft-room");
    if (draft && !draft.hidden) nav.insertBefore(draft, nav.firstChild);
  }

  /* ---------- Table scroll wrappers ---------- */
  function wrapTables(root) {
    if (!isMobile() || !root) return;
    root.querySelectorAll("table.div-table, table.player-table, table.afa-gd-box, table.pick-table").forEach((table) => {
      if (table.parentElement && table.parentElement.classList.contains("table-scroll")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  /* ---------- Scout card: tap to pin ---------- */
  let scoutPinned = false;

  function pinScoutFromTap(player, evt) {
    if (!window.FB || !player) return;
    const card = $("scout-card");
    if (!card) return;
    // Reuse FB internals via DOM: dispatch a synthetic mouseenter path by calling shown HTML
    // Prefer public hook if present
    if (typeof window.FB.showScoutCard === "function") {
      window.FB.showScoutCard(player, evt);
    } else {
      // Fallback: click path already builds card via bindScoutHover — force show
      card.hidden = false;
      card.classList.add("show");
    }
    card.classList.add("pinned");
    scoutPinned = true;
    // Center-ish on mobile via CSS; still place if desktop-touch hybrid
  }

  function unpinScout() {
    const card = $("scout-card");
    if (!card) return;
    card.classList.remove("pinned", "show");
    card.hidden = true;
    scoutPinned = false;
  }

  function bindScoutTap(rootEl) {
    if (!rootEl || !isTouch()) return;
    rootEl.querySelectorAll("[data-pid], [data-scout]").forEach((el) => {
      if (el._scoutTapBound) return;
      el._scoutTapBound = true;
      el.addEventListener("click", (e) => {
        // Don't steal draft-pick clicks on the board row itself if it's a draft action —
        // long-press / second tap pattern: first tap shows scout if not already drafting.
        const pid = el.getAttribute("data-pid") || el.getAttribute("data-scout");
        if (!pid || !window.AFA) return;
        const p = window.AFA.playerById ? window.AFA.playerById(pid) : (window.AFA.PLAYERS || []).find((x) => x.id === pid);
        if (!p) return;
        // If this element is primarily a draft button, only open scout when modifier / data-scout-only
        if (el.closest("#player-body") && el.tagName === "TR" && !el.dataset.scoutOnly) {
          // On touch: show scout on tap; drafting still works via dedicated draft controls / second interaction
          // Allow draft click to proceed but also show card briefly
          pinScoutFromTap(p, e);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        pinScoutFromTap(p, e);
      }, true);
    });
  }

  document.addEventListener("click", (e) => {
    if (!scoutPinned) return;
    const card = $("scout-card");
    if (!card || card.hidden) { scoutPinned = false; return; }
    if (card.contains(e.target)) return;
    if (e.target.closest && e.target.closest("[data-pid], [data-scout]")) return;
    unpinScout();
  }, true);

  /* ---------- Observe hub renders ---------- */
  const mo = new MutationObserver(() => {
    if (!isMobile()) return;
    wrapTables($("hub-body"));
    wrapTables($("draft-workspace"));
    bindScoutTap(document);
    prioritizeHubTabs();
  });

  function boot() {
    ensureMobileChrome();
    registerSW();
    maybeShowInstallHint();
    prioritizeHubTabs();
    wrapTables(document);
    bindScoutTap(document);
    const hubBody = $("hub-body");
    if (hubBody) mo.observe(hubBody, { childList: true, subtree: true });
    const draftWs = $("draft-workspace");
    if (draftWs) mo.observe(draftWs, { childList: true, subtree: true });
    MQ.addEventListener?.("change", () => {
      prioritizeHubTabs();
      if (!MQ.matches) $("mobile-drawer")?.classList.remove("open");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Expose small helpers for tests / app bridge
  window.AFAMobile = {
    isMobile,
    isTouch,
    wrapTables,
    bindScoutTap,
    unpinScout,
    syncDrawer,
    prioritizeHubTabs
  };
})();
