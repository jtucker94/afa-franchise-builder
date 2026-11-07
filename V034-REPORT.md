# AFA GM Franchise Builder — V034 Report (v0.1.24)

**Versions:** display/state `0.1.24` · assets `?v=034` · SW `afa-shell-v034` / `afa-data-v034` · save key `afa-gm-franchise-builder-v029` (unchanged).
**Not deployed.** Live Pages remains v0.1.23 / `?v=033` until this branch is merged and published. This run does not merge and does not deploy.

## Verified causes

1. **Depth was invisible to the CPU.** `recommendPlayer` only added starter holes to a top-160 overall shortlist. Once a club had one center, one guard, or one quarterback, the backups (often the 68–75 overall players) never entered the shortlist, so late picks piled onto WR/LB/CB. A full sim still handed out 53 names, but backup C/OG/QB were left on the board. Starters happened to fill. Depth did not.
2. **A second star at a filled position outscored a real hole.** After the depth target, a 90+ player still scored about 0.7×. That beat a backup center.
3. **Kickers and punters are actually scarce** (38 K, 34 P in the ESPN/Sleeper pool). The old scorer usually still gave everyone one, but nothing stopped a club from taking a second punter while another club had none.
4. **Identity was sleeper-id or else the raw game id.** It did not know ESPN ids, verified spelling/nickname duplicates, or “same name + position + college.” It also did not run on load, and a failed keeper click **replaced** the clicked player with the imported one (`playerId = k[0].id`).
5. **College drafts** used a flat 1.12 / 0.92 need bump, then cut back to 53 by lowest overall, which could release the only punter. There is no compiled class after 2028. The UI said the real data had ended and skipped the year. 2027 has 207 compiled rows, two of which are the same person twice, so a 224-pick draft cannot be filled with real prospects.
6. **Two confirmed duplicate listings** in the Nov 2026 college file: Kelly Jones (Mississippi State CB) is Kelley Jones; “OJ Frederique Jr.” is Romanas “OJ” Frederique Jr. Same-name NFL players with different Sleeper ids (two Justin Jeffersons, two Jaylon Joneses, Byron Murphy Jr. vs II, Tyler Miller OT/LSU vs OT/Iowa State) are different people. No college row shares name + position + college with the current NFL pool.

## Class policy

In `js/draft-engine.js` `classPolicy` (lines 487–495), using whatever real classes are actually in `js/prospects-college.js`:

| Year | Policy | What the draft uses |
| --- | --- | --- |
| 2027, 2028 | `real` | Compiled prospects only. If the board runs out, the remaining picks are unfilled. |
| 2029 | `unavailable` | The season after the last compiled class. No fictional class is created. |
| 2030 and later, and at least two seasons after the last real class | `generated` | Labeled fictional prospects. No biography, no stats, no college. Height, weight, age, and overall are game-only. |

Adding a real 2029 file later flips 2029 back to `real` and moves the empty gap to 2030. Known classes are not relabeled fictional.

## What changed, and where

### `js/draft-engine.js` (new; loaded before `js/app.js`)

| Function | Lines | Role |
| --- | --- | --- |
| `peopleClash` | 101–115 | Same person only with a shared Sleeper id, shared ESPN id, a verified alias group, or the same folded name **and** position **and** college. Different Sleeper ids never collapse. Name alone never matches. |
| `ALIAS_GROUPS` | 29–44 | Kelley Jones / Kelly Jones, and Romanas “OJ” Frederique Jr. / OJ Frederique Jr. |
| `dedupeIds` | 154–167 | Priority dedupe. Callers pass user club, then other clubs, then FA, then the board. |
| `rosterPhase` | 175–204 | Starter holes, then depth holes. Targets: QB 1/2, RB 1/3, WR 2/5, TE 1/2, OT 2/3, OG 2/3, C 1/2, DE 2/4, DT 2/3, LB 3/5, CB 2/4, S 2/3, K 1/1, P 1/1. |
| `scorePlayer` | 264–288 | Starter hole beats depth, depth beats a surplus star. Scheme tilt stays at most about +8%. Power Run / Shanahan still wants a complementary RB2 (±15 lb). A club at its depth target will not take another scarce body while other clubs are still short of that depth. |
| `recommend` | 310–358 | Shortlist is the top 80 overall **plus** the best 12 at each open starter spot and the best 8 at each thin depth spot, including K/P once the skeleton exists. |
| `scoreProspect` / `recommendProspect` | 290–375 | Seasonal draft. A 68 overall prospect can beat a luxury pick when he would actually play; he does not jump an established starter. |
| `commitPick` | 392–432 | One founding selection. Repeat of the same player on that club returns `idempotent` and does not add a second row. A keeper mismatch or a reserved import player returns without changing the board, rosters, or pick index. |
| `commitCollegePick` | 434–475 | Same contract for the college draft. |
| `classPolicy` | 487–495 | Real / unavailable / generated, from the compiled file. |
| `trimRoster` | 516–533 | Cut surplus bodies before the last starter at a position. |
| `pickFreeAgent` | 497–514 | Offseason FA fill follows the same starter-then-depth order. No overall floor, so a low rating is signed when that is the supply. |
| `generateProspectClass` | 546–605 | Stable fictional class for a far year. Ids `gen_{year}_###`. |
| `runSnakeDraft` | 615–678 | Reference simulator used by the regression. It calls `recommend` and `commitPick`. |

### `js/app.js`

| Function | Lines | Change |
| --- | --- | --- |
| `STORAGE` | 3 | Still `afa-gm-franchise-builder-v029`. |
| `enforceUniquePlayers` | 166–206 | Uses `peopleClash`. Order: user club, other clubs, FA, founding board, college board. Pick history drops a later selection of the same person and does not delete a player who was traded. `collegeDrafted` is deduped on its own list so a rostered prospect stays “already entered the league.” Import ids are deduped inside that league’s list only. Also runs on **load** (line 281). |
| `makePick` | 1245–1271 | Delegates to `commitPick`. Does not rewrite a clicked player into the keeper. |
| `recommendPlayer` | 1222–1243 | Delegates to `recommend`. The user’s pending keeper is still the recommendation; CPU clubs cannot see those ids. |
| `userDraft` | 1389–1406 | Refuses a non-keeper click with “That pick was not changed.” |
| `processAutoRun` / `simToManual` / `autoCompleteDraft` / `simDraftRound` | 1293–1373 | Same picker. `simDraftRound` fills the rest of the current round. A module-level `draftRunning` flag ignores a second sim until the first returns. |
| Draft card | 2663–2686 | Shows “Starters open” and “Depth.” New **Sim this round** button. |
| `schemeContext` | 1190–1200 | Still reads `dynasty/coaches.js` offensive and defensive keys. |
| `refillRostersFromFA` | 1943–1973 | Signs by starter, then depth, and refuses a second identity. |
| `prospectsForYear` / `ensureGeneratedClass` | 4541–4604 | Real class, or the stored fictional class, minus anyone already in the league and minus duplicate listings. |
| `collegeMakePick` / `collegeAiPick` | 4667–4707 | `commitCollegePick` + `recommendProspect`. Manual clicks are not replaced. |
| `finishCollegeDraft` | 4735–4785 | Trims with `trimRoster`. If a real class runs out, the toast says how many picks were unfilled and that no fictional players were added. |
| Save payload | 223–228, 254–255 | Version `0.1.24`. Load still accepts `0.1.23` back through `0.1`. |

`fillDraftIntroCopy` (hired head coach on the draft intro), the iPhone page-scroll CSS, GMFB grading, and the OGFFL / Dynasty Domination league records were not changed.

### Data

- `js/prospects-college.js` and `data/afa-college-prospects.json`: removed the Kelly Jones row and the nickname-only OJ Frederique Jr. row. Kelley Jones and Romanas “OJ” Frederique Jr. stay. The engine still treats the old ids as the same people if a v0.1.23 save has them.

### Cache bump, prepared and not published

- `index.html` asset query `?v=034`, eyebrow `v0.1.24`, script `js/draft-engine.js?v=034` before `js/app.js`.
- `sw.js` `SW_VERSION = "v034"` (`afa-shell-v034` / `afa-data-v034`), shell list includes `draft-engine.js`.
- `manifest.json` `start_url` `?v=034`.
- `js/mobile.js` version comment only. Coach and draft page-scroll CSS was not edited.

## Tests

Command: `node tests/draft-regression.mjs`  
Result: **PASS** (about 61s). Full numbers: `tests/draft-regression-results.json`.

| Check | Result |
| --- | --- |
| Seeds 1, 7, 42, 2026. Full 32-team, 53-round snake. | 1,696 picks each. Every club 53. 836 real players left as FA. 0 fictional ids. 0 duplicate persons. |
| Starter and depth targets where the real pool can support them | 0 clubs short at every position, all four seeds. Supply: C 81, OG 164, QB 110, K 38, P 34, and the rest higher. |
| Seed 1, Providence | 53 players, average overall 80.7. Counts: WR 8, LB 7, CB 7, DT 6, DE 4, TE 3, OT 3, S 3, OG 3, RB 3, QB 2, C 2, K 1, P 1. Lowest bodies on that club: 62 P, 70 C, 70 OG. |
| Sim one round | 32 picks, one per club. |
| Sim to the user (user is the 6th club in the order) | Stops after 5 CPU picks. User roster still empty. |
| Manual click | The chosen center is the pick, not the recommendation. |
| Repeat `commitPick` | `idempotent`, roster length stays 1. |
| Keeper mismatch | `reason: "keeper"`, pick index and board length unchanged. |
| Save/load resume | JSON snapshot at pick 64, then 32 more picks, matches a straight sim through pick 96. |
| Exhausted pool (80 real players, 53 rounds) | Stops `empty` after 80 picks. Rosters 2–3. No `gen_` ids. |
| OGFFL import (30 ids) vs Dynasty Domination (20 ids, 19 not on the OGFFL list) | All 30 OGFFL players on the user club only. No DD-only player on that club. Other clubs still 53 and not short of starters. Leagues are not merged. |
| 2027 college draft | 205 real prospects, 205 picks, **19 picks unfilled**. No fictional player. Trim keeps the last QB/K/P. |
| 2028 supply | 155 real prospects on file. A 224-pick draft cannot be filled; the same exhaustion rule applies. Not backfilled. |
| 2030 | 260 fictional prospects, overall 60–82, K and P included, no bio/stats/college. 224 picks complete. No name collides with the real pool. 2031 ids do not reuse 2030 ids. Regenerating 2030 is byte-identical. |
| 2029 | `unavailable`. Nothing generated. |
| Round-4 score | A 68 overall center outscores a 92 overall receiver once the club already has five receivers and no center. |
| Scheme | A Power Run staff scores the same guard higher than an Air Raid staff. A lighter RB2 outscores a clone of RB1. |

## Remaining constraints

- The founding pool is the Nov 2026 ESPN roster cross-checked with Sleeper (2,532 players, long snappers excluded). It is not re-fetched in this change.
- 2027 and 2028 overalls are the existing rank-derived game ratings (class top is 80). They were not inflated.
- 2027 cannot fill 7 rounds × 32 clubs. 19 picks stay empty. 2028 would leave 69 empty. That is the real supply, not a failed draft.
- 2029 has no compiled class and does not get fictional players. Fictional prospects start in 2030 under the rule above.
- Extra kickers (6) and punters (2) stay free agents. Every club in the four full sims has one of each; a second specialist loses to a position player once depth is full.
- The lower half of the 2027/2028 boards was not re-checked name by name against a live big board in this pass. The file header is the provenance. Two duplicate rows were removed. No row presents a current NFL player as a new rookie under the name + position + college rule.
- Distinct people who share a name and lack both a Sleeper id and a college will not be auto-merged. That is intentional.
- Desktop layout, iPhone coach/draft page scroll, and the hired-HC draft intro were left as they are in v0.1.23. They were not re-checked in a browser in this run; the draft work is headless logic plus the existing draft-card markup.
