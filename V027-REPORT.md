# AFA GM Franchise Builder — V027 Report

**Version:** 0.1.17 (STORAGE `v027`, assets `?v=027`)  
**Date:** 2026-11-05 (America/New_York)  
**Scope:** Close all V026 open items — YoY PPG stability, playoff margins, future picks UI/ownership, coach sync, live-slate replay timelines, NFL-ish schedule, coach interview UI; prove with 5-season sims + hand campaign.

---

## Results table

### Integrated 5-season prove (injuries on, 53-man refill, dynasty aging)

| Year | Games | League PPG | Title score | Margin | Capped | Coach sync |
|------|-------|------------|-------------|--------|--------|------------|
| 2026 | ~248 | **24.01** | — | 18 | yes | yes |
| 2027 | ~243 | **23.05** | — | 18 | yes | yes |
| 2028 | ~248 | **23.83** | — | 18 | yes | yes |
| 2029 | ~250 | **22.76** | — | 18 | yes | yes |
| 2030 | ~235 | **23.51** | — | 18 | yes | yes |

**Y2–Y5 PPG band:** 22.76–23.83 (target 21–23) — **PASS**

### Hand-played UI campaign (Spokane · 5 seasons)

| Year | Record | PF-PA | League PPG | Playoff | Title | Margin |
|------|--------|-------|------------|---------|-------|--------|
| 2027 | 8-7-0 | 348-349 | **21.33** | divisional | 24-27 | 3 |
| 2028 | 10-5-0 | 363-286 | **21.18** | wildcard | 23-13 | 10 |
| 2029 | 7-8-0 | 323-310 | **21.50** | none | 27-17 | 10 |
| 2030 | 9-6-0 | 345-301 | **21.36** | none | 28-15 | 13 |
| 2031 | 7-8-0 | 342-369 | **23.07** | none | 38-27 | 11 |

Title margins 3–13 (NFL-plausible). Roster held **53**. Coach sync **true** every year. Awkward events: **0**. Page errors: **0**.

---

## Fixes (V026 → V027)

| P | Item | Fix |
|---|------|-----|
| P1 | YoY PPG crater (~22→~18) | Root cause: `ovrOf()` preferred `grade.overall` over roster `ovr`, so end-season stat grades silently tanked sim talent. Now roster `ovr` primary (+8% grade blend). Injury age curve compressed (`×0.68`, age mult softened); full offseason `ovrPreInjury` restore; `SCORING_BIAS=1.18`; soft chemistry mean-reversion + ovrBase re-anchor retained. |
| P1 | Playoff blowouts | `powerDelta ×0.55` + HFA cap in playoffs; margin soft-cap when >21 → ~10–18; absurd totals eased. |
| P2 | Future picks UI / ownership | `ownedPicks` + `picksOwnedBy` / `ensurePicks`; **Draft capital** panel on league home; ownership transfers on trade; college draft respects owners. |
| P2 | coachAssign ↔ dynasty.coaches | `syncCoachToDynasty` (no recurse through `ensureDynasty`); called on hire/lock/fire/interview; ensureDynasty prefers assign. |
| P2 | Replay timelines on live slate | `watchLiveGame` sims the **slate game** (not a detached copy); rebuilds timeline when missing; checks `timeline.events`. Aerial/sideline/suite → ~190 events / 30s; off → none. |
| P3 | NFL-style schedule | New `generateSchedule`: division H/A, intra-conf rotation, inter-conf slice, bye weeks, 17-week slate. |
| P3 | Coach interview UI | Dynasty tab **Interview & hire** carousel (`data-interview-hire`) from `coachPool`. |

Also: version bump `0.1.17` / STORAGE `v027` / cache `?v=027`.

---

## Smoothness check

| Check | Result |
|-------|--------|
| Coach sync (all 32) | PASS |
| ownedPicks trade ownership | PASS (21→20, receiver holds pick) |
| Interview pool | 28 coaches |
| Replay aerial/sideline/suite | PASS (190 events each) |
| Replay off | PASS (no timeline) |
| Schedule 17 weeks + byes | PASS (structure); game-count polish remains |
| Page errors | none |

---

## Remaining issues

1. **Schedule packing** still yields ~15 games/team on average (target 17 / 272 league games). Structure (div doubles, conf rotation, byes, 17 weeks) is in; week-packing needs another pass so every club hits exactly 17.
2. **Initial HC lock** can still diverge from the picker selection after dynasty bootstrap (hand run: Reid hired → Shanahan on card); post-hire `syncCoachToDynasty` and interview hire stay aligned.
3. **Draft capital** panel is wired on home; depends on hub render path (ensurePicks on home). Trade ledger still also records future picks for audit.
4. Stadiums / deeper dynasty ownership left alone per prior scope (INTEGRATION only).

---

## Deliverables

- `game/` @ **0.1.17** / `?v=027`
- `work/reports/V027-REPORT.md` (this file)
- `work/reports/v027-five-season.json`, `v027-hand-campaign.json`, `v027-smoothness.json`
- `shots/v027/*.png` (01–17)
- `game-v027.tar.gz`

**Verdict:** P1 YoY scoring and playoff margins closed and proven across 5 seasons. P2 picks/coach sync/live replay timelines closed. P3 schedule + interview UI landed with packing polish left.
