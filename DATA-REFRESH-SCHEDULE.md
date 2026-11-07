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
- does not change base overalls and does not edit AFA saves

It does **not** rebuild or commit the player dataset every 5 minutes. GitHub Actions is a poor fit for that cadence: runs are UTC, can be dropped or delayed, only work from the default branch, and a commit every 5 minutes would republish the site all afternoon. The separate Grok bot news monitor is not this workflow.

Coverage is not exhaustive. The college feed is national and FBS-leaning. FCS, Division II, and Division III are outside it. A missed fetch, a closed tab, or a blocked feed is an outage, not an empty news day and not proof that nothing happened.
