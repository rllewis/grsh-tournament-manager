"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Rosters;
var _react = require("react");
var _playerScoring = require("../lib/playerScoring");
var _rosterEngine = require("../lib/rosterEngine");
var _jsxRuntime = require("react/jsx-runtime");
// Rosters.jsx — v3
// Real data, autosaved. Every action is saved to the server as it happens and the server sends back the whole
// division, so this page and the Draft page can never drift apart. No mock players, no fake Save button.
//
// Features: ghost slots · drag-over impact preview · sticky balance bar · auto-balance with per-move review ·
//           swap finder · keep-together / keep-apart rules · plans + autosave + undo · player peek card ·
//           committee review link + publish gate · publish with SportsPress dry run · print cards + reveal mode.

const API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce || "";
const F_HEAD = "'Fraunces',Georgia,serif";
const F_NUM = "'DM Mono',monospace";
const F_UI = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const INK = "#1a1a2e",
  MUTED = "#555566",
  SOFT = "#6b6b7b",
  LINE = "#E2E0D8",
  PAPER = "#F6F5F0",
  GOLD = "#D4A017",
  WHITE = "#fff";
const POS_COLOR = {
  defenseman: {
    bg: "#E8F0FE",
    color: "#1A3F8F"
  },
  center: {
    bg: "#E8F8EF",
    color: "#1A5C35"
  },
  winger: {
    bg: "#FDF3E8",
    color: "#7A4A18"
  },
  goaltender: {
    bg: "#FCE8E8",
    color: "#7A1818"
  }
};
const TIER_COLOR = t => {
  if (!t) return {
    bg: "#F3F4F6",
    color: "#4B5563"
  };
  const f = t[0];
  if (f === "A") return {
    bg: "#FCE8E8",
    color: "#7A1818"
  };
  if (f === "B") return {
    bg: "#FEF0E8",
    color: "#7A4518"
  };
  if (f === "C") return {
    bg: "#FEF9E7",
    color: "#6B4E0E"
  };
  return {
    bg: "#E8F0FE",
    color: "#1A3F8F"
  };
};
const BAND = {
  balanced: {
    label: "Balanced",
    color: "#166534",
    bg: "#DCFCE7"
  },
  review: {
    label: "Review",
    color: "#92400E",
    bg: "#FEF3C7"
  },
  rebalance: {
    label: "Rebalance",
    color: "#991B1B",
    bg: "#FEE2E2"
  },
  none: {
    label: "—",
    color: SOFT,
    bg: "#F3F4F6"
  }
};
const STAGES = [{
  key: "draft",
  label: "Draft"
}, {
  key: "review",
  label: "Committee review"
}, {
  key: "locked",
  label: "Locked"
}, {
  key: "published",
  label: "Published"
}];
const fullName = p => `${p.first_name} ${p.last_name}`.trim();
const effPos = p => p.is_goalie ? "goaltender" : p.position || "";
const hhmm = () => new Date().toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit"
});

// ─── small UI pieces ─────────────────────────────────────────────────────────
const btn = (kind = "ghost", extra = {}) => ({
  fontFamily: F_UI,
  fontSize: 13,
  fontWeight: 600,
  padding: "7px 12px",
  borderRadius: 8,
  cursor: "pointer",
  lineHeight: 1.2,
  border: kind === "primary" ? `1px solid ${INK}` : kind === "danger" ? "1px solid #B91C1C" : `1px solid ${LINE}`,
  background: kind === "primary" ? INK : kind === "danger" ? "#B91C1C" : WHITE,
  color: kind === "primary" || kind === "danger" ? WHITE : INK,
  ...extra
});
const chip = (c, extra = {}) => ({
  display: "inline-block",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  background: c.bg,
  color: c.color,
  whiteSpace: "nowrap",
  ...extra
});
function PosDot({
  p
}) {
  const c = POS_COLOR[effPos(p)] || {
    bg: "#F3F4F6",
    color: SOFT
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    title: _rosterEngine.POS_LABEL[effPos(p)] || "No position",
    style: {
      ...chip(c),
      width: 20,
      textAlign: "center",
      padding: "2px 0",
      fontFamily: F_NUM
    },
    children: _rosterEngine.POS_SHORT[effPos(p)] || "?"
  });
}
function PlayerRow({
  p,
  dense,
  onPeek,
  draggable,
  onDragStart,
  onDragEnd,
  captain,
  pinned,
  held,
  selected
}) {
  const tier = (0, _rosterEngine.tierOf)(p),
    tc = TIER_COLOR(tier),
    rb = (0, _playerScoring.formatReturningBadge)((p.returning_seasons || []).length);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    draggable: draggable,
    onDragStart: onDragStart,
    onDragEnd: onDragEnd,
    onClick: () => onPeek && onPeek(p),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: dense ? "5px 8px" : "7px 10px",
      background: selected ? "#FFF8E1" : WHITE,
      border: `1px solid ${selected ? GOLD : LINE}`,
      borderRadius: 8,
      cursor: draggable ? "grab" : "pointer",
      fontFamily: F_UI,
      fontSize: 13,
      color: INK,
      userSelect: "none"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(PosDot, {
      p: p
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
      style: {
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 600
      },
      children: [fullName(p), captain && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        title: "Captain",
        style: {
          marginLeft: 5,
          color: GOLD,
          fontWeight: 800
        },
        children: "C"
      })]
    }), held && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Locked to this team: auto-balance and swaps will not move them",
      style: {
        fontSize: 11
      },
      children: "\uD83D\uDD12"
    }), pinned && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Has a keep-together / keep-apart rule",
      style: {
        fontSize: 11
      },
      children: "\uD83D\uDCCC"
    }), p.payment_status !== "paid" && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: `Payment: ${p.payment_status}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: 4,
        background: "#DC2626"
      }
    }), p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Sandbagging flag",
      style: {
        fontSize: 11
      },
      children: "\u2691"
    }), rb && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Returning player",
      style: chip({
        bg: "#F3E8FF",
        color: "#6B21A8"
      }),
      children: rb
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: `Skill tier ${tier || "unassigned"}`,
      style: chip(tc),
      children: tier || "—"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Player score (tier + years)",
      style: {
        fontFamily: F_NUM,
        fontSize: 12,
        color: MUTED,
        width: 34,
        textAlign: "right"
      },
      children: (0, _rosterEngine.scoreOf)(p).toFixed(1)
    })]
  });
}
function Modal({
  title,
  onClose,
  children,
  width = 560,
  footer
}) {
  (0, _react.useEffect)(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(20,20,40,.45)",
      zIndex: 100000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      onClick: e => e.stopPropagation(),
      role: "dialog",
      "aria-label": title,
      style: {
        background: WHITE,
        borderRadius: 14,
        width: "100%",
        maxWidth: width,
        maxHeight: "88vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        fontFamily: F_UI,
        color: INK
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "14px 18px",
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          alignItems: "center"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
          style: {
            margin: 0,
            fontFamily: F_HEAD,
            fontSize: 19,
            flex: 1
          },
          children: title
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          "aria-label": "Close",
          style: btn("ghost", {
            padding: "4px 10px"
          }),
          children: "\u2715"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          padding: 18,
          overflowY: "auto"
        },
        children: children
      }), footer && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          padding: "12px 18px",
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap"
        },
        children: footer
      })]
    })
  });
}

// ─── main page ───────────────────────────────────────────────────────────────
function Rosters() {
  const [div, setDiv] = (0, _react.useState)(() => new URLSearchParams(window.location.search).get("division") || "");
  const [data, setData] = (0, _react.useState)(null);
  const [loading, setLoading] = (0, _react.useState)(true);
  const [err, setErr] = (0, _react.useState)("");
  const [saving, setSaving] = (0, _react.useState)(0);
  const [savedAt, setSavedAt] = (0, _react.useState)("");
  const [toast, setToast] = (0, _react.useState)(null);
  const [undo, setUndo] = (0, _react.useState)([]);
  const [peek, setPeek] = (0, _react.useState)(null); // player id
  const [modal, setModal] = (0, _react.useState)(null); // {kind, ...}
  const [posF, setPosF] = (0, _react.useState)("all");
  const [q, setQ] = (0, _react.useState)("");
  const [sortBy, setSortBy] = (0, _react.useState)("score");
  const [drag, setDrag] = (0, _react.useState)(null); // player id
  const [hover, setHover] = (0, _react.useState)(null); // team id | "pool"
  const [suggestTeam, setSuggestTeam] = (0, _react.useState)(null);
  const [reveal, setReveal] = (0, _react.useState)(null); // {i, shown}
  const [printing, setPrinting] = (0, _react.useState)(false);
  const [keyOpen, setKeyOpen] = (0, _react.useState)(false);
  const dataRef = (0, _react.useRef)(null);
  dataRef.current = data;
  const flash = (0, _react.useCallback)((msg, kind = "ok") => {
    setToast({
      msg,
      kind
    });
    window.clearTimeout(flash.t);
    flash.t = window.setTimeout(() => setToast(null), kind === "err" ? 7000 : 3500);
  }, []);

  // one fetch helper: sends the nonce, surfaces server messages, and always applies a returned division payload
  const call = (0, _react.useCallback)(async (path, method = "GET", body) => {
    setSaving(n => n + 1);
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": NONCE
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin"
      });
      let json = null;
      try {
        json = await res.json();
      } catch (e) {/* non-JSON error page */}
      if (!res.ok) {
        const m = json && (json.error || json.message) || `Request failed (${res.status}).`;
        const e = new Error(m);
        e.json = json;
        e.status = res.status;
        throw e;
      }
      if (json && json.teams && json.pool) {
        setData(json);
        if (method !== "GET") setSavedAt(hhmm());
      }
      return json;
    } finally {
      setSaving(n => n - 1);
    }
  }, []);
  const load = (0, _react.useCallback)(async d => {
    setLoading(true);
    setErr("");
    try {
      const json = await call(`/rosters${d ? `?division=${encodeURIComponent(d)}` : ""}`);
      if (json && json.division) {
        setDiv(json.division);
        const u = new URL(window.location.href);
        u.searchParams.set("division", json.division);
        window.history.replaceState({}, "", u);
      }
      setUndo([]);
      setPeek(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [call]);
  (0, _react.useEffect)(() => {
    load(div); /* eslint-disable-next-line */
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────
  const cfg = data?.config || {
    min_roster: 8,
    max_roster: 12,
    goalie_min: 1,
    goalie_max: 2
  };
  const th = data?.parity || {
    rebalance_low: 60,
    review_low: 65,
    review_high: 80,
    rebalance_high: 85
  };
  const MAX = data?.max_player_score || 32;
  const teams = data?.teams || [],
    pool = data?.pool || [],
    pins = data?.pins || [],
    locks = data?.locks || [];
  const live = data && (data.draft_status === "active" || data.draft_status === "paused");
  const readOnly = !!live || data?.stage === "published";
  const stats = (0, _react.useMemo)(() => (0, _rosterEngine.teamStats)(teams, MAX), [teams, MAX]);
  const totalPlayers = pool.length + teams.reduce((s, t) => s + t.players.length, 0);
  const target = (0, _rosterEngine.targetSize)(cfg, teams.length, totalPlayers);
  const template = (0, _react.useMemo)(() => (0, _rosterEngine.slotTemplate)(cfg, target), [cfg, target]);
  const violations = (0, _react.useMemo)(() => (0, _rosterEngine.pinViolations)(pins, teams), [pins, teams]);
  const heldSet = (0, _react.useMemo)(() => new Set(locks), [locks]);
  const pinned = (0, _react.useMemo)(() => {
    const s = new Set();
    pins.forEach(p => {
      s.add(p.a);
      s.add(p.b);
    });
    return s;
  }, [pins]);
  const allPlayers = (0, _react.useMemo)(() => [...pool, ...teams.flatMap(t => t.players)], [pool, teams]);
  const byId = (0, _react.useMemo)(() => {
    const m = new Map();
    allPlayers.forEach(p => m.set(p.id, p));
    return m;
  }, [allPlayers]);
  const lockSum = (0, _react.useMemo)(() => (0, _rosterEngine.lockSummary)(teams, pins, locks, byId), [teams, pins, locks, byId]);
  const teamOf = (0, _react.useMemo)(() => (0, _rosterEngine.assignMap)(teams), [teams]);
  const counts = (0, _react.useMemo)(() => ({
    all: pool.length,
    goaltender: pool.filter(p => effPos(p) === "goaltender").length,
    defenseman: pool.filter(p => effPos(p) === "defenseman").length,
    center: pool.filter(p => effPos(p) === "center").length,
    winger: pool.filter(p => effPos(p) === "winger").length
  }), [pool]);
  const shownPool = (0, _react.useMemo)(() => {
    const s = q.trim().toLowerCase();
    const r = pool.filter(p => (posF === "all" || effPos(p) === posF) && (!s || fullName(p).toLowerCase().includes(s)));
    return r.sort((a, b) => sortBy === "name" ? a.last_name.localeCompare(b.last_name) : (0, _rosterEngine.scoreOf)(b) - (0, _rosterEngine.scoreOf)(a) || a.id - b.id);
  }, [pool, posF, q, sortBy]);
  const proj = (0, _react.useMemo)(() => {
    if (!drag || typeof hover !== "number") return null;
    const pl = byId.get(drag);
    if (!pl) return null;
    return (0, _rosterEngine.projectMove)(teams, pl, hover, MAX);
  }, [drag, hover, teams, byId, MAX]);

  // ── actions ────────────────────────────────────────────────────────────────
  const guard = () => {
    if (readOnly) {
      flash(live ? "A draft is in progress for this division — finish it on the Draft page first." : "Rosters are published. Unpublish is not available here.", "err");
      return true;
    }
    return false;
  };
  const applyLocal = (d, moves) => {
    const nd = {
      ...d,
      teams: d.teams.map(t => ({
        ...t,
        players: [...t.players]
      })),
      pool: [...d.pool]
    };
    moves.forEach(m => {
      let pl = null;
      nd.pool = nd.pool.filter(p => {
        if (p.id === m.player_id) {
          pl = p;
          return false;
        }
        return true;
      });
      nd.teams.forEach(t => {
        t.players = t.players.filter(p => {
          if (p.id === m.player_id) {
            pl = p;
            return false;
          }
          return true;
        });
      });
      if (!pl) return;
      if (m.team_id === null || m.team_id === undefined) nd.pool.push(pl);else {
        const t = nd.teams.find(x => x.id === m.team_id);
        if (t) t.players.push(pl);else nd.pool.push(pl);
      }
    });
    return nd;
  };
  const doMoves = (0, _react.useCallback)(async (moves, {
    type = "manual",
    note = "",
    record = true
  } = {}) => {
    const d = dataRef.current;
    if (!d || !moves.length) return false;
    const before = (0, _rosterEngine.assignMap)(d.teams);
    const inverse = moves.map(m => ({
      player_id: m.player_id,
      team_id: before[m.player_id] ?? null
    }));
    setData(applyLocal(d, moves)); // optimistic: the card moves now
    try {
      await call("/rosters/moves", "POST", {
        division: d.division,
        moves: moves.map(m => ({
          player_id: m.player_id,
          team_id: m.team_id ?? null
        })),
        type,
        note
      });
      if (record) setUndo(u => [...u.slice(-29), {
        inverse,
        label: note || `${moves.length} move${moves.length > 1 ? "s" : ""}`
      }]);
      return true;
    } catch (e) {
      flash(e.message, "err");
      setData(d);
      load(d.division);
      return false;
    }
  }, [call, flash, load]);
  const doUndo = (0, _react.useCallback)(async () => {
    if (readOnly) return;
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo(u => u.slice(0, -1));
    const ok = await doMoves(last.inverse, {
      record: false,
      note: "undo"
    });
    if (ok) flash(`Undid: ${last.label}`);
  }, [undo, doMoves, flash, readOnly]);
  (0, _react.useEffect)(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) {
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doUndo]);
  const dropOn = teamIdOrPool => {
    const id = drag;
    setDrag(null);
    setHover(null);
    if (!id || guard()) return;
    const to = teamIdOrPool === "pool" ? null : teamIdOrPool;
    const cur = teamOf[id] ?? null;
    if (cur === to) return;
    const t = to === null ? null : teams.find(x => x.id === to);
    if (t && t.locked) {
      flash(`${t.name} is locked. Unlock it to add players.`, "err");
      return;
    }
    const lb = (0, _rosterEngine.lockBlock)(id, to, teams, locks);
    if (lb) {
      flash(lb, "err");
      return;
    }
    const from = cur === null ? null : teams.find(x => x.id === cur);
    if (from && from.locked) {
      flash(`${from.name} is locked. Unlock it to move players.`, "err");
      return;
    }
    doMoves([{
      player_id: id,
      team_id: to
    }], {
      note: `${fullName(byId.get(id))} → ${t ? t.name : "pool"}`
    });
  };
  const patchTeam = async (id, body) => {
    if (guard()) return;
    try {
      await call(`/rosters/teams/${id}`, "PATCH", body);
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const addTeam = async name => {
    if (guard()) return;
    try {
      await call("/rosters/teams", "POST", {
        division: data.division,
        name
      });
      flash(`Added ${name}`);
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const delTeam = async t => {
    if (guard()) return;
    try {
      await call(`/rosters/teams/${t.id}`, "DELETE");
      flash(`Deleted ${t.name}`);
    } catch (e) {
      if (e.status === 409 && e.json?.players) {
        if (window.confirm(`${t.name} has ${e.json.players} player(s). Delete it and send them back to the pool?`)) {
          try {
            await call(`/rosters/teams/${t.id}?force=1`, "DELETE");
          } catch (e2) {
            flash(e2.message, "err");
          }
        }
      } else flash(e.message, "err");
    }
  };
  const setCaptain = async (t, p) => {
    if (guard()) return;
    try {
      await call("/rosters/captain", "POST", {
        team_id: t.id,
        player_id: p.id
      });
      flash(`${fullName(p)} is captain of ${t.name}`);
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const saveLocks = async next => {
    try {
      await call("/rosters/locks", "POST", {
        division: data.division,
        locks: next
      });
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const toggleLock = id => {
    if (guard()) return;
    const on = heldSet.has(id);
    const pl = byId.get(id);
    saveLocks(on ? locks.filter(x => x !== id) : [...locks, id]).then(() => flash(`${fullName(pl)} ${on ? "unlocked" : "locked to their team"}`));
  };
  const savePins = async next => {
    try {
      await call("/rosters/pins", "POST", {
        division: data.division,
        pins: next
      });
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const lockAll = async lock => {
    if (guard()) return;
    try {
      for (const t of teams) {
        if (!!t.locked !== lock) await call(`/rosters/teams/${t.id}`, "PATCH", {
          draft_locked: lock
        });
      }
      flash(lock ? "All teams locked" : "All teams unlocked");
    } catch (e) {
      flash(e.message, "err");
    }
  };

  // ── render helpers ─────────────────────────────────────────────────────────
  if (loading && !data) return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      padding: 40,
      fontFamily: F_UI,
      color: MUTED
    },
    children: "Loading rosters\u2026"
  });
  if (err && !data) return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: 40,
      fontFamily: F_UI,
      color: INK
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
      style: {
        fontFamily: F_HEAD
      },
      children: "Rosters could not load"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: "#991B1B"
      },
      children: err
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn("primary"),
      onClick: () => load(div),
      children: "Try again"
    })]
  });
  const rowFor = id => stats.rows.find(r => r.id === id);
  const stageIdx = STAGES.findIndex(s => s.key === data.stage);
  const blockList = (0, _rosterEngine.blockers)(data.gate),
    warnList = (0, _rosterEngine.warnings)(data.gate);
  const planned = cfg.planned_teams || 0;
  const createPlanned = async () => {
    if (guard()) return;
    const want = Math.max(0, planned - teams.length);
    if (!want) return;
    const names = (0, _rosterEngine.plannedTeamNames)(teams.map(t => t.name), want);
    let made = 0;
    try {
      for (const n of names) {
        await call("/rosters/teams", "POST", {
          division: data.division,
          name: n
        });
        made++;
      }
      flash(`Created ${made} team${made === 1 ? "" : "s"}.`);
    } catch (e) {
      flash(`${made ? `Created ${made}, then stopped: ` : ""}${e.message}`, "err");
    }
  };
  const runFix = act => {
    if (act === "newteams") {
      planned > teams.length ? createPlanned() : setModal({
        kind: "newteam"
      });
    } else if (act === "balance") setModal({
      kind: "balance",
      mode: pool.length && teams.some(t => t.players.length) ? "fill" : "rebalance"
    });else if (act === "swaps") setModal({
      kind: "swaps"
    });else if (act === "lockall") lockAll(true);
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gr",
    style: {
      fontFamily: F_UI,
      color: INK,
      padding: "16px 20px 60px",
      maxWidth: 1700,
      margin: "0 auto"
    },
    onDragEnd: () => {
      setDrag(null);
      setHover(null);
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `.gr button:disabled{opacity:.4;cursor:not-allowed}.gr button:focus-visible,.gr select:focus-visible,.gr input:focus-visible{outline:3px solid ${GOLD};outline-offset:2px}.gr .gr-key{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px;color:${MUTED};background:${PAPER};border-radius:8px;padding:8px 10px;margin-bottom:8px}@media print{body *{visibility:hidden!important}.grsh-print,.grsh-print *{visibility:visible!important}.grsh-print{position:absolute;left:0;top:0;width:100%}}`
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
        style: {
          margin: 0,
          fontFamily: F_HEAD,
          fontSize: 28
        },
        children: "Rosters"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        role: "status",
        "aria-live": "polite",
        style: {
          fontSize: 13,
          color: saving > 0 ? "#92400E" : savedAt ? "#166534" : MUTED,
          fontWeight: 600
        },
        children: saving > 0 ? "Saving…" : savedAt ? `✓ All changes saved ${savedAt}` : "Changes save automatically"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: {
          flex: 1
        }
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "tablist",
      style: {
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 12
      },
      children: data.divisions.map(d => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        role: "tab",
        "aria-selected": d.key === data.division,
        onClick: () => d.key !== data.division && load(d.key),
        style: {
          ...btn(d.key === data.division ? "primary" : "ghost"),
          display: "flex",
          gap: 8,
          alignItems: "center"
        },
        children: [d.label, /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          title: (0, _rosterEngine.divisionTabLabel)(d).title,
          style: {
            fontSize: 11,
            opacity: (0, _rosterEngine.divisionTabLabel)(d).muted ? .6 : .85
          },
          children: (0, _rosterEngine.divisionTabLabel)(d).text
        })]
      }, d.key))
    }), live && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#FEF3C7",
        border: "1px solid #F59E0B",
        color: "#92400E",
        padding: "10px 14px",
        borderRadius: 10,
        marginBottom: 12,
        fontSize: 14
      },
      children: ["The draft for this division is ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        children: data.draft_status
      }), ". Editing is off here until it finishes or is reset on the Draft page \u2014 otherwise the two pages would overwrite each other."]
    }), data.stage === "published" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#DCFCE7",
        border: "1px solid #86EFAC",
        color: "#166534",
        padding: "10px 14px",
        borderRadius: 10,
        marginBottom: 12,
        fontSize: 14
      },
      children: ["Published ", data.published.at, ". Rosters are read-only.", data.changes_since_publish > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [" ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
          children: [data.changes_since_publish, " roster move", data.changes_since_publish > 1 ? "s were" : " was", " made after publishing."]
        }), " Open Activity to see them, then resend the emails if players should be told."]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 6,
        marginBottom: 12,
        flexWrap: "wrap"
      },
      children: [STAGES.map((s, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        onClick: () => setModal({
          kind: "publish",
          focus: s.key
        }),
        style: {
          ...btn("ghost"),
          background: i === stageIdx ? "#FFF8E1" : i < stageIdx ? "#DCFCE7" : WHITE,
          borderColor: i === stageIdx ? GOLD : LINE
        },
        children: [i < stageIdx ? "✓ " : `${i + 1}. `, s.label]
      }, s.key)), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: {
          fontSize: 12,
          color: SOFT,
          alignSelf: "center",
          marginLeft: 6
        },
        children: "Click a step to open its checklist."
      })]
    }), blockList.length > 0 && data.stage !== "published" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "region",
      "aria-label": "What blocks publishing",
      style: {
        background: "#FEF2F2",
        border: "1px solid #FCA5A5",
        borderRadius: 10,
        padding: "8px 12px",
        marginBottom: 12,
        fontSize: 13
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
        style: {
          color: "#991B1B"
        },
        children: [blockList.length, " thing", blockList.length > 1 ? "s" : "", " to fix before you can publish"]
      }), blockList.map(b => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginTop: 4
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          style: {
            flex: 1
          },
          children: ["\u26D4 ", b.text]
        }), b.fix && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn("ghost", {
            padding: "3px 9px",
            fontSize: 12
          }),
          onClick: () => runFix(b.fix.act),
          children: b.fix.label
        })]
      }, b.key))]
    }), !blockList.length && warnList.length > 0 && data.stage !== "published" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#FFFBEB",
        border: "1px solid #FCD34D",
        borderRadius: 10,
        padding: "6px 12px",
        marginBottom: 12,
        fontSize: 13,
        color: "#92400E"
      },
      children: ["Nothing blocks publishing. ", warnList.length, " thing", warnList.length > 1 ? "s" : "", " worth a look: ", warnList.slice(0, 2).map(w => w.text).join("; "), warnList.length > 2 ? "…" : "", " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        className: "gr-link",
        style: {
          background: "none",
          border: 0,
          color: "#92400E",
          textDecoration: "underline",
          cursor: "pointer",
          fontSize: 13
        },
        onClick: () => setModal({
          kind: "publish",
          focus: "review"
        }),
        children: "See all"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        position: "sticky",
        top: 32,
        zIndex: 50,
        background: PAPER,
        paddingBottom: 8
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          background: WHITE,
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            flex: 1,
            minWidth: 260
          },
          children: [teams.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              color: SOFT,
              fontSize: 13
            },
            children: "Balance appears once teams have players."
          }), teams.map(t => {
            const r = rowFor(t.id),
              b = BAND[(0, _rosterEngine.bandOf)(r?.parity ?? null, th)];
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              title: `${t.name}: average score ${r?.raw?.toFixed(1) ?? "—"}, balance ${r?.parity?.toFixed(0) ?? "—"}`,
              style: {
                minWidth: 110
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  fontWeight: 700
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    color: t.colour
                  },
                  children: t.name
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: F_NUM,
                    color: b.color
                  },
                  children: r?.parity === null || r?.parity === undefined ? "—" : r.parity.toFixed(0)
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  height: 8,
                  background: "#EEE",
                  borderRadius: 4,
                  overflow: "hidden"
                },
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    width: `${Math.min(100, r?.norm ?? 0)}%`,
                    height: "100%",
                    background: t.colour
                  }
                })
              })]
            }, t.id);
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontSize: 12,
            color: MUTED,
            textAlign: "right"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: ["Spread ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              style: {
                fontFamily: F_NUM
              },
              children: (0, _rosterEngine.spreadOf)(stats).toFixed(1)
            }), " pts"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [pool.length, " unassigned \xB7 target ", target, "/team"]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            gap: 6,
            flexWrap: "wrap"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("primary"),
            disabled: readOnly || !teams.length,
            title: (0, _rosterEngine.whyDisabled)("balance", {
              readOnly,
              teams: teams.length
            }),
            onClick: () => setModal({
              kind: "balance",
              mode: pool.length && teams.some(t => t.players.length) ? "fill" : "rebalance"
            }),
            children: "Auto-balance\u2026"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            disabled: readOnly || teams.length < 2,
            title: (0, _rosterEngine.whyDisabled)("swaps", {
              readOnly,
              teams: teams.length
            }) || "Find one-for-one swaps that even out the teams",
            onClick: () => setModal({
              kind: "swaps"
            }),
            children: "Find swaps"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            style: btn(),
            disabled: !undo.length || readOnly,
            onClick: doUndo,
            title: (0, _rosterEngine.whyDisabled)("undo", {
              readOnly,
              undo: undo.length
            }) || "Ctrl+Z",
            children: ["Undo", undo.length ? ` (${undo.length})` : ""]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            style: btn(),
            onClick: () => setModal({
              kind: "plans"
            }),
            children: ["Plans (", data.plans.length, ")"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            style: btn(),
            onClick: () => setModal({
              kind: "rules"
            }),
            title: "Every player with a lock, rule or captain role",
            children: ["Rules & locks", lockSum.broken > 0 ? ` (${lockSum.broken} broken)` : lockSum.held ? ` (${lockSum.held} 🔒)` : ""]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => setModal({
              kind: "activity"
            }),
            children: "Activity"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => setModal({
              kind: "print"
            }),
            children: "Print / Reveal"
          })]
        })]
      }), violations.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          marginTop: 6,
          fontSize: 12,
          color: "#92400E",
          background: "#FEF3C7",
          borderRadius: 8,
          padding: "6px 10px"
        },
        children: [violations.length, " keep-together / keep-apart rule", violations.length > 1 ? "s are" : " is", " broken:", " ", violations.slice(0, 3).map(v => `${fullName(byId.get(v.a) || {
          first_name: "?",
          last_name: ""
        })} ${v.type === "together" ? "&" : "≠"} ${fullName(byId.get(v.b) || {
          first_name: "?",
          last_name: ""
        })}`).join("; ")]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 340px",
        gap: 16,
        alignItems: "start"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))",
          gap: 12
        },
        children: [teams.map(t => {
          const r = rowFor(t.id),
            band = (0, _rosterEngine.bandOf)(r?.parity ?? null, th),
            b = BAND[band];
          const h = (0, _rosterEngine.teamHealth)(t, teams, pins, cfg, th, MAX);
          const slots = (0, _rosterEngine.fillSlots)(t, template);
          const isHover = hover === t.id && drag;
          const sg = suggestTeam === t.id ? (0, _rosterEngine.suggestFor)(t, teams, pool, pins, cfg, MAX, 3) : null;
          return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            onDragOver: e => {
              if (drag && !readOnly) {
                e.preventDefault();
                setHover(t.id);
              }
            },
            onDragLeave: () => setHover(x => x === t.id ? null : x),
            onDrop: e => {
              e.preventDefault();
              dropOn(t.id);
            },
            style: {
              background: WHITE,
              border: `2px solid ${isHover ? GOLD : LINE}`,
              borderTop: `5px solid ${t.colour}`,
              borderRadius: 12,
              padding: 10,
              opacity: t.locked ? 0.92 : 1
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  flex: 1,
                  fontFamily: F_HEAD,
                  fontSize: 18,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                },
                children: [t.locked && "🔒 ", t.name]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                title: "Balance vs. the other teams",
                style: chip(b),
                children: [b.label, r?.parity != null ? ` ${r.parity.toFixed(0)}` : ""]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 10,
                fontSize: 12,
                color: MUTED,
                margin: "4px 0 8px",
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                children: [t.players.length, "/", target, " players"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                children: ["Avg score ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  style: {
                    fontFamily: F_NUM
                  },
                  children: r?.raw != null ? r.raw.toFixed(1) : "—"
                })]
              }), h.score !== null && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                title: h.issues.join(" · ") || "No issues",
                children: ["Health ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  style: {
                    fontFamily: F_NUM,
                    color: h.score >= 80 ? "#166534" : h.score >= 60 ? "#92400E" : "#991B1B"
                  },
                  children: h.score
                })]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                display: "flex",
                gap: 4,
                margin: "0 0 8px",
                flexWrap: "wrap"
              },
              "aria-label": "Players by position",
              children: (0, _rosterEngine.positionNeeds)(t, cfg).map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                title: `${x.label}: ${x.have}${x.need ? ` (needs ${x.need})` : ""}`,
                style: chip(x.tone === "bad" ? {
                  bg: "#FEE2E2",
                  color: "#991B1B"
                } : x.tone === "warn" ? {
                  bg: "#FEF3C7",
                  color: "#92400E"
                } : {
                  bg: "#F3F4F6",
                  color: MUTED
                }, {
                  fontFamily: F_NUM
                }),
                children: [x.short, " ", x.have, x.need && x.tone !== "ok" ? `/${x.need}` : ""]
              }, x.pos))
            }), isHover && proj && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                background: "#FFF8E1",
                border: `1px dashed ${GOLD}`,
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 12,
                marginBottom: 8
              },
              children: ["If dropped here: balance ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: proj.before?.parity != null ? proj.before.parity.toFixed(0) : "—"
              }), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: proj.after?.parity != null ? proj.after.parity.toFixed(0) : "—"
              }), " ", "(", BAND[(0, _rosterEngine.bandOf)(proj.after?.parity ?? null, th)].label, "), avg ", proj.after?.raw != null ? proj.after.raw.toFixed(1) : "—"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                display: "grid",
                gap: 4
              },
              children: slots.map(s => s.player ? /*#__PURE__*/(0, _jsxRuntime.jsx)(PlayerRow, {
                p: s.player,
                dense: true,
                captain: t.captain_player_id === s.player.id,
                pinned: pinned.has(s.player.id),
                held: heldSet.has(s.player.id),
                selected: peek === s.player.id,
                draggable: !readOnly && !t.locked && !heldSet.has(s.player.id),
                onPeek: p => setPeek(p.id),
                onDragStart: e => {
                  e.dataTransfer.setData("text/plain", String(s.player.id));
                  e.dataTransfer.effectAllowed = "move";
                  setDrag(s.player.id);
                },
                onDragEnd: () => {
                  setDrag(null);
                  setHover(null);
                }
              }, s.player.id) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                disabled: readOnly || t.locked,
                onClick: () => setSuggestTeam(suggestTeam === t.id ? null : t.id),
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 8px",
                  border: `1.5px dashed ${s.slot.pos ? "#C9C6BA" : "#E5E3DB"}`,
                  borderRadius: 8,
                  background: "transparent",
                  color: SOFT,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: F_UI,
                  textAlign: "left"
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    ...chip({
                      bg: "#F3F4F6",
                      color: SOFT
                    }),
                    width: 20,
                    textAlign: "center",
                    padding: "2px 0"
                  },
                  children: _rosterEngine.POS_SHORT[s.slot.pos] || "+"
                }), s.slot.label, " needed"]
              }, s.slot.key))
            }), sg && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                marginTop: 8,
                borderTop: `1px solid ${LINE}`,
                paddingTop: 8
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontSize: 11,
                  fontWeight: 700,
                  color: SOFT,
                  marginBottom: 4
                },
                children: "BEST FITS FROM THE POOL"
              }), sg.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontSize: 12,
                  color: SOFT
                },
                children: "No one in the pool fits."
              }), sg.map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    flex: 1,
                    fontSize: 12
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: fullName(x.player)
                  }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    style: {
                      color: SOFT
                    },
                    children: ["\u2014 ", x.reasons[0]]
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  style: btn("ghost", {
                    padding: "3px 8px",
                    fontSize: 12
                  }),
                  onClick: () => doMoves([{
                    player_id: x.player.id,
                    team_id: t.id
                  }], {
                    note: `${fullName(x.player)} → ${t.name}`
                  }),
                  children: "Add"
                })]
              }, x.player.id))]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 6,
                marginTop: 8,
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: btn("ghost", {
                  padding: "4px 8px",
                  fontSize: 12
                }),
                disabled: readOnly,
                onClick: () => patchTeam(t.id, {
                  draft_locked: !t.locked
                }),
                children: t.locked ? "Unlock" : "Lock"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: btn("ghost", {
                  padding: "4px 8px",
                  fontSize: 12
                }),
                disabled: readOnly || t.locked,
                onClick: () => setModal({
                  kind: "teamedit",
                  team: t
                }),
                children: "Edit"
              }), h.issues.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                title: h.issues.join(" · "),
                style: {
                  fontSize: 11,
                  color: "#92400E",
                  alignSelf: "center"
                },
                children: ["\u26A0 ", h.issues[0], h.issues.length > 1 ? ` +${h.issues.length - 1}` : ""]
              })]
            })]
          }, t.id);
        }), !readOnly && teams.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            gridColumn: "1 / -1",
            background: WHITE,
            border: `2px dashed ${LINE}`,
            borderRadius: 12,
            padding: "28px 20px",
            textAlign: "center"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              fontFamily: F_HEAD,
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 6
            },
            children: ["No teams in ", data.division_label, " yet"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "0 auto 14px",
              maxWidth: 460,
              fontSize: 14,
              color: MUTED
            },
            children: planned ? `Settings plans ${planned} team${planned === 1 ? "" : "s"} for this division. Create them now, then drag players from the list on the right, or let Auto-balance fill them.` : "Add a team, then drag players from the list on the right, or let Auto-balance fill it."
          }), planned > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            style: btn("primary", {
              marginRight: 8
            }),
            onClick: createPlanned,
            children: ["Create ", planned, " team", planned === 1 ? "" : "s"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => setModal({
              kind: "newteam"
            }),
            children: "Add one team"
          })]
        }), !readOnly && teams.length > 0 && planned > teams.length && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          onClick: createPlanned,
          style: {
            border: `2px dashed ${GOLD}`,
            borderRadius: 12,
            background: "#FFFBEB",
            color: INK,
            minHeight: 60,
            cursor: "pointer",
            fontFamily: F_UI,
            fontSize: 14,
            fontWeight: 600
          },
          children: ["Create the other ", planned - teams.length, " planned team", planned - teams.length === 1 ? "" : "s"]
        }), !readOnly && teams.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          onClick: () => setModal({
            kind: "newteam"
          }),
          style: {
            border: `2px dashed ${LINE}`,
            borderRadius: 12,
            background: "transparent",
            color: MUTED,
            minHeight: 120,
            cursor: "pointer",
            fontFamily: F_UI,
            fontSize: 14,
            fontWeight: 600
          },
          children: ["+ Add team", cfg.planned_teams ? ` (${teams.length}/${cfg.planned_teams} planned)` : ""]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        onDragOver: e => {
          if (drag && !readOnly) {
            e.preventDefault();
            setHover("pool");
          }
        },
        onDrop: e => {
          e.preventDefault();
          dropOn("pool");
        },
        style: {
          position: "sticky",
          top: 168,
          maxHeight: "calc(100vh - 190px)",
          display: "flex",
          flexDirection: "column",
          background: WHITE,
          border: `2px solid ${hover === "pool" && drag ? GOLD : LINE}`,
          borderRadius: 12
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            padding: "10px 10px 6px"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "baseline",
              gap: 8
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: F_HEAD,
                fontSize: 18,
                fontWeight: 700,
                flex: 1
              },
              children: "Unassigned"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontSize: 12,
                color: SOFT
              },
              children: [pool.length, " players"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              "aria-expanded": keyOpen,
              onClick: () => setKeyOpen(!keyOpen),
              style: btn("ghost", {
                padding: "2px 8px",
                fontSize: 12
              }),
              title: "What the dots, chips and numbers mean",
              children: "Key"
            })]
          }), keyOpen && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gr-key",
            role: "note",
            style: {
              marginTop: 8
            },
            children: _rosterEngine.KEY_ITEMS.map(k => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "contents"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                style: {
                  fontFamily: F_NUM
                },
                children: k.mark
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
                  children: [k.label, "."]
                }), " ", k.text]
              })]
            }, k.label))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              margin: "8px 0"
            },
            children: [["all", "All"], ["goaltender", "Goalies"], ["defenseman", "Defense"], ["center", "Center"], ["winger", "Wing"]].map(([k, l]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              onClick: () => setPosF(k),
              style: {
                ...btn(posF === k ? "primary" : "ghost"),
                padding: "3px 8px",
                fontSize: 12
              },
              children: [l, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  fontFamily: F_NUM,
                  opacity: .8
                },
                children: counts[k]
              })]
            }, k))
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 6
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              value: q,
              onChange: e => setQ(e.target.value),
              placeholder: "Search name\u2026",
              "aria-label": "Search players",
              style: {
                flex: 1,
                padding: "6px 8px",
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                fontFamily: F_UI,
                fontSize: 13
              }
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
              value: sortBy,
              onChange: e => setSortBy(e.target.value),
              "aria-label": "Sort pool",
              style: {
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                fontSize: 13,
                padding: "0 8px",
                minWidth: 104
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                value: "score",
                children: "Score \u2193"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                value: "name",
                children: "Name"
              })]
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            overflowY: "auto",
            padding: "4px 10px 10px",
            display: "grid",
            gap: 4
          },
          children: [shownPool.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: 13,
              color: SOFT,
              padding: 12,
              textAlign: "center"
            },
            children: pool.length === 0 ? "Everyone is on a team." : "No one matches that filter."
          }), shownPool.map(p => /*#__PURE__*/(0, _jsxRuntime.jsx)(PlayerRow, {
            p: p,
            dense: true,
            pinned: pinned.has(p.id),
            selected: peek === p.id,
            draggable: !readOnly,
            onPeek: x => setPeek(x.id),
            onDragStart: e => {
              e.dataTransfer.setData("text/plain", String(p.id));
              e.dataTransfer.effectAllowed = "move";
              setDrag(p.id);
            },
            onDragEnd: () => {
              setDrag(null);
              setHover(null);
            }
          }, p.id))]
        })]
      })]
    }), peek && byId.get(peek) && /*#__PURE__*/(0, _jsxRuntime.jsx)(PeekCard, {
      p: byId.get(peek),
      teams: teams,
      pins: pins,
      held: heldSet.has(peek),
      onLock: () => toggleLock(peek),
      byId: byId,
      allPlayers: allPlayers,
      teamOf: teamOf,
      readOnly: readOnly,
      onClose: () => setPeek(null),
      onMove: tid => {
        const pl = byId.get(peek);
        const lb = (0, _rosterEngine.lockBlock)(peek, tid, teams, locks);
        if (lb) {
          flash(lb, "err");
          return;
        }
        const t = tid === null ? null : teams.find(x => x.id === tid);
        doMoves([{
          player_id: peek,
          team_id: tid
        }], {
          note: `${fullName(pl)} → ${t ? t.name : "pool"}`
        });
      },
      onCaptain: t => setCaptain(t, byId.get(peek)),
      onPins: savePins
    }), modal?.kind === "newteam" && /*#__PURE__*/(0, _jsxRuntime.jsx)(TextModal, {
      title: "Add a team",
      label: "Team name",
      cta: "Add team",
      onClose: () => setModal(null),
      onSubmit: async v => {
        await addTeam(v);
        setModal(null);
      }
    }), modal?.kind === "teamedit" && /*#__PURE__*/(0, _jsxRuntime.jsx)(TeamEditModal, {
      team: modal.team,
      onClose: () => setModal(null),
      onSave: async b => {
        await patchTeam(modal.team.id, b);
        setModal(null);
      },
      onDelete: async () => {
        setModal(null);
        await delTeam(modal.team);
      }
    }), modal?.kind === "balance" && /*#__PURE__*/(0, _jsxRuntime.jsx)(BalanceModal, {
      teams: teams,
      pool: pool,
      pins: pins,
      locks: locks,
      cfg: cfg,
      th: th,
      MAX: MAX,
      initialMode: modal.mode,
      onClose: () => setModal(null),
      onApply: async moves => {
        setModal(null);
        if (moves.length) {
          const ok = await doMoves(moves.map(m => ({
            player_id: m.player_id,
            team_id: m.to
          })), {
            type: "auto",
            note: `Auto-balance (${moves.length} moves)`
          });
          if (ok) flash(`Applied ${moves.length} move${moves.length > 1 ? "s" : ""}. Undo is available.`);
        }
      }
    }), modal?.kind === "swaps" && /*#__PURE__*/(0, _jsxRuntime.jsx)(SwapsModal, {
      teams: teams,
      pins: pins,
      locks: locks,
      cfg: cfg,
      MAX: MAX,
      onClose: () => setModal(null),
      onApply: async s => {
        setModal(null);
        await doMoves([{
          player_id: s.a.id,
          team_id: s.teamB
        }, {
          player_id: s.b.id,
          team_id: s.teamA
        }], {
          note: `Swap ${fullName(s.a)} ⇄ ${fullName(s.b)}`
        });
      }
    }), modal?.kind === "plans" && /*#__PURE__*/(0, _jsxRuntime.jsx)(PlansModal, {
      plans: data.plans,
      readOnly: readOnly,
      byId: byId,
      teams: teams,
      MAX: MAX,
      onClose: () => setModal(null),
      onSave: async name => {
        try {
          await call("/rosters/plans", "POST", {
            division: data.division,
            name
          });
          flash("Plan saved");
        } catch (e) {
          flash(e.message, "err");
        }
      },
      onRestore: async id => {
        if (guard()) return;
        try {
          await call("/rosters/plans/restore", "POST", {
            division: data.division,
            plan_id: id
          });
          setUndo([]);
          flash("Plan restored");
          setModal(null);
        } catch (e) {
          flash(e.message, "err");
        }
      },
      onDelete: async id => {
        try {
          await call(`/rosters/plans/${id}`, "DELETE");
        } catch (e) {
          flash(e.message, "err");
        }
      }
    }), modal?.kind === "publish" && /*#__PURE__*/(0, _jsxRuntime.jsx)(PublishModal, {
      data: data,
      readOnly: readOnly,
      teams: teams,
      onClose: () => setModal(null),
      call: call,
      flash: flash,
      lockAll: lockAll
    }), modal?.kind === "rules" && /*#__PURE__*/(0, _jsxRuntime.jsx)(RulesModal, {
      sum: lockSum,
      readOnly: readOnly,
      onClose: () => setModal(null),
      onPeek: id => {
        setModal(null);
        setPeek(id);
      },
      onUnlock: id => toggleLock(id),
      onRemoveRule: (a, b) => savePins(pins.filter(x => !(x.a === a && x.b === b || x.a === b && x.b === a)))
    }), modal?.kind === "activity" && /*#__PURE__*/(0, _jsxRuntime.jsx)(ActivityModal, {
      division: data.division,
      call: call,
      onClose: () => setModal(null)
    }), modal?.kind === "print" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: "Print rosters / Reveal",
      onClose: () => setModal(null),
      width: 440,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          marginTop: 0,
          color: MUTED,
          fontSize: 14
        },
        children: "Print one clean card per team (names and positions only \u2014 no emails, ages, or payment info), or run a reveal where each team's players appear one click at a time."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 8
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn("primary"),
          onClick: () => {
            setModal(null);
            setPrinting(true);
            window.setTimeout(() => {
              window.print();
              setPrinting(false);
            }, 150);
          },
          children: "Print roster cards"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn(),
          onClick: () => {
            setModal(null);
            setReveal({
              i: 0,
              shown: 0
            });
          },
          children: "Start reveal"
        })]
      })]
    }), printing && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "grsh-print",
      style: {
        position: "fixed",
        inset: 0,
        background: WHITE,
        zIndex: 99999,
        padding: 24,
        overflow: "auto"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h1", {
        style: {
          fontFamily: F_HEAD
        },
        children: [data.division_label, " \u2014 Rosters"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(2,1fr)",
          gap: 16
        },
        children: teams.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            border: `2px solid ${t.colour}`,
            borderRadius: 10,
            padding: 12,
            breakInside: "avoid"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              margin: "0 0 8px",
              fontFamily: F_HEAD,
              color: t.colour
            },
            children: t.name
          }), [...t.players].sort((a, b) => a.last_name.localeCompare(b.last_name)).map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 8,
              padding: "2px 0",
              fontSize: 14
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                width: 54,
                color: SOFT
              },
              children: _rosterEngine.POS_LABEL[effPos(p)] || ""
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              children: [fullName(p), t.captain_player_id === p.id ? " (C)" : ""]
            })]
          }, p.id))]
        }, t.id))
      })]
    }), reveal && teams[reveal.i] && /*#__PURE__*/(0, _jsxRuntime.jsx)(RevealView, {
      teams: teams,
      state: reveal,
      setState: setReveal
    }), toast && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "status",
      style: {
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: toast.kind === "err" ? "#991B1B" : INK,
        color: WHITE,
        padding: "10px 18px",
        borderRadius: 10,
        zIndex: 100001,
        fontSize: 14,
        maxWidth: "80vw"
      },
      children: toast.msg
    })]
  });
}

// ─── peek card ───────────────────────────────────────────────────────────────
function PeekCard({
  p,
  teams,
  pins,
  held,
  onLock,
  byId,
  allPlayers,
  teamOf,
  readOnly,
  onClose,
  onMove,
  onCaptain,
  onPins
}) {
  const tier = (0, _rosterEngine.tierOf)(p),
    bd = (0, _playerScoring.scoreBreakdown)(tier, p.years_experience || 0, 0),
    cur = teamOf[p.id] ?? null,
    team = teams.find(t => t.id === cur);
  const mine = pins.filter(x => x.a === p.id || x.b === p.id);
  const [other, setOther] = (0, _react.useState)(""),
    [type, setType] = (0, _react.useState)("together");
  const others = allPlayers.filter(x => x.id !== p.id).sort((a, b) => a.last_name.localeCompare(b.last_name));
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      position: "fixed",
      top: 40,
      right: 0,
      bottom: 0,
      width: 330,
      background: WHITE,
      borderLeft: `1px solid ${LINE}`,
      boxShadow: "-8px 0 30px rgba(0,0,0,.12)",
      zIndex: 90000,
      padding: 16,
      overflowY: "auto",
      fontFamily: F_UI,
      color: INK
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        alignItems: "center"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        style: {
          margin: 0,
          fontFamily: F_HEAD,
          fontSize: 20,
          flex: 1
        },
        children: fullName(p)
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("ghost", {
          padding: "3px 9px"
        }),
        onClick: onClose,
        "aria-label": "Close player card",
        children: "\u2715"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        margin: "8px 0"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(PosDot, {
        p: p
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        style: chip(TIER_COLOR(tier)),
        children: ["Tier ", tier || "—"]
      }), (0, _playerScoring.formatReturningBadge)((p.returning_seasons || []).length) && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: chip({
          bg: "#F3E8FF",
          color: "#6B21A8"
        }),
        children: (0, _playerScoring.formatReturningBadge)((p.returning_seasons || []).length)
      }), p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: chip({
          bg: "#FEE2E2",
          color: "#991B1B"
        }),
        children: "Sandbagging flag"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("table", {
      style: {
        width: "100%",
        fontSize: 13,
        borderCollapse: "collapse"
      },
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
        children: [["Score", (0, _rosterEngine.scoreOf)(p).toFixed(1)], ["Age", p.age ?? "—"], ["Years played", p.years_experience ?? "—"], ["Payment", p.payment_status], ["Returning seasons", (p.returning_seasons || []).length ? p.returning_seasons.join(", ") : "New"], ["Team", team ? team.name : "Unassigned"]].map(([k, v]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: {
              padding: "4px 0",
              color: SOFT
            },
            children: k
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: {
              padding: "4px 0",
              textAlign: "right",
              fontWeight: 600
            },
            children: v
          })]
        }, k))
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: PAPER,
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        margin: "10px 0",
        color: MUTED
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        children: "How the score is built:"
      }), " tier ", bd.tierValue, " + years ", bd.yearsContrib, " (", bd.yearsCapped, " yrs \xF7 5) = ", (0, _rosterEngine.scoreOf)(p).toFixed(1), _playerScoring.TIER_DESCRIPTIONS?.[tier] && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          marginTop: 4
        },
        children: _playerScoring.TIER_DESCRIPTIONS[tier]
      })]
    }), !readOnly && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: SOFT
        },
        children: "MOVE TO"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
        value: cur ?? "",
        onChange: e => onMove(e.target.value === "" ? null : Number(e.target.value)),
        style: {
          width: "100%",
          padding: 8,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          margin: "4px 0 8px",
          fontSize: 14
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "",
          children: "Unassigned (pool)"
        }), teams.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
          value: t.id,
          disabled: t.locked && t.id !== cur,
          children: [t.name, t.locked ? " (locked)" : ""]
        }, t.id))]
      }), team && !team.locked && /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: {
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          fontSize: 13,
          margin: "2px 0 10px",
          cursor: "pointer"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "checkbox",
          checked: !!held,
          onChange: onLock,
          style: {
            marginTop: 3
          }
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
            children: ["\uD83D\uDD12 Lock to ", team.name]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("br", {}), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              color: SOFT,
              fontSize: 12
            },
            children: "Auto-balance and swaps will leave this player here, and moving them by hand is blocked until you untick this."
          })]
        })]
      }), team && !team.locked && team.captain_player_id !== p.id && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        style: btn("ghost", {
          marginBottom: 10
        }),
        onClick: () => onCaptain(team),
        children: ["Make captain of ", team.name]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: SOFT,
          margin: "10px 0 4px"
        },
        children: "KEEP TOGETHER / APART"
      }), mine.map((x, i) => {
        const o = byId.get(x.a === p.id ? x.b : x.a);
        return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            marginBottom: 4
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: chip(x.type === "together" ? {
              bg: "#DCFCE7",
              color: "#166534"
            } : {
              bg: "#FEE2E2",
              color: "#991B1B"
            }),
            children: x.type === "together" ? "Together" : "Apart"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              flex: 1
            },
            children: o ? fullName(o) : "?"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("ghost", {
              padding: "2px 7px"
            }),
            onClick: () => onPins(pins.filter(y => y !== x)),
            "aria-label": "Remove rule",
            children: "\u2715"
          })]
        }, i);
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 4,
          marginTop: 6
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: type,
          onChange: e => setType(e.target.value),
          style: {
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: 6,
            fontSize: 13
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "together",
            children: "Together with"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "apart",
            children: "Apart from"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: other,
          onChange: e => setOther(e.target.value),
          style: {
            flex: 1,
            minWidth: 0,
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: 6,
            fontSize: 13
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "",
            children: "Pick a player\u2026"
          }), others.map(o => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: o.id,
            children: fullName(o)
          }, o.id))]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn("primary", {
            padding: "5px 10px"
          }),
          disabled: !other,
          onClick: () => {
            onPins([...pins.filter(y => !(y.a === p.id && y.b === Number(other) || y.b === p.id && y.a === Number(other))), {
              a: p.id,
              b: Number(other),
              type
            }]);
            setOther("");
          },
          children: "Add"
        })]
      })]
    })]
  });
}

// ─── modals ──────────────────────────────────────────────────────────────────
function TextModal({
  title,
  label,
  cta,
  onClose,
  onSubmit
}) {
  const [v, setV] = (0, _react.useState)("");
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(Modal, {
    title: title,
    onClose: onClose,
    width: 400,
    footer: /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        onClick: onClose,
        children: "Cancel"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("primary"),
        disabled: !v.trim(),
        onClick: () => onSubmit(v.trim()),
        children: cta
      })]
    }),
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      style: {
        fontSize: 13,
        fontWeight: 600
      },
      children: [label, /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        autoFocus: true,
        value: v,
        onChange: e => setV(e.target.value),
        onKeyDown: e => {
          if (e.key === "Enter" && v.trim()) onSubmit(v.trim());
        },
        style: {
          display: "block",
          width: "100%",
          marginTop: 6,
          padding: 9,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          fontSize: 15,
          boxSizing: "border-box"
        }
      })]
    })
  });
}
function TeamEditModal({
  team,
  onClose,
  onSave,
  onDelete
}) {
  const [name, setName] = (0, _react.useState)(team.name),
    [colour, setColour] = (0, _react.useState)(team.colour || "#666666");
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: `Edit ${team.name}`,
    onClose: onClose,
    width: 420,
    footer: /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("danger"),
        onClick: onDelete,
        children: "Delete team"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: {
          flex: 1
        }
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        onClick: onClose,
        children: "Cancel"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("primary"),
        onClick: () => onSave({
          name,
          colour
        }),
        children: "Save"
      })]
    }),
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      style: {
        fontSize: 13,
        fontWeight: 600
      },
      children: ["Name", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        value: name,
        onChange: e => setName(e.target.value),
        style: {
          display: "block",
          width: "100%",
          marginTop: 6,
          padding: 9,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          fontSize: 15,
          boxSizing: "border-box"
        }
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        display: "block",
        marginTop: 12
      },
      children: ["Colour ", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        type: "color",
        value: colour,
        onChange: e => setColour(e.target.value),
        style: {
          verticalAlign: "middle",
          marginLeft: 8
        }
      })]
    })]
  });
}
function BalanceModal({
  teams,
  pool,
  pins,
  locks,
  cfg,
  th,
  MAX,
  initialMode,
  onClose,
  onApply
}) {
  const [mode, setMode] = (0, _react.useState)(initialMode);
  const prop = (0, _react.useMemo)(() => (0, _rosterEngine.proposeBalance)(teams, pool, pins, cfg, {
    mode,
    max: MAX,
    locks
  }), [teams, pool, pins, cfg, mode, MAX, locks]);
  const [off, setOff] = (0, _react.useState)({}); // player ids the user unticked
  (0, _react.useEffect)(() => setOff({}), [mode]);
  const accepted = (prop.moves || []).filter(m => !off[m.player_id]);
  const after = (0, _react.useMemo)(() => {
    const asg = (0, _rosterEngine.assignMap)(teams);
    accepted.forEach(m => {
      if (m.to === null) delete asg[m.player_id];else asg[m.player_id] = m.to;
    });
    const all = [...pool, ...teams.flatMap(t => t.players)];
    return teams.map(t => ({
      ...t,
      players: all.filter(p => asg[p.id] === t.id)
    }));
  }, [teams, pool, accepted]);
  const sBefore = (0, _rosterEngine.teamStats)(teams, MAX),
    sAfter = (0, _rosterEngine.teamStats)(after, MAX);
  const viol = (0, _rosterEngine.pinViolations)(pins, after);
  const nameOf = id => id === null ? "Pool" : teams.find(t => t.id === id)?.name || "?";
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Auto-balance",
    onClose: onClose,
    width: 700,
    footer: /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        onClick: onClose,
        children: "Cancel"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        style: btn("primary"),
        disabled: !accepted.length,
        onClick: () => onApply(accepted),
        children: ["Apply ", accepted.length, " move", accepted.length === 1 ? "" : "s"]
      })]
    }),
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 6,
        marginBottom: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(mode === "fill" ? "primary" : "ghost"),
        onClick: () => setMode("fill"),
        children: "Fill only (keep current rosters)"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(mode === "rebalance" ? "primary" : "ghost"),
        onClick: () => setMode("rebalance"),
        children: "Rebalance everything"
      })]
    }), prop.error ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: "#991B1B"
      },
      children: prop.error
    }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          margin: "0 0 8px",
          fontSize: 13,
          color: MUTED
        },
        children: "Nothing is saved until you press Apply. Untick any move you don't want. Locked teams are never touched. Goalies, keep-together and keep-apart rules are respected."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          fontSize: 14,
          marginBottom: 10
        },
        children: ["Spread between teams: ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          style: {
            fontFamily: F_NUM
          },
          children: (0, _rosterEngine.spreadOf)(sBefore).toFixed(1)
        }), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          style: {
            fontFamily: F_NUM
          },
          children: (0, _rosterEngine.spreadOf)(sAfter).toFixed(1)
        }), " pts"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 10
        },
        children: after.map(t => {
          const b = sBefore.rows.find(r => r.id === t.id),
            a = sAfter.rows.find(r => r.id === t.id),
            band = BAND[(0, _rosterEngine.bandOf)(a?.parity ?? null, th)];
          return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              padding: "5px 9px",
              fontSize: 12
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              style: {
                color: t.colour
              },
              children: t.name
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              children: [t.players.length, " players \xB7 avg ", a?.raw != null ? a.raw.toFixed(1) : "—"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                color: band.color
              },
              children: ["Balance ", b?.parity != null ? b.parity.toFixed(0) : "—", " \u2192 ", a?.parity != null ? a.parity.toFixed(0) : "—", " (", band.label, ")"]
            })]
          }, t.id);
        })
      }), viol.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          background: "#FEF3C7",
          color: "#92400E",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          marginBottom: 8
        },
        children: ["With your selection, ", viol.length, " keep-together / keep-apart rule(s) would be broken."]
      }), prop.moves.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          color: SOFT
        },
        children: "No changes proposed \u2014 this is already the best arrangement I can find."
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "grid",
          gap: 3
        },
        children: prop.moves.map(m => /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 13,
            padding: "4px 6px",
            borderRadius: 6,
            background: off[m.player_id] ? "#F9F9F6" : "#F6FAF6",
            cursor: "pointer"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
            type: "checkbox",
            checked: !off[m.player_id],
            onChange: () => setOff(o => ({
              ...o,
              [m.player_id]: !o[m.player_id]
            }))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(PosDot, {
            p: m.player
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              flex: 1
            },
            children: [fullName(m.player), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                color: SOFT
              },
              children: ["(", (0, _rosterEngine.tierOf)(m.player) || "—", ", ", (0, _rosterEngine.scoreOf)(m.player).toFixed(1), ")"]
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              color: SOFT
            },
            children: [nameOf(m.from), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              style: {
                color: INK
              },
              children: nameOf(m.to)
            })]
          })]
        }, m.player_id))
      })]
    })]
  });
}
function SwapsModal({
  teams,
  pins,
  locks,
  cfg,
  MAX,
  onClose,
  onApply
}) {
  const list = (0, _react.useMemo)(() => (0, _rosterEngine.findSwaps)(teams, pins, cfg, {
    limit: 6,
    max: MAX,
    locks
  }), [teams, pins, cfg, MAX, locks]);
  const nm = id => teams.find(t => t.id === id)?.name || "?";
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Swap finder",
    onClose: onClose,
    width: 620,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        marginTop: 0,
        fontSize: 13,
        color: MUTED
      },
      children: "One-for-one swaps between open teams that improve balance without breaking goalie or keep-together / keep-apart rules."
    }), list.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: SOFT
      },
      children: "No swap improves things. The teams are about as even as these players allow."
    }), list.map((s, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          flex: 1,
          fontSize: 13
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: fullName(s.a)
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              color: SOFT
            },
            children: ["(", nm(s.teamA), ", ", (0, _rosterEngine.scoreOf)(s.a).toFixed(1), ")"]
          }), " \u21C4 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: fullName(s.b)
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              color: SOFT
            },
            children: ["(", nm(s.teamB), ", ", (0, _rosterEngine.scoreOf)(s.b).toFixed(1), ")"]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            color: MUTED,
            fontSize: 12
          },
          children: ["Spread ", s.spreadBefore.toFixed(1), " \u2192 ", s.spreadAfter.toFixed(1), " pts", s.samePos ? " · same position" : " · different positions"]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            color: SOFT,
            fontSize: 12,
            marginTop: 2
          },
          children: (0, _rosterEngine.explainSwap)(s, teams, MAX)
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("primary"),
        onClick: () => onApply(s),
        children: "Apply"
      })]
    }, i))]
  });
}
function PlansModal({
  plans,
  readOnly,
  byId,
  teams,
  MAX,
  onClose,
  onSave,
  onRestore,
  onDelete
}) {
  const [name, setName] = (0, _react.useState)("");
  const [cmp, setCmp] = (0, _react.useState)(null); // { id, against }
  const nm = id => id === null ? "Unassigned" : (teams.find(t => t.id === id) || {}).name || "?";
  const shown = (0, _react.useMemo)(() => {
    if (!cmp) return null;
    const pl = plans.find(x => x.id === cmp.id);
    if (!pl) return null;
    const other = cmp.against === "now" ? (0, _rosterEngine.currentAssign)(teams) : (plans.find(x => x.id === cmp.against) || {}).assign || {};
    return {
      pl,
      other,
      res: (0, _rosterEngine.comparePlans)(other, pl.assign || {}, byId, teams, MAX)
    };
  }, [cmp, plans, teams, byId, MAX]);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Plans (saved versions)",
    onClose: onClose,
    width: 520,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        marginTop: 0,
        fontSize: 13,
        color: MUTED
      },
      children: "Save the current rosters under a name to try another idea, then come back to it. Restoring only moves players \u2014 it never deletes anyone."
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 6,
        marginBottom: 12
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        value: name,
        onChange: e => setName(e.target.value),
        placeholder: "e.g. Balanced v2",
        style: {
          flex: 1,
          padding: 8,
          border: `1px solid ${LINE}`,
          borderRadius: 8
        }
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("primary"),
        onClick: () => {
          onSave(name);
          setName("");
        },
        children: "Save current"
      })]
    }), plans.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: SOFT,
        fontSize: 13
      },
      children: "No saved plans yet."
    }), shown && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: PAPER,
        borderRadius: 10,
        padding: 10,
        marginBottom: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: 13
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: shown.pl.name
        }), " compared with", /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: cmp.against,
          onChange: e => setCmp({
            ...cmp,
            against: e.target.value
          }),
          "aria-label": "Compare with",
          style: {
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: "3px 6px"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "now",
            children: "the rosters right now"
          }), plans.filter(x => x.id !== cmp.id).map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: x.id,
            children: x.name
          }, x.id))]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          fontSize: 13,
          margin: "6px 0"
        },
        children: ["Spread ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          style: {
            fontFamily: F_NUM
          },
          children: shown.res.spreadFrom.toFixed(1)
        }), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          style: {
            fontFamily: F_NUM
          },
          children: shown.res.spreadTo.toFixed(1)
        }), " pts if you restore it. ", shown.res.moves.length, " player", shown.res.moves.length === 1 ? "" : "s", " would move."]
      }), shown.res.moves.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          fontSize: 13,
          color: SOFT
        },
        children: "No differences."
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          maxHeight: 200,
          overflowY: "auto",
          display: "grid",
          gap: 2
        },
        children: shown.res.moves.map(m => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontSize: 12
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: fullName(m.player)
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              color: SOFT
            },
            children: [nm(m.from), " \u2192 "]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: nm(m.to)
          })]
        }, m.player.id))
      })]
    }), plans.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderTop: `1px solid ${LINE}`
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          flex: 1
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: p.name
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontSize: 12,
            color: SOFT
          },
          children: [p.created_at, p.by ? ` · ${p.by}` : "", " \xB7 ", p.count, " players"]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        onClick: () => setCmp(cmp && cmp.id === p.id ? null : {
          id: p.id,
          against: "now"
        }),
        "aria-pressed": !!cmp && cmp.id === p.id,
        children: "Compare"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        disabled: readOnly,
        onClick: () => onRestore(p.id),
        children: "Restore"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("ghost"),
        onClick: () => onDelete(p.id),
        "aria-label": `Delete plan ${p.name}`,
        children: "\u2715"
      })]
    }, p.id))]
  });
}
function PublishModal({
  data,
  readOnly,
  teams,
  onClose,
  call,
  flash,
  lockAll
}) {
  const [sp, setSp] = (0, _react.useState)(null),
    [busy, setBusy] = (0, _react.useState)(false);
  const fails = data.gate.filter(g => g.level === "fail"),
    published = data.stage === "published";
  const ICON = {
    ok: "✅",
    warn: "⚠️",
    fail: "⛔"
  };
  const copy = t => {
    try {
      navigator.clipboard.writeText(t);
      flash("Link copied");
    } catch (e) {
      flash("Copy failed — select and copy the link manually.", "err");
    }
  };
  const toggleReview = async enable => {
    try {
      await call("/rosters/review", "POST", {
        division: data.division,
        enable
      });
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const [pv, setPv] = (0, _react.useState)(null);
  const preview = async () => {
    try {
      setPv(await call(`/rosters/publish-preview?division=${encodeURIComponent(data.division)}`));
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const checkSp = async () => {
    try {
      setSp(await call(`/rosters/sportspress?division=${encodeURIComponent(data.division)}`));
    } catch (e) {
      flash(e.message, "err");
    }
  };
  const publish = async resend => {
    if (!window.confirm(resend ? "Email every rostered player again?" : "Publish rosters and email each rostered player their team?")) return;
    setBusy(true);
    try {
      const r = await call("/rosters/publish", "POST", {
        division: data.division,
        resend
      });
      const pr = r.publish_result || {};
      flash(`Published. Emails sent: ${pr.sent || 0}, failed: ${pr.failed || 0}, skipped: ${pr.skipped || 0}`);
    } catch (e) {
      flash(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Review & publish",
    onClose: onClose,
    width: 640,
    footer: published ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn(),
      disabled: busy,
      onClick: () => publish(true),
      children: "Resend emails"
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn("primary"),
      disabled: busy || fails.length > 0,
      onClick: () => publish(false),
      title: fails.length ? "Fix the blockers first" : "",
      children: "Publish & email players"
    }),
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h4", {
      style: {
        margin: "0 0 6px",
        fontFamily: F_HEAD
      },
      children: "Checklist"
    }), data.gate.map(g => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        fontSize: 14,
        padding: "3px 0"
      },
      children: [ICON[g.level], " ", g.text]
    }, g.key)), !published && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        margin: "10px 0"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn(),
        onClick: () => lockAll(true),
        disabled: !teams.length,
        children: "Lock all teams"
      }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("ghost"),
        onClick: () => lockAll(false),
        disabled: !teams.length,
        children: "Unlock all"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h4", {
      style: {
        margin: "16px 0 6px",
        fontFamily: F_HEAD
      },
      children: "Committee review link"
    }), data.review.active ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 6
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          readOnly: true,
          value: data.review.url,
          onFocus: e => e.target.select(),
          style: {
            flex: 1,
            padding: 8,
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            fontSize: 12
          }
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn(),
          onClick: () => copy(data.review.url),
          children: "Copy"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn("ghost"),
          onClick: () => toggleReview(false),
          children: "Turn off"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          fontSize: 12,
          color: SOFT,
          margin: "6px 0"
        },
        children: "Anyone with this link can view rosters (names, positions and tier only) and leave comments or approve a team. Turn it off when you are done."
      }), teams.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          fontSize: 13
        },
        children: [(data.review.approvals[t.id] || []).length ? "✅" : "⬜", " ", t.name, (data.review.approvals[t.id] || []).length ? ` — approved by ${data.review.approvals[t.id].join(", ")}` : ""]
      }, t.id)), data.review.comments.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          marginTop: 8
        },
        children: data.review.comments.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontSize: 13,
            background: PAPER,
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 4
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: c.name
          }), c.team_id ? ` on ${teams.find(t => t.id === c.team_id)?.name || "a team"}` : "", ": ", c.text]
        }, c.id))
      })]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn(),
      disabled: readOnly,
      onClick: () => toggleReview(true),
      children: "Create review link"
    }), published && data.published.url && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h4", {
        style: {
          margin: "16px 0 6px",
          fontFamily: F_HEAD
        },
        children: "Public roster page"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 6
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          readOnly: true,
          value: data.published.url,
          onFocus: e => e.target.select(),
          style: {
            flex: 1,
            padding: 8,
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            fontSize: 12
          }
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn(),
          onClick: () => copy(data.published.url),
          children: "Copy"
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h4", {
      style: {
        margin: "16px 0 6px",
        fontFamily: F_HEAD
      },
      children: "Who will be emailed (dry run)"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        fontSize: 12,
        color: SOFT,
        margin: "0 0 6px"
      },
      children: "Shows each player who would be told their team, and anyone who would be skipped. Nothing is sent."
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn(),
      onClick: preview,
      children: "Preview emails"
    }), pv && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        marginTop: 8,
        fontSize: 13
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: pv.will_send
        }), " would be emailed, ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: pv.will_skip
        }), " skipped."]
      }), pv.sample_subject && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          background: PAPER,
          borderRadius: 8,
          padding: "6px 10px",
          margin: "6px 0"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: "Subject:"
        }), " ", pv.sample_subject, /*#__PURE__*/(0, _jsxRuntime.jsx)("br", {}), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            color: MUTED
          },
          children: pv.sample_body
        })]
      }), pv.skipped.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          color: "#92400E"
        },
        children: ["Skipped: ", pv.skipped.map(x => `${x.name} (${x.reason})`).join("; ")]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
        style: {
          marginTop: 4
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("summary", {
          style: {
            cursor: "pointer"
          },
          children: "Show recipients"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            maxHeight: 160,
            overflowY: "auto",
            fontSize: 12
          },
          children: pv.recipients.map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [x.name, " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                color: SOFT
              },
              children: ["\u2192 ", x.team, " \xB7 ", x.to]
            })]
          }, i))
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h4", {
      style: {
        margin: "16px 0 6px",
        fontFamily: F_HEAD
      },
      children: "SportsPress check (dry run)"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        fontSize: 12,
        color: SOFT,
        margin: "0 0 6px"
      },
      children: "Shows which teams and players already exist in SportsPress. Nothing is created or changed."
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      style: btn(),
      onClick: checkSp,
      children: "Run check"
    }), sp && (!sp.available ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        fontSize: 13,
        color: SOFT
      },
      children: "SportsPress is not active on this site."
    }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        marginTop: 8,
        fontSize: 13
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: sp.unmatched_teams
        }), " team(s) and ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: sp.unmatched_players
        }), " player(s) have no SportsPress match by name."]
      }), sp.teams.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          marginTop: 4
        },
        children: [t.matched ? "✅" : "⛔", " ", t.team, t.players.filter(p => !p.matched).length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          style: {
            color: SOFT
          },
          children: [" \u2014 no match: ", t.players.filter(p => !p.matched).map(p => p.name).join(", ")]
        }) : ""]
      }, t.team))]
    }))]
  });
}
function RulesModal({
  sum,
  readOnly,
  onClose,
  onPeek,
  onUnlock,
  onRemoveRule
}) {
  const [only, setOnly] = (0, _react.useState)("all");
  const rows = sum.rows.filter(r => only === "all" || only === "broken" && r.broken || only === "locked" && r.held || only === "rules" && r.rules.length);
  const tab = (k, label, n) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
    style: btn(only === k ? "primary" : "ghost", {
      padding: "3px 10px",
      fontSize: 12
    }),
    "aria-pressed": only === k,
    onClick: () => setOnly(k),
    children: [label, " ", n]
  }, k);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Rules & locks",
    onClose: onClose,
    width: 640,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      style: {
        marginTop: 0,
        fontSize: 13,
        color: MUTED
      },
      children: ["Every player who is held in place, has a keep-together/apart rule, or captains a team. \uD83D\uDD12 locked players are never moved by Auto-balance or Find swaps.", sum.onLockedTeams > 0 ? ` ${sum.onLockedTeams} more player${sum.onLockedTeams === 1 ? " is" : "s are"} held because their whole team is locked.` : ""]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 6,
        marginBottom: 10,
        flexWrap: "wrap"
      },
      children: [tab("all", "All", sum.rows.length), tab("broken", "Broken", sum.broken), tab("locked", "🔒 Locked", sum.held), tab("rules", "With rules", sum.ruled)]
    }), rows.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: SOFT,
        fontSize: 13
      },
      children: sum.rows.length === 0 ? "Nothing yet. Open a player and tick “Lock to team”, or add a keep-together/apart rule." : "Nothing matches this filter."
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        display: "grid",
        gap: 6,
        maxHeight: "60vh",
        overflowY: "auto"
      },
      children: rows.map(r => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          border: `1px solid ${r.broken ? "#FCA5A5" : LINE}`,
          background: r.broken ? "#FEF2F2" : WHITE,
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 13
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: {
              background: "none",
              border: 0,
              padding: 0,
              fontWeight: 700,
              cursor: "pointer",
              color: INK,
              fontSize: 14,
              fontFamily: F_UI,
              textDecoration: "underline"
            },
            onClick: () => onPeek(r.player.id),
            children: fullName(r.player)
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              color: SOFT
            },
            children: r.teamName
          }), r.held && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: chip({
              bg: "#E0F2FE",
              color: "#075985"
            }),
            children: "\uD83D\uDD12 Locked to team"
          }), r.captain && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: chip({
              bg: "#FEF3C7",
              color: "#92400E"
            }),
            children: "Captain"
          }), r.teamLocked && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: chip({
              bg: "#F3F4F6",
              color: MUTED
            }),
            children: "Team locked"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              flex: 1
            }
          }), r.held && !readOnly && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("ghost", {
              padding: "2px 8px",
              fontSize: 12
            }),
            onClick: () => onUnlock(r.player.id),
            children: "Unlock"
          })]
        }), r.rules.map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginTop: 4
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: chip(x.type === "together" ? {
              bg: "#DCFCE7",
              color: "#166534"
            } : {
              bg: "#FEE2E2",
              color: "#991B1B"
            }),
            children: x.type === "together" ? "Together" : "Apart"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              flex: 1
            },
            children: [fullName(x.other), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                color: SOFT
              },
              children: ["(", x.otherTeam, ")"]
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontWeight: 700,
              color: x.met === false ? "#991B1B" : x.met ? "#166534" : SOFT
            },
            children: x.met === null ? "not placed yet" : x.met ? "✓ kept" : "✗ broken"
          }), !readOnly && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("ghost", {
              padding: "1px 7px",
              fontSize: 12
            }),
            onClick: () => onRemoveRule(r.player.id, x.other.id),
            "aria-label": "Remove rule",
            children: "\u2715"
          })]
        }, i))]
      }, r.player.id))
    })]
  });
}
function ActivityModal({
  division,
  call,
  onClose
}) {
  const [d, setD] = (0, _react.useState)(null);
  (0, _react.useEffect)(() => {
    let live = true;
    (async () => {
      try {
        const r = await call(`/rosters/activity?division=${encodeURIComponent(division)}`);
        if (live) setD(r);
      } catch (e) {
        if (live) setD({
          error: e.message
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [division, call]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(Modal, {
    title: "Activity",
    onClose: onClose,
    width: 560,
    children: !d ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: SOFT
      },
      children: "Loading\u2026"
    }) : d.error ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      style: {
        color: "#991B1B"
      },
      children: d.error
    }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        style: {
          marginTop: 0,
          fontSize: 13,
          color: MUTED
        },
        children: ["Every roster change for this division: who made it and when.", d.published_at ? ` Published ${d.published_at}.` : ""]
      }), d.changes_since_publish > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        style: {
          background: "#FEF3C7",
          color: "#92400E",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 13
        },
        children: [d.changes_since_publish, " move", d.changes_since_publish > 1 ? "s" : "", " since publishing. Players were not told."]
      }), d.items.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          color: SOFT
        },
        children: "Nothing recorded yet."
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "grid",
          gap: 4
        },
        children: d.items.map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            borderTop: `1px solid ${LINE}`,
            padding: "6px 0",
            fontSize: 13
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: x.title
          }), x.moved ? ` (${x.moved})` : "", " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              color: SOFT
            },
            children: [x.at, " \xB7 ", x.by]
          }), x.notes ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              color: MUTED
            },
            children: x.notes
          }) : null]
        }, x.id))
      })]
    })
  });
}
function RevealView({
  teams,
  state,
  setState
}) {
  const t = teams[state.i],
    players = [...t.players].sort((a, b) => (0, _rosterEngine.scoreOf)(b) - (0, _rosterEngine.scoreOf)(a));
  const next = (0, _react.useCallback)(() => setState(s => s.shown < players.length ? {
    ...s,
    shown: s.shown + 1
  } : s.i < teams.length - 1 ? {
    i: s.i + 1,
    shown: 0
  } : s), [players.length, teams.length, setState]);
  (0, _react.useEffect)(() => {
    const h = e => {
      if (e.key === "Escape") setState(null);else if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, setState]);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    onClick: next,
    style: {
      position: "fixed",
      inset: 0,
      background: "#0f1020",
      color: WHITE,
      zIndex: 100002,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: F_UI,
      cursor: "pointer"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        position: "absolute",
        top: 16,
        right: 20
      },
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("ghost"),
        onClick: e => {
          e.stopPropagation();
          setState(null);
        },
        children: "Exit (Esc)"
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
      style: {
        fontFamily: F_HEAD,
        fontSize: 64,
        margin: 0,
        color: t.colour === "#666666" ? GOLD : t.colour
      },
      children: t.name
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        marginTop: 24,
        display: "grid",
        gap: 8,
        minHeight: 300
      },
      children: players.slice(0, state.shown).map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          fontSize: 30,
          display: "flex",
          gap: 16
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            width: 120,
            color: "#9aa"
          },
          children: _rosterEngine.POS_LABEL[effPos(p)] || ""
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          children: [fullName(p), t.captain_player_id === p.id ? " (C)" : ""]
        })]
      }, p.id))
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        position: "absolute",
        bottom: 20,
        color: "#889",
        fontSize: 14
      },
      children: ["Click, Space or \u2192 to reveal \xB7 Team ", state.i + 1, " of ", teams.length, " \xB7 ", state.shown, "/", players.length]
    })]
  });
}