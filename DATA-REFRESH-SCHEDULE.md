# Data refresh schedule

Two different jobs. They are not interchangeable.

## Daily full snapshot — 5:00 AM America/New_York, every day

Roster, stats, and availability snapshots refresh **once a day at 5:00 AM Eastern, including Saturday and Sunday**.

GitHub Actions `schedule` is **UTC only**. It has no timezone and does not follow daylight saving time. This repo does **not** use `05:00 UTC` (that is 12:00 AM EST or 1:00 AM EDT).

| Eastern clock | UTC cron | When it is the real 5:00 AM |
| --- | --- | --- |
| 5:00 AM EST (standard, UTC−5) | `0 10 * * *` | November–March |
| 5:00 AM EDT (daylight, UTC−4) | `0 9 * * *` | March–November |

`.github/workflows/players-data-refresh.yml` registers both crons, all seven days (`* * *`). `scripts/refresh-clock.mjs` continues the job only when `America/New_York` hour is `05`. The other UTC slot logs a skip. A manual `workflow_dispatch` can run outside that hour and is labeled manual.

The dataset step is **not attached yet**. A green run of this workflow is only the clock gate. It does not mean player files were rebuilt or committed. Scheduled workflows also run only from the default branch after this file is on that branch, and GitHub may start them late.

## News check — about every 5 minutes, 8:00 AM–10:55 PM Eastern

NFL and NCAAF headlines are a **separate** check (`js/news-feed.js`). Target interval is 5 minutes from **8:00 AM through 10:55 PM America/New_York**, seven days a week, while the page is open.

This path:

- reads public feeds (ESPN NFL RSS and ESPN college football RSS) when the browser can reach them
- stores a cursor in `afa-news-cursor-v1`, not in `afa-gm-franchise-builder-v029`
- records source publication time and retrieval time
- drops a repeat URL, and a repeat player-plus-event even if the URL changed
- marks `verified`, `rumor`, or `unknown` (questionable is not “out” and unknown is not “healthy”)
- keeps the last error when a feed fails
- does not change base overalls by itself
- on a failed browser request, waits longer before the next try (5, 10, 20, then 30 minutes) and keeps the snapshot

The page requests the public ESPN RSS URLs directly. A check on 2026-11-07 found `Access-Control-Allow-Origin: *` on those URLs, so a normal browser can read them without a proxy. If a later response is blocked or fails, the ticker keeps `data/news-cache.json` and prints the snapshot time plus the failure. Five minutes is the target while the page is open and the last check worked. It is not a promise that the bar is less than five minutes old. The snapshot in this branch was fetched locally at `2026-11-07T00:38:44Z`. Verified availability is a separate opt-in (`js/real-status.js`) and is not applied by this news check.

It does **not** rebuild or commit the player dataset every 5 minutes. GitHub Actions is a poor fit for that cadence: runs are UTC, can be dropped or delayed, only work from the default branch, and a commit every 5 minutes would republish the site all afternoon. The separate Grok bot news monitor is not this workflow.

Coverage is not exhaustive. The college feed is national and FBS-leaning. FCS, Division II, and Division III are outside it. A missed fetch, a closed tab, or a blocked feed is an outage, not an empty news day and not proof that nothing happened.

## On-screen ticker

After the boot screen, a bottom bar crawls the cached real headlines. It is not the gold AFA draft ticker. Each item is labeled NFL or COLLEGE, keeps rumor / verified / unknown, and shows published and retrieved times in the static list. The headline opens the source URL. **News** opens the Scouting news tab.

Team marks use ESPN's logo files only for canonical abbreviations (current roster) or unambiguous nicknames and school names in the headline. A mention is not the player's current team. Trades and transfers can show two marks. "Brown", "New York", "Los Angeles", and bare "Washington" do not get a logo. A missing or broken image falls back to the abbreviation. Logos are 20px, lazy-loaded, and do not change the bar height.

The crawl is CSS only. It does not refetch on every frame. A new check still waits for the 5-minute Eastern window. Pause and Hide are in the bar. Hide is remembered in this browser. Reduced motion replaces the crawl with a sideways list. The moving text is hidden from assistive tech. The list is not an aria-live region.

The bar is hidden during boot, the draft-open intro, the draft-complete panel, and the scout card. On a phone it sits above the hub tab bar and the home-indicator inset. Coach and draft screens keep extra room so Sim and footer buttons can scroll clear of it.
