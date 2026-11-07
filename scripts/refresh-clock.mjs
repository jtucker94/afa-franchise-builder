#!/usr/bin/env node
/* Daily full-refresh gate for GitHub Actions.
 * Cron on GitHub is UTC. This process prints run=true only when the current
 * instant is 05:xx America/New_York. 05:xx UTC is not accepted.
 * Usage: node scripts/refresh-clock.mjs daily-gate
 * Optional: REFRESH_NOW=ISO timestamp for tests.
 */
import { pathToFileURL } from "url";

const TZ = "America/New_York";

function easternHour(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23"
  });
  const part = fmt.formatToParts(date).find((p) => p.type === "hour");
  return Number(part && part.value);
}

function gate(date) {
  const hour = easternHour(date);
  return { run: hour === 5, hour: hour, timeZone: TZ };
}

function print(result) {
  const lines = ["run=" + (result.run ? "true" : "false"), "eastern_hour=" + String(result.hour).padStart(2, "0"), "timezone=" + result.timeZone];
  if (!result.run) {
    lines.push("skip=Not 5:00 AM America/New_York. GitHub cron is UTC; the other daylight-saving slot will be the one that runs. 5:00 UTC is not this job.");
  } else {
    lines.push("note=Daily full data refresh window. All seven days. This is not the 5-minute news check.");
  }
  process.stdout.write(lines.join("\n") + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || "daily-gate";
  if (mode !== "daily-gate") {
    process.stderr.write("Unknown mode " + mode + "\n");
    process.exit(2);
  }
  const now = process.env.REFRESH_NOW ? new Date(process.env.REFRESH_NOW) : new Date();
  if (Number.isNaN(now.getTime())) {
    process.stderr.write("Bad REFRESH_NOW\n");
    process.exit(2);
  }
  print(gate(now));
}

export { gate, easternHour, TZ };
