/* Interactive status infographic — runs inside the exported HTML file.
   Plain browser JavaScript, no libraries, no network. Reads the snapshot from
   <script id="report-data"> and redraws everything when a filter changes. */
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("report-data").textContent);
  var app = document.getElementById("app");
  var tip = document.getElementById("tip");
  var TODAY = D.asOf;
  var CATS = ["done", "progress", "blocked", "todo"];
  var CAT_VAR = { done: "var(--done)", progress: "var(--progress)", blocked: "var(--blocked)", todo: "var(--todo)" };
  var CAT_INK = { done: "#fff", progress: "#fff", blocked: "#fff", todo: "var(--todo-ink)" };
  var PERIODS = [
    { key: "7d", label: "Last 7 days", short: "Week", days: 7, weeks: 4 },
    { key: "30d", label: "Last 30 days", short: "Month", days: 30, weeks: 6 },
    { key: "90d", label: "Last 90 days", short: "Quarter", days: 90, weeks: 13 },
    { key: "all", label: "All time", short: "All", days: null, weeks: 26 },
  ];

  var state = {
    person: D.person || "",
    space: "",
    module: "",
    period: PERIODS.some(function (p) { return p.key === D.period; }) ? D.period : "30d",
    q: "",
    sort: { key: "d", dir: 1 },
    showAll: false,
    tables: {},
  };

  // ---- helpers ------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toDay(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function fromDay(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function addDays(iso, n) { return fromDay(toDay(iso) + n); }
  function diffDays(a, b) { return toDay(b) - toDay(a); }
  function weekStart(iso) { var d = new Date(toDay(iso) * 864e5).getUTCDay(); return addDays(iso, -d); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmt(iso) { if (!iso) return ""; var p = iso.split("-"); return MON[+p[1] - 1] + " " + +p[2]; }
  function fmtLong(iso) { return fmt(iso) + ", " + iso.slice(0, 4); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function uniq(list) { var seen = {}; return list.filter(function (x) { if (x == null || seen[x]) return false; seen[x] = 1; return true; }); }
  // Sections chosen when the file was exported (older files: everything).
  function on(key) { return !D.sections || D.sections.indexOf(key) >= 0; }
  function period() { return PERIODS.filter(function (p) { return p.key === state.period; })[0]; }
  function sameName(a, b) { return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase(); }

  // ---- tooltip -----------------------------------------------------------
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, x + 14), vw - w - 8);
    var top = y - h - 12 < 8 ? y + 16 : y - h - 12;
    tip.style.left = left + "px";
    tip.style.top = Math.min(top, vh - h - 8) + "px";
  }
  function hideTip() { tip.hidden = true; }
  function bindTips(root) {
    root.querySelectorAll("[data-tip]").forEach(function (el) {
      var show = function (e) {
        var r = el.getBoundingClientRect();
        var x = e && e.clientX != null ? e.clientX : r.left + r.width / 2;
        var y = e && e.clientY != null ? e.clientY : r.top;
        showTip(el.getAttribute("data-tip"), x, y);
      };
      el.addEventListener("mousemove", show);
      el.addEventListener("focus", function () { show(null); });
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("blur", hideTip);
    });
  }
  document.addEventListener("scroll", hideTip, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });

  // ---- data ----------------------------------------------------------------
  var ALL = D.tasks;
  var PEOPLE = uniq(ALL.map(function (t) { return t.a; })).sort(function (a, b) {
    return (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b);
  });
  var SPACES = uniq(ALL.map(function (t) { return t.s; })).sort();
  var MODULES = uniq(ALL.map(function (t) { return t.m; })).sort();

  function filtered() {
    return ALL.filter(function (t) {
      return (!state.person || sameName(t.a, state.person)) &&
        (!state.space || t.s === state.space) &&
        (!state.module || (state.module === "__none__" ? !t.m : t.m === state.module));
    });
  }
  function isOpen(t) { return t.c !== "done"; }
  function isLate(t) { return isOpen(t) && t.d && t.d < TODAY; }

  function health(F) {
    if (!F.length) return { level: "none", label: "No tasks", reason: "Nothing matches these filters." };
    var dueSoFar = F.filter(function (t) { return t.d && t.d < TODAY; }).length;
    var late = F.filter(isLate).length;
    var blocked = F.filter(function (t) { return t.bl; }).length;
    var lateMs = F.filter(function (t) { return t.ms && isLate(t); }).length;
    var missed = F.filter(function (t) { return t.dm; }).length;
    var share = dueSoFar ? late / dueSoFar : 0;
    var level = share > 0.2 ? "off" : share > 0.1 || blocked || lateMs || missed ? "risk" : "ok";
    var why = [];
    if (late) why.push(late + " of " + dueSoFar + " tasks due so far " + (late === 1 ? "is" : "are") + " late (" + Math.round(share * 100) + "%)");
    if (lateMs) why.push(plural(lateMs, "milestone") + " late");
    if (blocked) why.push(blocked + " blocked");
    if (missed && !late) why.push(missed + " past a hard deadline");
    return {
      level: level,
      label: level === "ok" ? "On track" : level === "risk" ? "At risk" : "Off track",
      reason: why.length ? why.join(" · ") : "Nothing is overdue or blocked.",
    };
  }

  // ---- pieces --------------------------------------------------------------
  function cardHead(id, title, desc, tableable) {
    return '<div class="card-head"><div><h2>' + esc(title) + "</h2>" + (desc ? '<p class="desc">' + esc(desc) + "</p>" : "") + "</div>" +
      (tableable ? '<button class="btn" data-table="' + id + '" aria-pressed="' + !!state.tables[id] + '">' + (state.tables[id] ? "Show chart" : "Show table") + "</button>" : "") +
      "</div>";
  }
  function table(head, rows, numeric) {
    return '<div class="scroll"><table><thead><tr>' + head.map(function (h, i) { return "<th" + (numeric && numeric[i] ? ' class="n"' : "") + ">" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (c, i) { return "<td" + (numeric && numeric[i] ? ' class="n"' : "") + ">" + esc(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span><i class="' + (it.cls || "") + '" style="background:' + (it.color || "transparent") + '"></i>' + esc(it.label) + (it.value != null ? " <b>" + esc(it.value) + "</b>" : "") + "</span>";
    }).join("") + "</div>";
  }
  function taskLine(t, chip, chipCls, extra) {
    var sub = [t.a];
    if (D.multi && !state.space) sub.push(t.s);
    if (t.m && !state.module) sub.push(t.m);
    if (extra) sub.push(extra);
    var tipHtml = "<b>" + esc(t.t) + "</b><br>" + esc(t.st || D.catLabel[t.c]) + (t.d ? " · due " + fmt(t.d) : "") + (t.dd ? " · finished " + fmt(t.dd) : "") +
      (t.e || t.h ? "<br>" + r1(t.h) + "h logged" + (t.e ? " of " + t.e + "h estimated" : "") : "");
    return '<li tabindex="0" data-tip="' + esc(tipHtml) + '"><span class="dot" style="background:' + CAT_VAR[t.c] + '"></span><span class="main"><b>' +
      (t.ms ? "◆ " : "") + esc(t.t) + "</b><small>" + esc(sub.join(" · ")) + "</small></span>" +
      (chip ? '<span class="chip ' + (chipCls || "") + '">' + esc(chip) + "</span>" : "") + "</li>";
  }
  function listCard(title, desc, items, render, empty, limit) {
    limit = limit || 8;
    return cardHead("", title, desc, false) +
      (items.length ? '<ul class="list">' + items.slice(0, limit).map(render).join("") + "</ul>" : '<p class="empty">' + esc(empty) + "</p>") +
      (items.length > limit ? '<p class="more">+ ' + (items.length - limit) + " more" + (on("tasks") ? " in the task table below" : "") + "</p>" : "");
  }
  function dueChip(t) {
    if (!t.d) return ["No date", ""];
    var d = diffDays(TODAY, t.d);
    if (d < 0) return [-d + "d late", "bad"];
    if (d === 0) return ["Today", "warn"];
    if (d === 1) return ["Tomorrow", "warn"];
    return [fmt(t.d), ""];
  }

  // ---- charts (SVG) ----------------------------------------------------------
  function niceStep(max, ticks) {
    var raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / mag;
    return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag); // counts: whole numbers only
  }
  function svgEl(w, h, inner, label) {
    return '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(label) + '">' + inner + "</svg>";
  }

  function progressData(F) {
    var dates = [];
    F.forEach(function (t) { if (t.sd) dates.push(t.sd); if (t.d) dates.push(t.d); if (t.dd) dates.push(t.dd); });
    if (!dates.length) return null;
    dates.sort();
    var start = weekStart(dates[0]);
    var end = dates[dates.length - 1] > TODAY ? dates[dates.length - 1] : TODAY;
    var pts = [];
    for (var x = start; x <= addDays(end, 6); x = addDays(x, 7)) {
      var day = addDays(x, 6) < end ? addDays(x, 6) : end; // end of that week
      var planned = F.filter(function (t) { return t.d && t.d <= day; }).length;
      var actual = day <= TODAY ? F.filter(function (t) { return t.dd && t.dd <= day; }).length : null;
      pts.push({ day: day, planned: planned, actual: actual });
      if (day === end) break;
    }
    // make sure "today" is a point so the actual line ends on it
    if (!pts.some(function (p) { return p.day === TODAY; })) {
      pts.push({ day: TODAY, planned: F.filter(function (t) { return t.d && t.d <= TODAY; }).length, actual: F.filter(function (t) { return t.dd && t.dd <= TODAY; }).length });
      pts.sort(function (a, b) { return a.day < b.day ? -1 : 1; });
    }
    return { pts: pts, total: F.length };
  }

  function drawProgress(el, F) {
    var P = progressData(F);
    if (!P) { el.innerHTML = '<p class="empty">No dated tasks.</p>'; return; }
    var W = Math.max(280, el.clientWidth), H = 240, m = { l: 34, r: 12, t: 12, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var x0 = toDay(P.pts[0].day), x1 = toDay(P.pts[P.pts.length - 1].day);
    var maxY = Math.max(1, P.total);
    var step = niceStep(maxY, 4), top = Math.ceil(maxY / step) * step;
    var X = function (iso) { return m.l + (x1 === x0 ? iw / 2 : ((toDay(iso) - x0) / (x1 - x0)) * iw); };
    var Y = function (v) { return m.t + ih - (v / top) * ih; };
    var g = "";
    for (var v = 0; v <= top; v += step) {
      g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--grid)"/>';
      g += '<text x="' + (m.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    }
    var nLab = Math.max(2, Math.floor(iw / 90)), every = Math.max(1, Math.ceil(P.pts.length / nLab));
    P.pts.forEach(function (p, i) {
      if (i % every === 0) g += '<text x="' + X(p.day) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmt(p.day) + "</text>";
    });
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--axis)"/>';
    var tx = X(TODAY);
    g += '<line x1="' + tx + '" x2="' + tx + '" y1="' + m.t + '" y2="' + Y(0) + '" stroke="var(--axis)" stroke-dasharray="3 3"/>';
    g += '<text x="' + tx + '" y="' + (m.t + 10) + '" text-anchor="middle" style="fill:var(--ink-2);font-weight:600">Today</text>';
    var path = function (key) {
      return P.pts.filter(function (p) { return p[key] != null; }).map(function (p, i) { return (i ? "L" : "M") + X(p.day).toFixed(1) + " " + Y(p[key]).toFixed(1); }).join(" ");
    };
    g += '<path d="' + path("planned") + '" fill="none" stroke="var(--context)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>';
    g += '<path d="' + path("actual") + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>';
    var last = P.pts.filter(function (p) { return p.day === TODAY; })[0];
    if (last) g += '<circle cx="' + tx + '" cy="' + Y(last.actual) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>';
    g += '<g class="cross" style="display:none"><line y1="' + m.t + '" y2="' + Y(0) + '" stroke="var(--ink-2)" stroke-width="1"/><circle r="4" class="cp" fill="var(--context)" stroke="var(--surface)" stroke-width="2"/><circle r="4" class="ca" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>';
    g += '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>';
    el.innerHTML = svgEl(W, H, g, "Planned versus finished tasks over time");
    var svg = el.querySelector("svg"), cross = svg.querySelector(".cross");
    svg.querySelector(".hit").addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      var best = P.pts[0];
      P.pts.forEach(function (p) { if (Math.abs(X(p.day) - px) < Math.abs(X(best.day) - px)) best = p; });
      var cx = X(best.day);
      cross.style.display = "";
      cross.querySelector("line").setAttribute("x1", cx); cross.querySelector("line").setAttribute("x2", cx);
      var cp = cross.querySelector(".cp"), ca = cross.querySelector(".ca");
      cp.setAttribute("cx", cx); cp.setAttribute("cy", Y(best.planned));
      ca.style.display = best.actual == null ? "none" : ""; ca.setAttribute("cx", cx); ca.setAttribute("cy", Y(best.actual || 0));
      showTip("<b>" + fmtLong(best.day) + "</b><br>" + '<span class="sw" style="background:var(--accent)"></span>Finished: ' + (best.actual == null ? "—" : best.actual) +
        '<br><span class="sw" style="background:var(--context)"></span>Planned by then: ' + best.planned + " of " + P.total, e.clientX, e.clientY);
    });
    svg.querySelector(".hit").addEventListener("mouseleave", function () { cross.style.display = "none"; hideTip(); });
  }

  function weeksData(F) {
    var p = period();
    var n = p.weeks;
    if (p.key === "all") {
      var first = F.filter(function (t) { return t.dd; }).map(function (t) { return t.dd; }).sort()[0];
      n = first ? Math.min(26, Math.max(4, Math.floor(diffDays(weekStart(first), weekStart(TODAY)) / 7) + 1)) : 8;
    }
    var w0 = weekStart(TODAY), out = [];
    for (var i = n - 1; i >= 0; i--) {
      var s = addDays(w0, -7 * i), e = addDays(s, 6);
      var done = F.filter(function (t) { return t.dd && t.dd >= s && t.dd <= e; });
      out.push({ start: s, end: e, count: done.length, tasks: done, current: i === 0 });
    }
    return out;
  }

  function drawWeeks(el, F) {
    var WK = weeksData(F);
    var W = Math.max(280, el.clientWidth), H = 240, m = { l: 28, r: 8, t: 14, b: 26 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var max = Math.max(1, Math.max.apply(null, WK.map(function (w) { return w.count; })));
    var step = niceStep(max, 4), top = Math.ceil(max / step) * step;
    var Y = function (v) { return m.t + ih - (v / top) * ih; };
    var slot = iw / WK.length, bw = Math.max(4, Math.min(28, slot * 0.6));
    var g = "";
    for (var v = 0; v <= top; v += step) {
      g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--grid)"/>';
      g += '<text x="' + (m.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    }
    var every = Math.max(1, Math.ceil(WK.length / Math.max(2, Math.floor(iw / 60))));
    WK.forEach(function (w, i) {
      var cx = m.l + slot * i + slot / 2, x = cx - bw / 2, y = Y(w.count), h = Y(0) - y, r = Math.min(4, bw / 2, h);
      if (w.count > 0) {
        g += '<path d="M' + x + " " + Y(0) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y + "H" + (x + bw - r) + "Q" + (x + bw) + " " + y + " " + (x + bw) + " " + (y + r) + "V" + Y(0) + 'Z" fill="' +
          (w.current ? "var(--accent-soft)" : "var(--accent)") + '"' + (w.current ? ' stroke="var(--accent)" stroke-width="1"' : "") + "/>";
      }
      var list = w.tasks.slice(0, 5).map(function (t) { return "• " + esc(t.t); }).join("<br>") + (w.tasks.length > 5 ? "<br>+ " + (w.tasks.length - 5) + " more" : "");
      var tipHtml = "<b>Week of " + fmt(w.start) + (w.current ? " (so far)" : "") + "</b><br>" + plural(w.count, "task") + " finished" + (list ? "<br>" + list : "");
      g += '<rect class="hit" tabindex="0" x="' + (m.l + slot * i) + '" y="' + m.t + '" width="' + slot + '" height="' + ih + '" data-tip="' + esc(tipHtml) + '"/>';
      if (i % every === 0 || i === WK.length - 1) g += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + fmt(w.start) + "</text>";
    });
    g += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--axis)"/>';
    el.innerHTML = svgEl(W, H, g, "Tasks finished per week");
    bindTips(el);
  }

  // ---- render --------------------------------------------------------------
  function render() {
    hideTip();
    var F = filtered();
    var P = period();
    var from = P.days ? addDays(TODAY, -(P.days - 1)) : null;
    var by = {}; CATS.forEach(function (c) { by[c] = 0; });
    F.forEach(function (t) { by[t.c]++; });
    var done = by.done, total = F.length, open = F.filter(isOpen);
    var late = open.filter(isLate).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var blocked = open.filter(function (t) { return t.bl && !isLate(t); });
    var nBlocked = open.filter(function (t) { return t.bl; }).length;
    var finished = F.filter(function (t) { return t.dd && (!from || t.dd >= from) && t.dd <= TODAY; }).sort(function (a, b) { return a.dd < b.dd ? 1 : -1; });
    var horizon = P.key === "7d" ? 7 : P.key === "30d" ? 14 : 30;
    var upcoming = open.filter(function (t) { return t.d && t.d >= TODAY && t.d <= addDays(TODAY, horizon); }).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var hours = F.reduce(function (s, t) { return s + t.h; }, 0);
    var H = health(F);
    var hColor = H.level === "ok" ? "var(--good)" : H.level === "risk" ? "var(--warning)" : H.level === "off" ? "var(--critical)" : "var(--muted)";
    var hIcon = H.level === "ok" ? "✓" : H.level === "risk" ? "!" : H.level === "off" ? "✕" : "–";
    var filtersOn = state.person || state.space || state.module;

    var html = '<div class="wrap">';
    html += '<header class="head"><div><h1>' + (D.icon ? esc(D.icon) + " " : "") + esc(D.title) + '</h1><div class="sub">Status report · as of ' + fmtLong(TODAY) +
      " · " + esc(D.app) + "</div></div>" +
      '<div class="tools"><button class="btn" id="theme" title="Switch light / dark">◐ Theme</button><button class="btn" id="print">Print / PDF</button></div></header>';

    // filters
    html += '<div class="filters" role="toolbar" aria-label="Filters"><div class="seg" role="group" aria-label="Period">' +
      PERIODS.map(function (p) { return '<button data-period="' + p.key + '" aria-pressed="' + (p.key === state.period) + '" title="' + p.label + '">' + p.short + "</button>"; }).join("") + "</div>";
    html += '<select id="f-person" aria-label="Person"><option value="">Everyone</option>' + PEOPLE.map(function (p) { return "<option" + (sameName(p, state.person) ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select>";
    if (SPACES.length > 1) html += '<select id="f-space" aria-label="Space"><option value="">All spaces</option>' + SPACES.map(function (s) { return "<option" + (s === state.space ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select>";
    if (MODULES.length) html += '<select id="f-module" aria-label="Module"><option value="">All modules</option>' + MODULES.map(function (s) { return "<option" + (s === state.module ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + '<option value="__none__"' + (state.module === "__none__" ? " selected" : "") + ">No module</option></select>";
    if (filtersOn) html += '<button class="reset" id="reset">Clear filters</button>';
    html += '<span class="count">' + plural(total, "task") + (filtersOn ? " of " + ALL.length : "") + "</span></div>";

    // health
    if (on("health")) {
      html += '<div class="health"><span class="pill"><span class="dot" style="background:' + hColor + '"></span>' + hIcon + " " + esc(H.label) + '</span><span class="why">' + esc(H.reason) + "</span>" +
        '<span class="note">Schedule health is worked out from the due dates</span></div>';
    }

    // tiles
    if (on("tiles")) {
      var tiles = [
        { k: "Tasks", v: total, s: plural(open.length, "open task") },
        { k: "Complete", v: pct(done, total) + "%", s: done + " of " + total + " done" },
        { k: "Finished", v: finished.length, s: P.label.toLowerCase() },
        { k: "In progress", v: by.progress, s: nBlocked ? nBlocked + " blocked or waiting" : "none blocked" },
        { k: "Late", v: late.length, s: late.length ? "oldest due " + fmt(late[0].d) : "nothing overdue" },
        { k: "Hours logged", v: r1(hours), s: "all time, on these tasks" },
      ];
      html += '<div class="tiles">' + tiles.map(function (t) { return '<div class="tile"><div class="k">' + esc(t.k) + '</div><div class="v">' + esc(t.v) + '</div><div class="s">' + esc(t.s) + "</div></div>"; }).join("") + "</div>";
    }

    // Each row lays out whichever of its cards are included; a lone card takes the full width.
    function row(cards, spans) {
      var kept = cards.filter(Boolean);
      return kept.map(function (c, i) {
        var span = kept.length === cards.length ? spans[cards.indexOf(c)] : Math.floor(12 / kept.length);
        return '<section class="card span-' + span + (c.cls ? " " + c.cls : "") + '"' + (c.id ? ' id="' + c.id + '"' : "") + ">" + c.html + "</section>";
      }).join("");
    }

    html += '<div class="grid">';

    // where the work stands (+ modules)
    var mods = MODULES.map(function (name) {
      var ts = F.filter(function (t) { return t.m === name; });
      return { name: name, total: ts.length, done: ts.filter(function (t) { return t.c === "done"; }).length, late: ts.filter(isLate).length };
    }).filter(function (m) { return m.total; });
    var stateCard = null;
    if (on("state") || (on("modules") && mods.length)) {
      var sc = "";
      if (on("state")) {
        sc += cardHead("cats", "Where the work stands", plural(total, "task") + " by state", true);
        if (state.tables.cats) {
          sc += table(["State", "Tasks", "Share"], CATS.map(function (c) { return [D.catLabel[c], by[c], pct(by[c], total) + "%"]; }), [0, 1, 1]);
        } else {
          sc += '<div class="segbar">' + CATS.filter(function (c) { return by[c]; }).map(function (c) {
            var p = pct(by[c], total);
            return '<div tabindex="0" style="flex:' + by[c] + ";background:" + CAT_VAR[c] + ";color:" + CAT_INK[c] + '" data-tip="' + esc("<b>" + D.catLabel[c] + "</b><br>" + plural(by[c], "task") + " · " + p + "%") + '">' + (p >= 8 ? p + "%" : "") + "</div>";
          }).join("") + (total ? "" : '<div style="flex:1;background:var(--grid)"></div>') + "</div>";
          sc += legend(CATS.map(function (c) { return { color: CAT_VAR[c], label: D.catLabel[c], value: by[c] }; }));
        }
      }
      if (on("modules") && mods.length) {
        sc += on("state")
          ? '<h2 style="margin-top:18px;font-size:13px">By module</h2><p class="desc">Click a module to filter</p>'
          : cardHead("", "By module", "Tasks finished per module · click a module to filter", false);
        sc += '<ul class="meters">' + mods.map(function (m) {
          return '<li class="click' + (state.module === m.name ? " on" : "") + '" tabindex="0" data-module="' + esc(m.name) + '"><span class="lab"><b>' + esc(m.name) + "</b><small>" + (m.late ? m.late + " late" : pct(m.done, m.total) + "% done") + '</small></span><span class="track"><span style="width:' + pct(m.done, m.total) + '%;background:var(--accent)"></span></span><span class="fig"><b>' + m.done + "/" + m.total + "</b></span></li>";
        }).join("") + "</ul>";
      }
      stateCard = { html: sc };
    }

    // progress
    var progCard = null;
    if (on("progress")) {
      var pc = cardHead("prog", "Progress over time", "Tasks finished vs tasks planned to be due by each date", true);
      if (state.tables.prog) {
        var PD = progressData(F);
        pc += PD ? table(["Week ending", "Finished", "Planned"], PD.pts.map(function (p) { return [fmtLong(p.day), p.actual == null ? "—" : p.actual, p.planned]; }), [0, 1, 1]) : '<p class="empty">No dated tasks.</p>';
      } else {
        pc += '<div class="chart" id="c-prog"></div>' + legend([{ color: "var(--accent)", cls: "line", label: "Finished" }, { cls: "dash", label: "Planned (by due date)" }]);
      }
      progCard = { html: pc };
    }
    html += row([stateCard, progCard], [5, 7]);

    // weekly output
    var weekCard = null;
    if (on("weekly")) {
      var wc = cardHead("weeks", "Weekly output", "Tasks finished each week (weeks start on Sunday) · hover a column for the tasks", true);
      if (state.tables.weeks) {
        wc += table(["Week of", "Finished", "Tasks"], weeksData(F).map(function (w) { return [fmtLong(w.start) + (w.current ? " (so far)" : ""), w.count, w.tasks.map(function (t) { return t.t; }).join("; ")]; }), [0, 1, 0]);
      } else {
        wc += '<div class="chart" id="c-weeks"></div>';
      }
      weekCard = { html: wc };
    }

    // people
    var pplCard = null;
    if (on("people")) {
      var ppl = uniq(F.map(function (t) { return t.a; })).map(function (name) {
        var ts = F.filter(function (t) { return t.a === name; });
        return { name: name, total: ts.length, done: ts.filter(function (t) { return t.c === "done"; }).length, late: ts.filter(isLate).length, open: ts.filter(isOpen).length, hours: ts.reduce(function (s, t) { return s + t.h; }, 0) };
      }).sort(function (a, b) { return (a.name === "Unassigned") - (b.name === "Unassigned") || b.total - a.total; });
      var ppc = cardHead("ppl", "By person", "Tasks finished out of those assigned · click a name to filter", true);
      if (state.tables.ppl) {
        ppc += table(["Person", "Done", "Assigned", "Late", "Hours"], ppl.map(function (p) { return [p.name, p.done, p.total, p.late, r1(p.hours)]; }), [0, 1, 1, 1, 1]);
      } else {
        ppc += ppl.length ? '<ul class="meters">' + ppl.map(function (p) {
          return '<li class="click' + (sameName(state.person, p.name) ? " on" : "") + '" tabindex="0" data-person="' + esc(p.name) + '"><span class="lab"><b>' + esc(p.name) + "</b><small>" + (p.late ? p.late + " late" : p.open ? p.open + " open" : "all done") + '</small></span><span class="track"><span style="width:' + pct(p.done, p.total) + '%;background:var(--accent)"></span></span><span class="fig"><b>' + p.done + "/" + p.total + "</b> · " + r1(p.hours) + "h</span></li>";
        }).join("") + "</ul>" : '<p class="empty">No tasks.</p>';
      }
      pplCard = { html: ppc };
    }
    html += row([weekCard, pplCard], [7, 5]);

    // goals + baseline
    var goalsCard = null;
    if (on("goals") && D.goals.length) {
      goalsCard = { html: cardHead("", "Goals · " + D.goals.filter(function (g) { return g.state === "done"; }).length + "/" + D.goals.length + " achieved", "Progress comes from the tasks in each goal's modules · the dark mark is how much of the time has passed", false) +
        D.goals.map(function (g) {
          var color = g.state === "overdue" ? "var(--late)" : g.state === "at-risk" ? "var(--warning)" : g.state === "done" ? "var(--done)" : "var(--accent)";
          var when = g.daysLeft != null && g.state !== "done" ? (g.daysLeft < 0 ? -g.daysLeft + " days past " + fmt(g.target) : g.daysLeft === 0 ? "due today" : g.daysLeft + " days left · " + fmt(g.target)) : g.target ? fmt(g.target) : "no target date";
          return '<div class="goal" tabindex="0" data-tip="' + esc("<b>" + esc(g.title) + "</b><br>" + g.progress + "% done" + (g.expected != null ? " · " + g.expected + "% of the time used" : "") + (g.total ? "<br>" + g.done + " of " + g.total + " tasks" : "")) + '"><div class="row1"><span>' + esc(g.title) + "</span><span>" + g.progress + '%</span></div><div class="track"><span style="width:' + g.progress + "%;background:" + color + '"></span>' +
            (g.expected != null && g.state !== "done" ? '<em style="left:calc(' + g.expected + '% - 1px)"></em>' : "") + '</div><div class="row3"><b>' + esc(g.stateLabel) + "</b> · " + esc(when) + (g.total ? " · " + g.done + "/" + g.total + " tasks" : "") + (g.modules.length ? " · " + esc(g.modules.join(", ")) : "") + "</div></div>";
        }).join("") };
    }
    var baseCard = null;
    if (on("baseline") && D.baseline) {
      var withB = F.filter(function (t) { return t.sl != null; });
      var bl = withB.filter(function (t) { return t.sl > 0; }), be = withB.filter(function (t) { return t.sl < 0; });
      var avg = withB.length ? r1(withB.reduce(function (s, t) { return s + t.sl; }, 0) / withB.length) : 0;
      var bc = cardHead("", "Against the baseline", "Plan saved " + (D.baseline.setAt ? fmtLong(D.baseline.setAt) : "") + " vs the plan now · " + plural(withB.length, "task"), false);
      bc += '<div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:8px">' + [["Later", bl.length], ["On plan", withB.length - bl.length - be.length], ["Earlier", be.length]].map(function (x) { return '<div class="tile"><div class="v">' + x[1] + '</div><div class="k">' + x[0] + "</div></div>"; }).join("") + "</div>";
      bc += '<p class="desc">Average slip <b>' + (avg > 0 ? "+" : "") + avg + " days</b>" + (!filtersOn && D.baseline.baselineFinish ? " · last finish " + fmt(D.baseline.baselineFinish) + " → <b>" + fmt(D.baseline.currentFinish) + "</b>" : "") + "</p>";
      var top = bl.filter(isOpen).sort(function (a, b) { return b.sl - a.sl; });
      bc += top.length ? '<ul class="list">' + top.slice(0, 5).map(function (t) { return taskLine(t, "+" + t.sl + "d", "bad"); }).join("") + "</ul>" : '<p class="empty">No open task is finishing later than planned.</p>';
      baseCard = { html: bc };
    }
    html += row([goalsCard, baseCard], [7, 5]);

    // lists
    html += row([
      on("attention") ? { html: listCard("Needs attention", "Late or blocked, oldest first", late.concat(blocked), function (t) {
        var c = isLate(t) ? dueChip(t) : ["Blocked", "warn"];
        return taskLine(t, c[0], c[1], t.w ? "waiting on " + t.w : "");
      }, "Nothing is late or blocked.") } : null,
      on("upcoming") ? { html: listCard("Coming up", "Due in the next " + horizon + " days", upcoming, function (t) { var c = dueChip(t); return taskLine(t, c[0], c[1]); }, "Nothing due in this window.") } : null,
      on("finished") ? { html: listCard("Finished", P.label, finished, function (t) { return taskLine(t, fmt(t.dd), ""); }, "Nothing finished in this period.") } : null,
    ], [4, 4, 4]);

    if (on("notes") && D.notes) html += row([{ html: cardHead("", "Notes", "", false) + '<div class="notes">' + esc(D.notes) + "</div>" }], [12]);

    // explorer
    if (on("tasks")) html += row([{ cls: "explorer", id: "explorer", html: cardHead("", "All tasks", "Search, sort by any column, hover a row for details", false) + '<div id="explorer-body"></div>' }], [12]);
    html += "</div>"; // grid
    html += '<p class="foot">Snapshot made ' + esc(new Date(D.generated).toLocaleString()) + " from " + esc(D.app) + ". The numbers don't update — export again for fresh data.</p>";
    html += "</div>";
    app.innerHTML = html;

    // charts after layout
    var cp = document.getElementById("c-prog"); if (cp) drawProgress(cp, F);
    var cw = document.getElementById("c-weeks"); if (cw) drawWeeks(cw, F);
    if (on("tasks")) renderExplorer(F);
    bindTips(app);
    wire();
  }

  function renderExplorer(F) {
    var q = state.q.trim().toLowerCase();
    var cols = [
      { key: "t", label: "Task" },
      SPACES.length > 1 ? { key: "s", label: "Space" } : null,
      { key: "a", label: "Person" },
      { key: "c", label: "State" },
      MODULES.length ? { key: "m", label: "Module" } : null,
      { key: "sd", label: "Start" },
      { key: "d", label: "Due" },
      { key: "dd", label: "Finished" },
      { key: "h", label: "Hours", n: true },
    ].filter(Boolean);
    var rows = F.filter(function (t) {
      return !q || [t.t, t.a, t.s, t.st, t.m].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var k = state.sort.key, dir = state.sort.dir;
    var catRank = { blocked: 0, progress: 1, todo: 2, done: 3 };
    rows.sort(function (a, b) {
      var x = k === "c" ? catRank[a.c] : a[k], y = k === "c" ? catRank[b.c] : b[k];
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    var LIMIT = 150, shown = state.showAll ? rows : rows.slice(0, LIMIT);
    var body = document.getElementById("explorer-body");
    var h = '<div class="tools"><input class="search" id="q" type="search" placeholder="Search tasks, people, modules…" value="' + esc(state.q) + '"><span class="desc" style="margin:0">' + plural(rows.length, "task") + "</span></div>";
    h += '<div class="scroll"><table><thead><tr>' + cols.map(function (c) {
      return "<th" + (c.n ? ' class="n"' : "") + '><button data-sort="' + c.key + '"' + (k === c.key ? ' data-dir="' + (dir > 0 ? "▲" : "▼") + '"' : "") + ">" + c.label + "</button></th>";
    }).join("") + "</tr></thead><tbody>";
    h += shown.map(function (t) {
      var lateTxt = isLate(t) ? " (" + diffDays(t.d, TODAY) + "d late)" : "";
      return "<tr>" + cols.map(function (c) {
        if (c.key === "t") return "<td>" + (t.ms ? "◆ " : "") + esc(t.t) + "</td>";
        if (c.key === "c") return '<td><span class="status"><i style="background:' + CAT_VAR[t.c] + '"></i>' + esc(t.st || D.catLabel[t.c]) + "</span></td>";
        if (c.key === "d") return "<td>" + esc(fmt(t.d)) + (lateTxt ? '<span style="color:var(--bad-text)">' + lateTxt + "</span>" : "") + "</td>";
        if (c.key === "sd" || c.key === "dd") return "<td>" + esc(fmt(t[c.key])) + "</td>";
        if (c.key === "h") return '<td class="n">' + (t.e ? r1(t.h) + " / " + t.e : t.h ? r1(t.h) : "") + "</td>";
        return "<td>" + esc(t[c.key] || "") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    h += "</tbody></table></div>";
    if (rows.length > LIMIT) h += '<p class="more"><button class="btn" id="show-all">' + (state.showAll ? "Show fewer" : "Show all " + rows.length) + "</button></p>";
    body.innerHTML = h;
    body.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.getAttribute("data-sort");
        state.sort = { key: key, dir: state.sort.key === key ? -state.sort.dir : 1 };
        renderExplorer(filtered());
      });
    });
    var qi = document.getElementById("q");
    qi.addEventListener("input", function () {
      state.q = qi.value;
      var pos = qi.selectionStart;
      renderExplorer(filtered());
      var n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos);
    });
    var sa = document.getElementById("show-all");
    if (sa) sa.addEventListener("click", function () { state.showAll = !state.showAll; renderExplorer(filtered()); });
  }

  function wire() {
    app.querySelectorAll("[data-period]").forEach(function (b) {
      b.addEventListener("click", function () { state.period = b.getAttribute("data-period"); render(); });
    });
    var fp = document.getElementById("f-person"); if (fp) fp.addEventListener("change", function () { state.person = fp.value; render(); });
    var fs = document.getElementById("f-space"); if (fs) fs.addEventListener("change", function () { state.space = fs.value; render(); });
    var fm = document.getElementById("f-module"); if (fm) fm.addEventListener("change", function () { state.module = fm.value; render(); });
    var rs = document.getElementById("reset"); if (rs) rs.addEventListener("click", function () { state.person = state.space = state.module = ""; render(); });
    app.querySelectorAll("[data-table]").forEach(function (b) {
      b.addEventListener("click", function () { var id = b.getAttribute("data-table"); state.tables[id] = !state.tables[id]; render(); });
    });
    var toggle = function (attr, key) {
      app.querySelectorAll("[" + attr + "]").forEach(function (li) {
        var go = function () { var v = li.getAttribute(attr); state[key] = state[key] === v ? "" : v; render(); };
        li.addEventListener("click", go);
        li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    };
    toggle("data-person", "person");
    toggle("data-module", "module");
    document.getElementById("print").addEventListener("click", function () { window.print(); });
    document.getElementById("theme").addEventListener("click", function () {
      var root = document.documentElement;
      var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", dark ? "light" : "dark");
      try { localStorage.setItem("infographic-theme", root.getAttribute("data-theme")); } catch (e) { /* storage blocked */ }
    });
  }

  try {
    var saved = localStorage.getItem("infographic-theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked */ }

  var lastW = window.innerWidth, timer = 0;
  window.addEventListener("resize", function () {
    if (Math.abs(window.innerWidth - lastW) < 8) return;
    lastW = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(function () {
      var F = filtered();
      var cp = document.getElementById("c-prog"); if (cp) drawProgress(cp, F);
      var cw = document.getElementById("c-weeks"); if (cw) drawWeeks(cw, F);
    }, 120);
  });
  window.addEventListener("beforeprint", function () {
    var F = filtered();
    var cp = document.getElementById("c-prog"); if (cp) drawProgress(cp, F);
    var cw = document.getElementById("c-weeks"); if (cw) drawWeeks(cw, F);
  });

  render();
})();
