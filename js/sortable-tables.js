/* One sorter for every player table.
 * Each screen keeps its own key and direction for the life of the page.
 * Ties break by name, then id. Empty values sort last.
 */
(function (root) {
  "use strict";

  var memory = {};
  var ATTR = { SPD: 1, ACC: 1, AGI: 1, JMP: 1, CTH: 1, STR: 1, AWR: 1, THP: 1, THA: 1, TAK: 1, PRS: 1, RBK: 1, PBK: 1, CAR: 1, BCV: 1, CIT: 1, KPW: 1, KAC: 1 };

  function get(screen, fallbackKey, fallbackDir) {
    if (!memory[screen]) memory[screen] = { key: fallbackKey || "ovr", dir: fallbackDir || "desc" };
    return memory[screen];
  }

  function valueOf(row, key) {
    if (!row) return null;
    if (ATTR[key] && root.AFAAttrs) return root.AFAAttrs.sortValue(row, key);
    if (key === "name" || key === "player") return String(row.name || "");
    var direct = row[key];
    if (direct == null || direct === "") return null;
    return direct;
  }

  function compare(a, b, key, dir, read) {
    var value = read || valueOf;
    var av = value(a, key);
    var bv = value(b, key);
    var mul = dir === "asc" ? 1 : -1;
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    if (av != null && bv != null && av !== bv) {
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
      var an = Number(av);
      var bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return (an - bn) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    }
    var name = String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
    if (name) return name;
    return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
  }

  function sort(rows, screen, fallbackKey, fallbackDir) {
    var st = get(screen, fallbackKey, fallbackDir);
    return (rows || []).slice().sort(function (a, b) { return compare(a, b, st.key, st.dir); });
  }

  function set(screen, key, dir) {
    var st = get(screen, key, dir || "desc");
    st.key = key;
    st.dir = dir === "asc" ? "asc" : "desc";
    return st;
  }

  function toggle(screen, key) {
    var st = get(screen, key, "desc");
    if (st.key === key) st.dir = st.dir === "asc" ? "desc" : "asc";
    else {
      var text = /^(name|player|pos|college|nfl|status|team|age|slot|round)$/.test(key);
      st.key = key;
      st.dir = text ? "asc" : "desc";
    }
    return st;
  }

  function head(screen, columns) {
    var st = get(screen, columns[0] && columns[0][0], "desc");
    return "<tr>" + columns.map(function (col) {
      var key = col[0];
      var label = col[1];
      var on = key === st.key;
      var arrow = on ? (st.dir === "asc" ? " ↑" : " ↓") : "";
      var aria = on ? (st.dir === "asc" ? "ascending" : "descending") : "none";
      return '<th><button type="button" class="pool-sort-btn' + (on ? " on" : "") + '" data-afasort="' + key + '" data-sort="' + key + '" data-afasort-screen="' + screen + '" aria-sort="' + aria + '">' + label + arrow + "</button></th>";
    }).join("") + "</tr>";
  }

  function select(screen, columns) {
    var st = get(screen, columns[0] && columns[0][0], "desc");
    var opts = [];
    columns.forEach(function (col) {
      opts.push('<option value="' + col[0] + ':asc"' + (st.key === col[0] && st.dir === "asc" ? " selected" : "") + ">" + col[1] + " ascending</option>");
      opts.push('<option value="' + col[0] + ':desc"' + (st.key === col[0] && st.dir === "desc" ? " selected" : "") + ">" + col[1] + " descending</option>");
    });
    return '<label class="pool-sort">Sort by <select data-afasort-select="' + screen + '" aria-label="Sort ' + screen + '">' + opts.join("") + "</select></label>";
  }

  function bind(container, rerender) {
    if (!container) return;
    container.querySelectorAll("[data-afasort]").forEach(function (btn) {
      btn.onclick = function (event) {
        if (event) event.stopPropagation();
        toggle(btn.getAttribute("data-afasort-screen"), btn.getAttribute("data-afasort"));
        if (rerender) rerender(btn.getAttribute("data-afasort-screen"));
      };
    });
    container.querySelectorAll("[data-afasort-select]").forEach(function (sel) {
      sel.onchange = function () {
        var parts = String(sel.value || "").split(":");
        set(sel.getAttribute("data-afasort-select"), parts[0], parts[1] === "asc" ? "asc" : "desc");
        if (rerender) rerender(sel.getAttribute("data-afasort-select"));
      };
    });
  }

  root.AFASort = {
    get: get,
    set: set,
    toggle: toggle,
    sort: sort,
    compare: compare,
    head: head,
    select: select,
    bind: bind,
    snapshot: function () {
      var copy = {};
      Object.keys(memory).forEach(function (key) { copy[key] = { key: memory[key].key, dir: memory[key].dir }; });
      return copy;
    },
    restore: function (saved) {
      if (!saved) return;
      Object.keys(saved).forEach(function (key) {
        if (saved[key] && saved[key].key) memory[key] = { key: saved[key].key, dir: saved[key].dir === "asc" ? "asc" : "desc" };
      });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
