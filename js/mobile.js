/* AFA Franchise Builder — mobile chrome, PWA registration, tap scout (v0.1.25) */
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
      const dismissed = localStorage.getItem("afa-pwa-hint-v030") || localStorage.getItem("afa-pwa-hint-v029");
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
        // Prefer inserting above Play Story so the CTA stays visible
        const menuCard = document.querySelector("#screen-menu .menu-card");
        if (menuCard) {
          const logo = menuCard.querySelector(".menu-logo");
          if (logo && logo.nextSibling) menuCard.insertBefore(el, logo.nextSibling);
          else menuCard.insertBefore(el, menuCard.firstChild);
        } else {
          document.body.appendChild(el);
        }
        el.querySelector("#pwa-hint-dismiss").onclick = () => {
          localStorage.setItem("afa-pwa-hint-v030", "1");
          el.classList.remove("show");
        };
      }
      setTimeout(() => el.classList.add("show"), 1200);
    } catch (_) {}
  }

  /* ---------- Body screen class for FAB / toast placement ---------- */
  function syncBodyScreenClass() {
    const active = document.querySelector(".screen.active");
    const id = active && active.id ? active.id.replace(/^screen-/, "") : "";
    ["boot", "menu", "mode", "story", "coaches", "draft", "hub"].forEach((name) => {
      document.body.classList.toggle("screen-" + name + "-active", name === id);
    });
  }

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
      btn.setAttribute("aria-label", "Open league menu");
      btn.textContent = "Menu";
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
      drawer.innerHTML = '<div class="mobile-drawer-panel" role="dialog" aria-label="League menu">' +
        "<h3>League menu</h3><div id=\"mobile-drawer-tabs\"></div>" +
        '<button type="button" class="btn btn-ghost" id="mobile-drawer-close">Close</button></div>';
      document.body.appendChild(drawer);
      drawer.addEventListener("click", (e) => {
        if (e.target === drawer) drawer.classList.remove("open");
      });
      drawer.querySelector("#mobile-drawer-close").onclick = () => drawer.classList.remove("open");
    }

    if (!$("scout-backdrop")) {
      const bd = document.createElement("div");
      bd.id = "scout-backdrop";
      bd.className = "scout-backdrop";
      bd.addEventListener("click", () => unpinScout());
      document.body.appendChild(bd);
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
      const label = b.querySelector(".hub-nav-text");
      const icon = b.querySelector(".nav-ico");
      clone.innerHTML = (icon ? icon.outerHTML : "") + "<span>" + (label ? label.textContent.trim() : b.textContent.trim()) + "</span>";
      clone.onclick = () => {
        b.click();
        $("mobile-drawer")?.classList.remove("open");
      };
      mount.appendChild(clone);
    });
  }

  function prioritizeHubTabs() {
    /* Grouped tiles keep their full labels. Do not shorten or reorder them. */
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

  /* ---------- Scout card: tap modal ---------- */
  let scoutPinned = false;

  function ensureScoutClose(card) {
    if (!card || card.querySelector(".scout-close")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scout-close";
    btn.setAttribute("aria-label", "Close scout card");
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      unpinScout();
    });
    card.insertBefore(btn, card.firstChild);
  }

  function pinScoutFromTap(player, evt) {
    if (!window.FB || !player) return;
    const card = $("scout-card");
    if (!card) return;
    if (typeof window.FB.showScoutCard === "function") {
      window.FB.showScoutCard(player, evt || { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    } else {
      card.hidden = false;
      card.classList.add("show");
    }
    // Clear inline desktop positioning so mobile CSS modal wins
    if (isMobile()) {
      card.style.left = "";
      card.style.top = "";
      card.style.right = "";
      card.style.bottom = "";
    }
    card.classList.add("pinned");
    ensureScoutClose(card);
    const bd = $("scout-backdrop");
    if (bd && isMobile()) bd.classList.add("show");
    scoutPinned = true;
  }

  function unpinScout() {
    const card = $("scout-card");
    if (card) {
      card.classList.remove("pinned", "show");
      card.hidden = true;
    }
    $("scout-backdrop")?.classList.remove("show");
    scoutPinned = false;
    if (window.FB && typeof window.FB.hideScoutCard === "function") {
      try { window.FB.hideScoutCard(0); } catch (_) {}
    }
  }

  function bindScoutTap(rootEl) {
    if (!rootEl || !isTouch()) return;
    rootEl.querySelectorAll("[data-pid], [data-scout]").forEach((el) => {
      if (el._scoutTapBound) return;
      el._scoutTapBound = true;
      el.addEventListener("click", (e) => {
        // Never intercept primary action buttons (Draft / Cut / Hire / etc.)
        if (e.target.closest && e.target.closest("button, a, input, select, label, .btn")) return;
        // Trade rows have to add the player. Stopping the click left no way to offer a deal on a phone.
        if (el.matches("[data-offer], [data-ask], [data-offerpick], [data-askpick]")) return;
        // Players-tab rows open the full profile (which already shows Sleeper + stats) — no scout overlay
        if (el.closest(".apt-row, .apt-modal")) return;
        const pid = el.getAttribute("data-pid") || el.getAttribute("data-scout");
        if (!pid || !window.AFA) return;
        const p = window.AFA.playerById ? window.AFA.playerById(pid) : (window.AFA.PLAYERS || []).find((x) => x.id === pid);
        if (!p) return;
        if (el.closest("#player-body") && el.tagName === "TR" && !el.dataset.scoutOnly) {
          // Show scout alongside draft row tap; drafting still proceeds
          pinScoutFromTap(p, e);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        pinScoutFromTap(p, e);
      }, true);
    });
  }

  // v0.1.21: never leave the scout backdrop up when switching tabs/screens (it blocked the hub tab bar)
  // v0.1.23: coach screen page-scroll is CSS-only (mobile.css); keep clearing scout backdrop here
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("#hub-nav button, [data-tab], .mobile-tabbar button, #draft-nav button")) unpinScout();
  }, true);
  window.AFAMobileUnpinScout = unpinScout;
  document.addEventListener("click", (e) => {
    if (!scoutPinned) return;
    const card = $("scout-card");
    if (!card || card.hidden) { scoutPinned = false; $("scout-backdrop")?.classList.remove("show"); return; }
    if (card.contains(e.target)) return;
    if (e.target.closest && e.target.closest("[data-pid], [data-scout]")) return;
    unpinScout();
  }, true);

  /* ---------- Mobile copy: Click → Tap ---------- */
  function patchMobileCopy(root) {
    if (!isMobile() || !root) return;
    root.querySelectorAll(".panel-h span, .panel-h .help, .help").forEach((el) => {
      if (!el || el.dataset.tapPatched) return;
      const t = el.textContent || "";
      if (/click/i.test(t) || /hover/i.test(t)) {
        el.textContent = t
          .replace(/Click a name to draft/gi, "Tap a name to draft")
          .replace(/CLICK A NAME TO DRAFT/g, "TAP A NAME TO DRAFT")
          .replace(/Tap or hover for scout card/gi, "Tap for scout card")
          .replace(/TAP OR HOVER FOR SCOUT CARD/g, "TAP FOR SCOUT CARD")
          .replace(/Click to add/gi, "Tap to add")
          .replace(/CLICK TO ADD/g, "TAP TO ADD");
        el.dataset.tapPatched = "1";
      }
    });
    // Static draft panel header in index.html
    const poolHint = document.querySelector("#draft-tab-board .panel-h span");
    if (poolHint && /click/i.test(poolHint.textContent || "")) {
      poolHint.textContent = "Tap a name to draft";
    }
  }

  /* ---------- Scroll reset when screens show ---------- */
  function resetScreenScroll(id) {
    const sc = $("screen-" + id);
    if (!sc) return;
    sc.scrollTop = 0;
    const ws = sc.querySelector(".workspace");
    if (ws) ws.scrollTop = 0;
    if (id === "mode") {
      const picker = $("franchise-picker");
      if (picker) picker.scrollTop = 0;
    }
    if (id === "draft") {
      const dw = $("draft-workspace");
      if (dw) dw.scrollTop = 0;
    }
  }

  /* ---------- Observe hub renders ---------- */
  const mo = new MutationObserver(() => {
    if (!isMobile()) return;
    wrapTables($("hub-body"));
    wrapTables($("draft-workspace"));
    bindScoutTap(document);
    prioritizeHubTabs();
    patchMobileCopy(document);
    syncBodyScreenClass();
  });

  function ensureRotateHint() {
    if (/\bsyscheck=1\b/.test(location.search)) return;
    const portrait = window.matchMedia("(orientation: portrait) and (max-width: 540px)").matches;
    let el = $("rotate-hint");
    if (!el) {
      el = document.createElement("div");
      el.id = "rotate-hint";
      el.className = "rotate-hint";
      el.innerHTML = '<div class="rotate-card" role="dialog" aria-labelledby="rotate-title">' +
        '<p id="rotate-title">Rotate your phone for the best experience.</p>' +
        '<p>The sideline, draft room, and menus are laid out for landscape.</p>' +
        '<button type="button" class="btn btn-primary" id="rotate-continue">Continue anyway</button></div>';
      document.body.appendChild(el);
      el.querySelector("#rotate-continue").onclick = () => {
        try { sessionStorage.setItem("afa-portrait-ok", "1"); } catch (e) {}
        el.hidden = true;
      };
    }
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("afa-portrait-ok") === "1"; } catch (e) {}
    el.hidden = !portrait || dismissed;
  }

  function boot() {
    ensureMobileChrome();
    registerSW();
    maybeShowInstallHint();
    prioritizeHubTabs();
    wrapTables(document);
    bindScoutTap(document);
    patchMobileCopy(document);
    syncBodyScreenClass();
    ensureRotateHint();
    const hubBody = $("hub-body");
    if (hubBody) mo.observe(hubBody, { childList: true, subtree: true });
    const draftWs = $("draft-workspace");
    if (draftWs) mo.observe(draftWs, { childList: true, subtree: true });
    // Watch screen class changes
    const app = $("app");
    if (app) {
      new MutationObserver(() => {
        syncBodyScreenClass();
        const active = document.querySelector(".screen.active");
        if (active && active.id) resetScreenScroll(active.id.replace(/^screen-/, ""));
      }).observe(app, { attributes: true, subtree: true, attributeFilter: ["class"] });
    }
    MQ.addEventListener?.("change", () => {
      prioritizeHubTabs();
      ensureRotateHint();
      if (!MQ.matches) $("mobile-drawer")?.classList.remove("open");
    });
    window.addEventListener("resize", ensureRotateHint);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.AFAMobile = {
    isMobile,
    isTouch,
    wrapTables,
    bindScoutTap,
    unpinScout,
    pinScoutFromTap,
    syncDrawer,
    prioritizeHubTabs,
    resetScreenScroll,
    syncBodyScreenClass,
    patchMobileCopy
  };
})();
