"use strict";

// ═══════════════════════════════════════════════════════════════
//  KPI Card — main.js
//
//  Two modes, same page:
//    viz mode    (default)    — renders the card
//    dialog mode (?dialog=1)  — renders the settings form
//
//  API idioms from the official Tableau viz-extension sample:
//    • getVisualSpecificationAsync  — reads which fields are on the marks card
//    • getSummaryDataReaderAsync    — paged reader, no row cap, respects filters
//    • SettingsChanged event        — re-renders when the dialog saves
// ═══════════════════════════════════════════════════════════════

var VERSION             = "1.0.0";
var MEASURE_ENCODING_ID     = "measure";
var DATE_ENCODING_ID        = "date";
var DENOMINATOR_ENCODING_ID = "denominator";

var DEFAULTS = {
  // Value
  aggregation:   "latest",
  format:        "number",     // currency | percent | number | custom
  prefix:        "$",
  suffix:        "",
  decimals:      "1",
  abbreviate:    "true",
  // Goal
  goal:          "0",
  goalDirection: "higher",
  showGoalBar:   "true",
  goalBarPos:    "left-full",    // top | left-ban | left-full
  // Chart
  periodGrain:      "month",
  deltaComparison:  "yoy",    // yoy | pop
  showDelta:        "true",
  showChart:        "true",
  showDots:      "true",
  showZeroLine:  "true",
  zeroLineColor: "#94a3b8",
  captionPrefix: "As of ",
  // Labels
  title:         "",
  // Typography
  fontFamily:    "system",
  valueSize:     "large",
  valueWeight:   "800",
  // Colors
  bgColor:       "#ffffff",
  textColor:     "#0f172a",
  upColor:       "#15803d",
  downColor:     "#b91c1c",
  primaryColor:  "#4e79a7",
  prevColor:     "#94a3b8",
};

var PALETTES = [
  { name: "Tableau 10",   colors: ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f","#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ac"] },
  { name: "Tableau 20",   colors: ["#4e79a7","#a0cbe8","#f28e2b","#ffbe7d","#59a14f","#8cd17d","#b6992d","#f1ce63","#499894","#86bcb6","#e15759","#ff9d9a","#79706e","#bab0ac","#d37295","#fabfd2","#b07aa1","#d4a6c8","#9d7660","#d7b5a6"] },
  { name: "Miller Stone", colors: ["#f47942","#fbb04e","#b9aa97","#7e756d","#bfbb60","#638b66","#a2ceaa","#849db1","#d7ce9f","#4f6980"] },
  { name: "Nuriel Stone", colors: ["#8175aa","#6fb899","#31a1b3","#ccb22b","#a39fc9","#94d0c0","#959c9e","#027b8e","#9f8f12"] },
  { name: "Color Blind",  colors: ["#1170aa","#fc7d0b","#a3acb9","#57606c","#5fa2ce","#c85200","#7b848f","#a3cce9","#ffbc79","#c8d0d9"] },
];

var FONT_FAMILIES = {
  system:    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  inter:     '"Inter", system-ui, sans-serif',
  lato:      '"Lato", Helvetica, Arial, sans-serif',
  montserrat:'"Montserrat", sans-serif',
  dmsans:    '"DM Sans", sans-serif',
  georgia:   '"Georgia", "Times New Roman", serif',
  playfair:  '"Playfair Display", Georgia, serif',
  mono:      '"SF Mono", "Fira Code", Consolas, monospace',
};

var VALUE_SIZES = {
  small:  "clamp(28px, 8vw, 56px)",
  medium: "clamp(36px, 10vw, 72px)",
  large:  "clamp(48px, 14vw, 100px)",
  xlarge: "clamp(60px, 18vw, 130px)",
};

var root = document.getElementById("root");

/* ─── Settings helpers ───────────────────────────────────── */

function raw(key) {
  var v = tableau.extensions.settings.get(key);
  return (v === undefined || v === null) ? DEFAULTS[key] : v;
}

function getConfig() {
  var goalStr = raw("goal").trim();
  return {
    aggregation:   raw("aggregation"),
    format:        raw("format"),
    prefix:        raw("prefix"),
    suffix:        raw("suffix"),
    decimals:      Math.max(0, parseInt(raw("decimals"), 10) || 0),
    abbreviate:    raw("abbreviate") === "true",
    goal:          goalStr === "" ? null : Number(goalStr),
    goalDirection: raw("goalDirection"),
    showGoalBar:   raw("showGoalBar") === "true",
    goalBarPos:    raw("goalBarPos") === "left" ? "left-ban" : raw("goalBarPos"), // "left" is legacy
    periodGrain:   raw("periodGrain"),
    deltaComparison: raw("deltaComparison"),
    showDelta:       raw("showDelta") === "true",
    showChart:       raw("showChart") === "true",
    showDots:      raw("showDots") === "true",
    showZeroLine:  raw("showZeroLine") === "true",
    zeroLineColor: raw("zeroLineColor"),
    captionPrefix: raw("captionPrefix"),
    title:         raw("title"),
    fontFamily:    raw("fontFamily"),
    valueSize:     raw("valueSize"),
    valueWeight:   raw("valueWeight"),
    bgColor:       raw("bgColor"),
    textColor:     raw("textColor"),
    upColor:       raw("upColor"),
    downColor:     raw("downColor"),
    primaryColor:  raw("primaryColor"),
    prevColor:     raw("prevColor"),
  };
}

/* ─── Data reading (official viz-extension idioms) ───────── */

/** Read which fields the user has placed on each encoding shelf. */
async function getEncodingFields(worksheet) {
  var spec = await worksheet.getVisualSpecificationAsync();
  var result = {};
  if (spec.activeMarksSpecificationIndex < 0) return result;
  var marks = spec.marksSpecifications[spec.activeMarksSpecificationIndex];
  if (!marks) return result;
  for (var i = 0; i < marks.encodings.length; i++) {
    var enc = marks.encodings[i];
    if (enc.field) result[enc.id] = enc.field;
  }
  return result;
}

/** Read all summary-data rows via the paged reader (no row cap). */
async function readDataTable(worksheet) {
  var reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  var columns = null, rows = [];
  try {
    for (var p = 0; p < reader.pageCount; p++) {
      var page = await reader.getPageAsync(p);
      if (!columns) columns = page.columns;
      rows = rows.concat(page.data);
    }
  } finally {
    await reader.releaseAsync();
  }
  return { columns: columns || [], data: rows };
}

/* ─── Data processing helpers ────────────────────────────── */

// Strip Tableau aggregation wrappers: SUM(Sales) → Sales, AGG(Profit Ratio) → Profit Ratio
function cleanFieldName(name) {
  if (!name) return name;
  var m = name.match(/^[A-Z]+\((.+)\)$/);
  return m ? m[1] : name;
}

function findColumn(columns, field) {
  if (!field) return null;
  for (var c = 0; c < columns.length; c++) {
    if (columns[c].fieldName === field.name) return columns[c];
  }
  return null;
}

function firstNumericColumn(columns) {
  for (var c = 0; c < columns.length; c++) {
    var t = columns[c].dataType;
    if (t === "float" || t === "int") return columns[c];
  }
  return null;
}

function dateTime(cell) {
  var nv = cell.nativeValue;
  if (nv instanceof Date) {
    // Tableau returns date columns as UTC-midnight Date objects.
    // Re-create from UTC components so the calendar date is preserved in any
    // local timezone — prevents Dec 1 00:00 UTC from landing in November in UTC-5.
    return new Date(nv.getUTCFullYear(), nv.getUTCMonth(), nv.getUTCDate()).getTime();
  }
  // Fallback: parse string, treating YYYY-MM-DD as a local date to avoid UTC shift
  var s = cell.value || "";
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return Date.parse(s);
}

function truncateToGrain(ms, grain) {
  var d = new Date(ms);
  switch (grain) {
    case "day":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case "week": {
      var w = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      w.setDate(w.getDate() - w.getDay());
      return w.getTime();
    }
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case "quarter":
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
    case "year":
      return new Date(d.getFullYear(), 0, 1).getTime();
    default:
      return ms; // auto
  }
}

function grainLabel(ms, grain, fallback) {
  var d = new Date(ms);
  switch (grain) {
    case "day":
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    case "week":
      return "Wk " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    case "quarter":
      return "Q" + (Math.floor(d.getMonth() / 3) + 1) + " '" + String(d.getFullYear()).slice(2);
    case "year":
      return String(d.getFullYear());
    default:
      return fallback || "";
  }
}

/**
 * Returns a (year, withinYearKey) pair so we can group by calendar year.
 * The withinYearKey is a stable string that identifies the same period
 * in different years (e.g., "03" for March, "Q2" for Q2).
 */
function getYearAndPeriodKey(ms, grain) {
  var d = new Date(ms);
  var year = d.getFullYear();
  var pk;
  switch (grain) {
    case "year":
      pk = "Y";
      break;
    case "quarter":
      pk = "Q" + (Math.floor(d.getMonth() / 3) + 1);
      break;
    case "week": {
      // ISO week number
      var tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      year = tmp.getUTCFullYear();
      var jan1 = new Date(Date.UTC(year, 0, 1));
      pk = "W" + String(Math.ceil(((tmp - jan1) / 864e5 + 1) / 7)).padStart(2, "0");
      break;
    }
    case "day":
      pk = String(d.getMonth()).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      break;
    default: // month or auto
      pk = String(d.getMonth()).padStart(2, "0");
  }
  return { year: year, pk: pk };
}

function aggregate(values, type) {
  if (!values.length) return type === "count" ? 0 : null;
  switch (type) {
    case "avg":   return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    case "min":   return Math.min.apply(null, values);
    case "max":   return Math.max.apply(null, values);
    case "count": return values.length;
    default:      return values.reduce(function (a, b) { return a + b; }, 0);
  }
}

/* ─── Formatting ─────────────────────────────────────────── */

function formatValue(value, cfg) {
  if (value === null || value === undefined || isNaN(value)) return "—";

  var fmt    = cfg.format || "custom";
  var v      = (fmt === "percent") ? value * 100 : value;
  var prefix = (fmt === "number" || fmt === "percent") ? "" : cfg.prefix;
  var suffix = (fmt === "percent") ? "%" : (fmt === "number" ? "" : cfg.suffix);
  var abbr   = cfg.abbreviate && fmt !== "percent";

  var sign = v < 0 ? "-" : "";
  var abs  = Math.abs(v);
  var body;
  if (abbr && abs >= 1000) {
    var tiers = [[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"K"]];
    for (var i = 0; i < tiers.length; i++) {
      if (abs >= tiers[i][0]) {
        body = (abs / tiers[i][0]).toFixed(cfg.decimals) + tiers[i][1];
        break;
      }
    }
  }
  if (!body) {
    body = abs.toLocaleString(undefined, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    });
  }
  return sign + prefix + body + suffix;
}

/* ─── YoY chart (SVG) ────────────────────────────────────── */

/**
 * Renders into `container`:
 *   current year  — straight line + dot per point + tooltip, no fill
 *   previous year — gradient area fill + dashed line, same primaryColor at lower opacity
 *   x-axis        — period labels for the current year
 */
function renderChart(container, currentVals, prevVals, labels, cfg) {
  var n = currentVals.length;
  if (n < 2) { container.innerHTML = ""; return; }

  var W = 400, H = 100;
  var PT = 8, PR = 6, PB = 4, PL = 6;
  var plotW = W - PL - PR;
  var plotH = H - PT - PB;

  // Shared Y scale so both series are directly comparable
  var allVals = currentVals.concat(
    (prevVals || []).filter(function (v) { return v !== null && !isNaN(v); })
  ).filter(function (v) { return v !== null && !isNaN(v); });
  var rawMax = allVals.length ? Math.max.apply(null, allVals) : 1;
  var rawMin = allVals.length ? Math.min.apply(null, allVals) : 0;
  var range  = Math.abs(rawMax - rawMin) || Math.abs(rawMax) || 1;
  var maxY   = rawMax + range * 0.1;
  var minY   = rawMin - range * 0.1;

  function toX(i) { return (PL + (i / (n - 1)) * plotW).toFixed(2); }
  function toY(v) { return (PT + plotH - ((v - minY) / (maxY - minY)) * plotH).toFixed(2); }

  // Area fill closes at the zero crossing; if data is all-positive → bottom, all-negative → top
  var clampedZero = Math.min(Math.max(0, minY), maxY);
  var baseY = toY(clampedZero);

  // Straight-line path; null values lift the pen (gap in series)
  function makeLinePath(vals) {
    var d = [], pen = false;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] === null || isNaN(vals[i])) { pen = false; continue; }
      d.push((pen ? "L" : "M") + " " + toX(i) + " " + toY(vals[i]));
      pen = true;
    }
    return d.join(" ");
  }

  // Closed area path for the previous-year fill
  function makeAreaPath(vals) {
    var line = makeLinePath(vals);
    if (!line) return "";
    var fi = 0;          while (fi < vals.length && (vals[fi] === null || isNaN(vals[fi]))) fi++;
    var li = vals.length - 1; while (li >= 0 && (vals[li] === null || isNaN(vals[li]))) li--;
    if (fi >= li) return "";
    return line + " L " + toX(li) + " " + baseY + " L " + toX(fi) + " " + baseY + " Z";
  }

  var color = cfg.primaryColor;

  // Gradient runs from the most extreme prev-year value (strong) toward the zero line (faded).
  // Using userSpaceOnUse so the gradient orients correctly regardless of whether data is
  // positive, negative, or mixed.
  var prevFiltered = (prevVals || []).filter(function (v) { return v !== null && !isNaN(v); });
  var gradY1 = baseY; // fallback: start at zero line
  if (prevFiltered.length > 0) {
    var extremePrev = prevFiltered.reduce(function (a, b) { return Math.abs(b) > Math.abs(a) ? b : a; });
    gradY1 = toY(extremePrev);
  }
  var gradY2 = baseY; // zero line (or clamped edge)

  var svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">',
    '<defs>',
    '  <linearGradient id="kg-prev" x1="0" y1="' + gradY1 + '" x2="0" y2="' + gradY2 + '" gradientUnits="userSpaceOnUse">',
    '    <stop offset="0%"   stop-color="' + color + '" stop-opacity="0.22"/>',
    '    <stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>',
    '  </linearGradient>',
    '</defs>',
  ];

  // ── Zero line (drawn first so data renders on top) ──
  if (cfg.showZeroLine && minY < 0 && maxY > 0) {
    var zy = toY(0);
    svg.push(
      '<line x1="' + PL + '" y1="' + zy + '" x2="' + (W - PR) + '" y2="' + zy + '"',
      '  stroke="' + cfg.zeroLineColor + '" stroke-width="0.75" stroke-opacity="0.45"',
      '  vector-effect="non-scaling-stroke"/>'
    );
  }

  // ── Previous year: gradient area + dashed line (same colour, lower opacity) ──
  if (prevVals && prevVals.filter(function (v) { return v !== null && !isNaN(v); }).length >= 2) {
    var prevArea = makeAreaPath(prevVals);
    var prevLine = makeLinePath(prevVals);
    if (prevArea) {
      svg.push('<path d="' + prevArea + '" fill="url(#kg-prev)" stroke="none"/>');
    }
    if (prevLine) {
      svg.push('<path d="' + prevLine + '" fill="none" stroke="' + color + '"',
               '  stroke-width="1.5" stroke-dasharray="3 2.5" stroke-opacity="0.38"',
               '  vector-effect="non-scaling-stroke"/>');
    }
  }

  // ── Current year: straight line only, no fill ──
  var curLine = makeLinePath(currentVals);
  if (curLine) {
    svg.push('<path d="' + curLine + '" fill="none" stroke="' + color + '"',
             '  stroke-width="3" stroke-linecap="round" stroke-linejoin="round"',
             '  vector-effect="non-scaling-stroke"/>');
  }

  // ── Dots — data attributes carry tooltip content ──
  if (cfg.showDots) {
    for (var i = 0; i < currentVals.length; i++) {
      if (currentVals[i] === null || isNaN(currentVals[i])) continue;
      var pv = (prevVals && prevVals[i] !== null && !isNaN(prevVals[i])) ? prevVals[i] : "";
      svg.push(
        '<circle cx="' + toX(i) + '" cy="' + toY(currentVals[i]) + '" r="3"',
        '  fill="' + color + '" vector-effect="non-scaling-stroke" class="kpi-dot"',
        '  data-label="' + (labels[i] || "").replace(/"/g, "&quot;") + '"',
        '  data-val="' + currentVals[i] + '"',
        '  data-prev="' + pv + '"/>'
      );
    }
  }

  svg.push("</svg>");
  container.innerHTML = svg.join("\n");

  // ── Tooltip wiring ──
  var tipEl = document.getElementById("kpi-tip");
  if (!tipEl) return;

  function placeTip(e) {
    var tw = tipEl.offsetWidth || 150;
    var th = tipEl.offsetHeight || 90;
    var x  = e.clientX + 16;
    var y  = e.clientY - 12;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 16;
    if (y + th > window.innerHeight - 8) y = e.clientY - th + 12;
    if (y < 4) y = 4;
    tipEl.style.left = x + "px";
    tipEl.style.top  = y + "px";
  }

  container.querySelectorAll(".kpi-dot").forEach(function (dot) {
    dot.addEventListener("mouseenter", function (e) {
      var lbl  = dot.getAttribute("data-label");
      var cur  = parseFloat(dot.getAttribute("data-val"));
      var prev = dot.getAttribute("data-prev");
      var hasPrev = prev !== "" && !isNaN(parseFloat(prev));
      var prevNum = hasPrev ? parseFloat(prev) : null;

      var html = '<div class="kti-lbl">' + lbl + '</div>';
      html    += '<div class="kti-cur">' + formatValue(cur, cfg) + '</div>';
      if (prevNum !== null) {
        var pct  = (cur - prevNum) / Math.abs(prevNum) * 100;
        var up   = pct >= 0;
        var cls  = up ? "pos" : "neg";
        var arrow = up ? "▲" : "▼";
        html += '<div class="kti-prev">' +
                  '<span>Prior yr</span><span>' + formatValue(prevNum, cfg) + '</span>' +
                '</div>';
        html += '<div class="kti-delta ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(1) + '%</div>';
      }
      tipEl.innerHTML = html;
      tipEl.style.display = "block";
      placeTip(e);
    });
    dot.addEventListener("mousemove", placeTip);
    dot.addEventListener("mouseleave", function () { tipEl.style.display = "none"; });
  });
}

/* ─── Card rendering ─────────────────────────────────────── */

function statusClass(value, cfg) {
  if (value == null || cfg.goal == null || isNaN(cfg.goal)) return "neutral";
  return (cfg.goalDirection === "higher" ? value >= cfg.goal : value <= cfg.goal) ? "good" : "bad";
}

function renderMessage(cfg, text) {
  root.innerHTML =
    '<div class="kpi-card" style="background:' + cfg.bgColor + ';color:' + cfg.textColor + '">' +
      '<div class="kpi-status-bar bar-top neutral"></div>' +
      '<div class="kpi-content"><div class="kpi-message"></div></div>' +
    '</div>' +
    '<button id="gear" title="Configure" aria-label="Configure">&#9881;</button>' +
    '<div id="version">v' + VERSION + '</div>';
  root.querySelector(".kpi-message").textContent = text;
  root.querySelector(".kpi-card").style.fontFamily = FONT_FAMILIES[cfg.fontFamily] || FONT_FAMILIES.system;
  wireGear();
}

function renderCard(cfg, label, value, caption, delta, chartCurrentVals, chartPrevVals, chartLabels) {
  var hasDelta = cfg.showDelta && delta !== null && delta !== undefined;
  var hasChart = cfg.showChart && chartCurrentVals && chartCurrentVals.length >= 2;
  var status   = statusClass(value, cfg);

  var restHtml =
    (hasDelta ? '<p class="kpi-delta"></p>' : '') +
    (caption  ? '<p class="kpi-caption"></p>' : '') +
    (hasChart ? '<div class="kpi-chart"></div>' : '');

  // text-only rest (no chart) — used in left-full so chart sits outside the bar wrapper
  var textRest =
    (hasDelta ? '<p class="kpi-delta"></p>' : '') +
    (caption  ? '<p class="kpi-caption"></p>' : '');

  var barEl  = '<div class="kpi-status-bar bar-left ' + status + '"></div>';
  var topBar = '';
  var inner;

  if (!cfg.showGoalBar || cfg.goalBarPos === "top") {
    if (cfg.showGoalBar) topBar = '<div class="kpi-status-bar bar-top ' + status + '"></div>';
    inner = '<p class="kpi-label"></p><p class="kpi-value"></p>' + restHtml;
  } else if (cfg.goalBarPos === "left-ban") {
    inner =
      '<p class="kpi-label"></p>' +
      '<div class="kpi-value-wrap">' + barEl + '<p class="kpi-value"></p></div>' +
      restHtml;
  } else {
    // left-full: bar beside text only; chart is a sibling below so bar doesn't run beside it
    inner =
      '<p class="kpi-label"></p>' +
      '<div class="kpi-content-body">' +
        barEl +
        '<div class="kpi-content-right"><p class="kpi-value"></p>' + textRest + '</div>' +
      '</div>' +
      (hasChart ? '<div class="kpi-chart"></div>' : '');
  }

  root.innerHTML =
    '<div class="kpi-card" style="background:' + cfg.bgColor + ';color:' + cfg.textColor + '">' +
      topBar +
      '<div class="kpi-content">' + inner + '</div>' +
    '</div>' +
    '<button id="gear" title="Configure" aria-label="Configure">&#9881;</button>' +
    '<div id="version">v' + VERSION + '</div>' +
    '<div id="kpi-tip" class="kpi-tooltip"></div>';

  var card = root.querySelector(".kpi-card");
  card.style.background  = cfg.bgColor;
  card.style.fontFamily  = FONT_FAMILIES[cfg.fontFamily] || FONT_FAMILIES.system;

  root.querySelector(".kpi-label").textContent = cfg.title || label;

  var valEl = root.querySelector(".kpi-value");
  valEl.textContent      = formatValue(value, cfg);
  valEl.style.fontSize   = VALUE_SIZES[cfg.valueSize] || VALUE_SIZES.large;
  valEl.style.fontWeight = cfg.valueWeight || "800";

  if (hasDelta) {
    var el = root.querySelector(".kpi-delta");
    el.textContent = (delta.up ? "▲" : "▼") + " " + Math.abs(delta.pct).toFixed(1) + "%" +
                     (delta.prevLabel ? "  vs " + delta.prevLabel : "");
    el.className = "kpi-delta " + (delta.up ? "positive" : "negative");
  }

  if (caption) {
    root.querySelector(".kpi-caption").textContent = caption;
  }

  if (hasChart) {
    renderChart(root.querySelector(".kpi-chart"), chartCurrentVals, chartPrevVals, chartLabels, cfg);
  }

  wireGear();
}

function wireGear() {
  var g = document.getElementById("gear");
  if (g) g.onclick = openConfigDialog;
}

/* ─── Main update ────────────────────────────────────────── */

async function updateKpi() {
  var cfg       = getConfig();
  var worksheet = tableau.extensions.worksheetContent.worksheet;

  // 1. Which fields are on the Marks card?
  var encFields    = await getEncodingFields(worksheet);
  var measureField = encFields[MEASURE_ENCODING_ID];

  if (!measureField) {
    renderMessage(cfg, "Drag a measure onto the Measure tile.");
    return;
  }
  var dateField = encFields[DATE_ENCODING_ID];

  // 2. Read data (paged, respects filters + calculated fields)
  var dt      = await readDataTable(worksheet);
  var columns = dt.columns;
  var rows    = dt.data;

  var measureCol = findColumn(columns, measureField) || firstNumericColumn(columns);
  if (!measureCol) { renderMessage(cfg, "Could not find the measure column."); return; }
  var dateCol   = findColumn(columns, dateField);
  var mIdx      = measureCol.index;
  var denomField = encFields[DENOMINATOR_ENCODING_ID];
  var denomCol   = denomField ? findColumn(columns, denomField) : null;
  var dIdx2      = denomCol ? denomCol.index : null;

  // ── No date: simple aggregation, no chart ──────────────────
  if (!dateCol) {
    var vals = [];
    for (var r = 0; r < rows.length; r++) {
      var v = rows[r][mIdx].nativeValue;
      if (typeof v === "number" && !isNaN(v)) vals.push(v);
    }
    renderCard(cfg, cleanFieldName(measureField.name), aggregate(vals, cfg.aggregation), null, null, null, null, null);
    return;
  }

  // ── With date: bucket by grain ─────────────────────────────
  var dIdx  = dateCol.index;
  var grain = cfg.periodGrain;

  // First pass: collect all raw values per time bucket.
  var buckets = {};
  for (var i = 0; i < rows.length; i++) {
    var ts = dateTime(rows[i][dIdx]);
    if (isNaN(ts)) continue;
    var key = truncateToGrain(ts, grain);
    var mv  = rows[i][mIdx].nativeValue;
    var yp  = getYearAndPeriodKey(ts, grain);
    if (!buckets[key]) {
      buckets[key] = { vals: [], denomVals: [], label: grainLabel(key, grain, rows[i][dIdx].formattedValue), year: yp.year, pk: yp.pk };
    }
    if (typeof mv === "number" && !isNaN(mv)) buckets[key].vals.push(mv);
    if (dIdx2 !== null) {
      var dv = rows[i][dIdx2].nativeValue;
      if (typeof dv === "number" && !isNaN(dv)) buckets[key].denomVals.push(dv);
    }
  }

  // Second pass: collapse each bucket.
  // Ratio mode (denominator encoding set): SUM(numerator) / SUM(denominator) per period.
  //   This gives the mathematically correct result for measures like Profit Ratio
  //   when Tableau passes row-level data (one row per order).
  // Standard mode: sum / avg / min / max / count on the measure values.
  //   avg and latest both average within the bucket — a reasonable approximation for
  //   ratio fields when only one measure encoding is used.
  var sums = {};
  Object.keys(buckets).forEach(function (k) {
    var b   = buckets[k];
    var agg = cfg.aggregation;
    var v;
    if (!b.vals.length) {
      v = 0;
    } else if (dIdx2 !== null) {
      // Ratio mode (denominator encoding set): SUM(numerator) / SUM(denominator) per period.
      var numSum   = b.vals.reduce(function (a, x) { return a + x; }, 0);
      var denomSum = b.denomVals.reduce(function (a, x) { return a + x; }, 0);
      v = denomSum !== 0 ? numSum / denomSum : null;
    } else if (agg === "min") {
      v = Math.min.apply(null, b.vals);
    } else if (agg === "max") {
      v = Math.max.apply(null, b.vals);
    } else if (agg === "count") {
      v = b.vals.length;
    } else {
      // sum / avg / latest: always SUM within each period bucket.
      // This gives the period total (e.g. $85K December Sales) which is then
      // used by the cross-bucket aggregation setting to produce the BAN value.
      v = b.vals.reduce(function (a, x) { return a + x; }, 0);
    }
    sums[k] = { value: v, label: b.label, year: b.year, pk: b.pk };
  });

  var allKeys = Object.keys(sums).map(Number).sort(function (a, b) { return a - b; });
  if (!allKeys.length) {
    renderCard(cfg, cleanFieldName(measureField.name), null, null, null, null, null, null);
    return;
  }

  // ── Build year-over-year structure ─────────────────────────
  // yearMap[year][pk] = { value, label }
  var yearMap = {};
  allKeys.forEach(function (k) {
    var s = sums[k];
    if (!yearMap[s.year]) yearMap[s.year] = {};
    yearMap[s.year][s.pk] = { value: s.value, label: s.label };
  });

  var years      = Object.keys(yearMap).map(Number).sort(function (a, b) { return a - b; });
  var currentYr  = years[years.length - 1];
  var prevYr     = currentYr - 1;
  var curYrData  = yearMap[currentYr] || {};
  var prevYrData = yearMap[prevYr]    || {};

  // Sorted period keys for the current year — drive BAN value and delta calculation
  var periodKeys = Object.keys(curYrData).sort();

  // ── YoY chart series ───────────────────────────────────────
  // The chart x-axis is the UNION of current and prior year period keys.
  // This lets the prior year area extend through periods the current year hasn't
  // reached yet (e.g. December when the current year is filtered to November),
  // giving full seasonal context without cutting off the prior year prematurely.
  var chartPkSet = {};
  periodKeys.forEach(function (pk) { chartPkSet[pk] = true; });
  Object.keys(prevYrData).forEach(function (pk) { chartPkSet[pk] = true; });
  var chartPeriodKeys = Object.keys(chartPkSet).sort();

  var chartCurrentVals = chartPeriodKeys.map(function (pk) {
    return curYrData[pk] ? curYrData[pk].value : null;
  });
  var chartPrevVals = chartPeriodKeys.map(function (pk) {
    return prevYrData[pk] ? prevYrData[pk].value : null;
  });
  var chartLabels = chartPeriodKeys.map(function (pk) {
    var entry = curYrData[pk] || prevYrData[pk];
    return entry ? entry.label : "";
  });

  // Only show prev-year area if we have meaningful coverage (≥ 40 % of chart periods)
  var prevCoverage = chartPrevVals.filter(function (v) { return v !== null; }).length;
  if (prevCoverage < chartPeriodKeys.length * 0.4) chartPrevVals = null;

  // ── BAN value + delta ─────────────────────────────────────
  var banValue, banCaption, delta;

  if (cfg.aggregation === "latest") {
    var latestPk = periodKeys[periodKeys.length - 1];
    banValue     = curYrData[latestPk].value;
    banCaption   = cfg.captionPrefix + curYrData[latestPk].label;
    delta        = null;

    if (cfg.deltaComparison === "pop") {
      // Period-over-period: the bucket immediately before this one in the full sorted timeline
      var latestKey = allKeys[allKeys.length - 1];
      var prevKey   = allKeys[allKeys.length - 2];
      if (prevKey !== undefined) {
        var prevEntry = sums[prevKey];
        if (prevEntry && prevEntry.value !== 0) {
          var popPct = (banValue - prevEntry.value) / Math.abs(prevEntry.value) * 100;
          delta = { pct: popPct, up: popPct >= 0, prevLabel: prevEntry.label };
        }
      }
    } else {
      // Year-over-year: same period key in the previous year
      var prevBanEntry = prevYrData[latestPk];
      if (prevBanEntry && prevBanEntry.value !== 0) {
        var yoyPct2 = (banValue - prevBanEntry.value) / Math.abs(prevBanEntry.value) * 100;
        delta = { pct: yoyPct2, up: yoyPct2 >= 0, prevLabel: prevBanEntry.label };
      }
    }
  } else {
    // Aggregate across the whole current year; compare to the whole previous year
    var curYearVals  = periodKeys.map(function (pk) { return curYrData[pk].value; });
    var prevYearKeys = Object.keys(prevYrData);
    var prevYearVals = prevYearKeys.map(function (pk) { return prevYrData[pk].value; });

    banValue   = aggregate(curYearVals, cfg.aggregation);
    banCaption = null;
    delta      = null;

    if (prevYearVals.length) {
      var prevBanVal = aggregate(prevYearVals, cfg.aggregation);
      if (prevBanVal && prevBanVal !== 0) {
        var aggPct = (banValue - prevBanVal) / Math.abs(prevBanVal) * 100;
        delta = { pct: aggPct, up: aggPct >= 0, prevLabel: String(prevYr) };
      }
    }
  }

  renderCard(cfg, cleanFieldName(measureField.name), banValue, banCaption, delta,
             chartCurrentVals, chartPrevVals, chartLabels);
}

/* ─── Config dialog ──────────────────────────────────────── */

function openConfigDialog() {
  var url = window.location.origin + window.location.pathname + "?dialog=1";
  tableau.extensions.ui
    .displayDialogAsync(url, "", { width: 488, height: 740, dialogStyle: tableau.DialogStyle.Modal })
    .then(function ()  { updateKpi(); })
    .catch(function (err) {
      if (!err || err.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
        console.error("Config dialog error:", err);
      }
    });
}

function ea(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function byId(id) { return document.getElementById(id); }
function cfgRow(label, inputHtml) {
  return '<div class="row"><label>' + label + '</label>' + inputHtml + '</div>';
}
function cfgSel(id, opts, cur) {
  return '<select id="' + id + '">' + opts.map(function (o) {
    return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + '>' + o[1] + '</option>';
  }).join("") + '</select>';
}
function cfgTxt(id, key) {
  return '<input type="text" id="' + id + '" value="' + ea(raw(key)) + '">';
}
function cfgChk(id, key) {
  return '<input type="checkbox" id="' + id + '"' + (raw(key) === "true" ? " checked" : "") + '>';
}
// Three-level cascading colour picker: trigger swatch → families → swatches (right-expanding)
function cfgClrRow(label, id, key) {
  var cur = ea(raw(key));
  var families = PALETTES.map(function (p) {
    var swatches = p.colors.map(function (c) {
      return '<button type="button" class="pal-swatch" style="background:' + c + '"' +
             ' data-color="' + c + '" title="' + c + '"></button>';
    }).join('');
    return '<div class="pal-family-item">' +
      p.name + '<span class="pal-fi-arr">▶</span>' +
      '<div class="pal-colors-panel">' + swatches + '</div>' +
    '</div>';
  }).join('');

  return '<div class="clr-row">' +
    '<label>' + label + '</label>' +
    '<div class="pal-picker">' +
      '<button type="button" class="pal-trigger-btn" style="background:' + cur + '"></button>' +
      '<div class="pal-families-panel">' +
        families +
        '<div class="pal-divider"></div>' +
        '<div class="pal-custom-item">Custom</div>' +
      '</div>' +
      '<input type="color" id="' + id + '" value="' + cur + '" class="pal-hidden-input">' +
    '</div>' +
  '</div>';
}

function buildDialog() {
  root.innerHTML =
    '<div class="cfg">' +
      '<h2>KPI Card settings</h2>' +
      '<p class="sub">Changes apply when you click Save.</p>' +

      '<fieldset><legend>Value</legend>' +
        cfgRow("Aggregation", cfgSel("d-agg", [
          ["latest","Latest period (YoY delta)"],
          ["sum","Sum (full year vs prior year)"],
          ["avg","Average"], ["min","Minimum"], ["max","Maximum"], ["count","Count"],
        ], raw("aggregation"))) +
        cfgRow("Format", cfgSel("d-fmt", [
          ["number",   "Number  (1,234)"],
          ["currency", "Currency  ($1,234)"],
          ["percent",  "Percentage  (× 100, %)"],
          ["custom",   "Custom (use prefix / suffix)"],
        ], raw("format"))) +
        '<div id="d-prefsuf-rows">' +
          cfgRow("Prefix",  cfgTxt("d-prefix", "prefix")) +
          cfgRow("Suffix",  cfgTxt("d-suffix", "suffix")) +
        '</div>' +
        cfgRow("Decimal places",  '<input type="number" id="d-dec" min="0" max="4" value="' + (parseInt(raw("decimals"), 10) || 0) + '">') +
        cfgRow("Abbreviate (48.2K vs 48,200)", cfgChk("d-abbr", "abbreviate")) +
      '</fieldset>' +

      '<fieldset><legend>Goal</legend>' +
        cfgRow('Goal value <span class="hint">(blank = none)</span>',
          '<input type="number" id="d-goal" value="' + ea(raw("goal")) + '">') +
        cfgRow("Higher is better", cfgSel("d-goaldir", [
          ["higher","Yes — green when ≥ goal"],
          ["lower", "No — green when ≤ goal"],
        ], raw("goalDirection"))) +
        cfgRow("Show status bar",  cfgChk("d-goalbar", "showGoalBar")) +
        cfgRow("Bar position", cfgSel("d-goalpos", [
          ["top",       "Top — horizontal pill above title"],
          ["left-ban",  "Left — beside value only"],
          ["left-full", "Left — full content height"],
        ], raw("goalBarPos") === "left" ? "left-ban" : raw("goalBarPos"))) +
      '</fieldset>' +

      '<fieldset><legend>Chart &amp; Periods</legend>' +
        cfgRow("Period grain", cfgSel("d-grain", [
          ["auto","Auto (date's own grain)"],
          ["day","Day"], ["week","Week"],
          ["month","Month"], ["quarter","Quarter"], ["year","Year"],
        ], raw("periodGrain"))) +
        cfgRow("Compare period change to", cfgSel("d-deltacmp", [
          ["yoy", "Same period, prior year (YoY)"],
          ["pop", "Previous period (PoP)"],
        ], raw("deltaComparison"))) +
        cfgRow("Show YoY trend chart",          cfgChk("d-chart",    "showChart")) +
        cfgRow("Show period change (▲/▼ %)",   cfgChk("d-delta",    "showDelta")) +
        cfgRow("Show data point dots",          cfgChk("d-dots",     "showDots")) +
        cfgRow("Show zero line",                cfgChk("d-zeroline", "showZeroLine")) +
      '</fieldset>' +

      '<fieldset><legend>Labels</legend>' +
        cfgRow("Title (blank = field name)",    cfgTxt("d-title", "title")) +
        cfgRow("Period caption prefix",         cfgTxt("d-cap",   "captionPrefix")) +
      '</fieldset>' +

      '<fieldset><legend>Typography</legend>' +
        cfgRow("Font family", cfgSel("d-font", [
          ["system",     "System default (sans-serif)"],
          ["inter",      "Inter"],
          ["lato",       "Lato"],
          ["montserrat", "Montserrat"],
          ["dmsans",     "DM Sans"],
          ["georgia",    "Georgia (serif)"],
          ["playfair",   "Playfair Display (serif)"],
          ["mono",       "Monospace"],
        ], raw("fontFamily"))) +
        cfgRow("Value size", cfgSel("d-vsize", [
          ["small",  "Small"],
          ["medium", "Medium"],
          ["large",  "Large (default)"],
          ["xlarge", "X-Large"],
        ], raw("valueSize"))) +
        cfgRow("Value weight", cfgSel("d-vw", [
          ["400", "Regular"],
          ["600", "Semibold"],
          ["700", "Bold"],
          ["800", "Black (default)"],
          ["900", "Ultra black"],
        ], raw("valueWeight"))) +
      '</fieldset>' +

      '<fieldset><legend>Colors</legend>' +
        cfgClrRow("Card background",   "d-bg",       "bgColor") +
        cfgClrRow("Text",              "d-text",     "textColor") +
        cfgClrRow("Positive change",   "d-up",       "upColor") +
        cfgClrRow("Negative change",   "d-dn",       "downColor") +
        cfgClrRow("Line &amp; area",   "d-primary",  "primaryColor") +
        cfgClrRow("Zero line",         "d-zeroclr",  "zeroLineColor") +
      '</fieldset>' +

      '<div class="actions">' +
        '<button class="ghost" id="d-reset">Reset</button>' +
        '<span class="spacer"></span>' +
        '<button class="ghost" id="d-cancel">Cancel</button>' +
        '<button class="ghost" id="d-apply">Apply</button>' +
        '<button class="primary" id="d-save">Save</button>' +
      '</div>' +
    '</div>';

  byId("d-save").onclick   = saveDialog;
  byId("d-apply").onclick  = applyDialog;
  byId("d-cancel").onclick = function () { tableau.extensions.ui.closeDialog(""); };
  byId("d-reset").onclick  = resetDialog;

  // Show/hide Prefix & Suffix rows based on format selection
  function syncFmtRows() {
    var show = byId("d-fmt").value === "currency" || byId("d-fmt").value === "custom";
    byId("d-prefsuf-rows").style.display = show ? "" : "none";
  }
  byId("d-fmt").addEventListener("change", syncFmtRows);
  syncFmtRows();

  // Level 0: trigger swatch toggles the families panel
  root.querySelectorAll(".pal-trigger-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var picker = this.closest(".pal-picker");
      var wasOpen = picker.classList.contains("open");
      root.querySelectorAll(".pal-picker").forEach(function (p) { p.classList.remove("open", "flip-up"); });
      if (!wasOpen) {
        picker.classList.add("open");
        // Flip panel upward when too close to the bottom of the viewport
        var spaceBelow = window.innerHeight - picker.getBoundingClientRect().bottom;
        if (spaceBelow < 200) picker.classList.add("flip-up");
      }
    });
  });

  // Close all open pickers when clicking anywhere else
  root.addEventListener("click", function () {
    root.querySelectorAll(".pal-picker").forEach(function (p) { p.classList.remove("open", "flip-up"); });
  });

  // Level 2: clicking a swatch sets the colour, updates the trigger, closes the panel
  root.querySelectorAll(".pal-swatch").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var color = this.getAttribute("data-color");
      var picker = this.closest(".pal-picker");
      picker.querySelector(".pal-hidden-input").value = color;
      picker.querySelector(".pal-trigger-btn").style.background = color;
      picker.classList.remove("open");
    });
  });

  // Custom option: open native colour picker
  root.querySelectorAll(".pal-custom-item").forEach(function (item) {
    item.addEventListener("click", function (e) {
      e.stopPropagation();
      var picker = this.closest(".pal-picker");
      picker.classList.remove("open");
      picker.querySelector(".pal-hidden-input").click();
    });
  });

  // Native picker change: keep trigger swatch in sync
  root.querySelectorAll(".pal-hidden-input").forEach(function (inp) {
    inp.addEventListener("input", function () {
      this.closest(".pal-picker").querySelector(".pal-trigger-btn").style.background = this.value;
    });
  });
}

function resetDialog() {
  byId("d-agg").value      = DEFAULTS.aggregation;
  byId("d-fmt").value      = DEFAULTS.format;
  byId("d-fmt").dispatchEvent(new Event("change"));
  byId("d-prefix").value   = DEFAULTS.prefix;
  byId("d-suffix").value   = DEFAULTS.suffix;
  byId("d-dec").value      = DEFAULTS.decimals;
  byId("d-abbr").checked   = DEFAULTS.abbreviate === "true";
  byId("d-goal").value      = DEFAULTS.goal;
  byId("d-goaldir").value   = DEFAULTS.goalDirection;
  byId("d-goalbar").checked = DEFAULTS.showGoalBar === "true";
  byId("d-goalpos").value   = DEFAULTS.goalBarPos;
  byId("d-grain").value      = DEFAULTS.periodGrain;
  byId("d-deltacmp").value   = DEFAULTS.deltaComparison;
  byId("d-chart").checked    = DEFAULTS.showChart === "true";
  byId("d-delta").checked  = DEFAULTS.showDelta === "true";
  byId("d-dots").checked     = DEFAULTS.showDots     === "true";
  byId("d-zeroline").checked = DEFAULTS.showZeroLine === "true";
  byId("d-title").value    = DEFAULTS.title;
  byId("d-cap").value      = DEFAULTS.captionPrefix;
  byId("d-bg").value       = DEFAULTS.bgColor;
  byId("d-text").value     = DEFAULTS.textColor;
  byId("d-up").value       = DEFAULTS.upColor;
  byId("d-dn").value       = DEFAULTS.downColor;
  byId("d-font").value     = DEFAULTS.fontFamily;
  byId("d-vsize").value    = DEFAULTS.valueSize;
  byId("d-vw").value       = DEFAULTS.valueWeight;
  byId("d-primary").value  = DEFAULTS.primaryColor;
  // Sync colour trigger swatches to their hidden inputs
  root.querySelectorAll(".pal-picker").forEach(function (picker) {
    var inp = picker.querySelector(".pal-hidden-input");
    var btn = picker.querySelector(".pal-trigger-btn");
    if (inp && btn) btn.style.background = inp.value;
  });
}

function collectSettings() {
  var s = tableau.extensions.settings;
  s.set("aggregation",   byId("d-agg").value);
  s.set("format",        byId("d-fmt").value);
  s.set("prefix",        byId("d-prefix").value);
  s.set("suffix",        byId("d-suffix").value);
  s.set("decimals",      String(Math.max(0, parseInt(byId("d-dec").value, 10) || 0)));
  s.set("abbreviate",    byId("d-abbr").checked  ? "true" : "false");
  s.set("goal",          byId("d-goal").value.trim());
  s.set("goalDirection", byId("d-goaldir").value);
  s.set("showGoalBar",   byId("d-goalbar").checked ? "true" : "false");
  s.set("goalBarPos",    byId("d-goalpos").value);
  s.set("periodGrain",      byId("d-grain").value);
  s.set("deltaComparison",  byId("d-deltacmp").value);
  s.set("showChart",        byId("d-chart").checked  ? "true" : "false");
  s.set("showDelta",     byId("d-delta").checked  ? "true" : "false");
  s.set("showDots",      byId("d-dots").checked     ? "true" : "false");
  s.set("showZeroLine",  byId("d-zeroline").checked ? "true" : "false");
  s.set("zeroLineColor", byId("d-zeroclr").value);
  s.set("title",         byId("d-title").value);
  s.set("captionPrefix", byId("d-cap").value);
  s.set("bgColor",       byId("d-bg").value);
  s.set("textColor",     byId("d-text").value);
  s.set("upColor",       byId("d-up").value);
  s.set("downColor",     byId("d-dn").value);
  s.set("fontFamily",    byId("d-font").value);
  s.set("valueSize",     byId("d-vsize").value);
  s.set("valueWeight",   byId("d-vw").value);
  s.set("primaryColor",  byId("d-primary").value);
}

function applyDialog() {
  collectSettings();
  var btn = byId("d-apply");
  tableau.extensions.settings.saveAsync().then(function () {
    if (btn) {
      var orig = btn.textContent;
      btn.textContent = "Applied ✓";
      setTimeout(function () { btn.textContent = orig; }, 1400);
    }
  });
}

function saveDialog() {
  collectSettings();
  tableau.extensions.settings.saveAsync().then(function () {
    tableau.extensions.ui.closeDialog("saved");
  });
}

/* ─── Viz mode init ──────────────────────────────────────── */

function showError(err) {
  console.error("KPI Card error:", err);
  renderMessage(getConfig(), "Error: " + (err && err.message || String(err)));
}

function initViz() {
  var ws = tableau.extensions.worksheetContent.worksheet;
  ws.addEventListener(tableau.TableauEventType.SummaryDataChanged, function () {
    updateKpi().catch(showError);
  });
  tableau.extensions.settings.addEventListener(tableau.TableauEventType.SettingsChanged, function () {
    updateKpi().catch(showError);
  });
  return updateKpi();
}

/* ─── Boot ───────────────────────────────────────────────── */

if (typeof tableau === "undefined" || !tableau.extensions) {
  root.innerHTML = '<div style="padding:20px;color:#ef4444;">Tableau Extensions API failed to load.</div>';
  throw new Error("tableau.extensions unavailable");
}

var isDialog = new URLSearchParams(window.location.search).get("dialog") === "1";

if (isDialog) {
  tableau.extensions.initializeDialogAsync()
    .then(function () { buildDialog(); })
    .catch(function (err) {
      root.innerHTML = '<div style="padding:20px;color:#ef4444;">Could not open settings: ' + err + '</div>';
    });
} else {
  root.innerHTML =
    '<div class="kpi-card" style="background:' + DEFAULTS.bgColor + ';color:' + DEFAULTS.textColor + '">' +
      '<div class="kpi-status-bar neutral"></div>' +
      '<div class="kpi-content"><div class="kpi-message">Loading…</div></div>' +
    '</div>';

  tableau.extensions.initializeAsync({ configure: openConfigDialog })
    .then(initViz)
    .catch(showError);
}
