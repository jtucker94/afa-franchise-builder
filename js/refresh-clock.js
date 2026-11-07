/* America/New_York clock for the data refresh and the news check.
 * GitHub Actions cron is UTC and has no timezone field. 5:00 AM Eastern is
 * 10:00 UTC in EST and 09:00 UTC in EDT. Never treat 05:00 UTC as 5:00 AM Eastern.
 */
(function (root) {
  "use strict";
  var TZ = "America/New_York";
  var DAILY_HOUR = 5;
  var NEWS_START = 8 * 60;
  var NEWS_END = 22 * 60 + 55;
  var NEWS_INTERVAL_MS = 5 * 60 * 1000;

  function parts(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    var map = {};
    fmt.formatToParts(date instanceof Date ? date : new Date(date)).forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    var hour = Number(map.hour);
    var minute = Number(map.minute);
    return {
      timeZone: TZ,
      hour: hour,
      minute: minute,
      minutesOfDay: hour * 60 + minute,
      weekday: map.weekday,
      year: map.year,
      month: map.month,
      day: map.day
    };
  }

  function isDailyRefreshInstant(date) {
    return parts(date).hour === DAILY_HOUR;
  }

  function inNewsWindow(date) {
    var m = parts(date).minutesOfDay;
    return m >= NEWS_START && m <= NEWS_END;
  }

  root.AFARefreshClock = {
    TZ: TZ,
    DAILY_HOUR: DAILY_HOUR,
    NEWS_START_MINUTES: NEWS_START,
    NEWS_END_MINUTES: NEWS_END,
    NEWS_INTERVAL_MS: NEWS_INTERVAL_MS,
    parts: parts,
    isDailyRefreshInstant: isDailyRefreshInstant,
    inNewsWindow: inNewsWindow
  };
})(typeof window !== "undefined" ? window : globalThis);
