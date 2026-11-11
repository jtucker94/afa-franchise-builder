/* AFA club colors already stored on each team. No third brand color is invented:
 * accent uses the stored secondary. Text is the light or dark ink with the
 * higher contrast, and a color is used on a control only when that contrast
 * reaches WCAG AA for normal text (4.5:1).
 */
(function (root) {
  "use strict";

  var DARK = "#0c1118";
  var LIGHT = "#f7f4ea";

  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function channel(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    var rgb = hexToRgb(hex);
    if (!rgb) return 0;
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }

  function contrast(a, b) {
    var L1 = luminance(a);
    var L2 = luminance(b);
    var hi = Math.max(L1, L2);
    var lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function inkFor(bg) {
    var onDark = contrast(bg, DARK);
    var onLight = contrast(bg, LIGHT);
    return onDark >= onLight ? DARK : LIGHT;
  }

  function readablePair(bg) {
    var ink = inkFor(bg);
    return { bg: bg, ink: ink, ratio: contrast(bg, ink), aa: contrast(bg, ink) >= 4.5 };
  }

  function apply(team) {
    var doc = root.document;
    if (!doc || !doc.documentElement) return { themed: false };
    var el = doc.documentElement;
    var body = doc.body;
    var logo = doc.getElementById("team-corner-logo");
    if (!team || !team.primary || !team.secondary) {
      ["--team-primary", "--team-secondary", "--team-accent", "--on-primary", "--on-secondary", "--on-accent"].forEach(function (name) {
        el.style.removeProperty(name);
      });
      if (body) body.classList.remove("team-themed");
      el.removeAttribute("data-team");
      if (logo) { logo.hidden = true; logo.removeAttribute("src"); }
      return { themed: false };
    }
    var primary = readablePair(team.primary);
    var secondary = readablePair(team.secondary);
    var accent = secondary.aa ? secondary : primary;
    el.style.setProperty("--team-primary", team.primary);
    el.style.setProperty("--team-secondary", team.secondary);
    el.style.setProperty("--team-accent", accent.bg);
    el.style.setProperty("--on-primary", primary.ink);
    el.style.setProperty("--on-secondary", secondary.ink);
    el.style.setProperty("--on-accent", accent.ink);
    el.setAttribute("data-team", team.id || "");
    if (body) body.classList.add("team-themed");
    if (logo && team.logo) {
      logo.src = "logos/" + team.logo;
      logo.alt = (team.city ? team.city + " " : "") + (team.nick || "team") + " logo";
      logo.hidden = false;
    }
    return {
      themed: true,
      id: team.id,
      primary: team.primary,
      secondary: team.secondary,
      accent: accent.bg,
      onPrimary: primary.ink,
      onAccent: accent.ink,
      primaryRatio: Math.round(primary.ratio * 100) / 100,
      accentRatio: Math.round(accent.ratio * 100) / 100
    };
  }

  root.AFATheme = {
    DARK: DARK,
    LIGHT: LIGHT,
    contrast: contrast,
    inkFor: inkFor,
    readablePair: readablePair,
    apply: apply
  };
})(typeof window !== "undefined" ? window : globalThis);
