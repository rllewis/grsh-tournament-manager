"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Dashboard;
var _react = require("react");
var _dashboardEngine = require("../lib/dashboardEngine");
var _jsxRuntime = require("react/jsx-runtime");
// Dashboard.jsx — v3
// Every number on this page comes from the server (GET /dashboard and GET /sync/status). There is no mock data:
// if something cannot be measured it shows "—", and if a request fails the card says so and offers a retry.
//
// Includes: do-this-next card · readiness with counts and an explanation · click-through everywhere ·
//           last-sync status · tournament date + milestones · per-division capacity, goalies, stage and links ·
//           real flags, recent registrations and activity · print summary · refreshes when you return to the tab.

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
const adminUrl = (page, params = "") => `/wp-admin/admin.php?page=${page}${params ? params[0] === "?" ? "&" + params.slice(1) : params : ""}`;
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
      status: r.status
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
const SEV = {
  high: {
    bg: "#FEE2E2",
    color: "#991B1B",
    label: "Urgent"
  },
  medium: {
    bg: "#FEF3C7",
    color: "#92400E",
    label: "Soon"
  },
  low: {
    bg: "#E0F2FE",
    color: "#075985",
    label: "When ready"
  }
};
const STAGE = {
  draft: {
    label: "Drafting",
    bg: "#F3F4F6",
    color: "#4B5563"
  },
  locked: {
    label: "Locked",
    bg: "#FEF3C7",
    color: "#92400E"
  },
  published: {
    label: "Published",
    bg: "#DCFCE7",
    color: "#166534"
  }
};
function Card({
  title,
  right,
  children,
  id,
  error,
  onRetry,
  pad = true
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    id: id,
    style: {
      ...card,
      marginBottom: 16,
      overflow: "hidden"
    },
    children: [(title || right) && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "12px 18px",
        borderBottom: `1px solid ${LINE}`
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
        style: {
          margin: 0,
          fontFamily: F_UI,
          fontSize: 15,
          fontWeight: 700,
          color: INK
        },
        children: title
      }), right]
    }), error ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "alert",
      style: {
        padding: 16,
        color: "#991B1B",
        fontSize: 14
      },
      children: [error, " ", onRetry && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        style: btn("ghost", {
          marginLeft: 8,
          padding: "4px 10px"
        }),
        onClick: onRetry,
        children: "Retry"
      })]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: pad ? {
        padding: 18
      } : {},
      children: children
    })]
  });
}
function Gauge({
  score,
  basis,
  total
}) {
  const band = _dashboardEngine.BAND[(0, _dashboardEngine.bandFor)(score)];
  const r = 64,
    c = 2 * Math.PI * r,
    arc = c * 0.75,
    dash = score === null ? 0 : score / 100 * arc;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      textAlign: "center",
      flexShrink: 0,
      width: 190
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("svg", {
      width: "170",
      height: "150",
      viewBox: "0 0 170 150",
      role: "img",
      "aria-label": score === null ? "Readiness not measurable yet" : `Readiness ${score} out of 100, ${band.label}`,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("g", {
        transform: "rotate(135 85 85)",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("circle", {
          cx: "85",
          cy: "85",
          r: r,
          fill: "none",
          stroke: "#EEECE4",
          strokeWidth: "12",
          strokeDasharray: `${arc} ${c - arc}`,
          strokeLinecap: "round"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("circle", {
          cx: "85",
          cy: "85",
          r: r,
          fill: "none",
          stroke: band.ring,
          strokeWidth: "12",
          strokeDasharray: `${dash} ${c - dash}`,
          strokeLinecap: "round"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("text", {
        x: "85",
        y: "88",
        textAnchor: "middle",
        style: {
          fontFamily: F_HEAD,
          fontSize: 40,
          fontWeight: 700,
          fill: band.color
        },
        children: score === null ? "—" : score
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("text", {
        x: "85",
        y: "108",
        textAnchor: "middle",
        style: {
          fontFamily: F_NUM,
          fontSize: 12,
          fill: SOFT
        },
        children: score === null ? "" : "out of 100"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: F_UI,
        fontWeight: 700,
        fontSize: 14,
        color: band.color,
        marginTop: -6
      },
      children: band.label
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: F_UI,
        fontSize: 12,
        color: SOFT,
        marginTop: 2
      },
      children: basis === 0 ? "Nothing to measure yet" : `Based on ${basis} of ${total} measures`
    })]
  });
}
const ROW_LINK = {
  registration: "grsh-tm-players",
  payments: "grsh-tm-players",
  approvals: "grsh-tm-players",
  rosters: "grsh-tm-rosters"
};
const ROW_NOTE = {
  registration: (r, m) => m ? `${r.have} registered · minimum needed ${r.of} · room for ${m.room} more` : "",
  payments: r => `${r.have} of ${r.of} paid or waived`,
  approvals: r => `${r.have} of ${r.of} approved`,
  rosters: r => `${r.have} of ${r.of} teams have enough players and a goalie`
};
const ROW_NOTE_EMPTY = {
  registration: "Set teams and roster sizes in Settings to measure this.",
  payments: "No registered players yet.",
  approvals: "No registered players yet.",
  rosters: "No teams created yet."
};
function Dashboard() {
  const [dash, setDash] = (0, _react.useState)(null);
  const [dashErr, setDashErr] = (0, _react.useState)("");
  const [sync, setSync] = (0, _react.useState)(null); // /sync/status
  const [syncErr, setSyncErr] = (0, _react.useState)("");
  const [loading, setLoading] = (0, _react.useState)(true);
  const [syncing, setSyncing] = (0, _react.useState)(false);
  const [result, setResult] = (0, _react.useState)(null);
  const [dateEdit, setDateEdit] = (0, _react.useState)(false);
  const [dateVal, setDateVal] = (0, _react.useState)("");
  const [dateMsg, setDateMsg] = (0, _react.useState)("");
  const [showAll, setShowAll] = (0, _react.useState)(false);
  const [fetchedAt, setFetchedAt] = (0, _react.useState)(0);
  const busy = (0, _react.useRef)(false);
  const load = (0, _react.useCallback)(async () => {
    const [a, b] = await Promise.all([api("/dashboard"), api("/sync/status")]);
    if (a.ok) {
      setDash(a.data);
      setDashErr("");
    } else setDashErr(a.error);
    if (b.ok) {
      setSync(b.data);
      setSyncErr("");
    } else setSyncErr(b.error);
    setFetchedAt(Date.now());
    setLoading(false);
  }, []);
  (0, _react.useEffect)(() => {
    load();
  }, [load]);
  // refresh when you come back to the tab, so you never act on a view that is hours old
  (0, _react.useEffect)(() => {
    const h = () => {
      if (document.visibilityState === "visible" && Date.now() - fetchedAt > 60000) load();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [fetchedAt, load]);
  const doSync = async () => {
    if (busy.current) return; // a double click must not start a second import
    busy.current = true;
    setSyncing(true);
    setResult(null);
    const r = await api("/sync", {
      method: "POST"
    });
    setResult(r.ok ? {
      ok: !(r.data.errors && r.data.errors.length),
      data: r.data
    } : {
      ok: false,
      error: r.error
    });
    await load();
    setSyncing(false);
    busy.current = false;
  };
  const saveDate = async v => {
    setDateMsg("");
    const r = await api("/dashboard/tournament-date", {
      method: "POST",
      body: JSON.stringify({
        date: v
      })
    });
    if (r.ok) {
      setDash(r.data);
      setDateEdit(false);
    } else setDateMsg(r.error);
  };
  const ready = (0, _react.useMemo)(() => (0, _dashboardEngine.readiness)(dash && dash.metrics), [dash]);
  const actions = (0, _react.useMemo)(() => (0, _dashboardEngine.nextActions)(dash, {
    unsynced: sync ? sync.unsynced : null
  }), [dash, sync]);
  const days = dash ? (0, _dashboardEngine.daysUntil)(dash.tournament_date) : null;
  const goTo = (page, params) => {
    window.location.href = adminUrl(page, params);
  };
  if (loading) return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      padding: 40,
      fontFamily: F_UI,
      color: MUTED
    },
    children: "Loading the dashboard\u2026"
  });
  const t = dash ? dash.totals : null;
  const stats = [{
    label: "Form entries",
    value: sync ? sync.total_entries : null,
    sub: "submitted in WPForms",
    page: "grsh-tm-players",
    color: INK,
    err: syncErr
  }, {
    label: "Waiting to import",
    value: sync ? sync.unsynced : null,
    sub: sync && sync.unsynced > 0 ? "press Sync to bring them in" : "everything is imported",
    color: sync && sync.unsynced > 0 ? "#6B21A8" : "#166534",
    err: syncErr,
    onClick: () => document.getElementById("sync-btn") && document.getElementById("sync-btn").focus()
  }, {
    label: "Registered players",
    value: t ? t.registered : null,
    sub: "counted toward the tournament",
    page: "grsh-tm-players",
    color: INK,
    err: dashErr
  }, {
    label: "Unpaid",
    value: t ? t.unpaid : null,
    sub: t && t.unpaid > 0 ? "payment still pending" : "nobody owes",
    page: "grsh-tm-players",
    color: t && t.unpaid > 0 ? "#92400E" : "#166534",
    err: dashErr
  }, {
    label: "Alternates",
    value: t ? t.alternates : null,
    sub: "signed up as subs",
    page: "grsh-tm-alternates",
    color: "#1E3A8A",
    err: dashErr
  }, {
    label: "Sandbagging flags",
    value: t ? t.sandbagging_flags : null,
    sub: t && t.sandbagging_flags > 0 ? "need a committee decision" : "none to review",
    page: "grsh-tm-players",
    color: t && t.sandbagging_flags > 0 ? "#991B1B" : "#166534",
    err: dashErr
  }];
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      fontFamily: F_UI,
      color: INK,
      padding: "20px 24px 60px",
      maxWidth: 1300
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `
        .grsh-card-link:hover{background:#FAFAF8!important}
        .grsh-card-link:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid ${GOLD};outline-offset:2px}
        @media(max-width:900px){.grsh-two{grid-template-columns:1fr!important}.grsh-ready{flex-direction:column!important;align-items:stretch!important}}
        @media print{body *{visibility:hidden!important}.grsh-printable,.grsh-printable *{visibility:visible!important}.grsh-printable{position:absolute;left:0;top:0;width:100%}.grsh-noprint{display:none!important}}
      `
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "grsh-printable",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("header", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          style: {
            background: INK,
            color: GOLD,
            fontFamily: F_NUM,
            fontSize: 12,
            letterSpacing: ".06em",
            borderRadius: 99,
            padding: "4px 12px"
          },
          children: ["SEASON ", dash ? dash.season.year : "—", dash && dash.season.status ? ` · ${dash.season.status.toUpperCase()}` : ""]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
          style: {
            margin: 0,
            fontFamily: F_HEAD,
            fontSize: 28
          },
          children: dash ? `Season ${dash.season.year} Overview` : "Season Overview"
        }), days !== null ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          title: (0, _dashboardEngine.prettyDate)(dash.tournament_date),
          style: {
            background: days <= 30 && days >= 0 ? "#FEF3C7" : PAPER,
            border: `1px solid ${LINE}`,
            borderRadius: 99,
            padding: "4px 12px",
            fontSize: 13
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            style: {
              fontFamily: F_HEAD,
              fontSize: 16
            },
            children: Math.abs(days)
          }), " day", Math.abs(days) === 1 ? "" : "s", " ", days >= 0 ? "to" : "since", " the tournament"]
        }) : dash && /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
          href: "#dates",
          className: "grsh-noprint",
          style: {
            fontSize: 13,
            color: "#92400E"
          },
          children: "Set the tournament date"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            flex: 1
          }
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "grsh-noprint",
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: 13,
              color: dash && dash.sync_failures_7d > 0 ? "#991B1B" : SOFT
            },
            id: "sync",
            children: dash && dash.last_sync ? `Last import ${dash.last_sync.ok ? "succeeded" : "FAILED"} ${(0, _dashboardEngine.ago)(dash.last_sync.at, dash.server_now)}${dash.last_sync.by ? ` (${dash.last_sync.by})` : ""}` : "No import has run yet"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            id: "sync-btn",
            style: btn("primary", {
              opacity: syncing ? 0.7 : 1
            }),
            disabled: syncing,
            onClick: doSync,
            children: syncing ? "Importing…" : "Sync from WPForms"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => window.print(),
            children: "Print summary"
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        role: "status",
        "aria-live": "polite",
        children: result && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            ...card,
            padding: "10px 16px",
            marginBottom: 14,
            borderColor: result.ok ? "#86EFAC" : "#FCA5A5",
            background: result.ok ? "#F0FDF4" : "#FEF2F2",
            color: result.ok ? "#166534" : "#991B1B",
            fontSize: 14
          },
          children: result.error ? `Import did not run: ${result.error}` : result.ok ? result.data.message && !result.data.imported ? result.data.message : `Import complete — ${(0, _dashboardEngine.num)(result.data.imported) ?? 0} new registration${result.data.imported === 1 ? "" : "s"} added.` : `Import finished with problems — ${(0, _dashboardEngine.num)(result.data.imported) ?? 0} added, ${(0, _dashboardEngine.num)(result.data.skipped) ?? 0} skipped. See Recent activity for the reasons.`
        })
      }), dashErr && !dash && /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
        title: "Dashboard data",
        error: `The dashboard could not load: ${dashErr}`,
        onRetry: load
      }), dash && /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
        style: {
          ...card,
          marginBottom: 16,
          padding: "14px 18px",
          borderLeft: `5px solid ${actions.length ? actions[0].severity === "high" ? "#DC2626" : GOLD : "#22c55e"}`
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontSize: 12,
            fontWeight: 700,
            color: SOFT,
            letterSpacing: ".06em",
            marginBottom: 6
          },
          children: "DO THIS NEXT"
        }), actions.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontSize: 16,
            color: "#166534",
            fontWeight: 600
          },
          children: "Nothing needs your attention right now."
        }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontSize: 17,
                fontWeight: 700,
                flex: 1,
                minWidth: 240
              },
              children: actions[0].text
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
              className: "grsh-noprint",
              style: btn("primary"),
              href: adminUrl(actions[0].page, actions[0].params.startsWith("#") ? "" : actions[0].params) + (actions[0].params.startsWith("#") ? actions[0].params : ""),
              children: "Go there \u2192"
            })]
          }), actions.length > 1 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              marginTop: 10
            },
            children: [(showAll ? actions.slice(1) : actions.slice(1, 4)).map(a => /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
              href: adminUrl(a.page, a.params.startsWith("#") ? "" : a.params) + (a.params.startsWith("#") ? a.params : ""),
              style: {
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "5px 0",
                color: INK,
                textDecoration: "none",
                fontSize: 14
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  background: SEV[a.severity].bg,
                  color: SEV[a.severity].color,
                  borderRadius: 99,
                  padding: "1px 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 64,
                  textAlign: "center"
                },
                children: SEV[a.severity].label
              }), a.text]
            }, a.key)), actions.length > 4 && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              className: "grsh-noprint",
              style: {
                ...btn("ghost"),
                padding: "3px 10px",
                fontSize: 13,
                marginTop: 6
              },
              onClick: () => setShowAll(!showAll),
              children: showAll ? "Show fewer" : `Show all ${actions.length}`
            })]
          })]
        })]
      }), dash && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
        title: "Tournament readiness",
        pad: true,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "grsh-ready",
          style: {
            display: "flex",
            gap: 28,
            alignItems: "center"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Gauge, {
            score: ready.score,
            basis: ready.basis,
            total: ready.total
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              flex: 1,
              display: "grid",
              gap: 14
            },
            children: ready.rows.map(row => {
              const m = dash.metrics[row.key];
              const col = row.pct === null ? SOFT : row.pct >= 90 ? "#166534" : row.pct >= 70 ? INK : row.pct >= 50 ? "#92400E" : "#991B1B";
              return /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
                href: adminUrl(ROW_LINK[row.key]),
                className: "grsh-card-link",
                style: {
                  textDecoration: "none",
                  color: INK,
                  display: "block",
                  padding: "2px 4px",
                  borderRadius: 6
                },
                title: `${row.label} — counts ${row.weight}% of the readiness score. Click to open.`,
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    fontWeight: 600
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    children: row.label
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    style: {
                      fontFamily: F_NUM,
                      color: col
                    },
                    children: [(0, _dashboardEngine.fmtPct)(row.pct), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                      style: {
                        color: SOFT,
                        fontWeight: 400,
                        fontSize: 12
                      },
                      children: ["(", row.weight, "%)"]
                    })]
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    height: 8,
                    background: "#EEECE4",
                    borderRadius: 99,
                    margin: "5px 0",
                    overflow: "hidden"
                  },
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                    style: {
                      width: `${row.pct === null ? 0 : row.pct}%`,
                      height: "100%",
                      background: col
                    }
                  })
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    fontSize: 13,
                    color: SOFT
                  },
                  children: m ? ROW_NOTE[row.key](m, row.key === "registration" ? m : null) : ROW_NOTE_EMPTY[row.key]
                })]
              }, row.key);
            })
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
          style: {
            marginTop: 14,
            fontSize: 13,
            color: MUTED
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("summary", {
            style: {
              cursor: "pointer",
              fontWeight: 600
            },
            children: "How is this calculated?"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              margin: "8px 0 0"
            },
            children: "Each measure is a simple count: for example \u201C7 of 7 paid\u201D. The score is the weighted average of the measures that can be measured (registration 30%, payments 25%, approvals 25%, rosters 20%). A measure with nothing to count yet \u2014 like rosters before any team exists \u2014 is left out instead of counted as zero, and the score says how many measures it used. \u201CMinimum needed\u201D is the number of teams times the minimum roster size for each division, from Settings."
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
          gap: 10,
          marginBottom: 16
        },
        children: stats.map(s => {
          const body = /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: s.color
              }
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontSize: 13,
                color: SOFT,
                fontWeight: 600,
                marginTop: 6
              },
              children: s.label
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: F_HEAD,
                fontSize: 32,
                fontWeight: 700,
                color: s.err ? SOFT : s.color,
                lineHeight: 1.15
              },
              children: s.err ? "—" : (0, _dashboardEngine.num)(s.value) === null ? "—" : s.value
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontSize: 12,
                color: s.err ? "#991B1B" : SOFT
              },
              children: s.err ? "could not load" : s.sub
            })]
          });
          const st = {
            ...card,
            position: "relative",
            padding: "12px 14px",
            textDecoration: "none",
            color: INK,
            display: "block",
            textAlign: "left",
            cursor: "pointer",
            font: "inherit"
          };
          return s.onClick ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            className: "grsh-card-link",
            onClick: s.onClick,
            style: st,
            children: body
          }, s.label) : /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
            className: "grsh-card-link",
            href: adminUrl(s.page),
            style: st,
            children: body
          }, s.label);
        })
      }), dash && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Card, {
        id: "dates",
        title: "Key dates",
        right: !dateEdit && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "grsh-noprint",
          style: btn("ghost", {
            padding: "4px 10px",
            fontSize: 13
          }),
          onClick: () => {
            setDateVal(dash.tournament_date);
            setDateEdit(true);
          },
          children: dash.tournament_date ? "Change tournament date" : "Set tournament date"
        }),
        children: [dateEdit && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "grsh-noprint",
          style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
            style: {
              fontSize: 14
            },
            children: ["Tournament date ", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              type: "date",
              value: dateVal,
              onChange: e => setDateVal(e.target.value),
              style: {
                marginLeft: 6,
                padding: 6,
                border: `1px solid ${LINE}`,
                borderRadius: 8
              }
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn("primary"),
            onClick: () => saveDate(dateVal),
            children: "Save"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => setDateEdit(false),
            children: "Cancel"
          }), dash.tournament_date && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            style: btn(),
            onClick: () => saveDate(""),
            children: "Clear date"
          }), dateMsg && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            role: "alert",
            style: {
              color: "#991B1B",
              fontSize: 13
            },
            children: dateMsg
          })]
        }), dash.milestones.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            color: SOFT,
            fontSize: 14
          },
          children: "No dates set yet. Registration and draft dates come from Settings; the tournament date is set here."
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ol", {
          style: {
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 8
          },
          children: dash.milestones.map(m => {
            const d = (0, _dashboardEngine.daysUntil)(m.date),
              past = d !== null && d < 0;
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                opacity: past ? 0.6 : 1
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: past ? "#22c55e" : d === 0 ? "#DC2626" : GOLD
                },
                "aria-hidden": "true"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                style: {
                  minWidth: 150
                },
                children: m.label
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                children: (0, _dashboardEngine.prettyDate)(m.date)
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  color: SOFT
                },
                children: d === null ? "" : d === 0 ? "today" : past ? `${-d} day${d === -1 ? "" : "s"} ago` : `in ${d} day${d === 1 ? "" : "s"}`
              })]
            }, m.key);
          })
        })]
      }), dash && /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
        title: "Divisions",
        pad: false,
        right: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            fontSize: 13,
            color: SOFT
          },
          children: "Bar = registered. Marker = minimum needed."
        }),
        children: dash.divisions.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            padding: 18,
            color: SOFT
          },
          children: "No divisions are switched on in Settings."
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))"
          },
          children: dash.divisions.map(v => {
            const f = (0, _dashboardEngine.fillState)(v),
              tot = Object.values(v.tiers).reduce((a, b) => a + b, 0);
            const st = STAGE[v.stage] || STAGE.draft;
            const pctBar = f.cap ? Math.min(100, f.have / f.cap * 100) : 0,
              mark = f.cap ? f.need / f.cap * 100 : null;
            const goalieNeed = v.planned_teams;
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                padding: "16px 18px",
                borderRight: `1px solid ${LINE}`,
                borderBottom: `1px solid ${LINE}`,
                borderTop: `4px solid ${v.color}`
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
                  style: {
                    margin: 0,
                    fontFamily: F_HEAD,
                    fontSize: 18,
                    color: v.color,
                    flex: 1
                  },
                  children: v.label
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    background: st.bg,
                    color: st.color,
                    borderRadius: 99,
                    padding: "2px 9px",
                    fontSize: 12,
                    fontWeight: 700
                  },
                  children: v.draft_status === "active" || v.draft_status === "paused" ? `Draft ${v.draft_status}` : st.label
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontSize: 14,
                  margin: "8px 0 4px"
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  style: {
                    fontFamily: F_HEAD,
                    fontSize: 24
                  },
                  children: v.registered
                }), " registered", f.need ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  style: {
                    color: SOFT
                  },
                  children: [" \xB7 need ", f.need, ", room for ", f.room, " more"]
                }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    color: SOFT
                  },
                  children: " \xB7 set teams in Settings"
                })]
              }), f.cap ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  position: "relative",
                  height: 8,
                  background: "#EEECE4",
                  borderRadius: 99,
                  margin: "6px 0 10px"
                },
                title: `${f.have} registered; minimum ${f.need}; capacity ${f.cap}`,
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    width: `${pctBar}%`,
                    height: "100%",
                    borderRadius: 99,
                    background: f.state === "short" ? "#f59e0b" : v.color
                  }
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    position: "absolute",
                    top: -3,
                    left: `${mark}%`,
                    height: 14,
                    width: 2,
                    background: INK
                  }
                })]
              }) : null, f.state === "short" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontSize: 13,
                  color: "#92400E"
                },
                children: [f.short, " short of the minimum"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px 12px",
                  fontSize: 13,
                  margin: "10px 0"
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: v.paid
                  }), " of ", v.registered, " paid", v.unpaid > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    style: {
                      color: "#92400E"
                    },
                    children: [" (", v.unpaid, " owe)"]
                  }) : ""]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: v.goalies
                  }), " goalie", v.goalies === 1 ? "" : "s", goalieNeed ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    style: {
                      color: v.goalies < goalieNeed ? "#991B1B" : SOFT
                    },
                    children: [" (need ", goalieNeed, ")"]
                  }) : ""]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: v.subs
                  }), " alternate", v.subs === 1 ? "" : "s"]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: v.teams
                  }), " of ", v.planned_teams, " team", v.planned_teams === 1 ? "" : "s", " \xB7 ", v.rostered, " rostered"]
                })]
              }), tot > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                "aria-label": "Skill tier mix",
                style: {
                  marginBottom: 10
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    display: "flex",
                    height: 8,
                    borderRadius: 99,
                    overflow: "hidden",
                    gap: 1
                  },
                  children: [["A", "#E8A0A0"], ["B", "#EDBA94"], ["C", "#EAD08A"], ["R", "#9CB8EC"]].filter(([k]) => v.tiers[k] > 0).map(([k, c]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                    title: `Tier ${k}: ${v.tiers[k]}`,
                    style: {
                      flex: v.tiers[k],
                      background: c,
                      minWidth: 4
                    }
                  }, k))
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontSize: 12,
                    color: SOFT,
                    marginTop: 3
                  },
                  children: ["Tiers: ", ["A", "B", "C", "R"].filter(k => v.tiers[k] > 0).map(k => `${k} ${v.tiers[k]}`).join(" · "), v.tiers["?"] > 0 ? ` · unrated ${v.tiers["?"]}` : ""]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "grsh-noprint",
                style: {
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap"
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
                  style: btn("ghost", {
                    padding: "5px 10px",
                    fontSize: 13
                  }),
                  href: adminUrl("grsh-tm-rosters", `?division=${encodeURIComponent(v.key)}`),
                  children: "Rosters"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
                  style: btn("ghost", {
                    padding: "5px 10px",
                    fontSize: 13
                  }),
                  href: adminUrl("grsh-tm-draft"),
                  children: "Draft"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
                  style: btn("ghost", {
                    padding: "5px 10px",
                    fontSize: 13
                  }),
                  href: adminUrl("grsh-tm-players"),
                  children: "Players"
                })]
              })]
            }, v.key);
          })
        })
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "grsh-two",
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: dash && dash.flags.length ? `Sandbagging flags (${dash.totals.sandbagging_flags})` : "Sandbagging flags",
          error: dashErr && !dash ? dashErr : "",
          onRetry: load,
          pad: false,
          children: dash && (dash.flags.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              padding: 18,
              color: "#166534",
              fontSize: 14
            },
            children: "No flagged players."
          }) : dash.flags.map(f => /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
            href: adminUrl("grsh-tm-players"),
            className: "grsh-card-link",
            style: {
              display: "block",
              padding: "10px 18px",
              borderBottom: `1px solid ${LINE}`,
              textDecoration: "none",
              color: INK
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              children: f.player
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                fontSize: 13,
                color: SOFT
              },
              children: ["Rated ", f.tier || "?", ", asked for ", String(f.division).replace(/_/g, " ")]
            })]
          }, f.id)))
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
          title: "Recent registrations",
          error: syncErr && !sync ? syncErr : "",
          onRetry: load,
          pad: false,
          right: /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
            href: adminUrl("grsh-tm-players"),
            style: {
              fontSize: 13
            },
            children: "View all \u2192"
          }),
          children: sync && ((sync.recent_imports || []).length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              padding: 18,
              color: SOFT,
              fontSize: 14
            },
            children: "No registrations yet."
          }) : sync.recent_imports.map(r => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 18px",
              borderBottom: `1px solid ${LINE}`,
              fontSize: 14
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: r.name
              }), r.type === "sub" && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  marginLeft: 6,
                  fontSize: 11,
                  background: "#EDE9FE",
                  color: "#4C1D95",
                  padding: "1px 6px",
                  borderRadius: 4
                },
                children: "ALT"
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontSize: 12,
                  color: SOFT
                },
                children: [String(r.division || "").replace(/_/g, " "), r.position && r.position !== "—" ? ` · ${r.position}` : "", r.time ? ` · ${r.time}` : ""]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontSize: 12,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 99,
                background: r.status === "paid" ? "#DCFCE7" : r.status === "pending" ? "#FEF3C7" : "#EDE9FE",
                color: r.status === "paid" ? "#166534" : r.status === "pending" ? "#92400E" : "#4C1D95"
              },
              children: r.status
            })]
          }, r.id)))
        })]
      }), dash && /*#__PURE__*/(0, _jsxRuntime.jsx)(Card, {
        id: "activity",
        title: "Recent activity",
        right: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            fontSize: 13,
            color: SOFT
          },
          children: "From the audit log"
        }),
        pad: false,
        children: dash.activity.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            padding: 18,
            color: SOFT,
            fontSize: 14
          },
          children: "Nothing logged yet."
        }) : dash.activity.map(a => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "9px 18px",
            borderBottom: `1px solid ${LINE}`,
            fontSize: 14
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              width: 8,
              height: 8,
              borderRadius: 4,
              background: a.action === "sync_failed" ? "#DC2626" : "#D0CEC6"
            },
            "aria-hidden": "true"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              flex: 1
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              children: (0, _dashboardEngine.actionLabel)(a.action)
            }), a.notes ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                color: MUTED
              },
              children: [" \u2014 ", a.notes]
            }) : null]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              fontSize: 12,
              color: SOFT
            },
            children: [a.by ? `${a.by} · ` : "", (0, _dashboardEngine.ago)(a.at, dash.server_now)]
          })]
        }, a.id))
      })]
    })]
  });
}