/* Write docs/ratings-pass-2026-11-10.md from the pool and the stored lists.
 * node scripts/write-ratings-diff.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-lists.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/rating-sources.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/players-nfl.js", "utf8"), sandbox);
const R = sandbox.AFARatings;
const players = sandbox.AFA_NFL_PLAYERS;
const rows = players.map((p) => {
  const src = R.lookup(p);
  return {
    name: p.name,
    pos: p.pos,
    team: p.team || "",
    before: p.ovr,
    after: src ? src.ovr : p.ovr,
    madden: src ? src.ovr : null,
    url: src ? src.sourceUrl : null
  };
}).map((row) => Object.assign(row, { delta: row.after - row.before }));

const matched = rows.filter((row) => row.madden != null);
const unmatched = rows.length - matched.length;
const risers = matched.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
const fallers = matched.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name));
const bucky = rows.find((row) => row.name === "Bucky Irving");

function line(row) {
  return "| " + row.name + " | " + row.pos + " | " + row.before + " | " + row.after + " | " + (row.delta > 0 ? "+" : "") + row.delta + " | " + row.url + " |";
}

const md = [
  "# Ratings pass, 2026-11-10",
  "",
  "A fresh franchise uses a Madden NFL 27 overall only when that player is on a list stored in this repo. The lists were copied from maddenratings.com on 2026-11-07. They are a public compiler, not an EA file. PFF grades are not stored.",
  "",
  "Players who are not on those lists keep the AFA pool overall. That number is not labeled as a Madden rating. Draft-board speed, agility, jump, catch, and the other attribute columns are estimates from the overall. They are not EA attributes.",
  "",
  "An existing save is not rewritten. A progressed overall stays where the save left it.",
  "",
  "Coverage this pass: quarterbacks through the 92nd name on the public list, and the top 100 halfbacks. Other positions were not on a retrieved list, so they were not given a Madden overall.",
  "",
  "- Players in the pool: " + rows.length,
  "- Matched to a stored list: " + matched.length,
  "- Left on the AFA pool overall: " + unmatched,
  "- Risers: " + risers.length,
  "- Fallers: " + fallers.length,
  "- Unchanged among matches: " + matched.filter((row) => row.delta === 0).length,
  "",
  "## Bucky Irving",
  "",
  bucky
    ? "Pool overall " + bucky.before + ". Madden NFL 27 halfback list " + bucky.madden + " (" + bucky.url + "). A new franchise uses 86. His 2025 counting-stat grade is 71 and is kept as a separate grade. It does not replace the sourced overall on a new franchise, and it is not a PFF grade."
    : "Bucky Irving was not in the pool.",
  "",
  "## Biggest fallers",
  "",
  "| Player | Pos | Pool | List | Change | Source |",
  "| --- | --- | --- | --- | --- | --- |",
  ...fallers.slice(0, 15).map(line),
  "",
  "## Biggest risers",
  "",
  "| Player | Pos | Pool | List | Change | Source |",
  "| --- | --- | --- | --- | --- | --- |",
  ...risers.slice(0, 15).map(line),
  "",
  "Audric Estime is on the halfback list and is not in this player pool, so he was not assigned to anyone else.",
  ""
].join("\n");

fs.writeFileSync(root + "docs/ratings-pass-2026-11-10.md", md);
console.log("wrote docs/ratings-pass-2026-11-10.md matches " + matched.length + " fallers " + fallers.length + " risers " + risers.length);
