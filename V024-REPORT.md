# GM Franchise Builder v0.1.14 / build v024 — Integration + Skeptical Audit

Generated: 2026-11-05 America/New_York

## WR lineup — what was misaligned (v023) and what changed

| Issue | Before (v023) | After (v024) |
|---|---|---|
| TE placement | TE at field center `x:50,y:20` | Y/U TE on LOS adjacent to OT (`x≈18` or `≈84–90`, `y:46`) |
| WR3 / slot | WR3 at `x:18,y:58` (QB depth) | SL/SR off LOS at `y:30`, clear of OL/QB |
| X / Z roles | Generic WR1/WR2/WR3, both outsides off LOS at `y:18` | X = split end on/near LOS (`y:44`), Z = flanker off LOS (`y:28`), wide sides |
| Depth order | takeStarter order only | Absolute depth: WR1→X (ord0), WR2→Z (ord1), WR3→SL (ord2), WR4→SR |
| Formations | Single fixed 11-ish look | `10` / `11` / `12` / `21` personnel with toggles |
| Overlaps | TE/WR3 visually into OL/QB | `validateLineupGeometry` min-distance + LOS checks; 0 failures on 32×4 |

Screenshots: `shots/v024-lineup/before-v023-lineup.png`, `after-11-personnel.png`, `after-all-formations.png`, `ui-hub-lineup-{10,11,12,21}.png`.

## Integration summary
- Storage `afa-gm-franchise-builder-v024`; version `0.1.14`; legacy load v023/v022/v021.
- Scripts: grading, stats-2025 (1642 ids), systems data/market/rookie/injuries, `bridge-v024.js`.
- Seed grades from 2025 lines → `ovrBase` + `grade`; K/P lean; founding + rookie contracts; market-backed trade values.
- Sim: injuries + accrued season stats + end-season recalibrate/regrade; chunked rest-of-season.
- Hooks left for stadiums/dynasty (`AFABridge.hooks`).
- stadiums/ and dynasty/ untouched.

## Test results
- Formation template geometry: all clear (10, 11, 12, 21).
- Live WR order + geometry: **0 failures** / 32 teams × 4 formations.
- Sample 11: [{'slot': 'X', 'name': 'Jaxon Smith-Njigba', 'ovr': 97, 'x': 6, 'y': 44}, {'slot': 'SL', 'name': 'Carnell Tate', 'ovr': 96, 'x': 24, 'y': 30}, {'slot': 'Y', 'name': 'Trey McBride', 'ovr': 97, 'x': 90, 'y': 46}, {'slot': 'Z', 'name': 'Puka Nacua', 'ovr': 97, 'x': 94, 'y': 28}]
- 2 seasons × 272 games; avg combined pts ~44.8 then ~45.8.
- Modules loaded: grading/market/injuries/rookie/stats; console errors in boot audit: 0.

## Issues (skeptical pass) — open first, then fixed

| Sev | Area | Status | Issue |
|---|---|---|---|
| high | cap | **open** | Star-stacked test rosters: 21/32 over cap before contract retune; founding draft distribution + soft FA warn only — no hard block on trades. |
| high | grading | **open** | In-sim accrued stats schema may not match grading.deriveLine / 2025 seed line keys → recalibrate confidence can be low; K/P blend is heuristic. |
| high | sim | **open** | teamPower empty-roster returns 58, so undrafted clubs still 'play' average games — founding draft incomplete edge case. |
| high | trades | **open** | CPU trade accept ignores salary-cap overflow; a club can accept a deal that blows the cap. |
| medium | draft | **open** | When prospect class missing for a year, skip is allowed — owned picks for that year still filtered on finish/skip path needs verification. |
| medium | fa | **open** | No hard roster-limit (53) check on FA sign — only post-college-draft trim. |
| medium | injuries | **open** | IR designation limit not enforced in applyInjury path (designationsUsed never incremented). |
| medium | injuries | **open** | After 2 seasons 266 players still flagged onIR in test harness — rate looks high vs NFL; designation limit still unused. |
| medium | sim | **open** | Score model is still power+noise based; not drive/EPA. Yardage accrued heuristically, not tied to play-by-play. Distributions may diverge from NFL (e.g. 3000+ yard rushers possible on RB share). |
| medium | sim | **open** | No defensive snap counts / coverage grades from sim — end-season regrade will under-inform DB/LB vs WR/QB. |
| low | draft | **open** | College draft guard loop caps at 400; a corrupted board could stop early without finishing. |
| low | save | **open** | If seedGradesAndContracts throws mid-migrate, partial ovrBase may be set without grade. |
| low | sim | **open** | Ties allowed ~18%; NFL rarer after OT rules — OT not simulated. |
| low | ui | **open** | Hub lineup still embeds full depth chart above field; formation toggle only on offense. |
| low | ui | **open** | Grade badges require ovr vs ovrBase delta ≥2; subtle regrades invisible. |
| critical | lineup | **fixed** | v023 TE@center, WR3@QB-depth, missing X/Z/slot, single formation — replaced with FORMATIONS 11/12/21/10. |
| critical | lineup | **fixed** | pickFrom used nth-available instead of absolute depth index; WR3/SL could steal WR2 before Z. Fixed to pool[ord] absolute WR1→X, WR2→Z, WR3→SL. |
| high | cap | **fixed** | Founding veteran APYs retuned downward so balanced 53-man nearer $279.2M cap (still star-stacked rosters can overshoot — soft warn only). |
| high | lineup | **fixed** | Per-team geometry+WR order audit: 0 failures across 32 teams × 4 formations. |
| medium | fa | **fixed** | FA sign warns on cap overflow (confirm). |
| medium | save | **fixed** | STORAGE v024 + legacy chain includes v023; migrate seeds grades/contracts/IR/hooks. |
| medium | sim | **fixed** | 2×17-week sims: 272 games/season, avg combined score ~44.8 (~22 PPG). |
| medium | trades | **fixed** | executeTrade now guards ownership + duplicate player on both sides. |
| low | ui | **fixed** | Formation toggle 10/11/12/21 + WR key + geo-warn + data-slot attrs for tests. |

### Counts
```
('fixed', 'critical'): 2
('fixed', 'high'): 2
('fixed', 'low'): 1
('fixed', 'medium'): 4
('open', 'high'): 4
('open', 'low'): 5
('open', 'medium'): 6
```

## Open priorities (recommended next)
1. **High — trades/cap:** reject or warn CPU accepts that blow the cap; hard 53-man on FA sign.
2. **High — grading↔sim:** map accrued `playerStats` keys to `deriveLine` / seed schema; coverage stats for DB/LB.
3. **High — empty roster sim:** teamPower should tank or skip games if roster empty.
4. **Medium — IR designations:** increment/enforce `designationsUsed` limit; revisit injury rate.
5. **Medium — sim model:** drive-based scoring / OT; tighten rush yard shares.
