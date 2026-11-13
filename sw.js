/* AFA Franchise Builder service worker — versioned caches */
const SW_VERSION = "v047";
const SHELL_CACHE = `afa-shell-${SW_VERSION}`;
const DATA_CACHE = `afa-data-${SW_VERSION}`;

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./assets/gm-franchise-builder-logo.jpg",
  "./css/style.css?v=047",
  "./css/mobile.css?v=047",
  "./css/broadcast.css?v=047",
  "./stadiums/stadium.css?v=047",
  "./dynasty/dynasty.css?v=047",
  "./gameday/gameday.css?v=047",
  "./careers/careers.css?v=047",
  "./careers/players-tab.css?v=047",
  "./js/mobile.js?v=047",
  "./js/players-nfl.js?v=047",
  "./js/prospects-college.js?v=047",
  "./js/data.js?v=047",
  "./js/sleeper-2026.js?v=047",
  "./js/sleeper-leagues.js?v=047",
  "./js/madden-nfl27-lists.js?v=047",
  "./js/madden-nfl27-ea.js?v=047",
  "./js/rating-sources.js?v=047",
  "./js/scout.js?v=047",
  "./js/grading.js?v=047",
  "./js/stats-2025.js?v=047",
  "./js/systems-data-bundle.js?v=047",
  "./js/systems-market.js?v=047",
  "./js/systems-rookie-scale.js?v=047",
  "./js/systems-injuries.js?v=047",
  "./stadiums/stadium-data.js?v=047",
  "./stadiums/stadiums.js?v=047",
  "./stadiums/stadium-ui.js?v=047",
  "./dynasty/coaches.js?v=047",
  "./dynasty/dynasty.js?v=047",
  "./gameday/engine.js?v=047",
  "./gameday/replay.js?v=047",
  "./gameday/gameday-ui.js?v=047",
  "./careers/careers-data.js?v=047",
  "./careers/careers-ui.js?v=047",
  "./careers/players-tab.js?v=047",
  "./js/bridge-v024.js?v=047",
  "./js/bridge-v025.js?v=047",
  "./js/draft-engine.js?v=047",
  "./js/refresh-clock.js?v=047",
  "./js/news-feed.js?v=047",
  "./js/real-status.js?v=047",
  "./js/league-scout.js?v=047",
  "./js/team-logos.js?v=047",
  "./js/news-ticker.js?v=047",
  "./js/workspace-data.js?v=047",
  "./js/workspace-ui.js?v=047",
  "./js/franchise-mode.js?v=047",
  "./js/team-cultures.js?v=047",
  "./js/team-theme.js?v=047",
  "./js/sortable-tables.js?v=047",
  "./js/player-attrs.js?v=047",
  "./js/trade-desk.js?v=047",
  "./js/app.js?v=047"
];

const ON_DEMAND_HINTS = [
  "profiles-data.js",
  "sleeper-nfl-players.json",
  "espn-active-roster.json",
  "afa-nfl-free-agents.json",
  "afa-college-prospects.json",
  "league-settings.json",
  "news-cache.json",
  "nfl-availability.json",
  "refresh-status.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Precache shell; skip failures so install still succeeds
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => cache.add(url.split("?")[0]).catch(() => null))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("afa-") && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isOnDemand(url) {
  return ON_DEMAND_HINTS.some((h) => url.includes(h));
}

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (!isSameOrigin(url)) return; // let Google Fonts etc. go to network

  if (isOnDemand(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // App shell: stale-while-revalidate-ish — cache first, refresh in background
  event.respondWith(
    caches.match(req).then(async (cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
