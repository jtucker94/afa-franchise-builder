# AFA GM Franchise Builder — V028 Report

**Version:** 0.1.18 (STORAGE `v028`, assets `?v=028`)  
**Date:** 2026-11-05 (America/New_York)  
**Scope:** Exact-17 schedule + HC lock/dynasty card drift; regression.

---

## Schedule generator

- **18 weeks**, **17 games/team**, **1 bye** in weeks **5–14**
- Bye weeks always even (2 or 4 byes) so active sets match
- Week-by-week perfect matching (no double-booking)
- Home/away balanced to **8 or 9** (year/team parity targets)
- `validateSchedule()` exported

### 10-season validator

| Result | Detail |
|--------|--------|
| **allOk** | **true** (2026–2035) |
| Games/team | 17 exact every club |
| Home | 8–9 every club |
| Byes | weeks 5–14 only, one each |
| Double-book | none |

---

## HC lock ↔ dynasty card

- `lockCoaches` syncs all `coachAssign` → `dynasty.coaches` before draft
- `autoCoaches` / `syncCoachToDynasty` preserve hired id
- `assistCoach` never overwrites an existing hire
- `ensureDynasty` treats **coachAssign as source of truth**
- Drift test: Reid survives ensure + forced Shanahan overwrite → restored

Hand campaign: **Andy Reid** stayed Y1–Y2 (`coachSync: true`); Y3 hot-seat replace stayed synced.

---

## Regression

| Check | Result |
|-------|--------|
| Smoothness | PASS (schedule, HC, replay 176/176/176/0) |
| Hand 3 seasons | PPG 21.53 / 21.43 / 21.42 · 272 games/season · 0 awkward |

---

## Deliverables

- `game/` @ 0.1.18 / `?v=028`
- `work/reports/V028-REPORT.md`
- `work/reports/v028-schedule-validator.json`, `v028-hc-lock.json`, `v028-smoothness.json`, `v028-hand-campaign.json`
- `shots/v028/`
- `game-v028.tar.gz`
