/**
 * Tableau Extensions API stub for local dev (HTTP preview).
 *
 * Implements the same method signatures as the real API so main.js
 * runs identically in dev (browser) and in Tableau Desktop (HTTPS).
 *
 * Key shapes matched:
 *   getVisualSpecificationAsync  → marksSpecifications[n].encodings[].field.name
 *   getSummaryDataReaderAsync    → paged reader with pageCount + getPageAsync
 *   initializeDialogAsync        → for the ?dialog=1 settings page
 *   settings.addEventListener    → fires SettingsChanged after saveAsync
 */
(function () {
  "use strict";

  // ── Sample data: 24 months of Sales (2023-2024) ──────────────
  function seededRng(seed) {
    return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  }
  var rand = seededRng(42);

  var rawRows = [];
  for (var yr = 2023; yr <= 2024; yr++) {
    for (var mo = 1; mo <= 12; mo++) {
      var trend    = yr === 2024 ? 1.12 : 1.0;
      var seasonal = 1 + 0.25 * Math.sin((mo - 3) * Math.PI / 6);
      var noise    = 0.85 + rand() * 0.30;
      var sales    = Math.round(95000 * trend * seasonal * noise);
      var margin   = 0.08 + rand() * 0.10;   // 8-18% profit margin per period
      rawRows.push({
        date:   new Date(yr, mo - 1, 1),
        profit: Math.round(sales * margin),
        sales:  sales,
      });
    }
  }

  var COLUMNS = [
    { index: 0, fieldName: "Order Date", dataType: "date"  },
    { index: 1, fieldName: "Sales",      dataType: "float" },
    { index: 2, fieldName: "Profit",     dataType: "float" },
  ];

  function makeRows() {
    return rawRows.map(function (r) {
      return [
        { nativeValue: r.date,   value: r.date.toISOString().slice(0, 10), formattedValue: r.date.toLocaleDateString() },
        { nativeValue: r.sales,  value: String(r.sales),                    formattedValue: r.sales.toLocaleString()    },
        { nativeValue: r.profit, value: String(r.profit),                   formattedValue: r.profit.toLocaleString()   },
      ];
    });
  }

  // ── Paged reader ─────────────────────────────────────────────
  function makePagesReader() {
    var PAGE_SIZE = 500;
    var all = makeRows();
    var pages = [];
    for (var i = 0; i < all.length; i += PAGE_SIZE) {
      pages.push(all.slice(i, i + PAGE_SIZE));
    }
    if (pages.length === 0) pages.push([]);
    return {
      pageCount: pages.length,
      getPageAsync: function (p) {
        return Promise.resolve({ columns: COLUMNS, data: pages[p] || [] });
      },
      releaseAsync: function () { return Promise.resolve(); },
    };
  }

  // ── Settings store ───────────────────────────────────────────
  var _s  = {};  // settings store (public so cross-window Apply can copy values)
  var _ls = [];  // listeners (public for same reason)

  var _settingsObj = {
    get:  function (k) { return _s[k]; },
    set:  function (k, v) { _s[k] = v; },
    getAll: function () { return Object.assign({}, _s); },
    saveAsync: function () {
      console.log("[Dev] Settings saved:", _s);
      // Fire this window's SettingsChanged listeners
      _ls.forEach(function (fn) { fn(); });
      // If we're in a dialog popup, also sync to the main (opener) window
      if (window.opener && window.opener !== window) {
        try {
          var openerSettings = window.opener.tableau.extensions.settings;
          Object.keys(_s).forEach(function (k) { openerSettings._s[k] = _s[k]; });
          openerSettings._ls.forEach(function (fn) { fn(); });
        } catch (e) { console.warn("[Dev] Cross-window sync failed:", e); }
      }
      return Promise.resolve();
    },
    addEventListener: function (eventType, handler) {
      if (eventType === "settingsChanged") _ls.push(handler);
    },
    // expose internals so the opener-sync above can reach them
    _s:  _s,
    _ls: _ls,
  };

  // ── tableau global ───────────────────────────────────────────
  window.tableau = {
    extensions: {
      initializeAsync: function (opts) {
        console.log("[Dev] initializeAsync");
        return Promise.resolve();
      },

      initializeDialogAsync: function () {
        console.log("[Dev] initializeDialogAsync (dialog mode)");
        return Promise.resolve();
      },

      worksheetContent: {
        worksheet: {
          name: "KPI Dev",

          /** Returns the shape that getEncodingFields() expects.
           *  Switch USE_RATIO to true to test the Profit/Sales ratio encoding. */
          getVisualSpecificationAsync: function () {
            var USE_RATIO = false; // set true to test denominator mode
            var encodings = USE_RATIO
              ? [
                  { id: "measure",     field: { name: "Profit" }     },
                  { id: "date",        field: { name: "Order Date" } },
                  { id: "denominator", field: { name: "Sales" }      },
                ]
              : [
                  { id: "measure", field: { name: "Sales" }      },
                  { id: "date",    field: { name: "Order Date" } },
                ];
            return Promise.resolve({
              activeMarksSpecificationIndex: 0,
              marksSpecifications: [{ encodings: encodings }],
            });
          },

          /** Returns a paged reader matching getSummaryDataReaderAsync. */
          getSummaryDataReaderAsync: function (_n, _opts) {
            return Promise.resolve(makePagesReader());
          },

          addEventListener: function (eventType, handler) {
            console.log("[Dev] worksheet.addEventListener:", eventType, "(no-op)");
          },
        },
      },

      settings: _settingsObj,

      ui: {
        /** In dev, open the dialog URL in a small popup window. */
        displayDialogAsync: function (url, payload, opts) {
          var w = (opts && opts.width)  || 488;
          var h = (opts && opts.height) || 680;
          var popup = window.open(url, "kpi-settings", "width=" + w + ",height=" + h);
          // Return a promise that never resolves (popup closes itself).
          return new Promise(function () {});
        },
        closeDialog: function (payload) {
          console.log("[Dev] closeDialog:", payload);
          window.close();
        },
      },
    },

    TableauEventType: {
      SummaryDataChanged: "summaryDataChanged",
      FilterChanged:      "filterChanged",
      SettingsChanged:    "settingsChanged",
    },

    DialogStyle: { Modal: "modal" },
    ErrorCodes:  { DialogClosedByUser: "DialogClosedByUser" },
  };
})();
