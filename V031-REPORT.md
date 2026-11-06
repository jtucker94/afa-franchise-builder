# AFA GM Franchise Builder — V031 Report (v0.1.21)

**Versions:** display/state `0.1.21` · assets `?v=031` · SW `afa-shell-v031` / `afa-data-v031` · save key `afa-gm-franchise-builder-v029` (unchanged).
**Data fetched:** 2026-11-06 13:46 ET · Sleeper season 2026, regular, week 9 (from `/v1/state/nfl`).

## Endpoints used (all 200, public, no token)
- `GET /v1/state/nfl` (season/week/season_type — not hardcoded)
- `GET /v1/players/nfl` (cached in `work/sleeper/players.json`, refetch only if >24h)
- `GET /v1/stats/nfl/regular/2026` (season-to-date raw counting stats)
- `GET /v1/projections/nfl/regular/2026` (season projections + ADP fields)
Not used: trending add/drop, pts_ppr / pos_rank_* (never read), UI scraping.

## Build
`work/build-sleeper-v031.py` → `game/js/sleeper-2026.js` (~800 KB, compact; only matched GMFB players). Meta block records fetchedAt, season, week, match counts.
Fields kept: sid (Sleeper player_id string), team (null → "Free Agent"), position, age, years_exp, injury_status + body part, depth_chart_position/order, search_rank, ADP (adp_idp for defenders [DE/DT/LB/CB/S or fantasy_positions ∩ {DL,LB,DB}], adp_ppr for offense/K/P), adp_dynasty_ppr (offense only), positional ADP percentiles, raw season stats and raw season projections (non-zero keys only). 999/missing ADP → null.

## Matching
- GMFB pool rows: 2532 · matched 2504 (2492 by existing `sleeperId`, 12 by normalized search_full_name + team, unique only) · unmatched 28 · ambiguous skipped 0.
- Valid position-appropriate ADP: 967 players · valid dynasty ADP: 696.
- Notable unmatched (mostly fringe/practice-squad, ovr 68–82): David Ebuka Agoha (DEN DE), Mario Goodrich III (TEN CB), Sean Fresch (DEN CB), T.J. Tampa (BAL CB), Cameron Ball (IND DT), Maceo Beard-Aigret (MIN CB), Vincent Anthony Jr. (SF DE), Zachary Carter (ARI DT), Dwight McGlothern Jr. (MIN CB), Jalen Moreno-Cropper (NO WR). Full list: `work/sleeper/build-log.json`. No stars unmatched.

## Algorithm (js/scout.js, GMFB algo v0.2)
GMFB base unchanged: `0.40·Madden + 0.30·PFF-est + 0.18·athleticism + 0.12·skill + age`.
New explicit Sleeper pillar:
- `sleeperScore = 55 + 44·positionalPct(ADP)` (lower ADP = higher pct, within GMFB position among valid ADPs)
- if dynasty ADP valid: `sleeperScore = 0.75·sleeperScore + 0.25·(55 + 44·dynPct)`
- `adj = clamp(0.12·(sleeperScore − GMFB_base), −3, +3)`; GMFB = base + adj
- No valid ADP → adj 0 (no penalty). search_rank is display-only. pts_ppr never used.
Observed adj range across 967 players: −3 … +3. Scout schema bumped 3→4 so saved players re-enrich.
Note: the pre-existing roster OVR (players-nfl.js) was calibrated earlier partly from search_rank; this is why search_rank is not also used in the formula.

## UI
- Scout card: GMFB tile shows "Sleeper ±x"; new "Sleeper market & 2026 stats" block (Sleeper ADP (PPR/IDP) with positional top-%, Dynasty ADP, Sleeper popularity #, GMFB Sleeper adj, team/Free Agent, depth slot, snap %, injury, raw stat chips, source line). Missing → "Not on record"/"Unranked".
- Players tab full profile: same block on Overview.
- CSS in `css/style.css` (v0.1.21 Sleeper block); 2-column chips ≤900px; verified no horizontal overflow at 390px (`work/reports/v031-sleeper-mobile.png`).

## Files changed
index.html, sw.js, manifest.json, js/app.js, js/scout.js, js/mobile.js (header comment), css/style.css, careers/players-tab.js, new js/sleeper-2026.js; work/build-sleeper-v031.py.

## Skipped
Weekly files/PPG, weekly rich injury notes, trending, headshot changes (already Sleeper CDN), K/P/DEF ADP beyond adp_ppr when present, college prospects (not in Sleeper NFL data).
