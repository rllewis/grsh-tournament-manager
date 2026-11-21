"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ALL_COLS = void 0;
exports.ActiveChips = ActiveChips;
exports.BulkBar = BulkBar;
exports.ColumnsMenu = ColumnsMenu;
exports.CoverageStrip = CoverageStrip;
exports.DensityToggle = DensityToggle;
exports.EmptyColumnsNote = EmptyColumnsNote;
exports.ErrorBoundary = void 0;
exports.ExportMenu = ExportMenu;
exports.FilterBar = FilterBar;
exports.FreshnessLine = FreshnessLine;
exports.Hl = Hl;
exports.KpiBar = KpiBar;
exports.PlayersTable = PlayersTable;
exports.ReviewSummary = ReviewSummary;
exports.SavedViews = SavedViews;
exports.TableFooter = TableFooter;
exports.Toast = Toast;
exports.btnGhost = exports.btnDark = void 0;
exports.useDismiss = useDismiss;
var _react = require("react");
var _historyShared = require("./historyShared.js");
var _HistoryWidgets = require("./HistoryWidgets.js");
var _jsxRuntime = require("react/jsx-runtime");
// Player History: the page's own building blocks (banner, KPI chips, filters, table, menus, toast). Rules live in historyEngine.js.

const ghost = {
  fontFamily: _historyShared.MONO,
  fontSize: 12,
  background: "#F6F5F0",
  color: "#333",
  border: "1px solid #D8D6CE",
  padding: "6px 12px",
  borderRadius: 7,
  cursor: "pointer",
  height: 32,
  whiteSpace: "nowrap"
};
const dark = {
  ...ghost,
  background: "#1a1a2e",
  color: "#D4A017",
  border: "1px solid #1a1a2e"
};
const menuBox = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 4px)",
  background: "#fff",
  border: "1px solid #D8D6CE",
  borderRadius: 10,
  padding: 6,
  zIndex: 300,
  minWidth: 210,
  boxShadow: "0 8px 32px rgba(0,0,0,.14)",
  textAlign: "left"
};
const menuItem = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: _historyShared.MONO,
  cursor: "pointer",
  borderRadius: 6,
  color: "#222",
  textDecoration: "none",
  boxSizing: "border-box"
};

/** Close a popup on a click outside or Escape. Escape is marked handled so the page does not also close the drawer. */
function useDismiss(ref, open, close) {
  (0, _react.useEffect)(() => {
    if (!open) return undefined;
    const down = e => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    const key = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, ref, close]);
}

// ─── Error boundary: one broken widget should not blank the whole page ───────
class ErrorBoundary extends _react.Component {
  constructor(props) {
    super(props);
    this.state = {
      err: null
    };
  }
  static getDerivedStateFromError(err) {
    return {
      err
    };
  }
  componentDidCatch(err) {
    try {
      console.error("Player History:", this.props.label, err);
    } catch (e) {/* ignore */}
  }
  render() {
    if (!this.state.err) return this.props.children;
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "alert",
      style: {
        background: "#FEF2F2",
        border: "1px solid #FCA5A5",
        borderRadius: 10,
        padding: "12px 16px",
        margin: 12,
        color: "#991B1B",
        fontSize: 14
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
        children: [this.props.label || "This part", " hit a problem and was switched off."]
      }), " The rest of the page still works.", /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          marginTop: 8
        },
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          style: ghost,
          onClick: () => {
            this.setState({
              err: null
            });
            if (this.props.onReset) this.props.onReset();
          },
          children: "Try again"
        })
      })]
    });
  }
}

/** Text with the search terms marked. */
exports.ErrorBoundary = ErrorBoundary;
function Hl({
  text,
  terms
}) {
  const parts = (0, _historyShared.highlightParts)(text, terms);
  if (parts.length === 1 && !parts[0].hit) return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: parts[0].t
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_jsxRuntime.Fragment, {
    children: parts.map((x, i) => x.hit ? /*#__PURE__*/(0, _jsxRuntime.jsx)("mark", {
      style: {
        background: "#FDE68A",
        color: "inherit",
        borderRadius: 2,
        padding: 0
      },
      children: x.t
    }, i) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      children: x.t
    }, i))
  });
}

// ─── Freshness + review summary ──────────────────────────────────────────────
function FreshnessLine({
  overview,
  overviewErr,
  fresh
}) {
  const lastImp = overview && overview.last_import;
  const tone = fresh.level === "old" ? {
    bg: "#FEF2F2",
    bd: "#FCA5A5",
    fg: "#991B1B"
  } : fresh.level === "stale" || fresh.level === "none" ? {
    bg: "#FFFBEB",
    bd: "#FDE68A",
    fg: "#92400E"
  } : null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      marginTop: 6
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#555",
        margin: 0
      },
      children: [lastImp ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: ["Source: ", lastImp.file || "import file", " \xB7 imported by ", lastImp.by || "unknown", " \xB7 ", lastImp.at, " \xB7 ", lastImp.imported, " added, ", lastImp.updated, " updated", lastImp.skipped ? `, ${lastImp.skipped} skipped` : "", " "]
      }) : overviewErr ? "Import details unavailable. " : "No import recorded. ", /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
        href: (0, _historyShared.adminUrl)("grsh-tm-history-import"),
        style: {
          color: "#1a1a2e"
        },
        children: "Import History \u2192"
      })]
    }), tone && !overviewErr && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "status",
      style: {
        marginTop: 8,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        color: tone.fg,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        maxWidth: 640
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        children: fresh.text
      }), fresh.level === "old" || fresh.level === "stale" ? " Tiers and attendance here may be older than what players did last season. Re-import before using this for the draft." : " Import the past seasons so tiers and attendance can be checked."]
    })]
  });
}
function ReviewSummary({
  items,
  onGap,
  onTab,
  ready
}) {
  if (!ready) return null;
  if (!items.length) return /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
    style: {
      fontFamily: _historyShared.MONO,
      fontSize: 12,
      color: "#166534",
      margin: "8px 0 0"
    },
    children: "\u2713 All data checks are clear."
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 8
    },
    "aria-label": "What needs review",
    children: items.map((it, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
      type: "button",
      onClick: () => it.tab === "gaps" ? onGap(it.key) : onTab(it.tab),
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        background: "#FEF3C7",
        color: "#7A4A0A",
        border: "1px solid #FDE68A",
        borderRadius: 99,
        padding: "3px 10px",
        cursor: "pointer"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        children: it.count
      }), " ", it.label]
    }, i))
  });
}

// ─── KPI chips (these are the quick filters) ─────────────────────────────────
function KpiBar({
  s,
  f,
  toggle,
  recentCount
}) {
  const chips = [{
    k: "total",
    label: "On record",
    val: s.total,
    color: "#1a1a2e"
  }, {
    k: "champs",
    label: "Past champions",
    val: s.champions,
    color: "#92400E",
    on: f.champs,
    tip: "Players who won a championship in any season."
  }, {
    k: "captains",
    label: "Captains",
    val: s.captainsTracked ? s.captains : null,
    color: "#4C1D95",
    on: f.captains,
    tip: s.captainsTracked ? "Players who captained a team in any season." : "No season is marked as captain, so this is not tracked in the imported data yet."
  }, {
    k: "warn",
    label: "Sandbagging flags",
    val: s.sandbagging,
    color: "#991B1B",
    on: f.warn,
    tip: "Players the committee flagged for playing below their real level. A zero means nobody has been flagged."
  }, {
    k: "noShow",
    label: "Has no-shows",
    val: s.noShowsKnown ? s.noShows : null,
    color: "#7A4518",
    on: f.noShow,
    tip: s.noShowsKnown ? "Players with at least one no-show." : "No season has attendance recorded, so no-shows cannot be counted yet."
  }, {
    k: "recent",
    label: "Active recently",
    val: recentCount,
    color: "#166534",
    on: f.recent,
    tip: "Played in the latest season or the one before it."
  }];
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12,
      flexWrap: "wrap"
    },
    role: "group",
    "aria-label": "Quick filters",
    children: chips.map(c => {
      const tracked = c.val !== null;
      const clickable = c.k !== "total" && tracked;
      return /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        onClick: clickable ? () => toggle(c.k) : undefined,
        disabled: !clickable && c.k !== "total",
        "aria-pressed": clickable ? !!c.on : undefined,
        title: c.tip,
        style: {
          font: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: c.on ? "#E8E6DF" : "#fff",
          border: `1px solid ${c.on ? "#1a1a2e" : "#D8D6CE"}`,
          borderRadius: 99,
          padding: "5px 14px",
          cursor: clickable ? "pointer" : "default",
          opacity: tracked ? 1 : 0.85
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            fontFamily: "'Fraunces',serif",
            fontSize: tracked ? 16 : 12,
            fontWeight: 700,
            color: tracked ? c.color : "#555",
            lineHeight: 1
          },
          children: tracked ? c.val : "Not tracked yet"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            fontFamily: _historyShared.MONO,
            fontSize: 12,
            color: "#555",
            textTransform: "uppercase",
            letterSpacing: ".05em"
          },
          children: c.label
        })]
      }, c.k);
    })
  });
}

// ─── Coverage strip ──────────────────────────────────────────────────────────
const COVER_GAP = {
  tier: "no_tier",
  division: "no_division",
  team: "no_team",
  attendance: "no_games",
  email: "no_email"
};
function CoverageStrip({
  cov,
  onShowGap
}) {
  if (!cov.length || !cov[0].total) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      background: "#fff",
      border: "1px solid #E8E6DF",
      borderRadius: 10,
      padding: "8px 14px",
      marginBottom: 12
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#555",
        marginBottom: 6
      },
      children: "How complete the records are (players with at least one season filled in)"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        display: "flex",
        gap: 18,
        flexWrap: "wrap"
      },
      children: cov.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        disabled: c.pct === 100,
        onClick: () => onShowGap(COVER_GAP[c.key]),
        title: c.pct === 100 ? "Complete" : `Show the ${c.total - c.count} players missing this`,
        style: {
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: c.pct === 100 ? "default" : "pointer",
          minWidth: 110
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: _historyShared.MONO,
            fontSize: 12,
            color: "#333"
          },
          children: [c.label, " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
            style: {
              color: c.pct >= 90 ? "#166534" : c.pct >= 50 ? "#92400E" : "#991B1B"
            },
            children: [c.pct, "%"]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            height: 5,
            background: "#F0EEE8",
            borderRadius: 99,
            marginTop: 3,
            overflow: "hidden"
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              width: `${c.pct}%`,
              height: "100%",
              background: c.pct >= 90 ? "#22c55e" : c.pct >= 50 ? "#D4A017" : "#EF4444"
            }
          })
        })]
      }, c.key))
    })]
  });
}

// ─── Saved views ─────────────────────────────────────────────────────────────
function SavedViews({
  builtin,
  saved,
  activeId,
  onApply,
  onSave,
  onDelete,
  canSave
}) {
  const [naming, setNaming] = (0, _react.useState)(false);
  const [name, setName] = (0, _react.useState)("");
  const pill = (v, mine) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
    style: {
      display: "inline-flex",
      alignItems: "center"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      onClick: () => onApply(v),
      "aria-pressed": activeId === v.id,
      style: {
        ...ghost,
        height: 28,
        padding: "3px 10px",
        background: activeId === v.id ? "#1a1a2e" : "#fff",
        color: activeId === v.id ? "#D4A017" : "#333",
        borderRadius: mine ? "99px 0 0 99px" : 99
      },
      children: v.name
    }), mine && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      "aria-label": `Delete saved view ${v.name}`,
      onClick: () => onDelete(v),
      style: {
        ...ghost,
        height: 28,
        padding: "3px 8px",
        borderRadius: "0 99px 99px 0",
        borderLeft: "none",
        background: "#fff",
        color: "#555"
      },
      children: "\u2715"
    })]
  }, v.id);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 10
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#555"
      },
      children: "Views:"
    }), builtin.map(v => pill(v, false)), saved.map(v => pill(v, true)), naming ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("form", {
      onSubmit: e => {
        e.preventDefault();
        if (name.trim()) {
          onSave(name.trim());
          setName("");
          setNaming(false);
        }
      },
      style: {
        display: "inline-flex",
        gap: 4
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        autoFocus: true,
        value: name,
        maxLength: 40,
        onChange: e => setName(e.target.value),
        placeholder: "Name this view",
        "aria-label": "Name for the saved view",
        style: {
          ..._historyShared.sel,
          minWidth: 150
        }
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "submit",
        style: dark,
        disabled: !name.trim(),
        children: "Save"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        style: ghost,
        onClick: () => {
          setNaming(false);
          setName("");
        },
        children: "Cancel"
      })]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: {
        ...ghost,
        height: 28,
        padding: "3px 10px"
      },
      disabled: !canSave,
      title: canSave ? "Keep the current filters and sort as a view on this computer" : "Turn on a filter first",
      onClick: () => setNaming(true),
      children: "+ Save current view"
    })]
  });
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
function FilterBar({
  f,
  set,
  seasons,
  searchRef,
  onClear,
  activeCount,
  children
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: "10px 14px",
      display: "flex",
      gap: 12,
      alignItems: "flex-end",
      flexWrap: "wrap"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        flex: "1 1 240px",
        maxWidth: 360
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        htmlFor: "hx-search",
        style: _historyShared.fL,
        children: ["Search ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            textTransform: "none",
            letterSpacing: 0,
            color: "#555"
          },
          children: "(press / to jump here)"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          position: "relative"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          "aria-hidden": "true",
          style: {
            position: "absolute",
            top: 6,
            left: 9,
            color: "#555",
            fontSize: 14,
            pointerEvents: "none"
          },
          children: "\u2315"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          id: "hx-search",
          ref: searchRef,
          value: f.q,
          onChange: e => set("q", e.target.value),
          placeholder: "Name, email, tier, team\u2026 e.g. kevin kings",
          style: {
            ..._historyShared.sel,
            width: "100%",
            boxSizing: "border-box",
            paddingLeft: 26,
            background: "#fff"
          }
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        htmlFor: "hx-div",
        style: _historyShared.fL,
        children: "Prior division"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
        id: "hx-div",
        value: f.div,
        onChange: e => set("div", e.target.value),
        style: _historyShared.sel,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "",
          children: "All divisions"
        }), _historyShared.DIVISION_KEYS.map(d => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: d,
          children: _historyShared.DIVISION_LABEL[d]
        }, d))]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        htmlFor: "hx-season",
        style: _historyShared.fL,
        children: "Season"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
        id: "hx-season",
        value: f.season,
        onChange: e => set("season", e.target.value),
        style: _historyShared.sel,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "",
          children: "All seasons"
        }), seasons.map(y => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: y,
          children: y
        }, y))]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        htmlFor: "hx-rel",
        style: _historyShared.fL,
        children: "Attendance"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
        id: "hx-rel",
        value: f.reliability,
        onChange: e => set("reliability", e.target.value),
        style: _historyShared.sel,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "",
          children: "Any"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "perfect",
          children: "Perfect (100%)"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "concern",
          children: "Under 80%"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "noshows",
          children: "Has no-shows"
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        htmlFor: "hx-miss",
        style: _historyShared.fL,
        children: "Missing data"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
        id: "hx-miss",
        value: f.missing,
        onChange: e => set("missing", e.target.value),
        style: _historyShared.sel,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: "",
          children: "Nothing selected"
        }), Object.keys(_historyShared.GAP_FILTER_LABEL).map(k => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: k,
          children: _historyShared.GAP_FILTER_LABEL[k]
        }, k))]
      })]
    }), activeCount > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
      type: "button",
      onClick: onClear,
      style: {
        ...ghost,
        background: "#FEE2E2",
        color: "#991B1B",
        borderColor: "#FCA5A5"
      },
      children: ["Clear all (", activeCount, ")"]
    }), children]
  });
}
function ActiveChips({
  chips,
  onRemove,
  restored
}) {
  if (!chips.length) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      padding: "0 14px 10px",
      alignItems: "center"
    },
    "aria-label": "Active filters",
    children: [restored && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#7A4A0A",
        background: "#FEF3C7",
        border: "1px solid #FDE68A",
        borderRadius: 99,
        padding: "2px 10px"
      },
      children: "Filters restored from your last visit"
    }), chips.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        background: "#EEF2FF",
        color: "#1a1a2e",
        padding: "2px 4px 2px 10px",
        borderRadius: 99,
        display: "inline-flex",
        alignItems: "center",
        gap: 2
      },
      children: [c.label, /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        onClick: () => onRemove(c.key),
        "aria-label": `Remove filter: ${c.label}`,
        style: {
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#555",
          fontSize: 13,
          padding: "0 6px"
        },
        children: "\u2715"
      })]
    }, c.key))]
  });
}

// ─── Columns, density, export ────────────────────────────────────────────────
const ALL_COLS = exports.ALL_COLS = [{
  k: "player",
  l: "Player"
}, {
  k: "seasons",
  l: "Seasons"
}, {
  k: "champs",
  l: "Championships"
}, {
  k: "divisions",
  l: "Prior divisions"
}, {
  k: "tier",
  l: "Tier / trend"
}, {
  k: "attendance",
  l: "Attendance"
}, {
  k: "flags",
  l: "Flags"
}];
function ColumnsMenu({
  visible,
  onToggle,
  emptyCols,
  showEmpty,
  setShowEmpty
}) {
  const [open, setOpen] = (0, _react.useState)(false);
  const ref = (0, _react.useRef)(null);
  useDismiss(ref, open, () => setOpen(false));
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    ref: ref,
    style: {
      position: "relative"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: ghost,
      onClick: () => setOpen(o => !o),
      "aria-haspopup": "true",
      "aria-expanded": open,
      children: "\u229E Columns"
    }), open && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        ...menuBox,
        padding: "10px 12px"
      },
      children: [ALL_COLS.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 0",
          cursor: c.k === "player" ? "default" : "pointer",
          fontFamily: _historyShared.MONO,
          fontSize: 12,
          color: "#333"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "checkbox",
          checked: visible.includes(c.k),
          disabled: c.k === "player",
          onChange: () => onToggle(c.k)
        }), c.l, emptyCols.includes(c.k) ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            color: "#555"
          },
          children: " (no data)"
        }) : null]
      }, c.k)), emptyCols.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 0 2px",
          borderTop: "1px solid #F0EEE8",
          marginTop: 6,
          fontFamily: _historyShared.MONO,
          fontSize: 12,
          color: "#333"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "checkbox",
          checked: showEmpty,
          onChange: e => setShowEmpty(e.target.checked)
        }), " Show columns with no data"]
      })]
    })]
  });
}
function DensityToggle({
  density,
  setDensity
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    role: "group",
    "aria-label": "Row size",
    style: {
      display: "inline-flex"
    },
    children: [["comfortable", "Comfortable"], ["compact", "Compact"]].map(([k, l], i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      onClick: () => setDensity(k),
      "aria-pressed": density === k,
      style: {
        ...ghost,
        borderRadius: i === 0 ? "7px 0 0 7px" : "0 7px 7px 0",
        background: density === k ? "#1a1a2e" : "#F6F5F0",
        color: density === k ? "#D4A017" : "#333",
        marginLeft: i ? -1 : 0
      },
      children: l
    }, k))
  });
}
function ExportMenu({
  filteredCount,
  totalCount,
  pickedCount,
  onExport
}) {
  const [open, setOpen] = (0, _react.useState)(false);
  const ref = (0, _react.useRef)(null);
  useDismiss(ref, open, () => setOpen(false));
  const go = scope => {
    setOpen(false);
    onExport(scope);
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    ref: ref,
    style: {
      position: "relative"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: ghost,
      onClick: () => setOpen(o => !o),
      "aria-haspopup": "menu",
      "aria-expanded": open,
      children: "\u2193 Export CSV \u25BE"
    }), open && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "menu",
      style: menuBox,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        role: "menuitem",
        type: "button",
        style: menuItem,
        onClick: () => go("filtered"),
        disabled: !filteredCount,
        children: ["What you see now (", filteredCount, ")"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        role: "menuitem",
        type: "button",
        style: menuItem,
        onClick: () => go("all"),
        disabled: !totalCount,
        children: ["Every player (", totalCount, ")"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        role: "menuitem",
        type: "button",
        style: {
          ...menuItem,
          opacity: pickedCount ? 1 : 0.5
        },
        onClick: () => go("selected"),
        disabled: !pickedCount,
        children: ["Selected rows (", pickedCount, ")"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          fontFamily: _historyShared.MONO,
          fontSize: 12,
          color: "#555",
          padding: "6px 12px 2px"
        },
        children: "Uses the columns shown in the table."
      })]
    })]
  });
}
function BulkBar({
  count,
  filteredCount,
  onSelectAll,
  onCopy,
  onExport,
  onClear
}) {
  if (!count) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    role: "region",
    "aria-label": "Selected players",
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
      background: "#1a1a2e",
      color: "#fff",
      borderRadius: 10,
      padding: "8px 14px",
      marginBottom: 10
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 13
      },
      children: [count, " selected"]
    }), count < filteredCount && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
      type: "button",
      style: {
        ...ghost,
        height: 28
      },
      onClick: onSelectAll,
      children: ["Select all ", filteredCount, " shown by the filters"]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: {
        ...ghost,
        height: 28
      },
      onClick: onCopy,
      children: "Copy emails"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: {
        ...ghost,
        height: 28
      },
      onClick: onExport,
      children: "Export CSV"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: {
        ...ghost,
        height: 28,
        marginLeft: "auto"
      },
      onClick: onClear,
      children: "Clear selection"
    })]
  });
}

// ─── Toast with optional undo ────────────────────────────────────────────────
function Toast({
  toast,
  onUndo,
  onClose
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    role: "status",
    "aria-live": "polite",
    style: {
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 2000,
      pointerEvents: toast ? "auto" : "none"
    },
    children: toast && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "hx-toast",
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 13,
        fontWeight: 500,
        background: "#1a1a2e",
        color: "#D4A017",
        padding: "9px 12px 9px 20px",
        borderRadius: 99,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        whiteSpace: "nowrap"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        children: toast.msg
      }), toast.undo && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        onClick: onUndo,
        style: {
          background: "#D4A017",
          color: "#1a1a2e",
          border: "none",
          borderRadius: 99,
          padding: "4px 12px",
          fontFamily: _historyShared.MONO,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer"
        },
        children: "Undo"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        onClick: onClose,
        "aria-label": "Dismiss message",
        style: {
          background: "none",
          border: "none",
          color: "#D4A017",
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px"
        },
        children: "\u2715"
      })]
    })
  });
}

// ─── Table ───────────────────────────────────────────────────────────────────
function SortBtn({
  k,
  label,
  sortKey,
  sortDir,
  onSort
}) {
  const on = sortKey === k;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
    type: "button",
    onClick: () => onSort(k),
    title: `Sort by ${label.toLowerCase()}`,
    style: {
      background: "none",
      border: "none",
      padding: 0,
      margin: 0,
      font: "inherit",
      color: on ? "#1a1a2e" : "inherit",
      textTransform: "inherit",
      letterSpacing: "inherit",
      cursor: "pointer",
      fontWeight: on ? 700 : 500
    },
    children: [label, /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      "aria-hidden": "true",
      style: {
        marginLeft: 4,
        opacity: on ? 1 : 0.35
      },
      children: on ? sortDir === "asc" ? "↑" : "↓" : "↕"
    })]
  });
}
function Th({
  keys,
  sortKey,
  sortDir,
  top,
  children,
  style
}) {
  const on = keys && keys.includes(sortKey);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
    scope: "col",
    "aria-sort": keys ? on ? sortDir === "asc" ? "ascending" : "descending" : "none" : undefined,
    style: {
      ..._historyShared.TH,
      position: "sticky",
      top,
      zIndex: 10,
      ...style
    },
    children: children
  });
}
function RowMenu({
  p,
  onOpen,
  onCopyEmail,
  onSimilar
}) {
  const [open, setOpen] = (0, _react.useState)(false);
  const ref = (0, _react.useRef)(null);
  useDismiss(ref, open, () => setOpen(false));
  const run = fn => e => {
    e.stopPropagation();
    setOpen(false);
    fn();
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    ref: ref,
    style: {
      position: "relative",
      display: "inline-block"
    },
    onClick: e => e.stopPropagation(),
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      "aria-label": `More actions for ${(0, _historyShared.titleCase)(p.first_name)} ${(0, _historyShared.titleCase)(p.last_name)}`,
      "aria-haspopup": "menu",
      "aria-expanded": open,
      onClick: () => setOpen(o => !o),
      style: {
        background: open ? "#EEF2FF" : "none",
        border: "1px solid transparent",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        padding: "2px 8px",
        color: "#333"
      },
      children: "\u22EF"
    }), open && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      role: "menu",
      style: menuBox,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        role: "menuitem",
        type: "button",
        style: menuItem,
        onClick: run(onOpen),
        children: "Open details"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        role: "menuitem",
        type: "button",
        style: {
          ...menuItem,
          opacity: p.email ? 1 : 0.5
        },
        disabled: !p.email,
        onClick: run(onCopyEmail),
        children: "Copy email"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        role: "menuitem",
        type: "button",
        style: menuItem,
        onClick: run(onSimilar),
        children: "Find the same last name"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
        role: "menuitem",
        style: menuItem,
        href: (0, _historyShared.adminUrl)("grsh-tm-players"),
        children: "Open Players page \u2192"
      })]
    })]
  });
}
function TierCell({
  p,
  compact
}) {
  const trend = (0, _historyShared.tierTrend)(p.history);
  const info = _historyShared.TREND[trend];
  const lt = (0, _historyShared.latestTier)(p);
  const d = (0, _historyShared.tierDelta)(p.history);
  const tc = (0, _historyShared.TIER_COLOR)(lt);
  const n = p.history.filter(h => h.skill_tier).length;
  if (!lt) return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    title: "No skill tier is recorded for this player in any season.",
    style: {
      fontFamily: _historyShared.MONO,
      fontSize: 12,
      color: "#991B1B"
    },
    children: "No tier"
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        fontWeight: 700,
        background: tc.bg,
        color: tc.color,
        padding: "2px 8px",
        borderRadius: 99
      },
      children: lt
    }), !compact && n > 1 && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.TierSparkline, {
      history: p.history
    }), d ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
      title: `${info.label}: ${d.from} in ${d.fromSeason} to ${d.to} in ${d.toSeason}`,
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: info.color,
        fontWeight: 600
      },
      children: [d.from === d.to ? "no change" : `${d.from} → ${d.to}`, " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        "aria-hidden": "true",
        children: [info.arrow, d.steps !== 0 ? Math.abs(d.steps) : ""]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        className: "hx-sr",
        children: [" ", info.label]
      })]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: "Not enough tier history: only one season has a tier, so there is no trend yet.",
      style: {
        fontFamily: _historyShared.MONO,
        fontSize: 12,
        color: "#555"
      },
      children: "1 season"
    })]
  });
}
function Pill({
  children,
  bg,
  fg,
  bd,
  title
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    title: title,
    style: {
      fontFamily: _historyShared.MONO,
      fontSize: 12,
      fontWeight: 500,
      background: bg,
      color: fg,
      padding: "1px 7px",
      borderRadius: 99,
      border: `1px solid ${bd}`,
      whiteSpace: "nowrap"
    },
    children: children
  });
}
function PlayersTable({
  rows,
  cols,
  density,
  sortKey,
  sortDir,
  onSort,
  selectedId,
  onOpen,
  terms,
  latestSeason,
  dupIdx,
  picked,
  onPick,
  onPickShown,
  top,
  onCopyEmail,
  onSimilar,
  onReviewDupes,
  emptyState
}) {
  const compact = density === "compact";
  const pad = compact ? "6px 14px" : _historyShared.TD.padding;
  const td = {
    ..._historyShared.TD,
    padding: pad
  };
  const allShown = rows.length > 0 && rows.every(p => picked.has(p.id));
  const sp = {
    sortKey,
    sortDir,
    onSort
  };
  const has = k => cols.includes(k);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
    style: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      minWidth: 640
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("caption", {
      className: "hx-sr",
      children: "Players with their history, one row per player. Column headers are buttons that sort the table."
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          top: top,
          style: {
            width: 34,
            padding: "10px 6px 10px 14px"
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
            type: "checkbox",
            "aria-label": "Select every player shown",
            checked: allShown,
            onChange: e => onPickShown(e.target.checked)
          })
        }), has("player") && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Th, {
          keys: ["last_name", "last_active"],
          top: top,
          ...sp,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "last_name",
            label: "Player",
            ...sp
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              opacity: 0.5
            },
            children: "\xB7"
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "last_active",
            label: "Last active",
            ...sp
          })]
        }), has("seasons") && /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          keys: ["seasons"],
          top: top,
          ...sp,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "seasons",
            label: "Seasons",
            ...sp
          })
        }), has("champs") && /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          keys: ["champs"],
          top: top,
          ...sp,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "champs",
            label: "Championships",
            ...sp
          })
        }), has("divisions") && /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          keys: ["division"],
          top: top,
          ...sp,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "division",
            label: "Prior divisions",
            ...sp
          })
        }), has("tier") && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Th, {
          keys: ["tier", "trend"],
          top: top,
          ...sp,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "tier",
            label: "Tier",
            ...sp
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              opacity: 0.5
            },
            children: "\xB7"
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "trend",
            label: "Trend",
            ...sp
          })]
        }), has("attendance") && /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          keys: ["attendance"],
          top: top,
          ...sp,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "attendance",
            label: "Attendance",
            ...sp
          })
        }), has("flags") && /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          keys: ["flags"],
          top: top,
          ...sp,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(SortBtn, {
            k: "flags",
            label: "Flags",
            ...sp
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Th, {
          top: top,
          style: {
            width: 44
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "hx-sr",
            children: "Actions"
          })
        })]
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("tbody", {
      children: [rows.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("tr", {
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
          colSpan: 12,
          style: {
            padding: "48px 24px",
            textAlign: "center"
          },
          children: emptyState
        })
      }), rows.map(p => {
        const name = `${(0, _historyShared.titleCase)(p.first_name)} ${(0, _historyShared.titleCase)(p.last_name)}`;
        const champs = p.history.filter(h => h.championship === "winner");
        const capN = p.history.filter(h => h.was_captain).length;
        const divs = [...new Set(p.history.map(h => h.division).filter(Boolean))];
        const last = p.history[0] ? p.history[0].season : null;
        const recent = last != null && latestSeason && last >= latestSeason - 1;
        const inactive = last != null && latestSeason && last < latestSeason - 2;
        const sel_ = selectedId === p.id;
        const bg = sel_ ? "#EEF2FF" : p.sandbagging_flag ? "#FFFBEB" : "#fff";
        const dup = dupIdx[p.id];
        const cell = {
          ...td,
          background: bg
        };
        return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
          className: "hrow",
          "data-row-id": p.id,
          tabIndex: 0,
          "aria-selected": sel_,
          onClick: () => onOpen(p),
          onKeyDown: e => {
            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
              e.preventDefault();
              onOpen(p);
            }
          },
          style: {
            cursor: "pointer"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: {
              ...cell,
              width: 34,
              padding: "0 6px 0 14px",
              borderLeft: `3px solid ${sel_ ? "#1a1a2e" : p.sandbagging_flag ? "#FDE68A" : "transparent"}`
            },
            onClick: e => e.stopPropagation(),
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              type: "checkbox",
              "aria-label": `Select ${name}`,
              checked: picked.has(p.id),
              onChange: () => onPick(p.id)
            })
          }), has("player") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: cell,
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10
              },
              children: [!compact && /*#__PURE__*/(0, _jsxRuntime.jsx)(_HistoryWidgets.DNAAvatar, {
                player: p,
                size: 32
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  minWidth: 0
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: "'Fraunces',serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1a1a2e",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    flexWrap: "wrap"
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Hl, {
                      text: name,
                      terms: terms
                    })
                  }), champs.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    title: "Past champion",
                    "aria-label": "Past champion",
                    children: "\uD83C\uDFC6"
                  }), p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    title: "Sandbagging flag",
                    style: {
                      color: "#B91C1C"
                    },
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      "aria-hidden": "true",
                      children: "\u26A0"
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "hx-sr",
                      children: "Sandbagging flag"
                    })]
                  }), capN > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                    bg: "#EDE9FE",
                    fg: "#4C1D95",
                    bd: "#DDD6FE",
                    title: `${capN}× captain`,
                    children: "C"
                  }), dup && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    type: "button",
                    onClick: e => {
                      e.stopPropagation();
                      onReviewDupes();
                    },
                    title: `${dup.why}: ${dup.other}`,
                    style: {
                      background: "#FEF3C7",
                      color: "#7A4A0A",
                      border: "1px solid #FDE68A",
                      borderRadius: 99,
                      fontFamily: _historyShared.MONO,
                      fontSize: 12,
                      padding: "0 7px",
                      cursor: "pointer"
                    },
                    children: "Possible duplicate"
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: _historyShared.MONO,
                    fontSize: 12,
                    color: p.email ? "#555" : "#991B1B"
                  },
                  children: [p.email ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Hl, {
                    text: p.email,
                    terms: terms
                  }) : "No email on record", compact && last != null ? ` · last ${last}` : ""]
                }), !compact && last != null && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: _historyShared.MONO,
                    fontSize: 12,
                    color: recent ? "#166534" : "#555",
                    marginTop: 1
                  },
                  children: ["Last active ", last, " \xB7 ", recent ? "recent" : inactive ? "inactive" : "a while ago"]
                })]
              })]
            })
          }), has("seasons") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
            style: cell,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a2e"
              },
              children: p.history.length
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                marginTop: 2,
                color: "#555"
              },
              children: compact ? p.history.length > 1 ? `${p.history[p.history.length - 1].season}–${p.history[0].season}` : p.history[0]?.season : p.history.map((h, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  marginRight: 4,
                  color: i === 0 ? "#1a1a2e" : "#555",
                  fontWeight: i === 0 ? 700 : 400
                },
                children: h.season
              }, h.season))
            })]
          }), has("champs") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: cell,
            children: champs.length > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("b", {
                style: {
                  fontFamily: "'Fraunces',serif",
                  color: "#92400E"
                },
                children: ["\uD83C\uDFC6 ", champs.length, "\xD7"]
              }), capN > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: _historyShared.MONO,
                  fontSize: 12,
                  color: "#555"
                },
                children: [" (", capN, "\xD7 captain)"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontFamily: _historyShared.MONO,
                  fontSize: 12,
                  color: "#92400E"
                },
                children: champs.map(h => h.season).join(", ")
              })]
            }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                color: "#555"
              },
              children: "\u2014"
            })
          }), has("divisions") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: cell,
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 4,
                alignItems: "center"
              },
              children: [divs.slice(0, 1).map(d => {
                const dc = _historyShared.DIVISION_COLOR[d] || {};
                return /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  bg: dc.bg || "#F6F5F0",
                  fg: dc.color || "#555",
                  bd: dc.border || "#E8E6DF",
                  children: _historyShared.DIVISION_LABEL[d] || d
                }, d);
              }), divs.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                title: "No division recorded",
                style: {
                  fontFamily: _historyShared.MONO,
                  fontSize: 12,
                  color: "#991B1B"
                },
                children: "None"
              }), divs.length > 1 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: _historyShared.MONO,
                  fontSize: 12,
                  color: "#555",
                  cursor: "help"
                },
                title: divs.slice(1).map(d => _historyShared.DIVISION_LABEL[d] || d).join(", "),
                children: ["+", divs.length - 1]
              })]
            })
          }), has("tier") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: cell,
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(TierCell, {
              p: p,
              compact: compact
            })
          }), has("attendance") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
            style: {
              ...cell,
              minWidth: 100
            },
            children: [p.attendance_rating != null ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  width: 48,
                  height: 5,
                  background: "#F0EEE8",
                  borderRadius: 99,
                  overflow: "hidden",
                  flexShrink: 0
                },
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    height: "100%",
                    width: `${p.attendance_rating}%`,
                    background: p.attendance_rating === 100 ? "#22c55e" : p.attendance_rating >= 80 ? "#1a1a2e" : "#EF4444"
                  }
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: _historyShared.MONO,
                  fontSize: 12,
                  color: p.attendance_rating >= 80 ? "#333" : "#991B1B",
                  fontWeight: 600
                },
                children: [p.attendance_rating, "%"]
              })]
            }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              title: "Attendance was never recorded for this player",
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                color: "#555"
              },
              children: "\u2014"
            }), p.no_show_count > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                fontFamily: _historyShared.MONO,
                fontSize: 12,
                color: "#92400E",
                marginTop: 2
              },
              children: [p.no_show_count, " no-show", p.no_show_count > 1 ? "s" : ""]
            })]
          }), has("flags") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: cell,
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "flex-start"
              },
              children: [p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                bg: "#FEF2F2",
                fg: "#991B1B",
                bd: "#FCA5A5",
                children: "\u26A0 Sandbagging"
              }), p.no_show_count > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
                bg: "#FEF3C7",
                fg: "#92400E",
                bd: "#FDE68A",
                children: ["\uD83D\uDEAB ", p.no_show_count, " no-show", p.no_show_count > 1 ? "s" : ""]
              }), !p.sandbagging_flag && p.no_show_count === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  color: "#555"
                },
                children: "\u2014"
              })]
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
            style: {
              ...cell,
              width: 44,
              textAlign: "right",
              padding: compact ? "6px 8px 6px 4px" : "11px 8px 11px 4px"
            },
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(RowMenu, {
              p: p,
              onOpen: () => onOpen(p),
              onCopyEmail: () => onCopyEmail(p),
              onSimilar: () => onSimilar(p)
            })
          })]
        }, p.id);
      })]
    })]
  });
}
function EmptyColumnsNote({
  hidden,
  onShow
}) {
  if (!hidden.length) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
    style: {
      fontFamily: _historyShared.MONO,
      fontSize: 12,
      color: "#555",
      margin: "0 0 8px"
    },
    children: ["Hidden because no player has anything to show: ", hidden.map(k => _historyShared.EMPTY_COL_NOTE[k]).join("; "), ". ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      onClick: onShow,
      style: {
        background: "none",
        border: "none",
        color: "#1a1a2e",
        textDecoration: "underline",
        cursor: "pointer",
        font: "inherit",
        padding: 0
      },
      children: "Show anyway"
    })]
  });
}
function TableFooter({
  shown,
  total,
  onMore,
  onAll
}) {
  if (total === 0) return null;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      justifyContent: "center",
      padding: "14px 0 24px",
      fontFamily: _historyShared.MONO,
      fontSize: 12,
      color: "#555"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
      children: ["Showing ", shown, " of ", total]
    }), shown < total && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      style: ghost,
      onClick: onMore,
      children: "Show 50 more"
    }), shown < total && total - shown > 50 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
      type: "button",
      style: ghost,
      onClick: onAll,
      children: ["Show all ", total]
    })]
  });
}
const btnGhost = exports.btnGhost = ghost;
const btnDark = exports.btnDark = dark;