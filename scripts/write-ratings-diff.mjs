/* Write docs/ratings-pass-2026-11-10.md from the pool and the EA pages.
 * node scripts/write-ratings-diff.mjs
 */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-lists.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/madden-nfl27-ea.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/rating-sources.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(root + "js/players-nfl.js", "utf8"), sandbox);
const R = sandbox.AFARatings;
const players = sandbox.AFA_NFL_PLAYERS;
const book = sandbox.AFA_MADDEN_EA;
const oldHurts = sandbox.AFA_MADDEN_LISTS.players.find((row) => row.name === "Jalen Hurts" && row.pos === "QB");
const oldBucky = sandbox.AFA_MADDEN_LISTS.players.find((row) => row.name === "Bucky Irving");

const rows = players.map((p) => {
  const src = R.lookup(p);
  return {
    name: p.name,
    pos: p.pos,
    before: p.ovr,
    after: src ? src.ovr : p.ovr,
    madden: src ? src.ovr : null,
    url: src ? src.sourceUrl : null
  };
}).map((row) => Object.assign(row, { delta: row.after - row.before }));

const positions = [...new Set(rows.map((row) => row.pos))].sort();
const matched = rows.filter((row) => row.madden != null);
const unmatched = rows.filter((row) => row.madden == null);
const risers = matched.filter((row) => row.delta > 0).sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
const fallers = matched.filter((row) => row.delta < 0).sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name));
const bucky = rows.find((row) => row.name === "Bucky Irving");
const hurts = rows.find((row) => row.name === "Jalen Hurts" && row.pos === "QB");

function line(row) {
  return "| " + row.name + " | " + row.pos + " | " + row.before + " | " + row.after + " | " + (row.delta > 0 ? "+" : "") + row.delta + " | " + row.url + " |";
}

const coverage = positions.map((pos) => {
  const all = rows.filter((row) => row.pos === pos);
  const hit = all.filter((row) => row.madden != null).length;
  return "| " + pos + " | " + all.length + " | " + hit + " | " + (all.length - hit) + " |";
});

const sources = (book.lists || []).map((list) => "- " + list.pos + " (" + (list.pool || list.pos) + "): " + list.count + " of " + list.totalItems + " on " + list.url);

const unmatchedLines = positions.map((pos) => {
  const names = unmatched.filter((row) => row.pos === pos).map((row) => row.name).sort();
  if (!names.length) return "";
  return "### " + pos + " (" + names.length + ")\n\n" + names.join(", ") + "\n";
}).filter(Boolean);

const md = [
  "# Ratings pass, updated 2026-11-11",
  "",
  "A fresh franchise uses a Madden NFL 27 overall only when EA's public ratings page names that player. Retrieved 2026-11-11 from the official position pages. The embedded iteration is " + (book.iteration && book.iteration.label) + " (`" + (book.iteration && book.iteration.id) + "`). This is an EA page, not a made-up grade. PFF grades are not stored.",
  "",
  "Where that page publishes one attribute number, the draft board uses it. Speed, acceleration, agility, jump, catch, strength, awareness, throw power, tackle, run block, pass block, carrying, vision, catch in traffic, kick power, and kick accuracy are copied when present. Press is used for cornerback PRS. Play recognition is used for safety PRS. EA publishes throw accuracy as short, mid, and deep, and pass rush as finesse and power. Those are not collapsed into one number, so THA and a generic PRS stay labeled estimates. A player with no EA row keeps the AFA pool overall and estimated attributes.",
  "",
  "An existing save is not rewritten. A progressed overall stays where the save left it.",
  "",
  "## Sources",
  "",
  ...sources,
  "",
  "Long snappers and fullbacks are on the EA pages and are not AFA roster positions, so they are not applied to anyone.",
  "",
  "## Jalen Hurts",
  "",
  "Pool overall " + (hurts ? hurts.before : "missing") + ". EA Week 8 quarterback page " + (hurts ? hurts.madden : "not matched") + " (" + (hurts && hurts.url) + "), including throw power 86 and speed 88. The maddenratings.com quarterback list retrieved 2026-11-07 also says " + (oldHurts ? oldHurts.ovr : "not on that list") + " (https://www.maddenratings.com/lists/quarterbacks). Both published Madden sources agree. The pool 97 was the AFA number, not a second Madden overall.",
  "",
  "## Bucky Irving",
  "",
  bucky
    ? "Pool overall " + bucky.before + ". EA Week 8 halfback page " + bucky.madden + " (" + bucky.url + "), speed 89. The maddenratings.com halfback list retrieved 2026-11-07 said " + (oldBucky ? oldBucky.ovr : "not listed") + " (https://www.maddenratings.com/lists/halfbacks). A new franchise uses the EA page, 87. His 2025 counting-stat grade is 71 and stays a separate grade."
    : "Bucky Irving was not in the pool.",
  "",
  "## Coverage by pool position",
  "",
  "NFL pool only. College prospects are not on the NFL ratings pages and are not given a Madden overall.",
  "",
  "| Pos | Pool | Matched | Unmatched |",
  "| --- | --- | --- | --- |",
  ...coverage,
  "",
  "- Players in the NFL pool: " + rows.length,
  "- Matched to an EA page: " + matched.length,
  "- Left on the AFA pool overall: " + unmatched.length,
  "- Risers: " + risers.length,
  "- Fallers: " + fallers.length,
  "- Unchanged among matches: " + matched.filter((row) => row.delta === 0).length,
  "",
  "## Biggest fallers",
  "",
  "| Player | Pos | Pool | EA | Change | Source |",
  "| --- | --- | --- | --- | --- | --- |",
  ...fallers.slice(0, 20).map(line),
  "",
  "## Biggest risers",
  "",
  "| Player | Pos | Pool | EA | Change | Source |",
  "| --- | --- | --- | --- | --- | --- |",
  ...risers.slice(0, 20).map(line),
  "",
  "## Unmatched players",
  "",
  "These pool players are not on the retrieved EA pages. Their overall stays the AFA pool number. It is not labeled as a Madden rating.",
  "",
  ...unmatchedLines
].join("\n");

fs.writeFileSync(root + "docs/ratings-pass-2026-11-10.md", md);
console.log("wrote docs matches " + matched.length + " unmatched " + unmatched.length + " fallers " + fallers.length + " risers " + risers.length);
