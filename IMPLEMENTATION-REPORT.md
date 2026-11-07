# Implementation report — draft, Players, Scouting, news

Branch `cursor/draft-roster-identity-57bf`. Not merged. Not deployed. Live Pages is still v0.1.23 until this branch is published.

Save key remains `afa-gm-franchise-builder-v029`.

## Draft

`node tests/draft-regression.mjs` was rerun after the ticker loop fix and the real-FA offseason fill. **PASS.**

| Seed | Picks | Roster size | Left in pool | Clubs short of starter or depth |
| --- | --- | --- | --- | --- |
| 1, 7, 42, 2026 | 1,696 | 53–53 | 836 | none |

Supply that supports those targets: C 81, OG 164, QB 110, K 38, P 34, and higher counts at the other positions. No fictional ids in the founding draft. No duplicate person. OGFFL import keeps 30 players on the user club only. Dynasty Domination-only ids stay off that roster (29 OGFFL-only, 19 DD-only in the id lists).

2027 college class: **205 real prospects, 224 slots, 19 picks unfilled.** Those 19 slots are not filled with invented rookies. 2028 has 155 real prospects on file, so a full 7-round draft cannot be filled either. 2029 stays unavailable. 2030 uses 260 labeled fictional prospects (overall 60–82) only because that year is past the compiled classes.

An 80-player pool stopped after 80 picks (`stopped: empty`). Rosters were 2–3 players. That is the draft refusing to invent bodies, not a claim that a normal league ends that short. After a college draft, `finishCollegeDraft` now calls `refillRostersFromFA`, which signs only people already in the pool and only while a club is under 53. It does not create prospects.

## Players directory

2,532 real NFL rows, one page of 40, 64 pages. Positions include QB, RB, WR, TE, OT, OG, C, DE, DT, LB, CB, S, K, and P.

| Source | Count |
| --- | --- |
| Pool rows | 2,532 |
| Sleeper id on the player (photo or live team possible) | 2,532 have a Sleeper or ESPN id for a photo URL |
| 2025 stat line in `js/stats-2025.js` | 1,642 |
| Sleeper availability overlay matched `2026-11-07T00:38:44Z` | 2,492 of 2,492 sleeper ids |
| No 2025 line | 890 — shown as "Not on record", not zero |

The team on the row is the NFL abbreviation from the live overlay, else the Sleeper snapshot, else the ESPN pool field. `WSH` is folded to `WAS` so Commanders are not split. AFA nicknames are not used as the NFL team. The checkbox "Show this save's AFA club" only prints the AFA abbreviation next to the real team. **It does not copy injuries onto the save, and it does not change overalls, rosters, or the draft.** News headlines do not do that either.

Chrome, desktop 1280×800, opened A.J. Brown: Patriots logo, Sleeper CDN photo, status **Out**, 2025 targets 121 / receptions 78 / rec yds 1003 / rec TD 7, and 2026 Sleeper week 9 counting stats. Source line says stats-2025.js and the 2026-11-06 Sleeper snapshot. Phone 390×844 showed the same list, logos, and the ticker, with the Save pill hidden so it does not cover the rows.

## Scouting and leagues

OGFFL and Dynasty Domination stay separate. Fetched `2026-11-07T00:38:44Z` from `api.sleeper.app`.

| League | Roster | Owner | Name | Players on the Sleeper roster | Matched in the GMFB pool |
| --- | --- | --- | --- | --- | --- |
| OGFFL `1312302487876677632` | 1 | jtuck94 | Daniel Jonestown Massacre | 31 | 30 |
| Dynasty Domination `1355552579894923264` | 7 | jtuck94 | Taylor Park Boys | 21 | 20 |

`settings.type` is **1** for both. Taxi slots are 0. The screen does not translate that integer into "redraft" or "dynasty". Scoring values shown are the ones Sleeper returned, including OGFFL `pass_yd` 0.04, `pass_td` 6, `pass_int` -2, `rush_yd` 0.1. They are not added to the GMFB rating. Lineup slot counts come from `roster_positions`. Waiver targets, trade targets, and start/sit rankings are **not** implemented. There is no free-agent wire or league projection feed in this snapshot, so those lists would be made up.

## News, 5:00 AM Eastern, and the 5-minute check

GitHub cron is UTC. The daily job is `0 9 * * *` and `0 10 * * *` (5:00 AM EDT and 5:00 AM EST), every day including weekends. `scripts/refresh-clock.mjs` continues only when the `America/New_York` hour is 05. **05:00 UTC is not a schedule.** The Action has **not** been run by GitHub. It will not run on a schedule until the workflow file is on the default branch. A local `--write` at `2026-11-07T00:38:44Z` produced the JSON snapshots above. That is not a GitHub-hosted run.

The headline cache has 46 ESPN RSS items from that same local fetch (25 NFL, 21 college), with publication and retrieval times. The college note says the feed is FBS-leaning. FCS, Division II, and Division III are not covered. The bottom ticker reads that cache. It redrew **2** times with the ticker on and **2** times with `?ticker=off`, and the loop stop did not trip. The earlier freeze was a real risk: a `MutationObserver` on `body` class plus `setInterval(render)` could redraw forever, and `--virtual-time-budget` never finished while a repeating timer existed. Both are gone. Screen changes call `onScreen` once. The next headline fetch is a single 5-minute timeout, only inside 8:00 AM–10:55 PM Eastern, and only while the page is open. The crawl itself does not refetch.

If the cache is missing, the bar says headlines are unavailable and does not invent stories. Rumors stay rumors.

## CI

Before the test workflow was added, `gh pr checks 1` reported **no checks**. `.github/workflows/tests.yml` runs the four node suites on pull requests. The result after this push is in the PR. The scheduled data workflow does not run on pull requests.

## Not supported

- News and the live-data checkbox do not change ratings, availability inside a save, or the draft.
- No waiver, trade-target, or start/sit engine.
- `settings.type` is not renamed into redraft or dynasty.
- 2027 leaves 19 draft slots empty. 2029 has no class. Fictional prospects start at 2030 only.
- Browser ESPN fetches can fail CORS. The ticker then keeps the last cache.
- Headless `--dump-dom` with a repeating timer did not exit (timeout 124). DevTools smoke after the loop fix did finish and produced the screenshots below.

## Preview on a desktop

From the repo root:

```bash
python3 -m http.server 8765
```

- Players: http://127.0.0.1:8765/?screen=players
- Ticker off: http://127.0.0.1:8765/?screen=players&ticker=off
- Scouting, then OGFFL: http://127.0.0.1:8765/?screen=scouting

Screenshots from the DevTools run, not from a claimed `--dump-dom` success: `/opt/cursor/artifacts/smoke-players-desktop.png`, `smoke-players-phone.png`, `smoke-scouting-desktop.png`, `smoke-scouting-phone.png`.
