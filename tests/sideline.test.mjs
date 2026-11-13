/* Sideline coach view. node tests/sideline.test.mjs */
import fs from "fs";
import vm from "vm";

const root = new URL("..", import.meta.url).pathname;
const sandbox = { console, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(root + "js/sideline.js", "utf8"), sandbox);
const S = sandbox.AFASideline;
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const fourth = S.suggest({ down: 4, toGo: 8, yard: 40 });
check(fourth.id === "punt", "fourth and long did not suggest a punt");
const goal = S.suggest({ down: 4, toGo: 2, yard: 80 });
check(goal.id === "field-goal", "fourth and short in opponent territory did not suggest a field goal");
const html = S.render({
  game: { quarter: 2, down: 2, toGo: 7, yard: 42, scoreOff: 7, scoreDef: 3, log: ["Simulated first down."] },
  side: { timeouts: 2, challenges: 1, fatigue: {}, morale: {}, bench: {} },
  roster: [{ id: "p1", name: "Alex Sample", pos: "QB", number: 12, ovr: 80 }],
  team: { primary: "#143024", secondary: "#d4a017" }
});
check(html.indexOf("data-playcall") >= 0 && html.split("data-playcall").length > 4, "play cards missing");
check(html.indexOf("Text drive") >= 0, "simulated label missing");
check(html.indexOf(">12<") >= 0, "jersey number missing");
check(html.indexOf("Coordinator, simulated") >= 0, "coordinator line missing");
const side = S.afterSnap({ fatigue: {}, morale: {}, bench: {} }, [{ id: "p1" }], "Simulated score.");
check(side.fatigue.p1 > 15 && side.morale.p1 > 70, "fatigue and morale did not move");
const hurt = S.render({
  game: { quarter: 1, down: 1, toGo: 10, yard: 25 },
  side: { timeouts: 3, challenges: 2, fatigue: {}, morale: {}, bench: {} },
  roster: [{ id: "p9", name: "Casey Sample", pos: "RB", number: 28, currentInjury: { type: "Ankle", gamesRemaining: 2 } }],
  team: { primary: "#143024", secondary: "#d4a017" }
});
check(hurt.indexOf("Out") >= 0 && hurt.indexOf("Ankle") >= 0 && hurt.indexOf("simulated") >= 0, "existing injury was not labeled");
const app = fs.readFileSync(root + "js/app.js", "utf8");
check(app.indexOf('const STORAGE = "afa-gm-franchise-builder-v029"') >= 0, "save key changed");
const manifest = fs.readFileSync(root + "manifest.json", "utf8");
check(manifest.indexOf('"orientation": "landscape"') >= 0, "manifest is not landscape");

if (failures.length) {
  console.error("FAILED " + failures.length);
  failures.forEach((msg) => console.error(" - " + msg));
  process.exit(1);
}
console.log("PASS sideline");
