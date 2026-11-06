# GM Franchise Builder — AFA prototype v0.1

Working title **GM Franchise Builder**. The retail name stays Franchise Builder. This folder is a playable, static Alliance Football Association (AFA) prototype.

## How to open

Open `index.html` in a current desktop browser (Chrome, Edge, Firefox, or Safari).

- Double-click the file, or
- From this folder: `python3 -m http.server 8765` and visit `http://localhost:8765/`

No backend is required. Progress is stored in the browser's `localStorage` under `afa-gm-franchise-builder-v01`. Refresh keeps coach hires, the draft, rosters, and the season.

## How to play

1. **Boot** — The GM Franchise Builder mark dissolves (~3 seconds) and holds a short gap (~2 seconds) before the main menu. Click to skip.
2. **Play Story** — Choose **Commissioner's Desk** (all 32 clubs) or **Take a Club** (one franchise; the other 31 desks auto-fill).
3. **Cold open** — The NFL has folded; the AFA rises. You are Jordan, charged with opening the league.
4. **Coach assignment** — All 32 NFL head coaches from the 2025 season are free agents. Hire one for every AFA club. Use **Assist** (best remaining coach onto the selected or next vacant desk) or **Auto-assign remaining** to fill the board, then lock hires.
5. **Founding snake draft** — The entire player pool starts as free agents. Teams draft 1→32, then reverse, for three rounds (96 picks). Leftover players become free agents for signings. Each desk can be **Manual**, **Assisted**, or **Auto**. **Auto-complete draft** fills the rest so you can reach the season quickly. There are no pre-stocked rosters.
6. **Season hub** — Division standings, a weekly slate, any team's roster/depth chart by position, trades, free-agent signings (and cuts), and a simple week simulator.

## Data in this build

- 32 AFA teams across Eastern and Western conferences (8 divisions)
- 32 real NFL head coaches (2025 list) with overall ratings and previous clubs
- 112 real NFL players with position, age, and approximate overall ratings
- Approved team logos are resized JPEGs in `logos/` (wired wherever an approved mark exists; initials fallback otherwise)

## Controls that matter

- **Continue** on the menu resumes a saved league.
- **Reset save** clears `localStorage` and returns to the menu.
- In single-franchise mode you draft, cut, and sign for your club; you must be on one side of a trade. Commissioner mode can force any trade.

## v0.1 notes

This is a prototype: the pick clock is visual only, the sim is a strength-plus-variance stub, and rosters are founding-draft cores plus free agents rather than 53-man depth. Civic Horizon is not part of this project.
