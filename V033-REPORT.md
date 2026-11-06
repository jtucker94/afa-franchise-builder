# AFA GM Franchise Builder — V033 Report (v0.1.23)

**Versions:** display/state `0.1.23` · assets `?v=033` · SW `afa-shell-v033` / `afa-data-v033` · save key `afa-gm-franchise-builder-v029` (unchanged).
**Date:** 2026-11-06 (America/New_York).

## Why
On the AFA Draft OPENING / cinematic intro overlay (not the draft room), the player saw their franchise name but not the head coach they hired on the coach-assignment screen. Request: show the selected HC on that same intro screen for iPhone Safari without crowding the layout.

## Change — draft intro copy (dynamic, not hardcoded)
In `js/app.js` → `fillDraftIntroCopy()`:
- Read franchise from `state.userTeamId` via `displayName(teamById(...))` (single-franchise mode).
- Read hired HC from `state.coachAssign[state.userTeamId]` via `coachById` (same map written on the coach-assignment screen).
- If a coach name exists:
  - Eyebrow (`#draft-intro-eyebrow`): `Your franchise · {TEAM} · HC {COACH}`
  - Dim body (`#draft-intro-dim`): `You draft for the {TEAM}, led by {COACH}. The other 31 clubs pick themselves.`
- If coach is missing: keep the previous team-only strings (do not invent a name).
- League / multi mode unchanged (`Alliance Football Association` / empty-roster lede).
- Ticker already listed coaches; left as-is.
- No changes to draft logic, Sleeper data, save format, uniqueness rules, or coach-assignment page-scroll from v0.1.22.

## Layout (iPhone Safari)
- `css/style.css`: `.draft-open-eyebrow` gets `line-height: 1.45`, `max-width: 100%`, light horizontal padding so a longer `· HC {name}` line can wrap cleanly.
- `css/mobile.css` (≤900px): slightly tighter eyebrow `letter-spacing` / `font-size` so the HC addition does not overflow the cinematic center stack.

## Version bump
- Display / save payload version → `0.1.23` (load still accepts `0.1.22`…`0.1`).
- Asset query + SW caches → `?v=033` / `afa-shell-v033` / `afa-data-v033`.
- **Save key stays `afa-gm-franchise-builder-v029`.**

## Files changed
- `js/app.js` (intro copy + version 0.1.23; STORAGE still v029)
- `index.html` (`?v=033`, boot eyebrow v0.1.23)
- `sw.js`, `manifest.json` (v033 caches / start_url)
- `css/style.css`, `css/mobile.css` (eyebrow wrap / mobile density)
- `js/mobile.js` (version comment)
- `V033-REPORT.md` / `work/reports/V033-REPORT.md`

## Verify
- Live Pages should show `v0.1.23` / `?v=033` after push.
- After hiring an HC and locking into the draft: intro eyebrow includes `· HC {name}`; dim line includes `led by {name}`.
- If somehow coachAssign is empty for the user team: team-only copy (no invented HC).
- Coach + draft page-scroll from v0.1.22 still present on ≤900px.
