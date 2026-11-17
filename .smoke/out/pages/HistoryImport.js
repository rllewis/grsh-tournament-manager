"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = HistoryImport;
var _react = require("react");
var E = _interopRequireWildcard(require("../lib/importEngine"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const API = window.grshConfig && window.grshConfig.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig && window.grshConfig.nonce || "";
const ICONS = {
  upload: "M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 11v5m0-8.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  download: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8",
  db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  cal: "M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4v1a3 3 0 0 0 4 2.8M16 6h4v1a3 3 0 0 1-4 2.8M12 13v4m-4 3h8M10 17h4",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5",
  clip: "M9 4h6l1 2h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3l1-2z",
  chev: "M9 6l6 6-6 6",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
};
function Ic({
  n,
  s = 18
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("svg", {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)("path", {
      d: ICONS[n]
    })
  });
}
const saveBlob = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], {
    type: type || "text/csv;charset=utf-8"
  }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function call(path, opts) {
  const o = opts || {};
  try {
    const res = await fetch(API + path, {
      ...o,
      headers: {
        "X-WP-Nonce": NONCE,
        ...(o.headers || {})
      }
    });
    let j = null;
    try {
      j = await res.json();
    } catch (e) {/* not json */}
    return {
      ok: res.ok,
      status: res.status,
      j: j || {}
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      j: {
        message: "Could not reach the server. Check your connection and try again."
      }
    };
  }
}
const ACTION = {
  insert: ["New", "ok"],
  update: ["Update", "info"],
  unchanged: ["Same", "mute"],
  skip: ["Skipped", "warn"],
  error: ["Problem", "bad"]
};
const DIV_LABEL = E.DIVISIONS;
function Modal({
  title,
  onClose,
  children,
  wide
}) {
  const ref = (0, _react.useRef)(null);
  const closeRef = (0, _react.useRef)(onClose);
  closeRef.current = onClose;
  (0, _react.useEffect)(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const first = el && el.querySelector("[data-autofocus],button,input,select,textarea,[href]");
    if (first) first.focus();
    const key = e => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll("button,input,select,textarea,[href],[tabindex]:not([tabindex='-1'])")].filter(n => !n.disabled);
      if (!f.length) return;
      const a = f[0],
        z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    className: "gi-scrim",
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gi-modal" + (wide ? " wide" : ""),
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "gi-modal-t",
      ref: ref,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
        id: "gi-modal-t",
        className: "gi-h2",
        children: title
      }), children]
    })
  });
}
function Pill({
  tone,
  children
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    className: "gi-pill " + (tone || "mute"),
    children: children
  });
}
function StatCard({
  icon,
  label,
  value,
  sub
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gi-stat",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      className: "gi-stat-ic",
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: icon
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gi-stat-n",
        children: value
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gi-stat-l",
        children: label
      }), sub ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gi-stat-s",
        children: sub
      }) : null]
    })]
  });
}
function Coverage({
  coverage
}) {
  const g = (0, _react.useMemo)(() => E.coverageGrid(coverage), [coverage]);
  if (!g.seasons.length) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    className: "gi-card",
    "aria-labelledby": "gi-cov-t",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gi-card-h",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
        id: "gi-cov-t",
        className: "gi-h2",
        children: "Coverage map"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gi-sub",
        children: "Records per season and division. Darker means more."
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gi-covwrap",
      role: "region",
      "aria-label": "Coverage by season and division",
      tabIndex: 0,
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
        className: "gi-cov",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Season"
            }), g.divisions.map(d => /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: DIV_LABEL[d]
            }, d))]
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
          children: g.seasons.map(s => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "row",
              children: s
            }), g.divisions.map(d => {
              const n = g.cells[s + "|" + d] || 0;
              const h = E.heat(n, g.max);
              return /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                className: "h" + h,
                title: n ? `${n} records` : "No records",
                children: n || /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-gap",
                  children: "gap"
                })
              }, d);
            })]
          }, s))
        })]
      })
    }), g.gaps.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gi-note",
      children: [g.gaps.length === 1 ? "1 gap" : g.gaps.length + " gaps", ": ", g.gaps.slice(0, 6).map(x => `${x.season} ${DIV_LABEL[x.division]}`).join(", "), g.gaps.length > 6 ? "…" : "", ". A gap is not always a mistake (that division may not have run), but it is worth a look."]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gi-note",
      children: "No gaps. Every season has records in every division on file."
    })]
  });
}
function MappingPanel({
  map,
  parsed,
  onChange
}) {
  const missing = E.missingRequired(map);
  const review = E.needsReview(map);
  const unused = E.unusedColumns(map);
  const [open, setOpen] = (0, _react.useState)(false);
  const show = open || missing.length > 0 || review.length > 0;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    className: "gi-sec",
    "aria-labelledby": "gi-map-t",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gi-sec-h",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        id: "gi-map-t",
        className: "gi-h3",
        children: "Column matching"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gi-link",
        "aria-expanded": show,
        onClick: () => setOpen(!show),
        disabled: missing.length > 0 || review.length > 0,
        children: show ? "Hide" : "Review"
      })]
    }), missing.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gi-alert bad",
      role: "alert",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " Missing required: ", missing.map(E.fieldLabel).join(", "), ". Pick which of your columns holds each one below."]
    }) : null, !missing.length && review.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gi-alert warn",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " ", E.plural(review.length, "column was matched by guesswork", "columns were matched by guesswork"), ". Please confirm below."]
    }) : null, !missing.length && !review.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gi-note",
      children: ["All ", map.filter(m => m.col).length, " recognised columns matched", unused.length ? `; ${E.plural(unused.length, "column is", "columns are")} ignored (${unused.slice(0, 4).map(m => m.raw || "blank").join(", ")}${unused.length > 4 ? "…" : ""}).` : "."]
    }) : null, show ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gi-tablewrap",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
        className: "gi-table",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Your column"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "First value"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Goes into"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Status"
            })]
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
          children: map.map(m => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
              className: "gi-strong",
              children: m.raw || /*#__PURE__*/(0, _jsxRuntime.jsx)("em", {
                children: "(blank header)"
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
              className: "gi-dim",
              children: parsed.rows[0] && parsed.rows[0][m.index] || "—"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                "aria-label": `Where “${m.raw}” goes`,
                className: "gi-select",
                value: m.col,
                onChange: e => onChange(m.index, e.target.value),
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                  value: "",
                  children: "Ignore this column"
                }), E.COLUMNS.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
                  value: c.col,
                  children: [E.fieldLabel(c.col), c.req ? " (required)" : ""]
                }, c.col))]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
              children: m.how === "exact" || m.how === "alias" || m.how === "manual" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "ok",
                children: "Matched"
              }) : m.how === "fuzzy" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "warn",
                children: "Check"
              }) : m.how === "duplicate" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "warn",
                children: "Duplicate"
              }) : /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                children: "Ignored"
              })
            })]
          }, m.index))
        })]
      })
    }) : null]
  });
}
function RowTable({
  rows,
  kept,
  truncated
}) {
  const [f, setF] = (0, _react.useState)("all");
  const [page, setPage] = (0, _react.useState)(0);
  const counts = (0, _react.useMemo)(() => E.countActions(rows), [rows]);
  const list = (0, _react.useMemo)(() => f === "all" ? rows : rows.filter(r => r.action === f), [rows, f]);
  const per = 20;
  const pages = Math.max(1, Math.ceil(list.length / per));
  (0, _react.useEffect)(() => {
    setPage(0);
  }, [f, rows]);
  const slice = list.slice(page * per, page * per + per);
  const chips = [["all", "All", rows.length], ["insert", "New", counts.insert], ["update", "Update", counts.update], ["unchanged", "Same", counts.unchanged], ["skip", "Skipped", counts.skip], ["error", "Problems", counts.error]];
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    className: "gi-sec",
    "aria-labelledby": "gi-rows-t",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
      id: "gi-rows-t",
      className: "gi-h3",
      children: "Row by row"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gi-chips",
      role: "group",
      "aria-label": "Filter rows",
      children: chips.filter(c => c[0] === "all" || c[2] > 0).map(([k, l, n]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gi-chip" + (f === k ? " on" : ""),
        "aria-pressed": f === k,
        onClick: () => setF(k),
        children: [l, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: n
        })]
      }, k))
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gi-tablewrap",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
        className: "gi-table",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Line"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Player"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Season"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "What will happen"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
              scope: "col",
              children: "Details"
            })]
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
          children: slice.map(r => {
            const [lab, tone] = ACTION[r.action] || ["?", "mute"];
            const ch = r.changes && typeof r.changes === "object" ? Object.entries(r.changes) : [];
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                className: "gi-dim",
                children: E.sheetLine(kept, r.line)
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-strong",
                  children: r.name || "—"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-sm",
                  children: r.email
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                children: [r.season_year || "—", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-sm",
                  children: DIV_LABEL[E.normDivision(r.division)] || r.division
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: tone,
                  children: lab
                }), r.player === "new" && r.action === "insert" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-sm",
                  children: "new player"
                }) : null]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                className: "gi-detail",
                children: [ch.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
                  className: "gi-diff",
                  children: ch.map(([k, v]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
                    children: E.diffText(v, k)
                  }, k))
                }) : null, r.note ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  children: r.note
                }) : null, !ch.length && !r.note ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-dim",
                  children: "\u2014"
                }) : null]
              })]
            }, r.line);
          })
        })]
      })
    }), truncated ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gi-note",
      children: "Showing the first rows only. The totals above still cover the whole file."
    }) : null, pages > 1 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gi-pager",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gi-btn ghost",
        disabled: page === 0,
        onClick: () => setPage(page - 1),
        children: "Previous"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        children: ["Page ", page + 1, " of ", pages]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gi-btn ghost",
        disabled: page >= pages - 1,
        onClick: () => setPage(page + 1),
        children: "Next"
      })]
    }) : null]
  });
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=DM+Mono:wght@400;500&display=swap');
.gi{--navy:#1a1a2e;--gold:#d4a017;--goldt:#7a5a05;--cream:#f6f5f0;--line:#e3e0d6;--mut:#55556a;--ok:#1f6f46;--okb:#e6f4ec;--warn:#85540a;--warnb:#fdf3dc;--bad:#b3261e;--badb:#fdeceb;--info:#27578f;--infob:#e8f0fa;
 font-family:'DM Mono',ui-monospace,Menlo,monospace;font-size:14px;line-height:1.55;color:var(--navy);background:var(--cream);margin:0 -20px;padding:0 20px 56px;min-height:100vh;box-sizing:border-box}
.gi *,.gi *::before,.gi *::after{box-sizing:border-box}
.gi button,.gi select,.gi input,.gi textarea{font-family:inherit;font-size:inherit;color:inherit}
.gi button:focus-visible,.gi select:focus-visible,.gi input:focus-visible,.gi textarea:focus-visible,.gi [tabindex]:focus-visible,.gi a:focus-visible,.gi summary:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.gi-wrap{max-width:1180px;margin:0 auto}
.gi-hero{background:linear-gradient(135deg,#1a1a2e 0%,#2a2a4a 100%);color:#fff;border-radius:0 0 18px 18px;margin:0 -20px 22px;padding:30px 20px 26px;position:relative;overflow:hidden}
.gi-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(212,160,23,.35),transparent 70%)}
.gi-hero-in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;position:relative;z-index:1}
.gi-kicker{color:#f0cf6e;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px}
.gi-h1{font-family:'Fraunces',Georgia,serif;font-size:34px;line-height:1.1;margin:0 0 8px;font-weight:700;color:#fff}
.gi-lead{margin:0;color:#e4e4ee;max-width:640px}
.gi-last{margin-top:12px;display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:5px 14px;font-size:13px;color:#fff}
.gi-h2{font-family:'Fraunces',Georgia,serif;font-size:21px;margin:0;font-weight:600;color:var(--navy)}
.gi-h3{font-family:'Fraunces',Georgia,serif;font-size:17px;margin:0;font-weight:600}
.gi-sub{color:var(--mut);font-size:13px}
.gi-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px}
.gi-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;gap:12px;align-items:center;min-height:84px}
.gi-stat-ic{width:40px;height:40px;border-radius:11px;background:var(--cream);color:var(--goldt);display:grid;place-items:center;flex:none}
.gi-stat-n{font-family:'Fraunces',Georgia,serif;font-size:27px;font-weight:700;line-height:1}
.gi-stat-l{color:var(--mut);font-size:13px;margin-top:3px}.gi-stat-s{color:var(--mut);font-size:12px}
.gi-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:20px}
.gi-card-h{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.gi-covwrap{overflow-x:auto}
.gi-cov{border-collapse:separate;border-spacing:4px;width:100%;min-width:420px}
.gi-cov th{font-weight:500;text-align:left;font-size:13px;color:var(--mut);padding:4px 8px}
.gi-cov td{text-align:center;border-radius:8px;padding:8px;font-weight:500;background:#f1efe7;color:var(--mut)}
.gi-cov td.h1{background:#f6e7b5}.gi-cov td.h2{background:#efcf6c}.gi-cov td.h3{background:#e2b73a}.gi-cov td.h4{background:#d4a017;color:var(--navy)}
.gi-cov td.h1,.gi-cov td.h2,.gi-cov td.h3{color:var(--navy)}
.gi-gap{font-size:12px;font-weight:400}
.gi-note{margin:10px 0 0;color:var(--mut);font-size:13px}
.gi-tabs{display:flex;gap:4px;border-bottom:2px solid var(--line);margin-bottom:20px;overflow-x:auto}
.gi-tab{background:none;border:0;padding:12px 18px;cursor:pointer;color:var(--mut);font-weight:500;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;display:inline-flex;gap:8px;align-items:center;min-height:44px}
.gi-tab[aria-selected=true]{color:var(--navy);border-bottom-color:var(--gold)}
.gi-tab:hover{color:var(--navy)}
.gi-badge{background:var(--navy);color:#fff;border-radius:999px;padding:0 8px;font-size:12px;line-height:20px}
.gi-steps{display:flex;gap:6px;margin:0 0 20px;padding:0;list-style:none;flex-wrap:wrap}
.gi-step{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);color:var(--mut);font-size:13px}
.gi-step b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--cream);font-size:12px}
.gi-step.on{border-color:var(--navy);color:var(--navy);font-weight:500}.gi-step.on b{background:var(--navy);color:#fff}
.gi-step.done b{background:var(--ok);color:#fff}
.gi-grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
@media(max-width:900px){.gi-grid2{grid-template-columns:1fr}.gi-h1{font-size:28px}}
.gi-drop{border:2px dashed #b9b49f;border-radius:16px;background:#fff;padding:34px 20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}
.gi-drop:hover,.gi-drop.over{border-color:var(--gold);background:#fffaf0}
.gi-drop-ic{width:56px;height:56px;border-radius:16px;background:var(--navy);color:var(--gold);display:grid;place-items:center;margin:0 auto 12px}
.gi-drop strong{display:block;font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:600;margin-bottom:4px}
.gi-or{display:flex;align-items:center;gap:12px;color:var(--mut);margin:16px 0;font-size:13px}.gi-or::before,.gi-or::after{content:"";flex:1;height:1px;background:var(--line)}
.gi-ta{width:100%;min-height:96px;border:1px solid #b9b49f;border-radius:10px;padding:10px;background:#fff;resize:vertical}
.gi-btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-weight:500;display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:44px;background:var(--navy);color:#fff;transition:transform .1s,background .15s}
.gi-btn:hover:not(:disabled){background:#2d2d52}.gi-btn:active:not(:disabled){transform:translateY(1px)}
.gi-btn.gold{background:var(--gold);color:var(--navy)}.gi-btn.gold:hover:not(:disabled){background:#e3b12b}
.gi-btn.ghost{background:#fff;color:var(--navy);border:1px solid #b9b49f}.gi-btn.ghost:hover:not(:disabled){background:var(--cream)}
.gi-btn.danger{background:var(--bad)}.gi-btn.danger:hover:not(:disabled){background:#8f1d17}
.gi-btn.onnavy{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3)}.gi-btn.onnavy:hover{background:rgba(255,255,255,.2)}
.gi-btn:disabled{opacity:.5;cursor:not-allowed}
.gi-link{background:none;border:0;color:var(--navy);text-decoration:underline;cursor:pointer;padding:6px;min-height:32px}.gi-link:disabled{opacity:.5;cursor:default;text-decoration:none}
.gi-file{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:16px}
.gi-file-ic{width:40px;height:40px;border-radius:10px;background:var(--cream);display:grid;place-items:center;color:var(--goldt)}
.gi-file-meta{flex:1;min-width:160px}.gi-file-meta b{display:block;word-break:break-all}
.gi-sec{border-top:1px solid var(--line);padding:18px 0 4px;margin-top:16px}
.gi-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.gi-verdict{display:flex;gap:14px;align-items:flex-start;border-radius:14px;padding:16px 18px;border:1px solid}
.gi-verdict.ok{background:var(--okb);border-color:#a9d6bd}.gi-verdict.warn{background:var(--warnb);border-color:#ecd093}.gi-verdict.bad{background:var(--badb);border-color:#efb3ae}.gi-verdict.info{background:var(--infob);border-color:#b6cdea}
.gi-verdict h3{margin:0 0 2px}.gi-verdict p{margin:0;color:#33334a}
.gi-vic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.ok .gi-vic{background:var(--ok)}.warn .gi-vic{background:var(--warn)}.bad .gi-vic{background:var(--bad)}.info .gi-vic{background:var(--info)}
.gi-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--line);margin:16px 0 8px}
.gi-bar i{display:block;min-width:3px}
.gi-bar .insert{background:#2e9e6b}.gi-bar .update{background:#3b78c4}.gi-bar .unchanged{background:#a7a79c}.gi-bar .skip{background:#d9a21b}.gi-bar .error{background:#c9453b}
.gi-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:#33334a;margin:0 0 4px;padding:0;list-style:none}
.gi-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.gi-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:8px}
.gi-opt{border:2px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;display:block;background:#fff}
.gi-opt:has(input:checked){border-color:var(--navy);background:#fbfaf5}
.gi-opt:has(input:focus-visible){outline:3px solid var(--gold);outline-offset:2px}
.gi-opt input{margin-right:8px;accent-color:var(--navy)}
.gi-opt b{font-weight:500}.gi-opt span{display:block;color:var(--mut);font-size:13px;margin-top:2px;padding-left:24px}
.gi-select{border:1px solid #b9b49f;border-radius:8px;padding:8px 10px;background:#fff;min-height:40px;max-width:100%}
.gi-input{border:1px solid #b9b49f;border-radius:8px;padding:8px 12px;background:#fff;min-height:40px;min-width:0}
.gi-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:10px;background:#fff}
.gi-table{width:100%;border-collapse:collapse;font-size:13px}
.gi-table th{text-align:left;font-weight:500;color:var(--mut);background:#faf9f4;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.gi-table td{padding:10px 12px;border-bottom:1px solid #efede4;vertical-align:top}
.gi-table tr:last-child td{border-bottom:0}
.gi-strong{font-weight:500;display:block}.gi-sm{display:block;font-size:12px;color:var(--mut)}.gi-dim{color:var(--mut)}
.gi-detail{min-width:200px;max-width:420px}
.gi-diff{margin:0 0 4px;padding:0;list-style:none}.gi-diff li{background:var(--infob);border-radius:6px;padding:2px 8px;margin-bottom:3px;display:inline-block}
.gi-pill{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:500;border:1px solid transparent;white-space:nowrap}
.gi-pill.ok{background:var(--okb);color:var(--ok)}.gi-pill.warn{background:var(--warnb);color:var(--warn)}.gi-pill.bad{background:var(--badb);color:var(--bad)}.gi-pill.info{background:var(--infob);color:var(--info)}.gi-pill.mute{background:#eeece4;color:#4a4a5c}
.gi-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.gi-chip{background:#fff;border:1px solid #b9b49f;border-radius:999px;padding:6px 14px;cursor:pointer;min-height:36px}
.gi-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.gi-chip b{font-weight:500;margin-left:4px}
.gi-pager{display:flex;gap:14px;align-items:center;justify-content:center;margin-top:12px}
.gi-alert{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}
.gi-alert.bad{background:var(--badb);color:#7d1a14}.gi-alert.warn{background:var(--warnb);color:#6b4308}.gi-alert.info{background:var(--infob);color:#1d4573}
.gi-alert svg{flex:none;margin-top:2px}
.gi-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}
.gi-spin{width:16px;height:16px;border-radius:50%;border:2px solid #b9b49f;border-top-color:var(--navy);animation:gi-sp .8s linear infinite;display:inline-block}
@keyframes gi-sp{to{transform:rotate(360deg)}}
.gi-done{text-align:center;padding:10px 0 4px}
.gi-done-ic{width:64px;height:64px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;margin:0 auto 12px;animation:gi-pop .4s ease-out}
@keyframes gi-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.gi-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:18px 0}
.gi-count{background:var(--cream);border-radius:12px;padding:12px}.gi-count b{display:block;font-family:'Fraunces',Georgia,serif;font-size:26px}
.gi-unlock{text-align:left;max-width:640px;margin:0 auto;padding:0;list-style:none}
.gi-unlock li{display:flex;gap:10px;margin:8px 0;align-items:flex-start}.gi-unlock svg{color:var(--ok);flex:none;margin-top:3px}
.gi-guide{width:100%}
.gi-guide summary{cursor:pointer;font-weight:500;min-height:32px}
.gi-guide dl{margin:10px 0 0}.gi-guide dt{font-weight:500;margin-top:10px}.gi-guide dd{margin:0;color:var(--mut);font-size:13px}
.gi-req{color:var(--bad);font-size:12px;margin-left:6px}
.gi-bar-f{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.gi-bar-f .grow{flex:1;min-width:200px;position:relative}.gi-bar-f .grow input{width:100%;padding-left:36px}.gi-bar-f .grow svg{position:absolute;left:10px;top:11px;color:var(--mut)}
.gi-log{border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px;margin-bottom:12px}
.gi-log-h{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;align-items:flex-start}
.gi-log.undone{opacity:.75}
.gi-log ul{margin:8px 0 0;padding-left:20px;color:#33334a;font-size:13px}
.gi-empty{text-align:center;padding:40px 16px;color:var(--mut)}.gi-empty .gi-drop-ic{background:var(--cream);color:var(--goldt)}
.gi-scrim{position:fixed;inset:0;background:rgba(26,26,46,.55);display:grid;place-items:center;z-index:100000;padding:16px}
.gi-modal{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.gi-modal.wide{max-width:640px}.gi-modal p{margin:10px 0}
.gi-toasts{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.gi-toast{background:var(--navy);color:#fff;border-radius:10px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;animation:gi-up .25s ease-out}
.gi-toast.bad{background:var(--bad)}
@keyframes gi-up{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.gi-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.gi *,.gi *::before,.gi *::after{animation:none!important;transition:none!important}}
`;
function HistoryImport() {
  const [tab, setTab] = (0, _react.useState)("import");
  const [stats, setStats] = (0, _react.useState)(null);
  const [logs, setLogs] = (0, _react.useState)([]);
  const [toasts, setToasts] = (0, _react.useState)([]);
  // import flow
  const [src, setSrc] = (0, _react.useState)(null); // {name,size,parsed}
  const [map, setMap] = (0, _react.useState)([]);
  const [mode, setMode] = (0, _react.useState)("append");
  const [policy, setPolicy] = (0, _react.useState)("skip");
  const [res, setRes] = (0, _react.useState)(null);
  const [checking, setChecking] = (0, _react.useState)(false);
  const [checkErr, setCheckErr] = (0, _react.useState)("");
  const [importing, setImporting] = (0, _react.useState)(false);
  const [result, setResult] = (0, _react.useState)(null);
  const [fileErr, setFileErr] = (0, _react.useState)("");
  const [paste, setPaste] = (0, _react.useState)("");
  const [over, setOver] = (0, _react.useState)(false);
  const [modal, setModal] = (0, _react.useState)(null);
  const [warnOpen, setWarnOpen] = (0, _react.useState)(false);
  // records
  const [recs, setRecs] = (0, _react.useState)({
    records: [],
    total: 0,
    total_pages: 1
  });
  const [rq, setRq] = (0, _react.useState)("");
  const [rSeason, setRSeason] = (0, _react.useState)("");
  const [rDiv, setRDiv] = (0, _react.useState)("");
  const [rJob, setRJob] = (0, _react.useState)(0);
  const [rPage, setRPage] = (0, _react.useState)(1);
  const [recLoading, setRecLoading] = (0, _react.useState)(false);
  const [confirmText, setConfirmText] = (0, _react.useState)("");
  const fileRef = (0, _react.useRef)(null);
  const reqRef = (0, _react.useRef)(0);
  const recReq = (0, _react.useRef)(0);
  const toast = (0, _react.useCallback)((msg, tone) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, {
      id,
      msg,
      tone
    }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);
  const loadStats = (0, _react.useCallback)(async () => {
    const r = await call("/history/stats");
    if (r.ok) setStats(r.j);
  }, []);
  const loadLogs = (0, _react.useCallback)(async () => {
    const r = await call("/history/import-logs?limit=30");
    if (r.ok && Array.isArray(r.j)) setLogs(r.j);
  }, []);
  (0, _react.useEffect)(() => {
    loadStats();
    loadLogs();
  }, [loadStats, loadLogs]);
  const loadRecords = (0, _react.useCallback)(async () => {
    const id = ++recReq.current;
    setRecLoading(true);
    const p = new URLSearchParams({
      page: String(rPage),
      per_page: "25"
    });
    if (rq.trim()) p.set("q", rq.trim());
    if (rSeason) p.set("season_year", rSeason);
    if (rDiv) p.set("division", rDiv);
    if (rJob) p.set("job_id", String(rJob));
    const r = await call("/history/records?" + p.toString());
    if (id !== recReq.current) return;
    setRecLoading(false);
    if (r.ok) setRecs(r.j);
  }, [rq, rSeason, rDiv, rJob, rPage]);
  (0, _react.useEffect)(() => {
    if (tab !== "records") return undefined;
    const t = window.setTimeout(loadRecords, rq ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [tab, loadRecords, rq]);
  (0, _react.useEffect)(() => {
    setRPage(1);
  }, [rq, rSeason, rDiv, rJob]);

  // ── reading input ───────────────────────────────────────────────────────────────────────────
  const ingest = (0, _react.useCallback)((text, name, size) => {
    setFileErr("");
    setResult(null);
    setRes(null);
    setCheckErr("");
    const parsed = E.parseTable(text);
    if (!parsed.headers.length || !parsed.rowCount) {
      setSrc(null);
      setFileErr(parsed.headers.length ? "That file has headers but no data rows." : "That looks empty. Choose a CSV file, or paste rows copied from Excel (with the header row).");
      return;
    }
    setSrc({
      name,
      size,
      parsed
    });
    setMap(E.autoMap(parsed.headers));
  }, []);
  const readFile = (0, _react.useCallback)(async file => {
    if (!file) return;
    if (!(E.isCsvName(file.name) || /\.tsv$/i.test(file.name))) {
      setFileErr(`“${file.name}” is not a CSV file. In Excel, use File → Save As → CSV (Comma delimited).`);
      return;
    }
    if (file.size > E.MAX_BYTES) {
      setFileErr(`That file is ${E.fmtBytes(file.size)}. The limit is 5 MB. Split it into a few smaller files.`);
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      ingest(E.decodeBytes(buf), file.name, file.size);
    } catch (e) {
      setFileErr("Could not read that file. Try saving it again as CSV.");
    }
  }, [ingest]);
  const onPick = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    readFile(f);
  };
  const onDrop = e => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    readFile(f);
  };
  const usePaste = () => {
    const t = paste.trim();
    if (!t) {
      setFileErr("Paste some rows first.");
      return;
    }
    ingest(t, "pasted-data.csv", new Blob([t]).size);
  };
  const reset = () => {
    setSrc(null);
    setMap([]);
    setRes(null);
    setResult(null);
    setCheckErr("");
    setFileErr("");
    setPaste("");
    setPolicy("skip");
    setMode("append");
    reqRef.current++;
    setChecking(false);
  };

  // ── check (dry run) ─────────────────────────────────────────────────────────────────────────
  const missing = (0, _react.useMemo)(() => E.missingRequired(map), [map]);
  const kept = (0, _react.useMemo)(() => src ? E.keptIndex(src.parsed, map) : [], [src, map]);
  const form = (0, _react.useCallback)(dry => {
    const fd = new FormData();
    fd.append("csv", new Blob([E.canonicalCSV(src.parsed, map)], {
      type: "text/csv"
    }), (src.name || "import").replace(/\.[^.]+$/, "") + ".csv");
    fd.append("import_mode", mode);
    fd.append("on_error", policy);
    fd.append("dry_run", dry ? "1" : "0");
    return fd;
  }, [src, map, mode, policy]);
  (0, _react.useEffect)(() => {
    if (!src || result) return undefined;
    if (missing.length) {
      setRes(null);
      setChecking(false);
      return undefined;
    }
    const id = ++reqRef.current;
    setChecking(true);
    setCheckErr("");
    const t = window.setTimeout(async () => {
      const r = await call("/history/import", {
        method: "POST",
        body: form(true)
      });
      if (id !== reqRef.current) return;
      setChecking(false);
      if (!r.ok && !r.j.rows) {
        setRes(null);
        setCheckErr(r.j.message || "The check failed. Nothing was imported.");
        return;
      }
      setRes(r.j);
    }, 300);
    return () => window.clearTimeout(t);
  }, [src, map, mode, policy, missing, form, result]);
  const v = E.verdict(res);
  const counts = (0, _react.useMemo)(() => E.countActions(res && res.rows), [res]);
  const issuesErr = (0, _react.useMemo)(() => res ? E.problemsFromRows(res.rows, res.issues).map(p => ({
    row: p.row,
    messages: p.messages
  })) : [], [res]);
  const warns = (0, _react.useMemo)(() => res && res.issues ? res.issues.filter(x => x.level === "warning") : [], [res]);
  const writes = res ? (res.imported || 0) + (res.updated || 0) : 0;
  const canImport = !!res && !checking && !res.blocked && writes > 0 && !importing;
  const busy = (0, _react.useRef)(false);
  const doImport = async () => {
    if (busy.current) return;
    busy.current = true;
    setImporting(true);
    const r = await call("/history/import", {
      method: "POST",
      body: form(false)
    });
    setImporting(false);
    busy.current = false;
    if (!r.ok || !r.j.success) {
      toast(r.j.message || "The import failed. Nothing was changed.", "bad");
      return;
    }
    reqRef.current++;
    setResult(r.j);
    loadStats();
    loadLogs();
    toast(`Imported ${r.j.imported + r.j.updated} row${r.j.imported + r.j.updated === 1 ? "" : "s"}.`);
  };
  const doUndo = async id => {
    setModal(null);
    const r = await call(`/history/import-logs/${id}/undo`, {
      method: "POST"
    });
    toast(r.j.message || (r.ok ? "Import undone." : "Could not undo that import."), r.ok && r.j.success ? "" : "bad");
    if (r.ok && r.j.success) {
      setResult(null);
      reset();
    }
    loadStats();
    loadLogs();
    if (tab === "records") loadRecords();
  };
  const fixit = () => saveBlob("fix-these-rows.csv", E.errorReportCSV(src.parsed, issuesErr, kept));
  const exportAll = async () => {
    const all = [];
    let page = 1;
    let pages = 1;
    do {
      const r = await call(`/history/records?page=${page}&per_page=500`);
      if (!r.ok) {
        toast("Export failed part-way. Try again.", "bad");
        return;
      }
      all.push(...r.j.records);
      pages = r.j.total_pages || 1;
      page++;
    } while (page <= pages && page <= 40);
    saveBlob("grsh-history-backup.csv", E.recordsCSV(all));
    toast(`Exported ${all.length} records.`);
  };
  const delOne = async id => {
    setModal(null);
    const r = await call(`/history/records/${id}`, {
      method: "DELETE"
    });
    toast(r.ok ? "Record deleted." : r.j.message || "Could not delete that record.", r.ok ? "" : "bad");
    loadRecords();
    loadStats();
  };
  const clearAll = async () => {
    setModal(null);
    setConfirmText("");
    const r = await call("/history/records", {
      method: "DELETE"
    });
    toast(r.ok ? "All history cleared." : r.j.message || "Could not clear history.", r.ok ? "" : "bad");
    setRecs({
      records: [],
      total: 0,
      total_pages: 1
    });
    loadStats();
    loadLogs();
    reset();
  };
  const step = result ? 4 : !src ? 1 : res && !checking ? 3 : 2;
  const li = stats && stats.last_import;
  const latest = logs.find(l => l.can_undo);
  const seasonsAll = stats && stats.seasons || [];
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gi",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("header", {
      className: "gi-hero",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gi-hero-in",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gi-kicker",
            children: "Gold Rush Senior Hockey"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
            className: "gi-h1",
            children: "Import History"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gi-lead",
            children: "Bring past seasons in from a spreadsheet. Every import is checked first, nothing is saved until you say so, and the latest import can always be undone."
          }), li ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gi-last",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "clip",
              s: 15
            }), " Last import: ", li.filename, " \xB7 ", E.fmtStamp(li.timestamp), " \xB7 +", li.imported, li.updated ? ` / ${li.updated} updated` : "", li.undone ? " (undone)" : ""]
          }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gi-last",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "info",
              s: 15
            }), " No imports yet"]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          className: "gi-btn onnavy",
          onClick: () => saveBlob("grsh-history-template.csv", E.templateCSV()),
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "download",
            s: 16
          }), " Download template"]
        })]
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gi-wrap",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gi-stats",
        "aria-label": "History summary",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(StatCard, {
          icon: "db",
          label: "Records",
          value: stats ? stats.total : "…"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(StatCard, {
          icon: "users",
          label: "Players",
          value: stats ? stats.players : "…"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(StatCard, {
          icon: "cal",
          label: "Seasons",
          value: stats ? stats.seasons_count : "…",
          sub: seasonsAll.length ? `${Math.min(...seasonsAll)}–${Math.max(...seasonsAll)}` : ""
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(StatCard, {
          icon: "trophy",
          label: "Championships",
          value: stats ? stats.champions : "…"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(StatCard, {
          icon: "flag",
          label: "Sandbagging flags",
          value: stats ? stats.sandbagging : "…"
        })]
      }), stats && stats.coverage && stats.coverage.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Coverage, {
        coverage: stats.coverage
      }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gi-tabs",
        role: "tablist",
        "aria-label": "Import History sections",
        children: [["import", "Import"], ["records", "Records"], ["log", "Import log"]].map(([k, l]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          role: "tab",
          id: "gi-tab-" + k,
          "aria-selected": tab === k,
          "aria-controls": "gi-panel-" + k,
          tabIndex: tab === k ? 0 : -1,
          className: "gi-tab",
          onClick: () => setTab(k),
          onKeyDown: e => {
            const ks = ["import", "records", "log"];
            const i = ks.indexOf(k);
            if (e.key === "ArrowRight") {
              setTab(ks[(i + 1) % 3]);
            }
            if (e.key === "ArrowLeft") {
              setTab(ks[(i + 2) % 3]);
            }
          },
          children: [l, k === "records" && stats ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gi-badge",
            children: stats.total
          }) : null, k === "log" && logs.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gi-badge",
            children: logs.length
          }) : null]
        }, k))
      }), tab === "import" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gi-panel-import",
        "aria-labelledby": "gi-tab-import",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("ol", {
          className: "gi-steps",
          "aria-label": "Progress",
          children: ["Choose file", "Check", "Import", "Done"].map((l, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
            className: "gi-step" + (step === i + 1 ? " on" : "") + (step > i + 1 ? " done" : ""),
            "aria-current": step === i + 1 ? "step" : undefined,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              children: step > i + 1 ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "check",
                s: 13
              }) : i + 1
            }), l]
          }, l))
        }), step === 1 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-grid2",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-drop" + (over ? " over" : ""),
              role: "button",
              tabIndex: 0,
              "aria-label": "Choose a CSV file to import",
              onClick: () => fileRef.current && fileRef.current.click(),
              onKeyDown: e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current && fileRef.current.click();
                }
              },
              onDragOver: e => {
                e.preventDefault();
                setOver(true);
              },
              onDragLeave: () => setOver(false),
              onDrop: onDrop,
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                className: "gi-drop-ic",
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                  n: "upload",
                  s: 26
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: "Drop a CSV here, or click to choose"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gi-sub",
                children: "Up to 5 MB. Excel files: use Save As \u2192 CSV first."
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              ref: fileRef,
              type: "file",
              accept: ".csv,.txt,.tsv,text/csv",
              hidden: true,
              onChange: onPick
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              className: "gi-or",
              children: "or paste from Excel"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "gi-paste",
              className: "gi-sr",
              children: "Paste rows from a spreadsheet"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("textarea", {
              id: "gi-paste",
              className: "gi-ta",
              placeholder: "Select the cells in Excel (include the header row), copy, and paste here.",
              value: paste,
              onChange: e => setPaste(e.target.value)
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              className: "gi-actions",
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                type: "button",
                className: "gi-btn",
                onClick: usePaste,
                disabled: !paste.trim(),
                children: "Check pasted rows"
              })
            }), fileErr ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-alert bad",
              role: "alert",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "alert",
                s: 16
              }), " ", fileErr]
            }) : null]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-card",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
              className: "gi-h2",
              children: "What goes in the file"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              className: "gi-note",
              children: "One row per player per season. Column names can be spelled loosely (\u201CLast Name\u201D, \u201CEmail Address\u201D); we match them for you."
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
              className: "gi-guide",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("summary", {
                children: ["All ", E.COLUMNS.length, " columns"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dl", {
                children: E.COLUMNS.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("dt", {
                    children: [c.col, c.req ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "gi-req",
                      children: "required"
                    }) : null]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("dd", {
                    children: [c.note, " Example: ", c.example || "(blank)"]
                  })]
                }, c.col))
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-note",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "info",
                s: 14
              }), " Undo: the most recent import can be undone from the Import log, as long as nothing newer has been imported since."]
            })]
          })]
        }) : null, step === 2 || step === 3 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-card",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-file",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gi-file-ic",
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "file"
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-file-meta",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: src.name
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gi-sub",
                children: [E.plural(src.parsed.rowCount, "row"), " \xB7 ", E.fmtBytes(src.size)]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: reset,
              children: "Choose a different file"
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            "aria-live": "polite",
            children: [checking ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-note",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gi-spin"
              }), " Checking your file. Nothing is being saved."]
            }) : null, checkErr ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-alert bad",
              role: "alert",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "alert",
                s: 16
              }), " ", checkErr]
            }) : null, !checking && v ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-verdict " + v.tone,
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gi-vic",
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                  n: v.tone === "ok" ? "check" : v.tone === "info" ? "info" : "alert"
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
                  className: "gi-h3",
                  children: v.headline
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                  children: v.detail
                })]
              })]
            }) : null]
          }), res && !checking && res.rows && res.rows.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              className: "gi-bar",
              role: "img",
              "aria-label": E.summaryBar(counts).filter(b => b.n).map(b => `${b.n} ${b.label}`).join(", "),
              children: E.summaryBar(counts).filter(b => b.n).map(b => /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
                className: b.key,
                style: {
                  width: b.pct + "%"
                }
              }, b.key))
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
              className: "gi-legend",
              children: E.summaryBar(counts).filter(b => b.n).map(b => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
                  style: {
                    background: {
                      insert: "#2e9e6b",
                      update: "#3b78c4",
                      unchanged: "#a7a79c",
                      skip: "#d9a21b",
                      error: "#c9453b"
                    }[b.key]
                  }
                }), b.n, " ", b.label.toLowerCase()]
              }, b.key))
            }), res.new_players || res.matched_players ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-note",
              children: [E.plural(res.new_players || 0, "new player"), ", ", E.plural(res.matched_players || 0, "returning player"), " matched by email."]
            }) : null]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)(MappingPanel, {
            map: map,
            parsed: src.parsed,
            onChange: (i, c) => setMap(E.setMapping(map, i, c))
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
            className: "gi-sec",
            "aria-labelledby": "gi-opt-t",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
              id: "gi-opt-t",
              className: "gi-h3",
              children: "If a player and season are already on record"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-opts",
              role: "radiogroup",
              "aria-labelledby": "gi-opt-t",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
                className: "gi-opt",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  type: "radio",
                  name: "gi-mode",
                  checked: mode === "append",
                  onChange: () => setMode("append")
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  children: "Keep what is there"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  children: "Only add new rows. Existing records are left alone."
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
                className: "gi-opt",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  type: "radio",
                  name: "gi-mode",
                  checked: mode === "upsert",
                  onChange: () => setMode("upsert")
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  children: "Update from my file"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  children: "Replace stored values with the ones in your file (only columns that have a value)."
                })]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gi-note",
              style: {
                marginTop: 14
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                htmlFor: "gi-pol",
                children: "If a row has a problem: "
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                id: "gi-pol",
                className: "gi-select",
                value: policy,
                onChange: e => setPolicy(e.target.value),
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                  value: "skip",
                  children: "Skip it and import the rest"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                  value: "stop",
                  children: "Stop and import nothing"
                })]
              })]
            })]
          }), res && !checking && res.rows && res.rows.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)(RowTable, {
            rows: res.rows,
            kept: kept,
            truncated: res.rows_truncated
          }) : null, res && !checking && warns.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
            className: "gi-sec",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-link",
              "aria-expanded": warnOpen,
              onClick: () => setWarnOpen(!warnOpen),
              children: [warnOpen ? "Hide" : "Show", " ", E.plural(warns.length, "warning")]
            }), warnOpen ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("ul", {
              className: "gi-note",
              children: [warns.slice(0, 60).map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: ["Line ", E.sheetLine(kept, x.line), ": ", x.message]
              }, i)), warns.length > 60 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: ["\u2026and ", warns.length - 60, " more."]
              }) : null]
            }) : null]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-actions",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gi-btn gold",
              disabled: !canImport,
              onClick: doImport,
              children: importing ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gi-spin"
                }), " Importing\u2026"]
              }) : writes ? `Import ${E.plural(writes, "row")}` : "Nothing to import"
            }), issuesErr.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: fixit,
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "download",
                s: 16
              }), " Download rows to fix (", issuesErr.length, ")"]
            }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: reset,
              children: "Cancel"
            })]
          })]
        }) : null, step === 4 && result ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-card gi-done",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gi-done-ic",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "check",
              s: 32
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            className: "gi-h2",
            children: "Import complete"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gi-sub",
            children: result.message
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-counts",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-count",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: result.imported
              }), "added"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-count",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: result.updated
              }), "updated"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-count",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: result.unchanged
              }), "unchanged"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gi-count",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: result.skipped
              }), "skipped"]
            })]
          }), E.impactLines(result).length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
              className: "gi-h3",
              children: "What this changed"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
              className: "gi-unlock",
              children: E.impactLines(result).map(l => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                  n: "check",
                  s: 16
                }), l.text]
              }, l.key))
            })]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-actions",
            style: {
              justifyContent: "center"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-btn",
              onClick: () => {
                setRJob(result.job_id || 0);
                setTab("records");
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "list",
                s: 16
              }), " View these records"]
            }), result.job_id ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: () => setModal({
                t: "undo",
                id: result.job_id
              }),
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "undo",
                s: 16
              }), " Undo this import"]
            }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: reset,
              children: "Import another file"
            })]
          })]
        }) : null]
      }) : null, tab === "records" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gi-panel-records",
        "aria-labelledby": "gi-tab-records",
        className: "gi-card",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-bar-f",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "grow",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "search",
              s: 16
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "gi-q",
              className: "gi-sr",
              children: "Search players"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              id: "gi-q",
              className: "gi-input",
              type: "search",
              placeholder: "Search name or email",
              value: rq,
              onChange: e => setRq(e.target.value)
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
            className: "gi-sr",
            htmlFor: "gi-rs",
            children: "Season"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
            id: "gi-rs",
            className: "gi-select",
            value: rSeason,
            onChange: e => setRSeason(e.target.value),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: "",
              children: "All seasons"
            }), seasonsAll.map(s => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: s,
              children: s
            }, s))]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
            className: "gi-sr",
            htmlFor: "gi-rd",
            children: "Division"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
            id: "gi-rd",
            className: "gi-select",
            value: rDiv,
            onChange: e => setRDiv(e.target.value),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: "",
              children: "All divisions"
            }), Object.entries(DIV_LABEL).map(([k, l]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: k,
              children: l
            }, k))]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gi-btn ghost",
            onClick: exportAll,
            disabled: !stats || !stats.total,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "download",
              s: 16
            }), " Export CSV"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gi-btn ghost",
            onClick: () => setModal({
              t: "clear"
            }),
            disabled: !stats || !stats.total,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "trash",
              s: 16
            }), " Clear all"]
          })]
        }), rJob ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gi-alert info",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "info",
            s: 16
          }), " Showing only rows from import #", rJob, ". ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            className: "gi-link",
            onClick: () => setRJob(0),
            children: "Show everything"
          })]
        }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gi-sub",
          "aria-live": "polite",
          children: recLoading ? "Loading…" : `${recs.total} record${recs.total === 1 ? "" : "s"}`
        }), recs.records.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gi-tablewrap",
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
            className: "gi-table",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Player"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Season"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Division"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Team"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Result"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Tier"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Attendance"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gi-sr",
                    children: "Actions"
                  })
                })]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
              children: recs.records.map(r => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    className: "gi-strong",
                    children: [r.first_name, " ", r.last_name]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gi-sm",
                    children: r.email
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  children: r.season_year
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  children: DIV_LABEL[r.division_played] || r.division_played
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  children: r.team_name || "—"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                  children: [E.CHAMPS[r.championship_result] || "—", r.was_captain ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                    tone: "info",
                    children: "C"
                  }) : null, r.sandbagging_flag ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                    tone: "warn",
                    children: "Flag"
                  }) : null]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  children: r.skill_tier_reported || "—"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                  children: [r.games_attended !== null && r.games_scheduled !== null ? `${r.games_attended}/${r.games_scheduled}` : "—", r.no_show_count ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    className: "gi-sm",
                    children: [r.no_show_count, " no-show", r.no_show_count === 1 ? "" : "s"]
                  }) : null]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    type: "button",
                    className: "gi-btn ghost",
                    "aria-label": `Delete ${r.first_name} ${r.last_name} ${r.season_year}`,
                    onClick: () => setModal({
                      t: "del",
                      id: r.id,
                      label: `${r.first_name} ${r.last_name}, ${r.season_year}`
                    }),
                    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                      n: "trash",
                      s: 15
                    })
                  })
                })]
              }, r.id))
            })]
          })
        }) : !recLoading ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-empty",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gi-drop-ic",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "search",
              s: 26
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            children: ["No records match.", stats && !stats.total ? " Import a file to get started." : ""]
          })]
        }) : null, recs.total_pages > 1 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-pager",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            className: "gi-btn ghost",
            disabled: rPage <= 1,
            onClick: () => setRPage(rPage - 1),
            children: "Previous"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            children: ["Page ", rPage, " of ", recs.total_pages]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            className: "gi-btn ghost",
            disabled: rPage >= recs.total_pages,
            onClick: () => setRPage(rPage + 1),
            children: "Next"
          })]
        }) : null]
      }) : null, tab === "log" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gi-panel-log",
        "aria-labelledby": "gi-tab-log",
        children: [!logs.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gi-card gi-empty",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gi-drop-ic",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "clip",
              s: 26
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: "No imports yet. They will be listed here, newest first."
          })]
        }) : null, logs.map(l => /*#__PURE__*/(0, _jsxRuntime.jsxs)("article", {
          className: "gi-log" + (l.undone ? " undone" : ""),
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-log-h",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: l.filename
              }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gi-sub",
                children: ["#", l.id, " \xB7 ", E.fmtStamp(l.timestamp), " \xB7 ", l.user, " \xB7 ", l.mode === "upsert" ? "update mode" : "add-only mode"]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              children: l.undone ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "mute",
                children: "Undone"
              }) : l.error_count ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "warn",
                children: E.plural(l.error_count, "problem")
              }) : /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                tone: "ok",
                children: "Clean"
              })
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gi-note",
            children: [l.imported, " added \xB7 ", l.updated, " updated \xB7 ", l.unchanged, " unchanged \xB7 ", l.skipped, " skipped \xB7 ", l.total, " rows in file"]
          }), l.error_count ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("ul", {
            children: [l.errors.slice(0, 5).map((e, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
              children: e
            }, i)), l.errors.length > 5 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              children: ["\u2026and ", l.errors.length - 5, " more."]
            }) : null]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gi-actions",
            children: [!l.undone && l.imported + l.updated > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: () => {
                setRJob(l.id);
                setTab("records");
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "list",
                s: 15
              }), " View records"]
            }) : null, l.can_undo ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gi-btn ghost",
              onClick: () => setModal({
                t: "undo",
                id: l.id
              }),
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "undo",
                s: 15
              }), " Undo this import"]
            }) : null, !l.undone && !l.can_undo && l.has_undo_data ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gi-sub",
              children: "Undo is available once newer imports are undone first."
            }) : null, !l.undone && !l.has_undo_data && l.imported + l.updated > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gi-sub",
              children: "Too old to undo."
            }) : null]
          })]
        }, l.id))]
      }) : null]
    }), modal && modal.t === "undo" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: `Undo import #${modal.id}?`,
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: "Rows this import added will be removed, and rows it updated go back to their old values. Players and seasons it created are removed too, unless something else now uses them."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gi-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn danger",
          "data-autofocus": true,
          onClick: () => doUndo(modal.id),
          children: "Undo import"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn ghost",
          onClick: () => setModal(null),
          children: "Keep it"
        })]
      })]
    }) : null, modal && modal.t === "del" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: "Delete this record?",
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        children: [modal.label, " will be removed from history. This cannot be undone."]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gi-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn danger",
          onClick: () => delOne(modal.id),
          children: "Delete"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn ghost",
          "data-autofocus": true,
          onClick: () => setModal(null),
          children: "Cancel"
        })]
      })]
    }) : null, modal && modal.t === "clear" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: "Clear all history?",
      onClose: () => {
        setModal(null);
        setConfirmText("");
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        children: ["This deletes ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
          children: [stats ? stats.total : "all", " records"]
        }), " and the import log. It cannot be undone, and attendance and no-show numbers on those players are reset."]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-link",
          onClick: exportAll,
          children: "Download a backup CSV first"
        })
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        htmlFor: "gi-conf",
        children: "Type DELETE to confirm"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("br", {}), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        id: "gi-conf",
        className: "gi-input",
        "data-autofocus": true,
        value: confirmText,
        onChange: e => setConfirmText(e.target.value),
        autoComplete: "off"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gi-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn danger",
          disabled: confirmText.trim() !== "DELETE",
          onClick: clearAll,
          children: "Clear everything"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gi-btn ghost",
          onClick: () => {
            setModal(null);
            setConfirmText("");
          },
          children: "Cancel"
        })]
      })]
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gi-toasts",
      role: "status",
      "aria-live": "polite",
      children: toasts.map(t => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gi-toast" + (t.tone === "bad" ? " bad" : ""),
        children: t.msg
      }, t.id))
    })]
  });
}