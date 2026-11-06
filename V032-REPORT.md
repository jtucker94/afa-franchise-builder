# AFA GM Franchise Builder — V032 Report (v0.1.22)

**Versions:** display/state `0.1.22` · assets `?v=032` · SW `afa-shell-v032` / `afa-data-v032` · save key `afa-gm-franchise-builder-v029` (unchanged).
**Date:** 2026-11-06 (America/New_York).

## Why
On iPhone Safari, Coach Assignment only scrolled inside the nested “Open clubs” and “2026 NFL head coaches” banks. The page itself did not scroll, so users could not move both lists together. The other-31 club bank also looked like an unlabeled to-do list.

## Fix — page scroll (≤900px)
In `css/mobile.css` for `#screen-coaches`:
- Screen is the single scroll container (`overflow-y: auto`).
- `.coach-workspace` / `.coach-layout` / panels use `height: auto` and `overflow: visible`.
- `.panel-b.scroll-bank` nested `overflow-y: auto` traps are forced off (`overflow: visible !important`).
- Sticky topbar (Lock hires reachable) + sticky footer (Sim other 31 reachable).
- Extra `padding-bottom` on the workspace so the last coaches clear the sticky footer.
- Floating SAVE FAB stays hidden on this screen (broadcast.css rule retained).

Desktop (≥901px) keeps the existing two-pane nested-scroll layout from `style.css`.

## Fix — Draft room page scroll (≤900px)
Same pattern on `#screen-draft`:
- Screen is the single vertical scroll container.
- `.draft-board`, `#draft-workspace`, `.draft-layout`, and pool/pick-feed `.panel-b` use `height: auto` / `overflow: visible` (no nested bank-only scroll).
- Sticky topbar + sticky draft tabs under it; bottom padding clears safe area.
- Floating SAVE FAB and Draft Room FAB forced `display: none` on `body.screen-draft-active` (header already has Save — FAB was covering OVR/names).
- Desktop pane layout unchanged.

## Fix — UX / accessibility (desktop + iPhone)
- Numbered 3-step strip: (1) Hire your HC → (2) Fill the other 31 / Sim / Assist → (3) Lock hires.
- Dynamic help copy tracks the step; player’s club sorts first in the open bank.
- Slots labeled with text badges **Your club** vs **Other club** (not color alone); CPU slots use dashed borders.
- Hired chips are buttons with aria-labels; Hire buttons ≥44px with “Hire {name} for {club}” labels.
- Panel hints, `aria-live` on hire count / footer note, focus-visible outlines, higher-contrast helper text.
- Landmark roles: banner / main / contentinfo; listbox/list semantics on the two banks.

## Files changed
- `index.html` (coach markup + `?v=032` + eyebrow v0.1.22)
- `sw.js`, `manifest.json` (v032 caches / start_url)
- `css/mobile.css` (coach + draft page scroll + mobile UX)
- `css/style.css` (shared coach UX/a11y)
- `css/broadcast.css` (FAB-hide comment)
- `js/app.js` (renderCoaches UX/a11y + version 0.1.22; STORAGE still v029)
- `js/mobile.js` (version comment)
- `work/reports/V032-REPORT.md`

## Verify
- Live Pages should show `v0.1.22` / `?v=032` after push.
- iPhone: entire coach page scrolls; Open clubs and coaches list both in flow; sticky Sim footer does not permanently cover the last rows.
- iPhone draft: page scrolls from pick header through tabs, BEST AVAILABLE, and the full player pool; SAVE FAB does not cover rows.
- Laptop: two-pane coach/draft layouts still usable; steps + badges visible.
