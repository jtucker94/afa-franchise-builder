/* AFA Franchise Builder service worker — versioned caches */
const SW_VERSION = "v051";
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
  "./css/style.css?v=051",
  "./css/mobile.css?v=051",
  "./css/broadcast.css?v=051",
  "./stadiums/stadium.css?v=051",
  "./dynasty/dynasty.css?v=051",
  "./gameday/gameday.css?v=051",
  "./careers/careers.css?v=051",
  "./careers/players-tab.css?v=051",
  "./js/mobile.js?v=051",
  "./js/players-nfl.js?v=051",
  "./js/prospects-college.js?v=051",
  "./js/data.js?v=051",
  "./js/sleeper-2026.js?v=051",
  "./js/sleeper-leagues.js?v=051",
  "./js/madden-nfl27-lists.js?v=051",
  "./js/madden-nfl27-ea.js?v=051",
  "./js/rating-sources.js?v=051",
  "./js/scout.js?v=051",
  "./js/grading.js?v=051",
  "./js/stats-2025.js?v=051",
  "./js/systems-data-bundle.js?v=051",
  "./js/systems-market.js?v=051",
  "./js/systems-rookie-scale.js?v=051",
  "./js/systems-injuries.js?v=051",
  "./stadiums/stadium-data.js?v=051",
  "./stadiums/stadiums.js?v=051",
  "./stadiums/stadium-ui.js?v=051",
  "./dynasty/coaches.js?v=051",
  "./dynasty/dynasty.js?v=051",
  "./gameday/engine.js?v=051",
  "./gameday/replay.js?v=051",
  "./gameday/gameday-ui.js?v=051",
  "./careers/careers-data.js?v=051",
  "./careers/careers-ui.js?v=051",
  "./careers/players-tab.js?v=051",
  "./js/bridge-v024.js?v=051",
  "./js/bridge-v025.js?v=051",
  "./js/draft-engine.js?v=051",
  "./js/refresh-clock.js?v=051",
  "./js/news-feed.js?v=051",
  "./js/real-status.js?v=051",
  "./js/league-scout.js?v=051",
  "./js/team-logos.js?v=051",
  "./js/news-ticker.js?v=051",
  "./js/workspace-data.js?v=051",
  "./js/workspace-ui.js?v=051",
  "./js/franchise-mode.js?v=051",
  "./js/team-cultures.js?v=051",
  "./js/team-theme.js?v=051",
  "./js/sortable-tables.js?v=051",
  "./js/player-attrs.js?v=051",
  "./js/trade-desk.js?v=051",
  "./js/app.js?v=051"
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
