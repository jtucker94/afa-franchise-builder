# AFA GM Franchise Builder — v0.1.13 data correction log

Fetched: 2026-11-05 (America/New_York)

## Sources
- ESPN `site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{id}/roster` (all 32 teams)
- ESPN athlete endpoints for free-agent status spot-checks
- Sleeper players dump (`game/data/sleeper-nfl-players.json`) for sleeperId + search_rank
- College: PFN college pages, school athletics sites, StickToTheModel IOZ board, NFL Mock Draft Database consensus

## NFL player pool
| Metric | Count |
| --- | --- |
| Prior pool | 2531 |
| Live ESPN roster athletes | 2566 |
| Final pool (LS excluded) | 2532 |
| Removed (not on current roster / Free Agent) | 3 |
| Added from ESPN (non-LS) | 4 |
| OVR recalibrated by ≥5 | 1103 |
| OVR 99 after fix | 23 |

### Removed (inactive / free agent off roster)
- Carter Runyon (LV TE) — Not on current ESPN team roster
- Luke Haggard (TB OG) — Not on current ESPN team roster
- Jake Haener (NYG QB) — Not on current ESPN team roster

### Added
- Bub Means (KC WR)
- David Long Jr. (LAR CB)
- Cody White (LV WR)
- Kindle Vildor (NE CB)

### OVR examples (deflated inflated specialists / unranked OL)
- Hayden Conner OG: 89 → 73
- Kingsley Eguakun C: 84 → 71
- Josh Fryar OT: 86 → 65
- Albert Reese IV OT: 99 → 72
- Isaac Seumalo OG: 59 → 72
- Jayden Williams OT: 92 → 72
- Blake Gillikin P: 85 → 61
- Isaiah Adams OG: 80 → 70
- Chase Bisontis OG: 96 → 72
- Paris Johnson Jr. OT: 80 → 73
- Demontrey Jacobs OT: 72 → 64
- Valentin Senn OT: 74 → 66

### Kept as active per ESPN+Sleeper (even if historically surprising)
- Aaron Donald (LAR DT) — ESPN status Active, Sleeper Active as of fetch

### PFF grades
- Official PFF is paywalled. Scout UI now labels all PFF figures as **estimate**.

## College prospects
- Truncated duplicate removed: Ryan Coleman-Will...
- Name fixed: Ezra Dotson-Oyeta... → Ezra Dotson-Oyetade (Texas State)
- Position fixed: Jackson Bennee CB → S (Utah athletics)
- Colleges filled: 54 (plus Dom Nichols→Michigan, Bradyn Joiner→Purdue)
- Blank colleges remaining: 0

## Trial walkthrough (headless Chromium)
- Team: Providence Anchors
- Coach: Andy Reid
- Founding draft: 1,696 picks via Sim Draft
- Notable early picks: R1 Micah Parsons (DE 98); R2 Brian Thomas Jr. (WR 95); R3 Jamien Sherwood (LB 95); R4 Sam LaPorta (TE 98); R5 Tykee Smith (S 96)
- Trade: confirmed future pick package (ask R1 from Hartford)
- Season: simmed to final (11-5-1 in one run)
- College draft: simmed; roster trimmed back to 53; advanced to 2028 season
- Final top talent: Sam LaPorta TE 98, Saquon Barkley RB 98, Tykee Smith S 96, Lane Johnson OT 95, A'Shawn Robinson DT 93, Kyler Murray QB 92, Jauan Jennings WR 92, Christian Elliss LB 90

## Bugs fixed this pass
1. Season trend chart used `homeScore/awayScore` but sim stores `hs/as` → NaN paths (fixed)
2. Founding pick objects lacked `round` (fixed)
3. `lockDraft` skipped draft-complete summary UI (now shows charts, auto-advances)
4. College draft could leave 59-man rosters (now trims to 53, extras → FA)
5. PFF presented as official (now labeled estimate)
6. Inflated OVRs on unranked OL/K/P (recalibrated)
7. Three inactive free agents removed from pool; four active non-LS added

## Left unfixed / notes
- Long snappers intentionally omitted (no LS position in game)
- Some practice-squad-only names may churn week to week vs ESPN
- Season trend after college advance uses `lastSeasonGames` snapshot (new schedule starts 0-0)
- Console may show 404s for missing Sleeper/ESPN headshots (fallback SVG plate handles it)
