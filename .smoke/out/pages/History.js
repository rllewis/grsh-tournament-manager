"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = History;
var _react = require("react");
var _historyShared = require("./historyShared.js");
var _HistoryWidgets = require("./HistoryWidgets.js");
var _HistoryParts = require("./HistoryParts.js");
var _jsxRuntime = require("react/jsx-runtime");
// Player History page: loads the records, owns the filters and selection, and lays out the parts.
// Rules live in src/lib/historyEngine.js (tested). Pieces live in HistoryParts.jsx and HistoryWidgets.jsx.

// remembered per browser (never sent anywhere); everything read back is cleaned first
const PREF_KEY = "grsh_history_prefs_v1",
  VIEW_KEY = "grsh_history_views_v1";
const readJson = k => {
  try {
    const v = window.localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
};
const writeJson = (k, v) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {/* storage blocked: nothing is remembered, nothing breaks */}
};
const COL_KEYS = _HistoryParts.ALL_COLS.map(c => c.k);
const DEFAULT_COLS = ["player", "seasons", "divisions", "tier", "attendance", "flags"];
const DESC_FIRST = ["seasons", "champs", "attendance", "last_active", "flags", "trend"];
const OUR_PARAMS = ["q", "div", "season", "rel", "missing", "warn", "champs", "noshow", "recent", "captains", "sort", "dir", "search"];
function initialState() {
  const url = (0, _historyShared.decodeState)(window.location.search); // a link wins over what was remembered
  const pref = readJson(PREF_KEY) || {};
  const cols = Array.isArray(pref.cols) ? pref.cols.filter(c => COL_KEYS.includes(c)) : null;
  const base = {
    cols: cols && cols.includes("player") ? cols : DEFAULT_COLS,
    density: pref.density === "compact" ? "compact" : "comfortable"
  };
  if (url.touched) return {
    ...base,
    filters: url.filters,
    sortKey: url.sortKey,
    sortDir: url.sortDir,
    restored: false
  };
  const f = (0, _historyShared.cleanFilters)(pref.filters);
  return {
    ...base,
    filters: f,
    sortKey: _historyShared.SORT_KEYS.includes(pref.sortKey) ? pref.sortKey : "last_name",
    sortDir: pref.sortDir === "desc" ? "desc" : "asc",
    restored: _historyShared.FILTER_KEYS.some(k => f[k] !== _historyShared.DEFAULT_FILTERS[k])
  };
}
function ToolsMenu({
  seasons,
  onPick
}) {
  const [open, setOpen] = (0, _react.useState)(false);
  const ref = (0, _react.useRef)(null);
  (0, _HistoryParts.useDismiss)(ref, open, () => setOpen(false));
  const items = [["⚡ Risk analysis", "predictor"], ["⇔ Compare seasons", "diff"], ["📊 Cohort retention", "cohort"], ["🔍 Where are they now?", "where"]].concat(seasons.map(y => [`📖 ${y} story`, "story:" + y]));
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    ref: ref,
    style: {
      position: "relative"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      onClick: () => setOpen(o => !o),
      "aria-haspopup": "menu",
      "aria-expanded": open,
      style: {
        ..._historyShared.wowBtn,
        padding: "8px 14px",
        height: 34
      },
      children: "Tools \u25BE"
    }), open && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "menu",
      style: {
        position: "absolute",
        right: 0,
        top: "calc(100% + 4px)",
        background: "#fff",
        border: "1px solid #D8D6CE",
        borderRadius: 10,
        padding: 6,
        zIndex: 300,
        minWidth: 220,
        boxShadow: "0 8px 32px rgba(0,0,0,.14)"
      },
      children: items.map(([l, k]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        role: "menuitem",
        onClick: () => {
          setOpen(false);
          onPick(k);
        },
        style: {
          display: "block",
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          padding: "8px 12px",
          fontSize: 13,
          fontFamily: _historyShared.MONO,
          cursor: "pointer",
          borderRadius: 6
        },
        children: l
      }, k))
    })]
  });
}
function History() {
  const init = (0, _react.useRef)(null);
  if (init.current === null) init.current = initialState();
  const [players, setPlayers] = (0, _react.useState)([]); // real records only; never sample data
  const [loadState, setLoadState] = (0, _react.useState)("loading");
  const [loadError, setLoadError] = (0, _react.useState)("");
  const [loadInfo, setLoadInfo] = (0, _react.useState)({
    rows: 0,
    total: 0,
    skipped: 0,
    complete: true
  });
  const [overview, setOverview] = (0, _react.useState)(null);
  const [overviewErr, setOverviewErr] = (0, _react.useState)("");
  const [f, setF] = (0, _react.useState)(init.current.filters);
  const [restored, setRestored] = (0, _react.useState)(init.current.restored);
  const [sortKey, setSortKey] = (0, _react.useState)(init.current.sortKey);
  const [sortDir, setSortDir] = (0, _react.useState)(init.current.sortDir);
  const [cols, setCols] = (0, _react.useState)(init.current.cols);
  const [density, setDensity] = (0, _react.useState)(init.current.density);
  const [showEmpty, setShowEmpty] = (0, _react.useState)(false);
  const [shown, setShown] = (0, _react.useState)(_historyShared.PAGE_SIZE);
  const [picked, setPicked] = (0, _react.useState)(() => new Set());
  const [selectedId, setSelectedId] = (0, _react.useState)(null);
  const [showReview, setShowReview] = (0, _react.useState)(null); // null | "gaps" | "dupes" | "moves"
  const [modal, setModal] = (0, _react.useState)(null); // null | predictor | diff | cohort | where | story:YYYY
  const [busyKey, setBusyKey] = (0, _react.useState)("");
  const [toast, setToast] = (0, _react.useState)(null);
  const [savedViews, setSavedViews] = (0, _react.useState)(() => (0, _historyShared.cleanSavedViews)(readJson(VIEW_KEY)));
  const [barH, setBarH] = (0, _react.useState)(0);
  const searchRef = (0, _react.useRef)(null);
  const barRef = (0, _react.useRef)(null);
  const loadingRef = (0, _react.useRef)(false);
  const toastTimer = (0, _react.useRef)(null);
  const showToast = (0, _react.useCallback)((msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({
      msg,
      undo: undo || null
    });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 10000 : 3500);
  }, []);
  (0, _react.useEffect)(() => () => clearTimeout(toastTimer.current), []);

  // ── loading: every page of records (the server gives at most 500 at a time), then the data checks ──
  const loadAll = (0, _react.useCallback)(async silent => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoadState("loading");
    try {
      let page = 1,
        pages = 1,
        total = 0,
        flat = [];
      do {
        const res = await fetch(`${_historyShared.API}/history/records?per_page=500&page=${page}`, {
          credentials: "same-origin",
          headers: {
            "X-WP-Nonce": _historyShared.NONCE
          }
        });
        if (!res.ok) throw new Error(res.status === 403 || res.status === 401 ? "You do not have permission to view history." : `The server answered ${res.status}.`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.records || [];
        flat = flat.concat(rows);
        total = Number.isFinite(+data.total) ? +data.total : flat.length;
        pages = Number.isFinite(+data.total_pages) ? Math.max(1, +data.total_pages) : 1;
        page++;
      } while (page <= pages && page <= 40);
      const {
        players: ps,
        skipped
      } = (0, _historyShared.aggregateRecords)(flat);
      setPlayers(ps);
      setLoadInfo({
        rows: flat.length,
        total,
        skipped,
        complete: flat.length >= total
      });
      setLoadError("");
      setLoadState("done");
    } catch (e) {
      setLoadError(e && e.message ? e.message : "Could not reach the server. Check your connection.");
      if (silent) showToast("Could not refresh. Showing the last loaded data.");else setLoadState("error");
    }
    const o = await (0, _historyShared.apiCall)("/history/overview");
    if (o.ok) {
      setOverview(o.data);
      setOverviewErr("");
    } else setOverviewErr(o.error);
    loadingRef.current = false;
  }, [showToast]);
  (0, _react.useEffect)(() => {
    loadAll(false);
  }, [loadAll]);
  (0, _react.useEffect)(() => {
    // coming back to the tab after a while: refresh so nobody acts on an old view
    let last = Date.now();
    const h = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 120000) {
        last = Date.now();
        loadAll(true);
      }
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [loadAll]);

  // ── remember + share ──
  (0, _react.useEffect)(() => {
    writeJson(PREF_KEY, {
      filters: f,
      sortKey,
      sortDir,
      cols,
      density
    });
  }, [f, sortKey, sortDir, cols, density]);
  (0, _react.useEffect)(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      OUR_PARAMS.forEach(k => sp.delete(k));
      new URLSearchParams((0, _historyShared.encodeState)(f, sortKey, sortDir)).forEach((v, k) => sp.set(k, v));
      const qs = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    } catch (e) {/* address bar not writable: the page still works */}
  }, [f, sortKey, sortDir]);

  // the table header sticks just under the filter bar, so measure the bar
  (0, _react.useEffect)(() => {
    const el = barRef.current;
    if (!el) return undefined;
    setBarH(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadState]);

  // ── derived ──
  const allSeasons = (0, _react.useMemo)(() => (0, _historyShared.seasonsOf)(players), [players]);
  const latestSeason = allSeasons[0] || 0;
  const filtered = (0, _react.useMemo)(() => (0, _historyShared.filterAndSort)(players, f, sortKey, sortDir), [players, f, sortKey, sortDir]);
  const terms = (0, _react.useMemo)(() => (0, _historyShared.searchTerms)(f.q), [f.q]);
  const st = (0, _react.useMemo)(() => (0, _historyShared.stats)(players), [players]);
  const cov = (0, _react.useMemo)(() => (0, _historyShared.coverage)(players), [players]);
  const emptyCols = (0, _react.useMemo)(() => (0, _historyShared.emptyColumns)(players), [players]);
  const hiddenEmpty = showEmpty ? [] : cols.filter(c => emptyCols.includes(c));
  const shownCols = cols.filter(c => !hiddenEmpty.includes(c));
  const recentCount = (0, _react.useMemo)(() => latestSeason ? players.filter(p => p.history.some(h => +h.season >= latestSeason - 1)).length : 0, [players, latestSeason]);
  const fresh = (0, _react.useMemo)(() => (0, _historyShared.freshness)(overview && overview.last_import && overview.last_import.at, Date.now()), [overview]);
  const summary = (0, _react.useMemo)(() => (0, _historyShared.reviewSummary)(overview, players), [overview, players]);
  const reviewCount = summary.reduce((n, i) => n + (i.tab === "gaps" ? 1 : i.count), 0);
  const dupIdx = (0, _react.useMemo)(() => (0, _historyShared.duplicateIndex)(overview), [overview]);
  const registeredIds = (0, _react.useMemo)(() => overview && Array.isArray(overview.registered_ids) ? new Set(overview.registered_ids.map(Number)) : null, [overview]);
  const chips = (0, _historyShared.activeFilterChips)(f);
  const visible = filtered.slice(0, (0, _historyShared.visibleCount)(filtered.length, shown));
  const selected = (0, _react.useMemo)(() => players.find(p => p.id === selectedId) || null, [players, selectedId]);
  const livePicked = (0, _react.useMemo)(() => new Set(players.filter(p => picked.has(p.id)).map(p => p.id)), [players, picked]);
  const builtin = (0, _react.useMemo)(() => (0, _historyShared.builtinViews)(latestSeason), [latestSeason]);
  const activeView = [...builtin, ...savedViews].find(v => (0, _historyShared.sameFilters)(v.filters, f) && v.sortKey === sortKey && v.sortDir === sortDir);

  // ── actions ──
  const setFilter = (k, v) => {
    setF(x => ({
      ...x,
      [k]: v
    }));
    setRestored(false);
    setShown(_historyShared.PAGE_SIZE);
  };
  const toggle = k => {
    setF(x => ({
      ...x,
      [k]: !x[k]
    }));
    setRestored(false);
    setShown(_historyShared.PAGE_SIZE);
  };
  const removeChip = k => setFilter(k, typeof _historyShared.DEFAULT_FILTERS[k] === "boolean" ? false : "");
  const clearFilters = () => {
    setF({
      ..._historyShared.DEFAULT_FILTERS
    });
    setRestored(false);
    setShown(_historyShared.PAGE_SIZE);
  };
  const onSort = k => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");else {
      setSortKey(k);
      setSortDir(DESC_FIRST.includes(k) ? "desc" : "asc");
    }
    setShown(_historyShared.PAGE_SIZE);
  };
  const applyView = v => {
    setF({
      ...v.filters
    });
    setSortKey(v.sortKey);
    setSortDir(v.sortDir);
    setRestored(false);
    setShown(_historyShared.PAGE_SIZE);
  };
  const saveView = name => {
    const next = [...savedViews, {
      id: "u" + Date.now(),
      name,
      filters: {
        ...f
      },
      sortKey,
      sortDir
    }].slice(-20);
    setSavedViews(next);
    writeJson(VIEW_KEY, next);
    showToast(`✓ Saved view "${name}"`);
  };
  const deleteView = v => {
    const next = savedViews.filter(x => x.id !== v.id);
    setSavedViews(next);
    writeJson(VIEW_KEY, next);
  };
  const toggleCol = k => setCols(c => c.includes(k) ? c.filter(x => x !== k) : COL_KEYS.filter(x => x === k || c.includes(x)));
  const pick = id => setPicked(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);else n.add(id);
    return n;
  });
  const pickShown = on => setPicked(s => {
    const n = new Set(s);
    visible.forEach(p => on ? n.add(p.id) : n.delete(p.id));
    return n;
  });
  const closeModals = () => {
    setModal(null);
    setShowReview(null);
  };
  const openPlayer = p => {
    setSelectedId(p.id);
    setShowReview(null);
  };
  const closePanel = () => {
    const id = selectedId;
    setSelectedId(null);
    if (id != null) requestAnimationFrame(() => {
      const el = document.querySelector(`[data-row-id="${id}"]`);
      if (el) el.focus({
        preventScroll: true
      });
    }); // back to where you were
  };
  const copy = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg);
    } catch (e) {
      showToast("Could not copy. Select the text and copy it by hand.");
    }
  };
  const runUndo = async () => {
    const t = toast;
    if (!t || !t.undo) return;
    clearTimeout(toastTimer.current);
    setToast(null);
    const r = await t.undo();
    if (r && r.ok) {
      showToast("↩ Change undone");
      loadAll(true);
    } else showToast("Could not undo: " + (r && r.error || "unknown error"));
  };
  const doExport = scope => {
    const list = scope === "all" ? (0, _historyShared.filterAndSort)(players, _historyShared.DEFAULT_FILTERS, sortKey, sortDir) : scope === "selected" ? filtered.length ? players.filter(p => livePicked.has(p.id)) : [] : filtered;
    if (!list.length) {
      showToast("Nothing to export.");
      return;
    }
    const blob = new Blob(["﻿" + (0, _historyShared.buildCsv)(list, shownCols)], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grsh-history-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`✓ Exported ${list.length} player${list.length === 1 ? "" : "s"}`);
  };

  // merge / not-a-duplicate reuse the Players endpoints. A merge cannot be undone from here, so the dialog asks first.
  const doMerge = async (pair, keepId) => {
    const removeId = keepId === pair.a.id ? pair.b.id : pair.a.id;
    const key = pair.a.id + "-" + pair.b.id;
    if (busyKey) return;
    setBusyKey(key);
    const r = await (0, _historyShared.apiCall)("/players/merge", {
      method: "POST",
      body: JSON.stringify({
        keep_id: keepId,
        remove_id: removeId
      })
    });
    setBusyKey("");
    if (!r.ok) {
      showToast("Not merged: " + r.error);
      return;
    }
    showToast("✓ Merged. This cannot be undone here.");
    if (selectedId === removeId) setSelectedId(keepId);
    loadAll(true);
  };
  const doDismiss = async pair => {
    const key = pair.a.id + "-" + pair.b.id;
    if (busyKey) return;
    setBusyKey(key);
    const r = await (0, _historyShared.apiCall)("/players/not-duplicate", {
      method: "POST",
      body: JSON.stringify({
        a: pair.a.id,
        b: pair.b.id
      })
    });
    setBusyKey("");
    if (!r.ok) {
      showToast("Could not save: " + r.error);
      return;
    }
    showToast("✓ Marked as different people");
    loadAll(true);
  };

  // keyboard: / search, Esc closes the top thing, arrows move through the list
  (0, _react.useEffect)(() => {
    const typing = t => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const h = e => {
      if (e.defaultPrevented) return; // a menu already used this key
      const anyModal = !!(modal || showReview);
      if (e.key === "Escape") {
        if (anyModal) closeModals();else if (selectedId != null) closePanel();
        return;
      }
      if (anyModal || typing(e.target)) return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }
      if (!selected || e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const idx = filtered.findIndex(p => p.id === selected.id);
      const next = filtered[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      setShown(s => Math.max(s, idx + 3));
      setSelectedId(next.id);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-row-id="${next.id}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({
          block: "nearest"
        });
      });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // ── states with nothing to table ──
  if (loadState === "error") return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: 48,
      background: "#F6F5F0",
      minHeight: "60vh",
      fontFamily: "system-ui,sans-serif"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: "'Fraunces',serif",
        fontSize: 24,
        fontWeight: 700,
        color: "#1a1a2e",
        marginBottom: 10
      },
      children: "Player History"
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "alert",
      style: {
        background: "#FEF2F2",
        border: "1px solid #FCA5A5",
        borderRadius: 10,
        padding: "16px 20px",
        maxWidth: 560,
        color: "#991B1B"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        children: "The history could not be loaded."
      }), " ", loadError, /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          color: "#555",
          marginTop: 6,
          fontSize: 14
        },
        children: "Nothing is shown rather than showing old or sample data."
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        onClick: () => loadAll(false),
        style: {
          ..._HistoryParts.btnDark,
          marginTop: 12
        },
        children: "Try again"
      })]
    })]
  });
  if (loadState === "loading") return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: 48,
      fontFamily: _historyShared.MONO,
      fontSize: 13,
      color: "#555",
      background: "#F6F5F0",
      minHeight: "100vh"
    },
    role: "status",
    "aria-live": "polite",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}`
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: "'Fraunces',serif",
        fontSize: 24,
        fontWeight: 700,
        color: "#1a1a2e",
        marginBottom: 6
      },
      children: "Player History"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        marginBottom: 24
      },
      children: "Loading imported records\u2026"
    }), [1, 2, 3, 4, 5].map(i => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        height: 52,
        borderRadius: 8,
        marginBottom: 8,
        background: "linear-gradient(90deg,#F0EEE8 25%,#E8E6DF 50%,#F0EEE8 75%)",
        backgroundSize: "400px 100%",
        animation: "shimmer 1.4s infinite"
      }
    }, i))]
  });
  const hasPlayers = players.length > 0;
  const emptyState = /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        fontFamily: "'Fraunces',serif",
        fontSize: 16,
        fontWeight: 700,
        color: "#1a1a2e",
        margin: "0 0 6px"
      },
      children: chips.length ? "No players match these filters" : "No history records yet"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#555",
        margin: "0 0 16px"
      },
      children: chips.length ? "Remove a filter below the search box, or clear them all." : "Import past seasons from the Import History page."
    }), chips.length > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      onClick: clearFilters,
      style: _HistoryParts.btnDark,
      children: "Clear all filters"
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
      href: (0, _historyShared.adminUrl)("grsh-tm-history-import"),
      style: {
        ..._HistoryParts.btnDark,
        display: "inline-block",
        textDecoration: "none",
        lineHeight: "20px"
      },
      children: "Import History \u2192"
    })]
  });
  const seasonText = allSeasons.length === 0 ? "" : allSeasons.length === 1 ? ` · season ${allSeasons[0]}` : ` · ${allSeasons[allSeasons.length - 1]}–${allSeasons[0]} (${allSeasons.length} seasons)`;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "hx",
    style: {
      "--hx-top": `${barH + 44}px`
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `
        .hx *{box-sizing:border-box}
        .hx :focus-visible{outline:2px solid #1a1a2e;outline-offset:2px}
        .hx .hrow:focus-visible{outline:2px solid #1a1a2e;outline-offset:-2px}
        .hx .hrow:hover td{background:#F0F4FF!important}
        .hx .hrow{scroll-margin-top:var(--hx-top,120px)}
        .hx .hx-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
        .hx .hx-toast{animation:hxUp .2s ease}
        @keyframes hxUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.hx *,.hx .hx-toast{animation:none!important;transition:none!important}}
        @media(max-width:768px){.hx .hsplit{flex-direction:column!important;height:auto!important}}
      `
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(_HistoryParts.ErrorBoundary, {
      label: "This tool",
      onReset: closeModals,
      children: [modal === "predictor" && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.SandbagPredictor, {
        players: players,
        onClose: () => setModal(null)
      }), modal === "diff" && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.SeasonDiff, {
        players: players,
        onClose: () => setModal(null)
      }), modal === "cohort" && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.CohortChart, {
        players: players,
        onClose: () => setModal(null)
      }), modal === "where" && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.WhereAreTheyNow, {
        players: players,
        registeredIds: registeredIds,
        year: overview && overview.registered_year || new Date().getFullYear(),
        onClose: () => setModal(null)
      }), modal && modal.indexOf("story:") === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.SeasonStory, {
        players: players,
        season: +modal.slice(6),
        onClose: () => setModal(null)
      }), showReview && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.NeedsReview, {
        overview: overview,
        overviewErr: overviewErr,
        players: players,
        startTab: showReview,
        onClose: () => setShowReview(null),
        busyKey: busyKey,
        onShowGap: k => {
          setFilter("missing", k);
          setShowReview(null);
        },
        onOpenPlayer: openPlayer,
        onMerge: doMerge,
        onDismiss: doDismiss
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "hsplit",
      style: {
        display: "flex",
        height: "calc(100vh - 32px)",
        overflow: "hidden",
        background: "#F6F5F0"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("main", {
        "aria-label": "Player history",
        style: {
          flex: 1,
          overflow: "auto",
          padding: "18px 20px 0",
          minWidth: 0
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 10
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              minWidth: 0
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("nav", {
              "aria-label": "Breadcrumb",
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                color: "#555"
              },
              children: ["GRSH Tournament Manager \u203A ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                "aria-current": "page",
                children: "Player History"
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 26,
                fontWeight: 700,
                color: "#1a1a2e",
                margin: "2px 0 2px",
                letterSpacing: "-.5px"
              },
              children: "Player History"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              style: {
                fontSize: 13,
                color: "#333",
                margin: "0 0 4px",
                maxWidth: 640
              },
              children: "What every player did in past seasons. Use it to check tiers before the draft, spot sandbagging and clean up records."
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                color: "#555",
                margin: 0
              },
              children: [players.length, " players \xB7 ", loadInfo.rows, " season rows", seasonText]
            }), !loadInfo.complete && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              role: "alert",
              style: {
                fontSize: 13,
                color: "#991B1B",
                margin: "4px 0 0"
              },
              children: ["Only ", loadInfo.rows, " of ", loadInfo.total, " season rows loaded. Numbers below are incomplete."]
            }), loadInfo.skipped > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              role: "alert",
              style: {
                fontSize: 13,
                color: "#92400E",
                margin: "4px 0 0"
              },
              children: [loadInfo.skipped, " row", loadInfo.skipped === 1 ? "" : "s", " could not be matched to a player and are not shown."]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.FreshnessLine, {
              overview: overview,
              overviewErr: overviewErr,
              fresh: fresh
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              onClick: () => setShowReview("gaps"),
              style: {
                ..._HistoryParts.btnGhost,
                height: 34,
                fontWeight: 600,
                background: reviewCount > 0 ? "#FEF3C7" : "#E6F4EA",
                color: reviewCount > 0 ? "#7A4A0A" : "#166534",
                borderColor: reviewCount > 0 ? "#FDE68A" : "#86EFAC"
              },
              children: overview || hasPlayers ? reviewCount > 0 ? `Needs review (${reviewCount})` : "All checks clear" : "Needs review"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(ToolsMenu, {
              seasons: allSeasons,
              onPick: setModal
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ReviewSummary, {
          items: summary,
          ready: !!overview,
          onGap: k => setFilter("missing", k),
          onTab: setShowReview
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            height: 12
          }
        }), hasPlayers && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.KpiBar, {
          s: st,
          f: f,
          toggle: toggle,
          recentCount: recentCount
        }), hasPlayers && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.CoverageStrip, {
          cov: cov,
          onShowGap: k => setFilter("missing", k)
        }), hasPlayers && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.SavedViews, {
          builtin: builtin,
          saved: savedViews,
          activeId: activeView ? activeView.id : null,
          onApply: applyView,
          onSave: saveView,
          onDelete: deleteView,
          canSave: chips.length > 0 && !activeView
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          ref: barRef,
          style: {
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "#F6F5F0",
            margin: "0 -20px",
            padding: "0 20px 8px"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              background: "#fff",
              border: "1px solid #D8D6CE",
              borderRadius: 10
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.FilterBar, {
              f: f,
              set: setFilter,
              seasons: allSeasons,
              searchRef: searchRef,
              onClear: clearFilters,
              activeCount: chips.length
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ActiveChips, {
              chips: chips,
              onRemove: removeChip,
              restored: restored
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 8
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              role: "status",
              "aria-live": "polite",
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                color: "#333",
                margin: 0
              },
              children: ["Showing ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: filtered.length
              }), " of ", players.length, " players", chips.length > 0 ? " (filtered)" : "", selected ? " · ↑↓ move · Esc close" : ""]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.DensityToggle, {
                density: density,
                setDensity: setDensity
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ColumnsMenu, {
                visible: cols,
                onToggle: toggleCol,
                emptyCols: emptyCols,
                showEmpty: showEmpty,
                setShowEmpty: setShowEmpty
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ExportMenu, {
                filteredCount: filtered.length,
                totalCount: players.length,
                pickedCount: livePicked.size,
                onExport: doExport
              })]
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.BulkBar, {
          count: livePicked.size,
          filteredCount: filtered.length,
          onSelectAll: () => setPicked(new Set(filtered.map(p => p.id))),
          onCopy: () => {
            const em = players.filter(p => livePicked.has(p.id) && p.email).map(p => p.email);
            if (em.length) copy(em.join("; "), `✓ Copied ${em.length} email${em.length === 1 ? "" : "s"}`);else showToast("None of the selected players has an email.");
          },
          onExport: () => doExport("selected"),
          onClear: () => setPicked(new Set())
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.EmptyColumnsNote, {
          hidden: hiddenEmpty,
          onShow: () => setShowEmpty(true)
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            background: "#fff",
            border: "1px solid #D8D6CE",
            borderRadius: 10
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ErrorBoundary, {
            label: "The table",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.PlayersTable, {
              rows: visible,
              cols: shownCols,
              density: density,
              sortKey: sortKey,
              sortDir: sortDir,
              onSort: onSort,
              selectedId: selectedId,
              onOpen: openPlayer,
              terms: terms,
              latestSeason: latestSeason,
              dupIdx: dupIdx,
              picked: livePicked,
              onPick: pick,
              onPickShown: pickShown,
              top: barH,
              onCopyEmail: p => copy(p.email, "✓ Email copied"),
              onSimilar: p => setFilter("q", p.last_name),
              onReviewDupes: () => setShowReview("dupes"),
              emptyState: emptyState
            })
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.TableFooter, {
          shown: visible.length,
          total: filtered.length,
          onMore: () => setShown(visible.length + _historyShared.PAGE_SIZE),
          onAll: () => setShown(filtered.length)
        })]
      }), selected && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          width: 420,
          borderLeft: "1px solid #D8D6CE",
          background: "#fff",
          height: "calc(100vh - 32px)",
          overflowY: "auto",
          flexShrink: 0
        },
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.ErrorBoundary, {
          label: "The player panel",
          onReset: closePanel,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.HistoryPanel, {
            player: selected,
            onClose: closePanel,
            onSaved: () => loadAll(true),
            onToast: showToast
          })
        })
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryParts.Toast, {
      toast: toast,
      onUndo: runUndo,
      onClose: () => setToast(null)
    })]
  });
}