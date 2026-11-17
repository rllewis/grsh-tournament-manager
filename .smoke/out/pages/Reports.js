"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Reports;
var _react = require("react");
var _reportsEngine = require("../lib/reportsEngine");
var _jsxRuntime = require("react/jsx-runtime");
// Reports.jsx — v3
// Every number on this page comes from the server (GET /reports/overview). There is no mock data:
// if something cannot be measured it shows "—", and if a request fails the page says so and offers a retry.
//
// Includes: readiness verdict + worklist with fix links · reconciled KPIs (paid + waived + unpaid always add up to registered) ·
//           real money (collected, owed from the player fee) · reminders with preview, cooldown and confirm · parity with the
//           real thresholds · goalie coverage and unplaced goalies · registration pace forecast (or an honest "not enough data") ·
//           change since last visit and history · real CSV exports and board pack · read-only expiring share links · print.

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
const adminUrl = page => `/wp-admin/admin.php?page=${page}`;
async function api(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, {
      credentials: "same-origin",
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "X-WP-Nonce": NONCE,
        ...(opts.headers || {})
      }
    });
    let json = null;
    try {
      json = await r.json();
    } catch (e) {/* not JSON */}
    if (!r.ok) return {
      ok: false,
      error: json && (json.error || json.message) || `The server answered ${r.status}.`,
      status: r.status,
      data: json
    };
    return {
      ok: true,
      data: json
    };
  } catch (e) {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection."
    };
  }
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = (0, _reportsEngine.safeFilename)(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const card = {
  background: WHITE,
  border: `1px solid ${LINE}`,
  borderRadius: 12
};
const btn = (kind = "ghost", extra = {}) => ({
  fontFamily: F_UI,
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
  lineHeight: 1.2,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: kind === "primary" ? `1px solid ${INK}` : `1px solid ${LINE}`,
  background: kind === "primary" ? INK : WHITE,
  color: kind === "primary" ? WHITE : INK,
  ...extra
});
const TH = {
  textAlign: "left",
  fontFamily: F_NUM,
  fontSize: 11,
  fontWeight: 500,
  color: MUTED,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  padding: "8px 10px",
  borderBottom: `1px solid ${LINE}`,
  whiteSpace: "nowrap"
};
const TD = {
  padding: "9px 10px",
  borderBottom: `1px solid ${LINE}`,
  fontSize: 14,
  color: INK,
  verticalAlign: "middle"
};
function Pill({
  bg,
  color,
  children,
  title
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    title: title,
    style: {
      display: "inline-block",
      background: bg,
      color,
      fontFamily: F_NUM,
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 99,
      whiteSpace: "nowrap"
    },
    children: children
  });
}
function Card({
  title,
  right,
  children,
  pad = true,
  id
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    id: id,
    style: {
      ...card,
      marginBottom: 16
    },
    children: [(title || right) && /*#__PURE__*/(0, _jsxRuntime.jsxs)("header", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 18px",
        borderBottom: `1px solid ${LINE}`,
        flexWrap: "wrap"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
        style: {
          margin: 0,
          fontFamily: F_NUM,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: MUTED
        },
        children: title
      }), right]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        padding: pad ? 18 : 0
      },
      children: children
    })]
  });
}
function Kpi({
  label,
  value,
  sub,
  tone,
  onClick,
  change,
  hint
}) {
  const color = tone === "bad" ? "#991B1B" : tone === "warn" ? "#92400E" : tone === "good" ? "#166534" : INK;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
    type: "button",
    onClick: onClick,
    title: hint,
    style: {
      ...card,
      textAlign: "left",
      padding: "16px 18px",
      cursor: onClick ? "pointer" : "default",
      font: "inherit",
      width: "100%"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: F_NUM,
        fontSize: 11,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: MUTED
      },
      children: label
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: F_HEAD,
        fontSize: 38,
        fontWeight: 700,
        color,
        lineHeight: 1.1,
        margin: "4px 0"
      },
      children: value
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontSize: 13,
        color: MUTED
      },
      children: sub
    }), change ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: F_NUM,
        fontSize: 11,
        color: SOFT,
        marginTop: 4
      },
      children: change
    }) : null]
  });
}
function Skeleton() {
  const b = (h, w = "100%") => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      height: h,
      width: w,
      background: "#ECEAE2",
      borderRadius: 8,
      marginBottom: 12
    }
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    "aria-busy": "true",
    "aria-label": "Loading reports",
    style: {
      padding: 4
    },
    children: [b(28, "40%"), b(70), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12
      },
      children: [0, 1, 2, 3].map(i => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        children: b(110)
      }, i))
    }), b(260)]
  });
}
function Bar({
  pct,
  color = INK,
  h = 8,
  bg = "#ECEAE2",
  label
}) {
  const p = (0, _reportsEngine.num)(pct) === null ? 0 : Math.max(0, Math.min(100, pct));
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    role: "img",
    "aria-label": label,
    style: {
      background: bg,
      borderRadius: 99,
      height: h,
      overflow: "hidden",
      width: "100%"
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        width: `${p}%`,
        height: "100%",
        background: color
      }
    })
  });
}
const TABS = [["overview", "Overview"], ["worklist", "To fix"], ["parity", "Parity"], ["payments", "Payments"], ["goalies", "Goalies"], ["review", "Review"], ["exports", "Export"], ["history", "History & sharing"], ["help", "Help"]];

// ─────────────────────────────────────────────────────────────────────────────
function Reports() {
  const [data, setData] = (0, _react.useState)(null);
  const [err, setErr] = (0, _react.useState)("");
  const [loading, setLoading] = (0, _react.useState)(true);
  const [tab, setTab] = (0, _react.useState)(() => {
    const h = (window.location.hash || "").replace("#", "");
    return TABS.some(t => t[0] === h) ? h : "overview";
  });
  const [div, setDiv] = (0, _react.useState)("");
  const [toast, setToast] = (0, _react.useState)("");
  const [busy, setBusy] = (0, _react.useState)("");
  const [q, setQ] = (0, _react.useState)("");
  const [rem, setRem] = (0, _react.useState)(null); // reminder dialog state
  const [feeText, setFeeText] = (0, _react.useState)("");
  const [shares, setShares] = (0, _react.useState)([]);
  const [newLink, setNewLink] = (0, _react.useState)(null);
  const [days, setDays] = (0, _react.useState)(7);
  const loadedAt = (0, _react.useRef)(0);
  const locks = (0, _react.useRef)({}); // blocks a second click from starting the same action twice
  const once = async (key, fn) => {
    if (locks.current[key]) return;
    locks.current[key] = true;
    try {
      await fn();
    } finally {
      locks.current[key] = false;
    }
  };
  const toastTimer = (0, _react.useRef)(0);
  const say = (0, _react.useCallback)(m => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 6000);
  }, []);
  const load = (0, _react.useCallback)(async silent => {
    if (!silent) setLoading(true);
    const r = await api("/reports/overview");
    if (r.ok) {
      setData(r.data);
      setErr("");
      loadedAt.current = Date.now();
    } else if (!silent || !data) {
      setErr(r.error);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShares = (0, _react.useCallback)(async () => {
    const r = await api("/reports/shares");
    if (r.ok) setShares(r.data || []);
  }, []);
  (0, _react.useEffect)(() => {
    load(false);
    loadShares();
  }, [load, loadShares]);
  (0, _react.useEffect)(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > 120000) load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);
  (0, _react.useEffect)(() => {
    try {
      window.history.replaceState(null, "", `#${tab}`);
    } catch (e) {/* ignore */}
  }, [tab]);
  (0, _react.useEffect)(() => {
    const st = document.createElement("style");
    st.id = "grsh-reports-print";
    st.textContent = "@media print{#adminmenumain,#wpadminbar,#wpfooter,.grsh-noprint{display:none!important}#wpcontent,#wpfooter{margin-left:0!important}body{background:#fff!important}.grsh-print-title{display:block!important}}.grsh-print-title{display:none}";
    document.head.appendChild(st);
    return () => st.remove();
  }, []);
  (0, _react.useEffect)(() => {
    if (data && data.payments) setFeeText(data.payments.fee_source === "set" ? String(data.payments.fee) : "");
  }, [data && data.payments && data.payments.fee, data && data.payments && data.payments.fee_source]); // eslint-disable-line react-hooks/exhaustive-deps

  const divs = data ? data.divisions : [];
  const shown = (0, _react.useMemo)(() => div ? divs.filter(d => d.key === div) : divs, [divs, div]);

  // ── actions ──
  const downloadExport = id => once("exp-" + id, async () => {
    setBusy("exp-" + id);
    const r = await api(`/reports/export?id=${encodeURIComponent(id)}`);
    setBusy("");
    if (!r.ok) {
      say(`Could not build that export. ${r.error}`);
      return;
    }
    saveBlob(new Blob([r.data.csv], {
      type: "text/csv;charset=utf-8"
    }), r.data.filename);
    say(`Downloaded ${r.data.filename} (${r.data.rows} row${r.data.rows === 1 ? "" : "s"}).`);
  });
  const boardPack = () => once("pack", async () => {
    setBusy("pack");
    try {
      const r = await fetch(`${API}/reports/board-meeting-pack`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": NONCE
        }
      });
      if (!r.ok) {
        say(`The board pack could not be built (the server answered ${r.status}).`);
        setBusy("");
        return;
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const m = /filename="?([^";]+)/.exec(cd);
      const name = m ? m[1] : "GRSH-Board-Pack.html";
      saveBlob(blob, name);
      say(/\.html$/i.test(name) ? "Saved as a web page because no PDF library is installed. Open it and use Print → Save as PDF." : "Board pack downloaded.");
    } catch (e) {
      say("Could not reach the server to build the board pack.");
    }
    setBusy("");
  });
  const saveFee = () => once("fee", async () => {
    setBusy("fee");
    const r = await api("/reports/fee", {
      method: "POST",
      body: JSON.stringify({
        fee: feeText.trim()
      })
    });
    setBusy("");
    if (r.ok) {
      setData(r.data);
      say(feeText.trim() ? "Player fee saved." : "Player fee cleared. Amounts owed fall back to what players paid.");
    } else {
      say(r.error);
    }
  });
  const openReminders = async ids => {
    setRem({
      loading: true,
      ids: ids || null,
      note: ""
    });
    const r = await api("/reports/reminders", {
      method: "POST",
      body: JSON.stringify({
        send: false,
        ids: ids || undefined
      })
    });
    setRem(r.ok ? {
      ...r.data,
      ids: ids || null,
      note: ""
    } : {
      error: r.error
    });
  };
  const sendReminders = () => once("send", async () => {
    setRem(s => ({
      ...s,
      sending: true
    }));
    const r = await api("/reports/reminders", {
      method: "POST",
      body: JSON.stringify({
        send: true,
        ids: rem.ids || undefined,
        note: rem.note
      })
    });
    if (r.ok) {
      setRem(s => ({
        ...s,
        sending: false,
        done: r.data
      }));
      load(true);
    } else {
      setRem(s => ({
        ...s,
        sending: false,
        error: r.error
      }));
    }
  });
  const createLink = () => once("share", async () => {
    setBusy("share");
    const r = await api("/reports/share", {
      method: "POST",
      body: JSON.stringify({
        days
      })
    });
    setBusy("");
    if (r.ok) {
      setNewLink(r.data);
      loadShares();
    } else {
      say(r.error);
    }
  });
  const revoke = async id => {
    const r = await api(`/reports/share/${id}`, {
      method: "DELETE"
    });
    if (r.ok) {
      say("Link revoked. It no longer works.");
      setNewLink(null);
      loadShares();
    } else {
      say(r.error);
    }
  };
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied.`);
    } catch (e) {
      say("Could not copy automatically. Select the text and copy it.");
    }
  };
  const goTab = t => {
    setTab(t);
    window.scrollTo && window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };
  const onTabKey = e => {
    const i = TABS.findIndex(t => t[0] === tab);
    if (e.key === "ArrowRight") {
      setTab(TABS[(i + 1) % TABS.length][0]);
      e.preventDefault();
    }
    if (e.key === "ArrowLeft") {
      setTab(TABS[(i + TABS.length - 1) % TABS.length][0]);
      e.preventDefault();
    }
  };

  // ── states ──
  if (loading && !data) return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      padding: "20px 24px",
      fontFamily: F_UI
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Skeleton, {})
  });
  if (err && !data) {
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        padding: "40px 24px",
        fontFamily: F_UI,
        maxWidth: 560
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
        style: {
          fontFamily: F_HEAD,
          fontSize: 28,
          margin: "0 0 8px"
        },
        children: "Reports could not load"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        style: {
          color: MUTED,
          fontSize: 15
        },
        children: err
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("primary"),
        onClick: () => load(false),
        children: "Try again"
      })]
    });
  }
  const d = data,
    p = d.payments,
    t = d.totals,
    v = d.verdict,
    vs = _reportsEngine.VERDICT[v.level] || _reportsEngine.VERDICT.empty,
    since = d.since;
  const stale = (0, _reportsEngine.ageMinutes)(d.generated_at) > 30;
  const bd = p.breakdown;
  const sinceTxt = n => since ? (0, _reportsEngine.delta)(n) && `${(0, _reportsEngine.delta)(n)} since ${since.days} day${since.days === 1 ? "" : "s"} ago` : null;
  const divLabel = k => (divs.find(x => x.key === k) || {}).label || k;
  const unpaidShown = d.unpaid.filter(u => (!div || u.division === div) && (0, _reportsEngine.matchName)(u.name, q));
  const goalieNoDiv = d.teams_no_goalie.filter(x => !div || x.division === div);
  const unplaced = d.goalies_unplaced.filter(x => !div || x.division === div);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: "16px 24px 48px",
      fontFamily: F_UI,
      color: INK,
      maxWidth: 1180
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h1", {
      className: "grsh-print-title",
      style: {
        fontFamily: F_HEAD
      },
      children: [d.season.label, " \u2014 Reports (", new Date(d.generated_at).toLocaleString(), ")"]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "grsh-noprint",
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 14
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: F_NUM,
            fontSize: 12,
            letterSpacing: ".1em",
            color: GOLD,
            fontWeight: 600
          },
          children: ["SEASON ", d.season.year]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
          style: {
            fontFamily: F_HEAD,
            fontSize: 36,
            margin: "2px 0 4px",
            lineHeight: 1.1
          },
          children: "Reports"
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontSize: 14,
            color: MUTED
          },
          children: ["Data as of ", new Date(d.generated_at).toLocaleString(), " (", (0, _reportsEngine.ago)(d.generated_at), ")", stale ? /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
            style: {
              color: "#92400E"
            },
            children: " \xB7 may be stale"
          }) : null, " \xB7", " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            onClick: () => load(true),
            style: {
              background: "none",
              border: "none",
              padding: 0,
              color: INK,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 14
            },
            children: loading ? "Refreshing…" : "Refresh"
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 8,
          flexWrap: "wrap"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn(),
          onClick: () => goTab("history"),
          children: "Share link"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn(),
          onClick: () => window.print(),
          children: "Print this page"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          style: btn("primary"),
          onClick: boardPack,
          disabled: busy === "pack",
          children: busy === "pack" ? "Building…" : "Board pack"
        })]
      })]
    }), err ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "alert",
      style: {
        ...card,
        background: "#FEF3C7",
        borderColor: "#FCD34D",
        padding: "10px 14px",
        marginBottom: 12,
        fontSize: 14
      },
      children: ["The last refresh failed (", err, "). You are looking at older data. ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: {
          ...btn(),
          padding: "4px 10px",
          marginLeft: 8
        },
        onClick: () => load(true),
        children: "Retry"
      })]
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "status",
      style: {
        background: vs.bg,
        border: `1px solid ${vs.border}`,
        color: vs.color,
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 16
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          "aria-hidden": "true",
          style: {
            width: 26,
            height: 26,
            borderRadius: 99,
            background: vs.color,
            color: vs.bg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700
          },
          children: vs.icon
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
          style: {
            fontSize: 17
          },
          children: v.headline
        }), d.issues.length > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          className: "grsh-noprint",
          style: {
            ...btn(),
            marginLeft: "auto",
            padding: "5px 12px",
            fontSize: 13
          },
          onClick: () => goTab("worklist"),
          children: ["See all ", d.issues.length]
        }) : null]
      }), d.issues.slice(0, 3).map(i => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          fontSize: 14,
          marginTop: 6,
          paddingLeft: 36
        },
        children: ["\u2022 ", i.title, i.detail ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          style: {
            opacity: 0.85
          },
          children: [" \u2014 ", i.detail]
        }) : null]
      }, i.id))]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 12,
        marginBottom: 16
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
        label: "Registered",
        value: t.registered,
        sub: t.min_needed ? `of ${t.min_needed} minimum · ${t.capacity} spots` : "players, subs not counted",
        change: sinceTxt(since && since.registered),
        onClick: () => goTab("overview")
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
        label: "Paid",
        value: (0, _reportsEngine.pctText)(p.pct_paid),
        tone: p.pct_paid === null ? undefined : p.pct_paid >= 95 ? "good" : "warn",
        sub: `${bd.paid} paid${bd.waived ? ` · ${bd.waived} waived` : ""}`,
        hint: `${bd.paid} paid + ${bd.waived} waived + ${bd.pending} pending + ${bd.failed} failed + ${bd.refunded} refunded = ${p.registered}`,
        change: sinceTxt(since && since.paid),
        onClick: () => goTab("payments")
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
        label: "Outstanding",
        value: p.unpaid,
        tone: p.unpaid > 0 ? "warn" : "good",
        sub: p.unpaid === 0 ? "nobody owes anything" : p.owed === null ? "set the player fee to see $ owed" : `${(0, _reportsEngine.money)(p.owed)} owed`,
        change: sinceTxt(since && since.unpaid),
        onClick: () => goTab("payments")
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
        label: "Goalies",
        value: t.goalies,
        tone: t.teams_no_goalie > 0 ? "bad" : t.teams > 0 ? "good" : undefined,
        sub: t.teams === 0 ? "no teams created yet" : t.teams_no_goalie > 0 ? `${t.teams_no_goalie} team${t.teams_no_goalie === 1 ? "" : "s"} with no goalie` : "every team covered",
        change: t.goalies_unplaced ? `${t.goalies_unplaced} not on a roster yet` : null,
        onClick: () => goTab("goalies")
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "grsh-noprint",
      role: "group",
      "aria-label": "Filter by division",
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        style: {
          fontFamily: F_NUM,
          fontSize: 12,
          color: MUTED
        },
        children: "DIVISION"
      }), [{
        key: "",
        label: "All divisions"
      }, ...divs.filter(x => x.registered > 0 || x.configured).map(x => ({
        key: x.key,
        label: x.label
      }))].map(o => /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        "aria-pressed": div === o.key,
        onClick: () => setDiv(o.key),
        style: {
          ...btn(div === o.key ? "primary" : "ghost"),
          padding: "6px 14px",
          fontSize: 13,
          borderRadius: 99
        },
        children: o.label
      }, o.key || "all"))]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "grsh-noprint",
      role: "tablist",
      "aria-label": "Report sections",
      onKeyDown: onTabKey,
      style: {
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 16,
        borderBottom: `1px solid ${LINE}`,
        paddingBottom: 10
      },
      children: TABS.map(([k, label]) => {
        const n = k === "worklist" ? d.issues.length : k === "payments" ? p.unpaid : k === "goalies" ? t.teams_no_goalie : k === "review" ? t.sandbagging : 0;
        const on = tab === k;
        return /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          role: "tab",
          id: `tab-${k}`,
          "aria-selected": on,
          "aria-controls": `panel-${k}`,
          tabIndex: on ? 0 : -1,
          onClick: () => setTab(k),
          style: {
            ...btn(on ? "primary" : "ghost"),
            padding: "7px 13px",
            fontSize: 13
          },
          children: [label, n > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontFamily: F_NUM,
              fontSize: 11,
              background: on ? "rgba(255,255,255,.22)" : "#FEF3C7",
              color: on ? WHITE : "#92400E",
              borderRadius: 99,
              padding: "0 7px"
            },
            children: n
          }) : null]
        }, k);
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "tabpanel",
      id: `panel-${tab}`,
      "aria-labelledby": `tab-${tab}`,
      children: [tab === "overview" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Plain-English summary",
          right: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            className: "grsh-noprint",
            style: {
              ...btn(),
              padding: "5px 12px",
              fontSize: 13
            },
            onClick: () => copy(d.summary_text, "Summary"),
            children: "Copy"
          }),
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              fontSize: 16,
              lineHeight: 1.6
            },
            children: d.summary_text
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "8px 0 0",
              fontSize: 12,
              color: SOFT
            },
            children: "Written from the numbers on this page, so it always matches them. Nothing is sent to an outside service."
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: "Divisions",
          pad: false,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              overflowX: "auto"
            },
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
              style: {
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 760
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Division"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Registered"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Paid"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Unpaid"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Goalies"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Avg parity"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Tiers A / B / C / R / ?"
                  })]
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
                children: shown.map(x => {
                  const f = (0, _reportsEngine.fillState)(x.registered, x.min_needed, x.capacity);
                  const col = f.state === "short" ? "#B45309" : f.state === "over" ? "#991B1B" : "#166534";
                  const b = (0, _reportsEngine.parityBand)(x.avg_parity, d.parity_bands);
                  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                      style: TD,
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        style: {
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 99,
                          background: x.color,
                          marginRight: 8
                        }
                      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                        children: x.label
                      }), !x.configured ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                        style: {
                          fontSize: 11,
                          color: "#92400E"
                        },
                        children: "not set up in Settings"
                      }) : null]
                    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                      style: {
                        ...TD,
                        minWidth: 190
                      },
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                        style: {
                          fontFamily: F_NUM,
                          fontSize: 13
                        },
                        children: [x.registered, x.capacity ? ` / ${x.capacity}` : "", x.min_needed ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                          style: {
                            color: MUTED
                          },
                          children: [" \xB7 min ", x.min_needed]
                        }) : null]
                      }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Bar, {
                        pct: f.pct,
                        color: col,
                        label: `${x.label}: ${x.registered} registered`
                      }), f.state === "short" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                        style: {
                          fontSize: 12,
                          color: "#B45309",
                          marginTop: 2
                        },
                        children: [f.short, " short of minimum"]
                      }) : f.state === "over" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                        style: {
                          fontSize: 12,
                          color: "#991B1B",
                          marginTop: 2
                        },
                        children: "over capacity"
                      }) : null]
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: TD,
                      children: x.settled
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: {
                        ...TD,
                        color: x.unpaid ? "#92400E" : INK,
                        fontWeight: x.unpaid ? 600 : 400
                      },
                      children: x.unpaid
                    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                      style: TD,
                      children: [x.goalies, x.goalies_unplaced ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                        style: {
                          fontSize: 12,
                          color: MUTED
                        },
                        children: [" (", x.goalies_unplaced, " unplaced)"]
                      }) : null]
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: TD,
                      children: x.avg_parity === null ? "—" : /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
                        bg: b.bg,
                        color: b.color,
                        children: [x.avg_parity, " ", b.label]
                      })
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: {
                        ...TD,
                        fontFamily: F_NUM,
                        fontSize: 13
                      },
                      children: ["A", "B", "C", "R", "?"].map(k => x.tiers[k]).join(" / ")
                    })]
                  }, x.key);
                })
              })]
            })
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
            gap: 16
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
            title: "Will we fill?",
            children: d.forecast.projected === null ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              style: {
                margin: 0,
                fontSize: 15,
                color: MUTED
              },
              children: [d.forecast.reason, " A projection appears once there is enough history, so this page never guesses."]
            }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: F_HEAD,
                  fontSize: 34,
                  fontWeight: 700
                },
                children: ["about ", d.forecast.projected]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                style: {
                  margin: "4px 0 8px",
                  fontSize: 14,
                  color: MUTED
                },
                children: ["players by the close date, at ", d.forecast.per_day, " per day over the next ", d.forecast.days_left, " days.", d.forecast.min_needed ? d.forecast.projected >= d.forecast.min_needed ? ` That meets the minimum of ${d.forecast.min_needed}.` : ` That is short of the minimum of ${d.forecast.min_needed}.` : "", d.forecast.capacity ? ` Capacity is ${d.forecast.capacity}.` : ""]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                style: {
                  margin: 0,
                  fontSize: 12,
                  color: SOFT
                },
                children: ["An estimate from ", d.forecast.basis, "."]
              })]
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
            title: "Registrations, last 30 days",
            children: (() => {
              const bars = (0, _reportsEngine.dayBars)(d.registrations_by_day, 30);
              const mx = Math.max(1, ...bars.map(b => b.n));
              const total = bars.reduce((s, b) => s + b.n, 0);
              return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("svg", {
                  viewBox: "0 0 300 70",
                  width: "100%",
                  role: "img",
                  "aria-label": `${total} registrations recorded in the last 30 days`,
                  children: [bars.map((b, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("rect", {
                    x: i * 10 + 1,
                    y: 68 - b.n / mx * 64,
                    width: "8",
                    height: Math.max(b.n ? 2 : 0, b.n / mx * 64),
                    fill: INK,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("title", {
                      children: [b.date, ": ", b.n]
                    })
                  }, b.date)), /*#__PURE__*/(0, _jsxRuntime.jsx)("line", {
                    x1: "0",
                    y1: "68.5",
                    x2: "300",
                    y2: "68.5",
                    stroke: LINE
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                  style: {
                    margin: "6px 0 0",
                    fontSize: 13,
                    color: MUTED
                  },
                  children: [total, " recorded in 30 days", d.last_registration_day ? ` · latest ${d.last_registration_day}` : "", ". Dates are when each registration was recorded here."]
                })]
              });
            })()
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
            title: "Skill tiers",
            children: ["A", "B", "C", "R", "?"].map(k => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  width: 70,
                  fontFamily: F_NUM,
                  fontSize: 13
                },
                children: k === "?" ? "No tier" : `Tier ${k}`
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Bar, {
                pct: t.registered ? d.tiers[k] / t.registered * 100 : 0,
                color: k === "?" ? "#9CA3AF" : INK,
                label: `${d.tiers[k]} players`
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  width: 34,
                  textAlign: "right",
                  fontFamily: F_NUM,
                  fontSize: 13
                },
                children: d.tiers[k]
              })]
            }, k))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
            title: "Ages",
            children: d.ages.n === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              style: {
                margin: 0,
                color: MUTED,
                fontSize: 14
              },
              children: "No ages are recorded for this season\u2019s registrations."
            }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                style: {
                  margin: "0 0 8px",
                  fontSize: 14,
                  color: MUTED
                },
                children: ["Average ", d.ages.avg, " \xB7 youngest ", d.ages.min, " \xB7 oldest ", d.ages.max, " \xB7 ", d.ages.n, " of ", t.registered, " have an age on file."]
              }), d.ages.bands.map(b => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 4
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    width: 56,
                    fontFamily: F_NUM,
                    fontSize: 12
                  },
                  children: b.label
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Bar, {
                  pct: b.n / d.ages.n * 100,
                  label: `${b.n} players aged ${b.label}`
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    width: 30,
                    textAlign: "right",
                    fontFamily: F_NUM,
                    fontSize: 12
                  },
                  children: b.n
                })]
              }, b.label))]
            })
          })]
        })]
      }), tab === "worklist" && /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
        title: `To fix (${d.issues.length})`,
        children: d.issues.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          style: {
            margin: 0,
            fontSize: 16
          },
          children: t.registered === 0 ? "Nothing to fix yet. No one has registered." : "Nothing to fix. Every check on this page passes."
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
          style: {
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 10
          },
          children: d.issues.filter(i => !div || i.id.indexOf(div) !== -1 || ["unpaid", "sandbag", "tiers", "nodiv"].indexOf(i.id) !== -1).map(i => {
            const sv = _reportsEngine.SEVERITY[i.severity];
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              style: {
                border: `1px solid ${LINE}`,
                borderLeft: `5px solid ${sv.color}`,
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                bg: sv.bg,
                color: sv.color,
                children: sv.label
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  flex: 1,
                  minWidth: 220
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    fontWeight: 600,
                    fontSize: 15
                  },
                  children: i.title
                }), i.detail ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    fontSize: 13,
                    color: MUTED
                  },
                  children: i.detail
                }) : null]
              }), i.fix.page ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
                href: adminUrl(i.fix.page),
                style: btn(),
                children: [i.fix.label, " \u2192"]
              }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                style: btn(),
                onClick: () => goTab(i.fix.tab),
                children: [i.fix.label, " \u2192"]
              })]
            }, i.id);
          })
        })
      }), tab === "parity" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: "How to read parity",
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            style: {
              margin: 0,
              fontSize: 14,
              color: MUTED,
              lineHeight: 1.6
            },
            children: ["Parity compares each team\u2019s skill and age against the others in its division. ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              style: {
                color: "#166534"
              },
              children: "Balanced"
            }), " is ", d.parity_bands.review_below, "\u2013", d.parity_bands.review_above, ". ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              style: {
                color: "#92400E"
              },
              children: "Review"
            }), " is ", d.parity_bands.rebalance_below, "\u2013", d.parity_bands.review_below, " or ", d.parity_bands.review_above, "\u2013", d.parity_bands.rebalance_above, ". ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              style: {
                color: "#991B1B"
              },
              children: "Rebalance"
            }), " is outside ", d.parity_bands.rebalance_below, "\u2013", d.parity_bands.rebalance_above, ". These are the same limits the rest of the plugin uses. Worst teams are listed first."]
          })
        }), shown.map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: `${x.label} · ${x.teams.length} team${x.teams.length === 1 ? "" : "s"} · ${x.registered} players`,
          children: x.teams.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              color: MUTED,
              fontSize: 14
            },
            children: "No teams have been created for this division yet, so there is no parity to show."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              overflowX: "auto"
            },
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
              style: {
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 620
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Team"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Players"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Skill"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Age"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Parity"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    title: "Goalies / Defense / Centers / Wingers",
                    children: "G / D / C / W"
                  })]
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
                children: (0, _reportsEngine.sortTeams)(x.teams, d.parity_bands).map(tm => {
                  const b = (0, _reportsEngine.parityBand)(tm.parity_score, d.parity_bands);
                  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                      style: TD,
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        style: {
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 99,
                          background: tm.colour,
                          marginRight: 8
                        }
                      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                        children: tm.name
                      })]
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: TD,
                      children: tm.players
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: {
                        ...TD,
                        fontFamily: F_NUM
                      },
                      children: tm.skill_score ?? "—"
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: {
                        ...TD,
                        fontFamily: F_NUM
                      },
                      children: tm.age_score ?? "—"
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                      style: TD,
                      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
                        bg: b.bg,
                        color: b.color,
                        children: [tm.parity_score ?? "—", " \xB7 ", b.label]
                      })
                    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                      style: {
                        ...TD,
                        fontFamily: F_NUM,
                        fontSize: 13,
                        color: tm.goalies === 0 ? "#991B1B" : INK,
                        fontWeight: tm.goalies === 0 ? 700 : 400
                      },
                      children: [tm.goalies, " / ", tm.defense, " / ", tm.center, " / ", tm.wing, tm.goalies === 0 ? "  no goalie" : ""]
                    })]
                  }, tm.name);
                })
              })]
            })
          })
        }, x.key))]
      }), tab === "payments" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
            marginBottom: 16
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
            label: "Collected",
            value: (0, _reportsEngine.money)(p.collected),
            tone: "good",
            sub: "the sum players actually paid"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Kpi, {
            label: "Still owed",
            value: p.owed === null ? "—" : (0, _reportsEngine.money)(p.owed),
            tone: p.owed ? "warn" : undefined,
            sub: p.owed === null ? "set the player fee below" : p.fee_source === "estimated" ? `at about ${(0, _reportsEngine.money)(p.fee)} each (estimated)` : `at ${(0, _reportsEngine.money)(p.fee)} each`
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              ...card,
              padding: "16px 18px"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "fee",
              style: {
                fontFamily: F_NUM,
                fontSize: 11,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: MUTED
              },
              children: "Player fee"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 8,
                margin: "8px 0 6px"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                id: "fee",
                inputMode: "decimal",
                value: feeText,
                onChange: e => setFeeText(e.target.value),
                placeholder: p.fee ? String(p.fee) : "e.g. 200",
                style: {
                  fontSize: 16,
                  padding: "7px 10px",
                  border: `1px solid ${LINE}`,
                  borderRadius: 8,
                  width: 110
                }
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: btn("primary"),
                onClick: saveFee,
                disabled: busy === "fee",
                children: busy === "fee" ? "Saving…" : "Save"
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontSize: 12,
                color: SOFT
              },
              children: p.fee_source === "set" ? "Set by the committee." : p.fee_source === "estimated" ? "Not set. Using the typical amount paid. Save a fee to make it exact." : "Not set and nobody has paid yet, so amounts owed are unknown."
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Where every registration stands",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              display: "flex",
              height: 16,
              borderRadius: 99,
              overflow: "hidden",
              background: "#ECEAE2"
            },
            role: "img",
            "aria-label": `${bd.paid} paid, ${bd.waived} waived, ${bd.pending} pending, ${bd.failed} failed, ${bd.refunded} refunded`,
            children: [["paid", "#166534"], ["waived", "#6D28D9"], ["pending", "#D97706"], ["failed", "#991B1B"], ["refunded", "#6B7280"]].map(([k, c]) => bd[k] && p.registered ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                width: `${bd[k] / p.registered * 100}%`,
                background: c
              },
              title: `${k}: ${bd[k]}`
            }, k) : null)
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginTop: 10,
              fontSize: 14
            },
            children: [["Paid", bd.paid, "#166534"], ["Waived", bd.waived, "#6D28D9"], ["Pending", bd.pending, "#B45309"], ["Failed", bd.failed, "#991B1B"], ["Refunded", bd.refunded, "#4B5563"]].map(([l, n, c]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                "aria-hidden": "true",
                style: {
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: c,
                  marginRight: 6
                }
              }), l, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: n
              })]
            }, l))
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            style: {
              margin: "10px 0 0",
              fontSize: 12,
              color: SOFT
            },
            children: [bd.paid, " + ", bd.waived, " + ", bd.pending, " + ", bd.failed, " + ", bd.refunded, bd.other ? ` + ${bd.other} other` : "", " = ", p.registered, " registered", p.adds_up ? "" : " (this does not add up. Please tell the developer.)", ". Subs and withdrawn players are not counted."]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: `Unpaid players (${unpaidShown.length}${unpaidShown.length !== d.unpaid.length ? ` of ${d.unpaid.length}` : ""})`,
          right: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "grsh-noprint",
            style: {
              display: "flex",
              gap: 8,
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              "aria-label": "Search unpaid players",
              placeholder: "Search name\u2026",
              value: q,
              onChange: e => setQ(e.target.value),
              style: {
                fontSize: 14,
                padding: "6px 10px",
                border: `1px solid ${LINE}`,
                borderRadius: 8
              }
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn("primary"),
              disabled: !d.unpaid.some(u => u.can_remind),
              onClick: () => openReminders(null),
              children: "Send reminders\u2026"
            })]
          }),
          pad: false,
          children: unpaidShown.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              padding: 18,
              margin: 0,
              fontSize: 15
            },
            children: d.unpaid.length === 0 ? "Nobody owes anything." : "No unpaid players match."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              overflowX: "auto"
            },
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
              style: {
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 640
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Player"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Division"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Status"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Owes"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Waiting"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH,
                    children: "Last reminded"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    style: TH
                  })]
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
                children: unpaidShown.map(u => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                      children: u.name
                    })
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: divLabel(u.division)
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                      bg: u.status === "failed" ? "#FEE2E2" : "#FEF3C7",
                      color: u.status === "failed" ? "#991B1B" : "#92400E",
                      children: u.status
                    })
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: {
                      ...TD,
                      fontFamily: F_NUM
                    },
                    children: (0, _reportsEngine.money)(u.owes)
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: {
                      ...TD,
                      color: (u.days_waiting || 0) > 30 ? "#991B1B" : INK,
                      fontWeight: (u.days_waiting || 0) > 30 ? 700 : 400
                    },
                    children: u.days_waiting === null ? "—" : `${u.days_waiting} day${u.days_waiting === 1 ? "" : "s"}`
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: {
                      ...TD,
                      fontSize: 13,
                      color: MUTED
                    },
                    children: u.reminded_at ? (0, _reportsEngine.ago)(u.reminded_at) : !u.has_email ? "no email on file" : "never"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                      className: "grsh-noprint",
                      style: {
                        ...btn(),
                        padding: "4px 10px",
                        fontSize: 13
                      },
                      disabled: !u.can_remind,
                      onClick: () => openReminders([u.player_id]),
                      title: u.can_remind ? "" : u.has_email ? `Reminded in the last ${d.cooldown_days} days` : "No email on file",
                      children: "Remind"
                    })
                  })]
                }, u.player_id))
              })]
            })
          })
        })]
      }), tab === "goalies" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Teams without a goalie",
          children: [goalieNoDiv.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              fontSize: 15
            },
            children: t.teams === 0 ? "No teams have been created yet." : "Every team has a goalie."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            style: {
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 8
            },
            children: goalieNoDiv.map(g => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              style: {
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                bg: "#FEE2E2",
                color: "#991B1B",
                children: "No goalie"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: g.team
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  color: MUTED
                },
                children: [g.label, " \xB7 ", g.players, " player", g.players === 1 ? "" : "s"]
              })]
            }, g.division + g.team))
          }), goalieNoDiv.length > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "12px 0 0"
            },
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
              href: adminUrl("grsh-tm-rosters"),
              style: btn(),
              children: "Open Rosters to assign one \u2192"
            })
          }) : null]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: `Registered goalies not on a roster (${unplaced.length})`,
          children: unplaced.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              fontSize: 15
            },
            children: "Every registered goalie is on a roster."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            style: {
              margin: 0,
              paddingLeft: 18,
              lineHeight: 1.8,
              fontSize: 15
            },
            children: unplaced.map(g => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: g.name
              }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  color: MUTED
                },
                children: ["\xB7 ", divLabel(g.division)]
              })]
            }, g.name + g.division))
          })
        })]
      }), tab === "review" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
        title: `Flagged for tier review (${t.sandbagging})`,
        children: [d.flags.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          style: {
            margin: 0,
            fontSize: 15
          },
          children: "No players are flagged this season."
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            overflowX: "auto"
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
            style: {
              width: "100%",
              borderCollapse: "collapse"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Player"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Tier"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Division"
                })]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
              children: d.flags.filter(f => !div || f.division === div).map(f => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                    children: f.player
                  })
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: {
                    ...TD,
                    fontFamily: F_NUM
                  },
                  children: f.tier || "—"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: divLabel(f.division)
                })]
              }, f.id))
            })]
          })
        }), t.sandbagging > d.flags.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          style: {
            fontSize: 13,
            color: MUTED
          },
          children: ["Showing the first ", d.flags.length, " of ", t.sandbagging, "."]
        }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          style: {
            margin: "12px 0 0",
            fontSize: 13,
            color: MUTED
          },
          children: [t.tier_unknown, " registered player", t.tier_unknown === 1 ? " has" : "s have", " no skill tier. ", /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
            href: adminUrl("grsh-tm-players"),
            style: {
              color: INK
            },
            children: "Open Players \u2192"
          })]
        })]
      }), tab === "exports" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Download as CSV (opens in Excel or Google Sheets)",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: 12
            },
            children: d.exports.map(e => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                border: `1px solid ${LINE}`,
                borderRadius: 10,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                style: {
                  fontSize: 15
                },
                children: e.title
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  fontSize: 13,
                  color: MUTED,
                  flex: 1
                },
                children: e.desc
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: btn(),
                onClick: () => downloadExport(e.id),
                disabled: busy === "exp-" + e.id,
                children: busy === "exp-" + e.id ? "Building…" : "Download CSV"
              })]
            }, e.id))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "12px 0 0",
              fontSize: 12,
              color: SOFT
            },
            children: "Files are built on the server from live data and named with today\u2019s date. Player exports contain emails, so store them with care. Each download is recorded in the audit log."
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Board meeting pack",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "0 0 10px",
              fontSize: 14,
              color: MUTED
            },
            children: "A formatted summary of the numbers above: registration, payments, parity, goalies and action items, built when you click."
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("primary"),
            onClick: boardPack,
            disabled: busy === "pack",
            children: busy === "pack" ? "Building…" : "Download board pack"
          })]
        })]
      }), tab === "history" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Share a read-only link",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "0 0 12px",
              fontSize: 14,
              color: MUTED,
              lineHeight: 1.6
            },
            children: "Anyone with the link can see totals only: counts, percentages and division tables. No player names, no emails. The link expires on its own and you can revoke it at any time."
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "days",
              style: {
                fontSize: 14
              },
              children: "Expires in"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
              id: "days",
              value: days,
              onChange: e => setDays(Number(e.target.value)),
              style: {
                fontSize: 15,
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${LINE}`
              },
              children: [1, 3, 7, 14, 30].map(n => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
                value: n,
                children: [n, " day", n === 1 ? "" : "s"]
              }, n))
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn("primary"),
              onClick: createLink,
              disabled: busy === "share",
              children: busy === "share" ? "Creating…" : "Create link"
            })]
          }), newLink ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            role: "status",
            style: {
              marginTop: 14,
              padding: 12,
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
              borderRadius: 10
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                fontSize: 13,
                marginBottom: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: "Copy this now."
              }), " ", newLink.note]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 8,
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                readOnly: true,
                "aria-label": "Share link",
                value: newLink.url,
                onFocus: e => e.target.select(),
                style: {
                  flex: 1,
                  minWidth: 260,
                  fontFamily: F_NUM,
                  fontSize: 12,
                  padding: "7px 10px",
                  border: `1px solid ${LINE}`,
                  borderRadius: 8
                }
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: btn(),
                onClick: () => copy(newLink.url, "Link"),
                children: "Copy"
              })]
            })]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("h3", {
            style: {
              fontFamily: F_NUM,
              fontSize: 12,
              color: MUTED,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              margin: "18px 0 8px"
            },
            children: ["Active links (", shares.length, ")"]
          }), shares.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              fontSize: 14,
              color: MUTED
            },
            children: "No active links."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            style: {
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 8
            },
            children: shares.map(s => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              style: {
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: 14
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: F_NUM,
                  fontSize: 12
                },
                children: ["\u2026", s.id.slice(0, 6)]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                children: ["created ", (0, _reportsEngine.ago)(s.created), " by ", s.by]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  color: MUTED
                },
                children: ["expires ", new Date(s.expires).toLocaleDateString()]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                style: {
                  ...btn(),
                  padding: "3px 10px",
                  fontSize: 13,
                  marginLeft: "auto"
                },
                onClick: () => revoke(s.id),
                children: "Revoke"
              })]
            }, s.id))
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
          title: "Report history",
          pad: false,
          children: [d.history.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              padding: 18,
              margin: 0,
              color: MUTED
            },
            children: "Nothing recorded yet."
          }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
            style: {
              width: "100%",
              borderCollapse: "collapse"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Recorded"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Registered"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Paid"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Unpaid"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  style: TH,
                  children: "Collected"
                })]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
              children: d.history.map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: new Date(h.at).toLocaleString()
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: h.registered
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: h.paid
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: TD,
                  children: h.unpaid
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  style: {
                    ...TD,
                    fontFamily: F_NUM
                  },
                  children: (0, _reportsEngine.money)(h.collected)
                })]
              }, h.at))
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: 0,
              padding: "10px 18px 14px",
              fontSize: 12,
              color: SOFT
            },
            children: "A snapshot is recorded automatically when someone opens this page, at most every 6 hours. It is what powers \u201Csince last visit\u201D."
          })]
        })]
      }), tab === "help" && /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
        title: "How these numbers work",
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("dl", {
          style: {
            margin: 0,
            display: "grid",
            gap: 14,
            fontSize: 14,
            lineHeight: 1.6
          },
          children: [["What counts as “registered”?", "Primary players whose registration is active. Substitutes, withdrawn players and the waitlist are not counted. Paid + waived + pending + failed + refunded always equals registered."], ["Where does “owed” come from?", "The player fee on the Payments tab. If you have not set one, the page uses the typical amount players have paid and says it is an estimate. If neither exists it shows a dash, never $0."], ["What do the reminder emails say?", "A short plain note that the payment is still open and asking them to reply if they already paid. You see the exact wording and who gets it before anything is sent. A player is never emailed twice within " + d.cooldown_days + " days, and each send is limited to " + 100 + " people."], ["What is in a share link?", "Totals only. It has a long random code, expires, and can be revoked. If you want a name-level view, use the CSV exports instead."], ["Why might a forecast be missing?", "It needs at least 10 registrations over at least a week and a registration close date in Settings. Otherwise it tells you why, rather than guessing."], ["How fresh is the data?", "It is read from the database each time you open or refresh this page. To pull in new WPForms entries first, use Sync on the Dashboard or Players page."]].map(([k, a]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("dt", {
              style: {
                fontWeight: 700
              },
              children: k
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dd", {
              style: {
                margin: 0,
                color: MUTED
              },
              children: a
            })]
          }, k))
        })
      })]
    }), rem ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Send payment reminders",
      onKeyDown: e => {
        if (e.key === "Escape") setRem(null);
      },
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,46,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
        padding: 16
      },
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          ...card,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 22
        },
        children: rem.loading ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          children: "Checking who can be reminded\u2026"
        }) : rem.error && !rem.eligible && !rem.done ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              marginTop: 0,
              fontFamily: F_HEAD
            },
            children: "Could not prepare reminders"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              color: MUTED
            },
            children: rem.error
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => setRem(null),
            children: "Close"
          })]
        }) : rem.done ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              marginTop: 0,
              fontFamily: F_HEAD
            },
            children: "Reminders sent"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            style: {
              fontSize: 15
            },
            children: [rem.done.sent, " email", rem.done.sent === 1 ? "" : "s", " sent", rem.done.failed ? `, ${rem.done.failed} could not be sent` : "", ". They will not be reminded again for ", d.cooldown_days, " days."]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("primary"),
            onClick: () => setRem(null),
            children: "Done"
          })]
        }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h2", {
            style: {
              marginTop: 0,
              fontFamily: F_HEAD
            },
            children: ["Send ", rem.eligible, " reminder", rem.eligible === 1 ? "" : "s", "?"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            style: {
              margin: "0 0 8px",
              fontSize: 14,
              color: MUTED
            },
            children: [rem.names.join(", "), rem.eligible > rem.names.length ? ` and ${rem.eligible - rem.names.length} more` : "", ".", rem.skipped_recent ? ` ${rem.skipped_recent} skipped (reminded in the last ${d.cooldown_days} days).` : "", rem.skipped_no_email ? ` ${rem.skipped_no_email} skipped (no email on file).` : "", rem.capped ? " Only the first 100 will be sent now." : ""]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              background: PAPER,
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              marginBottom: 10
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              children: rem.subject
            }), "\n\n", rem.body]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
            htmlFor: "note",
            style: {
              fontSize: 13
            },
            children: "Add a line of your own (optional)"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("textarea", {
            id: "note",
            maxLength: 500,
            rows: 2,
            value: rem.note,
            onChange: e => setRem(s => ({
              ...s,
              note: e.target.value
            })),
            style: {
              width: "100%",
              boxSizing: "border-box",
              fontSize: 14,
              padding: 8,
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              margin: "4px 0 12px",
              fontFamily: F_UI
            }
          }), rem.error ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            role: "alert",
            style: {
              color: "#991B1B",
              fontSize: 14
            },
            children: rem.error
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 8,
              justifyContent: "flex-end"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn(),
              onClick: () => setRem(null),
              children: "Cancel"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn("primary"),
              disabled: rem.sending || !rem.eligible,
              onClick: sendReminders,
              children: rem.sending ? "Sending…" : `Send ${rem.eligible} email${rem.eligible === 1 ? "" : "s"}`
            })]
          })]
        })
      })
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "status",
      "aria-live": "polite",
      style: {
        position: "fixed",
        left: 24,
        bottom: 24,
        maxWidth: 420,
        zIndex: 100001
      },
      children: toast ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          background: INK,
          color: WHITE,
          padding: "12px 16px",
          borderRadius: 10,
          fontSize: 14,
          boxShadow: "0 6px 24px rgba(0,0,0,.25)"
        },
        children: toast
      }) : null
    })]
  });
}