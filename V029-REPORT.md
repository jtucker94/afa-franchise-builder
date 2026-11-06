# AFA GM Franchise Builder — V029 Report

**Version:** 0.1.19 (STORAGE `v029`, assets `?v=029`)  
**Date:** 2026-11-05 (America/New_York)  
**Scope:** iPhone-ready responsive layout + installable PWA (manifest, icons, service worker, safe areas); mobile Chromium tests; hosting survey.

---

## What changed

### Mobile layout (`css/mobile.css`, `js/mobile.js`)
- Bottom fixed hub tab bar with horizontal scroll + hamburger drawer for all hub tabs (≤900px)
- Safe-area insets for notched iPhones (`viewport-fit=cover`, env(safe-area-inset-*))
- Tap targets ≥44px on coarse pointers; inputs at 16px to avoid iOS zoom
- Tables wrap in `.table-scroll` for horizontal swipe
- Depth / trades / standings / game day / players tab collapse to single column or card-like rows
- Scout cards open on **tap** (pinned sheet); hover still works on desktop
- Save / Draft FABs lift above the bottom tab bar
- Desktop (≥901px) unchanged; mobile-only chrome hidden

### PWA
- `manifest.json` — name **AFA Franchise Builder**, standalone, theme `#e0b145`
- Icons 180 / 192 / 512 (from AFA logo) + `apple-touch-icon.png`
- Apple meta tags (`apple-mobile-web-app-capable`, status bar, title)
- `sw.js` — versioned caches `afa-shell-v029` / `afa-data-v029`
  - Precaches app shell (HTML/CSS/JS modules)
  - **On-demand** cache for `profiles-data.js` (~7MB) and large JSON (not precached)
  - Old `afa-*` caches deleted on activate
- Install hint banner for iOS Safari (Share → Add to Home Screen)

### Version bump
- STORAGE `afa-gm-franchise-builder-v029` (reads legacy v028…v021)
- State version `0.1.19`; all asset query strings `?v=029`
- `profiles-data.js` load bust updated from `?v=025` → `?v=029`

---

## Tests (headless Chromium)

| Check | Result |
|-------|--------|
| iPhone 390×844 touch, zero page errors | **PASS** |
| Zero console errors | **PASS** |
| Service worker registers | **PASS** (`sw.js`, installing/active) |
| Manifest + apple-touch linked | **PASS** |
| Mobile chrome (fixed hub-nav + hamburger) | **PASS** |
| Scout tap opens card | **PASS** |
| Players tab / search path | **PASS** |
| Campaign smoke (sim one game) | **PASS** (34–24) |
| Desktop menu / hub still works; hamburger hidden | **PASS** |

Artifacts:
- `shots/v029-mobile/` (13 shots)
- `shots/v029-desktop/` (3 shots)
- `work/reports/v029-mobile-pwa.json`

**Best screenshots (3):**
1. `shots/v029-mobile/02-menu.png` — phone menu @ v0.1.19
2. `shots/v029-mobile/04-hub-home.png` — bottom tab bar + hub
3. `shots/v029-mobile/07-scout-tap.png` — tap scout card sheet

---

## Hosting / public HTTPS link

**No permanent public link yet.** No credentials were used or created.

| Option | Box status | What Jordan would need |
|--------|------------|-------------------------|
| **GitHub Pages** (`gh`) | Not logged in | `gh auth login` (browser/device flow), then create/push a public repo and enable Pages on `/docs` or `gh-pages` |
| **Cloudflare Pages** (`wrangler`) | Not authenticated | `wrangler login` (Cloudflare account in browser), then `wrangler pages deploy game` |
| **Netlify CLI** | Not authenticated (also wants Node ≥22 for latest CLI) | Netlify account + `netlify login`, then `netlify deploy --dir=game --prod` |
| **Surge.sh** | Not authenticated | `surge` account / `surge login`, then `surge game afa-franchise.surge.sh` |
| **cloudflared quick tunnel** | Binary present; **edge connect blocked** in this environment (QUIC/TCP 7844 fail, TLS EOF on http2). URL was issued (`*.trycloudflare.com`) but returned **530** — not usable. | N/A here; on an unrestricted network: `cloudflared tunnel --url http://localhost:PORT` (temporary only, no account) |

**Hosting blocker:** need Jordan to complete one provider login (GitHub is the cleanest for a static game). After that, the packaged `game/` folder (or `game-v029.tar.gz`) deploys as-is — HTTPS + PWA install will work from Safari.

Local play without hosting: open `game/index.html` via any static server on the LAN, or AirDrop the tarball and serve on the Mac.

---

## Deliverables

- `game/` @ **0.1.19** / `?v=029`
- `game-backup-v028.tar.gz` (5.1M)
- `game-v029.tar.gz` (5.5M)
- `work/reports/V029-REPORT.md`
- `work/reports/v029-mobile-pwa.json`
- `shots/v029-mobile/`, `shots/v029-desktop/`

---

## Remaining issues

1. **No live public URL** until a host login (see above). Cloudflare quick tunnel is blocked on this box.
2. Hub bottom bar shows ~5–6 primary tabs at once; others need horizontal swipe or the ☰ drawer (by design, but dense).
3. Players virtualized list CSS on very narrow phones is simplified (card rows); deep profile modal is full-bleed sheet — further polish possible.
4. Game-day replay canvas uses 4:3 on phones (readable) vs 16:9 desktop — fine, but suite/sideline camera chrome is still busy on 390px.
5. Large data (`profiles-data.js`, sleeper JSON) still needs network on first Players-tab open (then SW caches). Fully offline Players profiles require that first visit.
6. Omni Desktop sync of v029 not done this turn (prior v022 sync was still pending when machine offline).
7. iOS “Add to Home Screen” must be done once by Jordan in Safari after a permanent HTTPS URL exists (PWA install prompt is limited on iOS).
