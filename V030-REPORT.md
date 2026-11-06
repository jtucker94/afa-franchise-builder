# AFA GM Franchise Builder — V030 Report

**Version:** 0.1.20 (STORAGE still `afa-gm-franchise-builder-v029`, assets `?v=030`)  
**Date:** 2026-11-06 (America/New_York)  
**Scope:** iPhone / narrow-screen layout & visibility fixes from the v030 audit playthrough. No gameplay/stat inventing; layout-only unless a control was blocked.

---

## What changed

### Files
- `css/mobile.css` — major ≤900px layout pass (draft pool, scout modal, toasts, FAB, hub tabs, gameday, trades, coach, draft-complete, install banner, mode contrast, scroll padding)
- `js/mobile.js` — scout modal + backdrop/close, body screen classes, scroll reset, install banner above Play Story, short hub tab labels, Click→Tap copy patch
- `js/app.js` — showScreen scrollTop + body classes; toast auto-dismiss + pointer-events none; mobile scout placement/close; Draft button no longer stolen by scout; hide Draft FAB on draft screen; chart label collision; Tap copy; version `0.1.20` (STORAGE key unchanged)
- `css/style.css` — mode-tile text contrast; toast `pointer-events: none`; draft-complete-card `overflow-x: hidden`
- `index.html` — `?v=030`, menu `v0.1.20`, pool hint “Tap a name to draft”
- `sw.js` — caches `afa-shell-v030` / `afa-data-v030`
- `manifest.json` — start_url `?v=030`
- `careers/players-tab.js` — profiles bust `?v=030`

### Version strings
- Display / state: **0.1.20**
- Asset query: **`?v=030`**
- SW caches: **`afa-shell-v030`**, **`afa-data-v030`**
- Save key: **`afa-gm-franchise-builder-v029`** (unchanged; migrations intact)

---

## Audit items

| # | Issue | Status |
|---|-------|--------|
| 1 | Scout card blocks Draft / overflows | **Fixed** — modal (max ~100vw−16px, 80vh, overflow-y, no h-scroll); ✕ + backdrop dismiss; tap opens (not hover); Draft button excluded from scout hit-target; scout on rec **name** only |
| 2 | Player pool unreachable | **Fixed** — `.draft-layout { height: auto }`; workspace scrolls; pool after rec on mobile but both reachable |
| 3 | DRAFT BOARD / ROOM pill covers Sim/Auto/Save | **Fixed** — Draft FAB hidden while `#screen-draft` is active |
| 4 | Install banner covers Play Story | **Fixed** — banner inserted into `.menu-card` above logo/CTAs (or top-fixed fallback) |
| 5 | Team-pick header offscreen | **Fixed** — `#screen-mode` `justify-content: flex-start`; scrollTop reset on show / picker open |
| 6 | Toast covers Begin coach assignments | **Fixed** — `pointer-events: none`; auto-remove `.show` ~2.6s; positioned above FAB |
| 7 | Draft chrome too tall | **Fixed** — compacted topbar/clock/nav; layout height auto |
| 8 | Coach screen cramped / FAB over hint | **Fixed** — flex row heights for lists; footer left padding clears FAB |
| 9 | Hub tab bar cuts Play Week | **Fixed** — shorter labels, horizontal scroll + right fade cue; hamburger still lists all |
| 10 | Trades table clipped | **Fixed** — horizontal scroll in panel-b; hub padding-bottom for FAB/tabs |
| 11 | Game Day overlap / field overflow | **Fixed** — scorebug + meters stack statically; stage/field max-width 100% |
| 12 | Draft Complete modal h-scroll / Continue | **Fixed** — max-width 100%, no h-scroll, sticky Continue footer; tiny K/P labels omitted + legend line |
| 13 | Mode-select dark titles | **Fixed** — explicit `color: var(--text)` on `.mode-tile` / `h2` |
| 14 | SAVE FAB on boot/menu/cold open | **Fixed** — hidden on boot/menu/story via body screen classes; padding elsewhere |
| 15 | Desktop “CLICK/HOVER” copy on mobile | **Fixed** — Tap wording in HTML/JS + runtime patch |
| 16 | Cut buttons <44px | **Fixed** — coarse-pointer min 44×64 |
| 17 | Toasts under FAB/tab bar | **Fixed** — same positioning as #6 |
| 18 | Week 1 results after Sim This Week | **Skipped** — not confirmed as a clear layout bug in a few minutes; schedule UX, not overflow |
| 19 | Version label V0.1.19 → V0.1.20 | **Fixed** |

Desktop (≥901px) path left essentially unchanged (mobile overrides stay behind ≤900px / mobile-only chrome).

---

## Publish
- Copied `game/` → git checkout `/tmp/afa-franchise-builder` on `main` (with `.nojekyll`)
- Commit: `e8a9b363ba65f8db914c86fd767ae6f3c9c40f6b` — Fix iPhone layout overflow and covered controls (v0.1.20)
- Author: jtucker94 <n.jordantucker94@gmail.com>
- Push: **succeeded** (`main`)
- Live verified: index shows `v0.1.20` / `?v=030`; `sw.js` → `afa-shell-v030`; mobile.css contains scout-backdrop / screen-draft-active rules
- URL: https://jtucker94.github.io/afa-franchise-builder/

## Still worth a visual re-check on a real iPhone
1. Scout modal open/close while drafting (Draft button + name tap)
2. Scrolling to Player pool after Sim controls
3. Hub tab bar swipe to **Play** + hamburger
4. Install banner does not cover Play Story before “Got it”
5. Cold-open toast does not block “Begin coach assignments”
