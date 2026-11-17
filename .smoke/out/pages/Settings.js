"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Settings;
var _react = require("react");
var _settingsEngine = require("../lib/settingsEngine");
var _jsxRuntime = require("react/jsx-runtime");
const API = window.grshConfig && window.grshConfig.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig && window.grshConfig.nonce || "";
const H = {
  "X-WP-Nonce": NONCE,
  "Content-Type": "application/json"
};
const TABS = [["season", "Season"], ["divisions", "Divisions"], ["fees", "Fees"], ["draft", "Draft"], ["email", "Email"], ["access", "Access"], ["health", "Health"]];
const STATUS_HELP = {
  setup: "Building the season. Not taking registrations.",
  open: "Taking registrations.",
  draft: "Registration closed, running the draft.",
  locked: "Rosters are final.",
  complete: "Season is over."
};
const DRAFT_TYPES = [["snake", "Snake draft"], ["linear", "Linear draft"], ["auto_balance", "Auto-balance"]];
const DRAFT_ORDERS = [["random", "Random"], ["weighted", "Weighted (prior season)"], ["lottery", "Lottery"], ["manual", "Manual"]];
const ROLES = [["Administrator", [1, 1, 1, 1, 1, 1]], ["Committee", [1, 1, 1, 1, 1, 0]], ["Captain", [0, 0, 0, 0, 1, 1]], ["Read Only", [0, 0, 0, 0, 1, 0]]];
const fmtStamp = s => {
  if (!s) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${(0, _settingsEngine.fmtDate)(m[1])} at ${m[2]}:${m[3]}` : s;
};
const saveBlob = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], {
    type
  }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function api(path, opts) {
  const res = await fetch(`${API}${path}`, {
    headers: H,
    ...(opts || {})
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
}
function Wire({
  ov,
  k
}) {
  const w = ov && ov.wiring && ov.wiring[k];
  if (!w) return null;
  return w.state === "not_connected" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    className: "gs-wire off",
    title: "This is saved, but no other part of the plugin reads it yet, so changing it does nothing today.",
    children: "Not connected yet"
  }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
    className: "gs-wire on",
    children: ["Used by: ", w.used_by]
  });
}
function Switch({
  id,
  checked,
  onChange,
  label,
  hint,
  ov,
  k
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gs-row",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-rowtxt",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        id: id + "-l",
        htmlFor: id,
        className: "gs-rowlabel",
        children: label
      }), hint && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        id: id + "-h",
        className: "gs-hint",
        children: hint
      }), k && /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
        ov: ov,
        k: k
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      role: "switch",
      id: id,
      "aria-checked": !!checked,
      "aria-labelledby": id + "-l",
      "aria-describedby": hint ? id + "-h" : undefined,
      className: "gs-sw" + (checked ? " on" : ""),
      onClick: () => onChange(!checked),
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {})
    })]
  });
}
function Field({
  id,
  label,
  hint,
  error,
  children,
  wide
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gs-f" + (wide ? " wide" : ""),
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
      htmlFor: id,
      className: "gs-lab",
      children: label
    }), children, error ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gs-err",
      role: "alert",
      id: id + "-e",
      children: error
    }) : hint ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gs-hint",
      children: hint
    }) : null]
  });
}
const Group = ({
  title,
  children
}) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
  className: "gs-group",
  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
    className: "gs-gl",
    children: title
  }), children]
});
function Timeline({
  opens,
  closes,
  draft,
  today
}) {
  const t = (0, _settingsEngine.timelineModel)({
    opens,
    closes,
    draft,
    today
  });
  const [a, b, c] = ["opens", "closes", "draft"].map(k => t.points.find(p => p.key === k));
  const tone = {
    open: "green",
    before: "blue",
    closed: "amber",
    after: "grey",
    unset: "grey"
  }[t.phase];
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gs-tl",
    "aria-label": "Season timeline",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-tlhead",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        className: "gs-pill " + tone,
        children: ["\u25CF ", t.label]
      }), t.note && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gs-tlnote " + tone,
        children: t.note
      })]
    }), t.points.length >= 2 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-bar",
      role: "img",
      "aria-label": t.points.map(p => `${p.label} ${(0, _settingsEngine.fmtDate)(p.ymd)}`).join(", "),
      children: [a && b && /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
        className: "seg green",
        style: {
          left: a.pct + "%",
          width: Math.max(0, b.pct - a.pct) + "%"
        }
      }), b && c && /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
        className: "seg amber",
        style: {
          left: b.pct + "%",
          width: Math.max(0, c.pct - b.pct) + "%"
        }
      }), t.points.map(p => /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
        className: "tick",
        style: {
          left: p.pct + "%"
        }
      }, p.key)), t.todayPct !== null && /*#__PURE__*/(0, _jsxRuntime.jsx)("u", {
        className: "today",
        style: {
          left: t.todayPct + "%"
        },
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("em", {
          children: "Today"
        })
      })]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gs-hint",
      children: "Set the dates to see the season laid out to scale."
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gs-tlfoot",
      children: t.points.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        children: [p.label, ": ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
          children: (0, _settingsEngine.fmtDate)(p.ymd)
        })]
      }, p.key))
    }), t.problems.map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gs-err",
      role: "alert",
      children: x
    }, x))]
  });
}
function Settings() {
  const [load, setLoad] = (0, _react.useState)({
    state: "loading",
    msg: ""
  });
  const [ov, setOv] = (0, _react.useState)(null);
  const [base, setBase] = (0, _react.useState)(null);
  const [cfg, setCfg] = (0, _react.useState)(null);
  const [srvErr, setSrvErr] = (0, _react.useState)({});
  const [tab, setTab] = (0, _react.useState)("season");
  const [review, setReview] = (0, _react.useState)(false);
  const [ack, setAck] = (0, _react.useState)(false);
  const [saving, setSaving] = (0, _react.useState)(false);
  const [msg, setMsg] = (0, _react.useState)(null);
  const [conflict, setConflict] = (0, _react.useState)(false);
  const [pending, setPending] = (0, _react.useState)(null);
  const [mail, setMail] = (0, _react.useState)(null);
  const [restoreId, setRestoreId] = (0, _react.useState)(null);
  const [imp, setImp] = (0, _react.useState)(null);
  const [feeDate, setFeeDate] = (0, _react.useState)("");
  const busy = (0, _react.useRef)(false);
  const fetchAll = (0, _react.useCallback)(async keepEdits => {
    setLoad({
      state: "loading",
      msg: ""
    });
    try {
      const r = await api("/settings/overview");
      if (!r.ok) {
        const why = r.status === 403 ? "Your account is not allowed to open Settings (it needs a WordPress Administrator)." : r.j.message || r.j.error || `The server answered HTTP ${r.status}.`;
        setLoad({
          state: "error",
          msg: why
        });
        return;
      }
      setOv(r.j);
      setBase(r.j.settings);
      if (!keepEdits) {
        setCfg(r.j.settings);
        setSrvErr({});
      }
      setFeeDate(d => d || r.j.today);
      setLoad({
        state: "ready",
        msg: ""
      });
    } catch (e) {
      setLoad({
        state: "error",
        msg: "Could not reach the server."
      });
    }
  }, []);
  (0, _react.useEffect)(() => {
    fetchAll(false);
  }, [fetchAll]);
  const changes = (0, _react.useMemo)(() => base && cfg ? (0, _settingsEngine.diff)(base, cfg) : [], [base, cfg]);
  const dirty = changes.length > 0;
  const clientErr = (0, _react.useMemo)(() => cfg ? (0, _settingsEngine.validate)(cfg) : {}, [cfg]);
  const err = (0, _react.useMemo)(() => ({
    ...srvErr,
    ...clientErr
  }), [srvErr, clientErr]);
  const errCount = Object.keys(err).length;
  const tabErr = (0, _react.useMemo)(() => (0, _settingsEngine.errorTabCounts)(err), [err]);
  const today = ov && ov.today || (0, _settingsEngine.localToday)();
  (0, _react.useEffect)(() => {
    if (!dirty) return undefined;
    const h = e => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const set = (k, v) => {
    setCfg(c => ({
      ...c,
      [k]: v
    }));
    setSrvErr(e => {
      if (!(k in e)) return e;
      const n = {
        ...e
      };
      delete n[k];
      return n;
    });
    setMsg(null);
  };
  const setDiv = (i, k, v) => {
    setCfg(c => ({
      ...c,
      divisions: c.divisions.map((d, x) => x === i ? {
        ...d,
        [k]: v
      } : d)
    }));
    setSrvErr(e => {
      const key = `divisions.${i}.${k}`;
      if (!(key in e)) return e;
      const n = {
        ...e
      };
      delete n[key];
      return n;
    });
    setMsg(null);
  };
  const P = (k, extra) => ({
    id: "f-" + k,
    value: cfg[k] === null || cfg[k] === undefined ? "" : cfg[k],
    onChange: e => set(k, e.target.value),
    "aria-invalid": !!err[k],
    "aria-describedby": err[k] ? "f-" + k + "-e" : undefined,
    className: "gs-in" + (err[k] ? " bad" : ""),
    ...extra
  });
  const discard = () => {
    setCfg(base);
    setSrvErr({});
    setMsg(null);
    setPending(null);
    setConflict(false);
  };
  const openReview = () => {
    setAck(false);
    setReview(true);
  };
  const warnings = (0, _react.useMemo)(() => ov && base && cfg ? (0, _settingsEngine.divisionWarnings)(base, cfg, ov.registered) : [], [ov, base, cfg]);
  const irreversible = cfg && base && cfg.status !== base.status && _settingsEngine.IRREVERSIBLE.includes(cfg.status);
  const statusChecks = ov && cfg && base && cfg.status !== base.status ? (ov.readiness[cfg.status] || []).filter(c => c.level !== "ok") : [];
  const save = async force => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setMsg(null);
    try {
      const body = {
        ...(0, _settingsEngine.buildPayload)(cfg, ov.meta.saved_at),
        ...(force ? {
          force: true
        } : {})
      };
      const r = await api("/settings", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (r.ok) {
        setBase(r.j.settings);
        setCfg(r.j.settings);
        setSrvErr({});
        setConflict(false);
        setReview(false);
        setOv(o => ({
          ...o,
          settings: r.j.settings,
          meta: {
            ...o.meta,
            ...(r.j.meta || {})
          },
          history: r.j.history || o.history
        }));
        setMsg({
          kind: "ok",
          text: r.j.unchanged ? "Nothing changed." : `Saved ${r.j.changes.length} change${r.j.changes.length === 1 ? "" : "s"} at ${new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })}.`
        });
        fetchAll(true);
      } else if (r.status === 422) {
        setSrvErr(r.j.errors || {});
        setReview(false);
        const first = Object.keys(r.j.errors || {})[0];
        if (first) setTab((0, _settingsEngine.tabOfError)(first));
        setMsg({
          kind: "bad",
          text: r.j.error || "Fix the highlighted fields."
        });
      } else if (r.status === 409) {
        setReview(false);
        setConflict(true);
        setMsg({
          kind: "bad",
          text: r.j.error
        });
      } else setMsg({
        kind: "bad",
        text: r.j.error || r.j.message || `Save failed (HTTP ${r.status}). Your edits are still here.`
      });
    } catch (e) {
      setMsg({
        kind: "bad",
        text: "Could not reach the server. Your edits are still here and nothing was saved."
      });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const sendTest = async () => {
    if (busy.current) return;
    busy.current = true;
    setMail({
      state: "sending"
    });
    try {
      const r = await api("/settings/test-email", {
        method: "POST",
        body: "{}"
      });
      setMail(r.ok ? {
        state: "ok",
        ...r.j
      } : {
        state: "bad",
        text: r.j.error || `HTTP ${r.status}`
      });
    } catch (e) {
      setMail({
        state: "bad",
        text: "Could not reach the server."
      });
    } finally {
      busy.current = false;
    }
  };
  const restore = async id => {
    if (busy.current) return;
    busy.current = true;
    setMsg(null);
    try {
      const r = await api("/settings/restore", {
        method: "POST",
        body: JSON.stringify({
          id
        })
      });
      if (r.ok) {
        setRestoreId(null);
        setMsg({
          kind: "ok",
          text: "Restored that version."
        });
        await fetchAll(false);
      } else setMsg({
        kind: "bad",
        text: r.j.error || `Restore failed (HTTP ${r.status}).`
      });
    } catch (e) {
      setMsg({
        kind: "bad",
        text: "Could not reach the server."
      });
    } finally {
      busy.current = false;
    }
  };
  const onKeyTabs = e => {
    const i = TABS.findIndex(t => t[0] === tab);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;else if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length;else return;
    e.preventDefault();
    setTab(TABS[n][0]);
    const el = document.getElementById("gs-tab-" + TABS[n][0]);
    if (el) el.focus();
  };
  const onImport = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const r = (0, _settingsEngine.importPayload)(String(rd.result));
      if (!r.ok) {
        setImp({
          kind: "bad",
          text: r.error
        });
        return;
      }
      setCfg(c => ({
        ...c,
        ...r.settings,
        season_year: c.season_year
      }));
      setImp({
        kind: "ok",
        text: `Loaded ${Object.keys(r.settings).length} settings from ${f.name}. Nothing is saved yet. Press Review & save to check them.` + (r.ignored.length ? ` Ignored: ${r.ignored.join(", ")}.` : "")
      });
    };
    rd.readAsText(f);
    e.target.value = "";
  };
  if (load.state === "loading" && !cfg) return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gs-root",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Styles, {}), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gs-load",
      role: "status",
      children: "Loading settings\u2026"
    })]
  });
  if (load.state === "error" && !cfg) {
    return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-root",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Styles, {}), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gs-fail",
        role: "alert",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
          children: "Settings could not be loaded"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          children: load.msg
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gs-hint",
          children: "The form is hidden on purpose. If it showed default values you could save them over your real settings."
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn primary",
          onClick: () => fetchAll(false),
          children: "Try again"
        })]
      })]
    });
  }
  if (!cfg || !ov) return null;
  const statusIdx = _settingsEngine.STATUSES.indexOf(cfg.status);
  const regd = ov.registered || {};
  const healthBad = (ov.health || []).filter(h => h.level === "bad" || h.level === "warn").length;
  const plan = (0, _settingsEngine.rolloverPlan)(cfg);
  const fee = (0, _settingsEngine.teamFeeFor)(cfg, feeDate || today);
  const formList = ov.forms && ov.forms.available ? ov.forms.forms : null;
  const sync = ov && ov.sync_forms || null;
  const formKnown = formList ? formList.find(f => f.id === (0, _settingsEngine.toNum)(cfg.form_id)) : null;
  const sw = (k, label, hint) => /*#__PURE__*/(0, _jsxRuntime.jsx)(Switch, {
    id: "sw-" + k,
    checked: cfg[k],
    onChange: v => set(k, v),
    label: label,
    hint: hint,
    ov: ov,
    k: k
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gs-root",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Styles, {}), /*#__PURE__*/(0, _jsxRuntime.jsxs)("header", {
      className: "gs-head",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gs-eyebrow",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gs-tag",
            children: "Admin"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gs-pill s-" + base.status,
            children: base.status.charAt(0).toUpperCase() + base.status.slice(1)
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
          className: "gs-title",
          children: "Settings"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gs-sub",
          children: "Season \xB7 divisions \xB7 fees \xB7 draft \xB7 email \xB7 access"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gs-saved",
          "aria-live": "polite",
          children: ov.meta.saved_at ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
            children: ["Last saved ", ov.meta.saved_by ? "by " + ov.meta.saved_by + " " : "", "on ", fmtStamp(ov.meta.saved_at)]
          }) : "Never saved from this page. Showing built-in defaults."
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gs-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn ghost",
          disabled: !dirty || saving,
          onClick: discard,
          children: "Discard changes"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn primary",
          disabled: !dirty || saving || errCount > 0,
          onClick: openReview,
          title: errCount ? "Fix the highlighted fields first" : dirty ? "See exactly what will change" : "Nothing to save",
          children: saving ? "Saving…" : dirty ? `Review & save (${changes.length})` : "Saved"
        })]
      })]
    }), msg && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-banner " + msg.kind,
      role: msg.kind === "bad" ? "alert" : "status",
      children: [msg.text, conflict && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        className: "gs-bact",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn small",
          onClick: () => {
            if (!dirty || window.confirm("Reload and lose your unsaved edits?")) {
              setConflict(false);
              setMsg(null);
              fetchAll(false);
            }
          },
          children: "Reload their version"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn small danger",
          onClick: () => save(true),
          children: "Overwrite with mine"
        })]
      })]
    }), load.state === "error" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-banner bad",
      role: "alert",
      children: ["Could not refresh from the server: ", load.msg]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gs-tabs",
      role: "tablist",
      "aria-label": "Settings sections",
      onKeyDown: onKeyTabs,
      children: TABS.map(([k, l]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        id: "gs-tab-" + k,
        role: "tab",
        "aria-selected": tab === k,
        "aria-controls": "gs-panel-" + k,
        tabIndex: tab === k ? 0 : -1,
        className: "gs-tab" + (tab === k ? " on" : ""),
        onClick: () => setTab(k),
        children: [l, tabErr[k] ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gs-badge bad",
          "aria-label": tabErr[k] + " problems",
          children: tabErr[k]
        }) : k === "health" && healthBad ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gs-badge warn",
          "aria-label": healthBad + " to check",
          children: healthBad
        }) : null]
      }, k))
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-card",
      role: "tabpanel",
      id: "gs-panel-" + tab,
      "aria-labelledby": "gs-tab-" + tab,
      children: [tab === "season" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Group, {
          title: "Season timeline",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Timeline, {
            opens: cfg.registration_opens,
            closes: cfg.registration_closes,
            draft: cfg.draft_date,
            today: today
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Where the season is",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("ol", {
            className: "gs-steps",
            "aria-label": "Season status",
            children: _settingsEngine.STATUSES.map((s, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                type: "button",
                className: "gs-step" + (i < statusIdx ? " done" : "") + (i === statusIdx ? " now" : ""),
                "aria-current": i === statusIdx ? "step" : undefined,
                onClick: () => {
                  if (s !== cfg.status) setPending(s);
                },
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "n",
                  children: i < statusIdx ? "✓" : i + 1
                }), s.charAt(0).toUpperCase() + s.slice(1)]
              })
            }, s))
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gs-hint",
            children: [STATUS_HELP[cfg.status], cfg.status !== base.status && /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              children: " Not saved yet."
            })]
          }), err.status && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-err",
            role: "alert",
            children: err.status
          }), pending && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-panel",
            role: "region",
            "aria-label": "Move to " + pending,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h4", {
              children: ["Move to \u201C", pending, "\u201D?"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("ul", {
              className: "gs-checks",
              children: [(ov.readiness[pending] || []).length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
                className: "ok",
                children: "Nothing to check for this step."
              }), (ov.readiness[pending] || []).map((c, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                className: c.level,
                children: [c.text, c.tab && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  className: "gs-link",
                  onClick: () => setTab(c.tab),
                  children: "Fix"
                })]
              }, i))]
            }), _settingsEngine.IRREVERSIBLE.includes(pending) && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              className: "gs-warn",
              children: "This step is meant to be final. You can still change it back here, but captains and players may already have been told."
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gs-btnrow",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                className: "gs-btn primary",
                disabled: (ov.readiness[pending] || []).some(c => c.level === "block"),
                onClick: () => {
                  set("status", pending);
                  setPending(null);
                },
                children: ["Use \u201C", pending, "\u201D (not saved yet)"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                className: "gs-btn ghost",
                onClick: () => setPending(null),
                children: "Cancel"
              })]
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Group, {
          title: "Season details",
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-season_year",
              label: "Season year",
              hint: `Fixed at ${ov.locked_year} by the sync code. Next season is a code change, not a setting.`,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                id: "f-season_year",
                className: "gs-in locked",
                value: cfg.season_year,
                readOnly: true,
                "aria-readonly": "true"
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-season_label",
              label: "Season label",
              error: err.season_label,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                ...P("season_label")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Field, {
              id: "f-form_id",
              label: "Registration form (WPForms)",
              error: err.form_id,
              hint: formList ? formKnown ? `${formKnown.title}${formKnown.entries !== null ? " · " + formKnown.entries + " entries" : ""}` : "" : "WPForms could not be read here, so type the form ID.",
              children: [formList ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                ...P("form_id", {
                  onChange: e => set("form_id", e.target.value)
                }),
                children: [!formKnown && /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
                  value: cfg.form_id,
                  children: ["#", cfg.form_id, " (not found in WPForms)"]
                }), formList.map(f => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
                  value: f.id,
                  children: [f.title, " (#", f.id, ")", f.entries !== null ? ` · ${f.entries} entries` : ""]
                }, f.id))]
              }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: "1",
                ...P("form_id")
              }), formList && !formKnown && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                className: "gs-note",
                role: "status",
                children: ["Form #", cfg.form_id, " was not found in the WPForms list (", formList.length, " forms found)."]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                className: "gs-note",
                children: sync && sync.live ? `Not connected yet: registration sync is fixed to form #${sync.live}${sync.test ? ` (test form #${sync.test} also accepted)` : ""} in the plugin code. Changing this does not change what syncs.` : "Not connected yet: the sync does not read this setting."
              })]
            })]
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Group, {
          title: "Dates",
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-registration_opens",
              label: "Registration opens",
              error: err.registration_opens,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "date",
                ...P("registration_opens")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-registration_closes",
              label: "Registration closes",
              error: err.registration_closes,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "date",
                ...P("registration_closes")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-draft_date",
              label: "Draft date",
              error: err.draft_date,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "date",
                ...P("draft_date")
              })
            })]
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Group, {
          title: "Intelligence",
          children: sw("sandbagging_auto_flag", "Auto-flag sandbagging", "Flag players whose registered tier does not match their prior division history, in red on the Draft board.")
        })]
      }), tab === "divisions" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Divisions",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-hint",
            children: "Roster spots = teams \xD7 max roster. \u201CNeeded\u201D = teams \xD7 min roster. The bar shows registered players against both."
          }), err.divisions && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-err",
            role: "alert",
            children: err.divisions
          })]
        }), cfg.divisions.map((d, i) => {
          const cap = (0, _settingsEngine.capacity)(d),
            n = regd[d.key] && regd[d.key].registered || 0,
            g = regd[d.key] && regd[d.key].goalies || 0;
          const pct = cap.slots ? Math.min(100, Math.round(n / cap.slots * 100)) : 0,
            needPct = cap.slots && cap.needed ? Math.round(cap.needed / cap.slots * 100) : 0;
          const e = f => err[`divisions.${i}.${f}`];
          const num = (f, lab) => /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
            id: `d${i}-${f}`,
            label: lab,
            error: e(f),
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              type: "number",
              id: `d${i}-${f}`,
              value: d[f] === null || d[f] === undefined ? "" : d[f],
              onChange: ev => setDiv(i, f, ev.target.value),
              "aria-invalid": !!e(f),
              "aria-describedby": e(f) ? `d${i}-${f}-e` : undefined,
              className: "gs-in" + (e(f) ? " bad" : "")
            })
          });
          return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
            className: "gs-div" + (d.enabled ? "" : " off"),
            "aria-label": d.label,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gs-divhead",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gs-divname",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  "aria-label": d.label + " name",
                  className: "gs-in name" + (e("label") ? " bad" : ""),
                  value: d.label,
                  onChange: ev => setDiv(i, "label", ev.target.value)
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("code", {
                  children: d.key
                }), e("label") && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gs-err",
                  children: e("label")
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                type: "button",
                role: "switch",
                "aria-checked": !!d.enabled,
                "aria-label": "Enable " + d.label,
                className: "gs-sw" + (d.enabled ? " on" : ""),
                onClick: () => setDiv(i, "enabled", !d.enabled),
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {})
              })]
            }), d.enabled && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gs-grid five",
                children: [num("teams", "Teams"), num("min_roster", "Min roster"), num("max_roster", "Max roster"), num("goalie_min", "Min goalies"), num("goalie_max", "Max goalies")]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gs-cap",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  className: "gs-meter",
                  role: "img",
                  "aria-label": `${n} registered of ${cap.slots === null ? "unknown" : cap.slots} spots`,
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
                    className: n > (cap.slots || Infinity) ? "over" : "",
                    style: {
                      width: pct + "%"
                    }
                  }), needPct > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    style: {
                      left: needPct + "%"
                    },
                    title: "Minimum needed"
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                  className: "gs-hint",
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                    children: n
                  }), " registered (", g, " goalie", g === 1 ? "" : "s", ") \xB7 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                    children: cap.slots === null ? "—" : cap.slots
                  }), " spots \xB7 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                    children: cap.needed === null ? "—" : cap.needed
                  }), " needed to run", cap.goalies !== null && g < cap.goalies ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    className: "gs-warn",
                    children: [" \xB7 needs ", cap.goalies, " goalies"]
                  }) : null]
                })]
              })]
            }), !d.enabled && n > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              className: "gs-warn",
              children: [n, " registered player", n === 1 ? "" : "s", " will be hidden while this division is off."]
            })]
          }, d.key);
        })]
      }), tab === "fees" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Player fee",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-grid",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-player_fee",
              label: "Fee per player (USD)",
              error: err.player_fee,
              hint: "Reports uses this for \u201Camount owed\u201D and payment reminders. Blank = not set.",
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: "0",
                step: "0.01",
                placeholder: "not set",
                ...P("player_fee")
              })
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
            ov: ov,
            k: "player_fee"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Team fees (full-team entries)",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_deposit_amount",
              label: "Deposit",
              error: err.team_deposit_amount,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: "0",
                step: "0.01",
                ...P("team_deposit_amount")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_fee_early_amount",
              label: "Early total",
              error: err.team_fee_early_amount,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: "0",
                step: "0.01",
                ...P("team_fee_early_amount")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_fee_late_amount",
              label: "Late total",
              error: err.team_fee_late_amount,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                min: "0",
                step: "0.01",
                ...P("team_fee_late_amount")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_fee_early_cutoff_date",
              label: "Early fee if deposit paid by",
              error: err.team_fee_early_cutoff_date,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "date",
                ...P("team_fee_early_cutoff_date")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_balance_due_date",
              label: "Balance due",
              error: err.team_balance_due_date,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "date",
                ...P("team_balance_due_date")
              })
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
            ov: ov,
            k: "team_fee_late_amount"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-try",
            "aria-live": "polite",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "f-feedate",
              className: "gs-lab",
              children: "Try it: a team pays its deposit on"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              id: "f-feedate",
              type: "date",
              className: "gs-in short",
              value: feeDate,
              onChange: e => setFeeDate(e.target.value)
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              className: "gs-result",
              children: fee ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                children: ["That team gets the ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                  children: fee.tier
                }), " fee: ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                  children: (0, _settingsEngine.money)(fee.total)
                }), " total, ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                  children: (0, _settingsEngine.money)(fee.balance)
                }), " due on ", (0, _settingsEngine.fmtDate)(cfg.team_balance_due_date), " after the ", (0, _settingsEngine.money)(fee.deposit), " deposit.", fee.tier === "early" ? ` ${fee.daysFromCutoff === 0 ? "Last day for the early fee." : Math.abs(fee.daysFromCutoff) + " days before the cutoff."}` : ` ${fee.daysFromCutoff} day${fee.daysFromCutoff === 1 ? "" : "s"} past the cutoff. Paying earlier would have saved ${(0, _settingsEngine.money)(fee.saving)}.`]
              }) : "Fill in the amounts and dates to see an example."
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Reminders",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_deposit_nudge_days",
              label: "Nudge for deposit (days before cutoff)",
              error: err.team_deposit_nudge_days,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                ...P("team_deposit_nudge_days")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-team_balance_reminder_days",
              label: "Balance reminder (days before due)",
              error: err.team_balance_reminder_days,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "number",
                ...P("team_balance_reminder_days")
              })
            })]
          }), sw("email_team_deposit_nudge", "Deposit nudge emails", "Remind team captains to pay the deposit before the early-fee cutoff."), sw("email_team_balance", "Balance reminder emails", "Remind team captains before the balance is due.")]
        })]
      }), tab === "draft" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Pick clock",
          children: [sw("timer_enabled", "Enable draft timer", "Countdown clock for each pick."), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-grid",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-timer_seconds",
              label: "Seconds per pick",
              error: err.timer_seconds,
              hint: "The Draft page starts with this value. You can still change it when you press Start.",
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gs-range",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  type: "range",
                  min: "15",
                  max: "180",
                  step: "5",
                  "aria-label": "Seconds per pick (slider)",
                  value: Math.min(180, Math.max(15, (0, _settingsEngine.toNum)(cfg.timer_seconds) || 90)),
                  onChange: e => set("timer_seconds", e.target.value)
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  type: "number",
                  ...P("timer_seconds", {
                    className: "gs-in short" + (err.timer_seconds ? " bad" : "")
                  })
                })]
              })
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
            ov: ov,
            k: "timer_seconds"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Draft format",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Field, {
              id: "f-draft_type",
              label: "Draft type",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
                ...P("draft_type"),
                children: DRAFT_TYPES.map(([v, l]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                  value: v,
                  children: l
                }, v))
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
                ov: ov,
                k: "draft_type"
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Field, {
              id: "f-draft_order",
              label: "Draft order",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
                ...P("draft_order"),
                children: DRAFT_ORDERS.map(([v, l]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                  value: v,
                  children: l
                }, v))
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
                ov: ov,
                k: "draft_order"
              })]
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-hint",
            children: "These two are saved so your choice is not lost, but the Draft page does not read them yet. Set order on the Draft page."
          })]
        })]
      }), tab === "email" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Automated emails",
          children: [sw("email_registration", "Registration confirmation", "When a player submits the registration form."), sw("email_roster", "Roster finalized", "To players and captains when rosters are published."), sw("email_payment", "Payment reminder", "To unpaid players. Reports has a manual reminder button that does work today."), sw("email_alternate", "Alternate activation", "When a sub is activated.")]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Sender",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-grid",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-sender_name",
              label: "From name",
              error: err.sender_name,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                placeholder: "Gold Rush Senior Hockey",
                ...P("sender_name")
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Field, {
              id: "f-sender_email",
              label: "From email",
              error: err.sender_email,
              hint: `Leave blank to use the WordPress default. Best if it ends in @${ov.mail.site_domain || "your site"}.`,
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                type: "email",
                placeholder: "tournament@" + (ov.mail.site_domain || "yoursite.com"),
                ...P("sender_email")
              })
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Wire, {
            ov: ov,
            k: "sender_email"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Check it works",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gs-hint",
            children: ["Mail plugin: ", ov.mail.smtp ? /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              className: "gs-okt",
              children: "SMTP plugin active"
            }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              className: "gs-warn",
              children: "no SMTP plugin found. Mail may go to spam."
            }), ". The test goes only to your own account address", ov.mail.to ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
              children: [" (", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                children: ov.mail.to
              }), ")"]
            }) : "", " and uses the ", /*#__PURE__*/(0, _jsxRuntime.jsx)("em", {
              children: "saved"
            }), " sender", dirty ? ", so save first" : "", "."]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-btnrow",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              className: "gs-btn",
              onClick: sendTest,
              disabled: !ov.mail.to || mail && mail.state === "sending",
              children: mail && mail.state === "sending" ? "Sending…" : "Send me a test email"
            })
          }), mail && mail.state === "ok" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gs-okt",
            role: "status",
            children: ["Sent to ", mail.to, mail.from ? " from " + mail.from : "", ". Check that it arrived and is not in spam."]
          }), mail && mail.state === "bad" && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-err",
            role: "alert",
            children: mail.text
          })]
        })]
      }), tab === "access" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Group, {
          title: "Visibility",
          children: sw("public_rosters", "Public roster pages", "Let players view rosters without logging in.")
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "User roles (reference only)",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-hint",
            children: "Roles and permissions are set in the plugin code, not here."
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-tablewrap",
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
              className: "gs-table",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("caption", {
                className: "sr",
                children: "What each role can do"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)("tr", {
                  children: ["Role", "Sync import", "Edit roster", "Run draft", "Send email", "View roster", "Manage own roster"].map(h => /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "col",
                    children: h
                  }, h))
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
                children: ROLES.map(([r, v]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "row",
                    children: r
                  }), v.map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    className: x ? "yes" : "no",
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      "aria-hidden": "true",
                      children: x ? "✓" : "—"
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "sr",
                      children: x ? "yes" : "no"
                    })]
                  }, i))]
                }, r))
              })]
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-hint",
            children: "The GRSH admin menu currently needs a full WordPress Administrator account. A Committee or Read Only user who is not also an Administrator will not see it."
          })]
        })]
      }), tab === "health" && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Health check",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gs-checks",
            children: (ov.health || []).map((h, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              className: h.level,
              children: [h.text, h.tab && h.level !== "ok" && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                className: "gs-link",
                onClick: () => setTab(h.tab),
                children: "Go there"
              })]
            }, i))
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-btnrow",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              className: "gs-btn small",
              onClick: () => fetchAll(true),
              children: "Re-check"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gs-hint",
              children: "Based on saved settings."
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Version history (last 10 saves)",
          children: [(!ov.history || ov.history.length === 0) && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gs-hint",
            children: "No saved versions yet. The next save will be recorded here."
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gs-hist",
            children: (ov.history || []).map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("summary", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
                    children: fmtStamp(h.at)
                  }), " \xB7 ", h.by || "unknown", " \xB7 ", h.count, " change", h.count === 1 ? "" : "s", /^Restored/.test(h.note) ? " · restore" : ""]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("ul", {
                  className: "gs-chg",
                  children: [h.changes.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      children: labelOf(c.key, cfg)
                    }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("del", {
                      children: show(c.key, c.from)
                    }), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("ins", {
                      children: show(c.key, c.to)
                    })]
                  }, c.key)), h.count > h.changes.length && /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                    children: ["\u2026and ", h.count - h.changes.length, " more"]
                  })]
                })]
              }), restoreId === h.id ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gs-confirm",
                children: [" Put these settings back", dirty ? " (your unsaved edits will be discarded)" : "", "? ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  className: "gs-btn small danger",
                  onClick: () => restore(h.id),
                  children: "Yes, restore"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  className: "gs-btn small ghost",
                  onClick: () => setRestoreId(null),
                  children: "No"
                })]
              }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                className: "gs-btn small ghost",
                onClick: () => setRestoreId(h.id),
                children: "Restore this version"
              })]
            }, h.id))
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Back up or copy settings",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gs-btnrow",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              className: "gs-btn",
              onClick: () => saveBlob(`grsh-settings-${today}.json`, JSON.stringify((0, _settingsEngine.exportPayload)(cfg), null, 2), "application/json"),
              children: "Download settings (JSON)"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              className: "gs-btn",
              htmlFor: "gs-import",
              children: "Load settings from a file\u2026"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              id: "gs-import",
              type: "file",
              accept: "application/json,.json",
              className: "sr",
              onChange: onImport
            })]
          }), imp && /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: imp.kind === "ok" ? "gs-okt" : "gs-err",
            role: imp.kind === "ok" ? "status" : "alert",
            children: imp.text
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)(Group, {
          title: "Next season planner",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gs-hint",
            children: ["A starting point for ", plan.season_year, ": same divisions and fees, every date moved one year. This only prepares a file. The season year is fixed in code, so switching seasons is a developer step."]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-tablewrap",
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
              className: "gs-table",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("caption", {
                className: "sr",
                children: "Next season plan"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "col",
                    children: "Setting"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "col",
                    children: "This season"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "col",
                    children: plan.season_year
                  })]
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
                children: [["season_label"], ["registration_opens"], ["registration_closes"], ["draft_date"], ["team_fee_early_cutoff_date"], ["team_balance_due_date"]].map(([k]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                    scope: "row",
                    children: _settingsEngine.FIELD_LABELS[k]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    children: show(k, cfg[k])
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    children: show(k, plan[k])
                  })]
                }, k))
              })]
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gs-btnrow",
            children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              className: "gs-btn",
              onClick: () => saveBlob(`grsh-next-season-${plan.season_year}.json`, JSON.stringify({
                ...(0, _settingsEngine.exportPayload)({
                  ...cfg,
                  ...plan
                }),
                note: "Planning file only. Not applied to the site."
              }, null, 2), "application/json"),
              children: ["Download ", plan.season_year, " plan"]
            })
          })]
        })]
      })]
    }), dirty && !review && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gs-bottom",
      role: "region",
      "aria-label": "Unsaved changes",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        children: [changes.length, " unsaved change", changes.length === 1 ? "" : "s", errCount ? ` · ${errCount} problem${errCount === 1 ? "" : "s"} to fix` : ""]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn ghost",
          onClick: discard,
          children: "Discard"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          className: "gs-btn primary",
          disabled: errCount > 0 || saving,
          onClick: openReview,
          children: "Review & save"
        })]
      })]
    }), review && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gs-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "gs-rv-t",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gs-dlg",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h2", {
          id: "gs-rv-t",
          children: ["Review ", changes.length, " change", changes.length === 1 ? "" : "s"]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
          className: "gs-chg big",
          children: changes.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              children: c.label
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("del", {
                children: c.from
              }), " \u2192 ", /*#__PURE__*/(0, _jsxRuntime.jsx)("ins", {
                children: c.to
              })]
            })]
          }, c.key))
        }), warnings.map(w => /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gs-warn",
          role: "alert",
          children: ["\u26A0 ", w]
        }, w)), statusChecks.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gs-panel",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h4", {
            children: ["Before moving to \u201C", cfg.status, "\u201D"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gs-checks",
            children: statusChecks.map((c, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
              className: c.level,
              children: c.text
            }, i))
          })]
        }), irreversible && /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
          className: "gs-ack",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
            type: "checkbox",
            checked: ack,
            onChange: e => setAck(e.target.checked)
          }), " I understand \u201C", cfg.status, "\u201D is meant to be final."]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gs-hint",
          children: "Every save is logged with your name and kept in Version history so you can undo it."
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gs-btnrow",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            className: "gs-btn primary",
            disabled: saving || irreversible && !ack,
            onClick: () => save(false),
            children: saving ? "Saving…" : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            className: "gs-btn ghost",
            onClick: () => setReview(false),
            children: "Keep editing"
          })]
        })]
      })
    })]
  });
}
function labelOf(key, cfg) {
  if (key.startsWith("divisions.")) {
    const [, dk, f] = key.split(".");
    const d = (cfg.divisions || []).find(x => x.key === dk);
    return `${d ? d.label : dk} · ${f.replace("_", " ")}`;
  }
  return _settingsEngine.FIELD_LABELS[key] || key;
}
function show(key, v) {
  if (v === null || v === undefined || v === "") return "not set";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (/_(amount)$|^player_fee$/.test(key)) return (0, _settingsEngine.money)(v);
  if (/date$|_opens$|_closes$/.test(key)) return (0, _settingsEngine.fmtDate)(v);
  return String(v);
}
function Styles() {
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
    children: `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
.gs-root{--ink:#1a1a2e;--mut:#5b5b55;--line:#dcd9cf;--bg:#f6f5f0;--gold:#d4a017;--ok:#0f6e56;--bad:#a32d2d;--warn:#8a5a0b;font-family:'Fraunces',Georgia,serif;background:var(--bg);color:var(--ink);padding:24px 28px 90px;max-width:1040px;box-sizing:border-box}
.gs-root *{box-sizing:border-box}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.gs-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:16px}
.gs-eyebrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;line-height:1.5;margin:0 0 8px;position:relative}
.gs-tag{font:500 11px 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;background:var(--ink);color:var(--gold);padding:3px 12px;border-radius:99px}
.gs-pill{font:500 12px 'DM Mono',monospace;border:1px solid var(--line);background:#fff;padding:2px 10px;border-radius:99px;display:inline-block}
.gs-pill.green,.gs-pill.s-open{color:var(--ok);border-color:#9fe1cb;background:#e1f5ee}.gs-pill.blue,.gs-pill.s-setup{color:#185fa5;border-color:#b5d4f4;background:#e6f1fb}
.gs-pill.amber,.gs-pill.s-draft{color:var(--warn);border-color:#fac775;background:#faeeda}.gs-pill.s-locked{color:var(--bad);border-color:#f7c1c1;background:#fceBEB}.gs-pill.grey,.gs-pill.s-complete{color:var(--mut);background:#f1efe8}
.gs-root h1.gs-title{display:block;font-size:30px;line-height:1.2;font-weight:700;margin:0 0 4px;padding:0;letter-spacing:-.5px;position:relative}
.gs-in[type=text],select.gs-in{text-overflow:ellipsis}select.gs-in{min-width:0;max-width:100%}
.gs-note{font:12px 'DM Mono',monospace;color:var(--mut);margin:6px 0 0;line-height:1.5}
.gs-sub{font:13px 'DM Mono',monospace;color:var(--mut);margin:0}.gs-saved{font:12px 'DM Mono',monospace;color:var(--mut);margin:6px 0 0}
.gs-actions{display:flex;gap:8px;flex-wrap:wrap}
.gs-btn{font:500 13px 'DM Mono',monospace;border:1px solid var(--ink);background:#fff;color:var(--ink);padding:9px 16px;border-radius:8px;cursor:pointer;display:inline-block;text-decoration:none}
.gs-btn:hover:not(:disabled){background:#efede4}.gs-btn.primary{background:var(--ink);color:var(--gold)}.gs-btn.primary:hover:not(:disabled){background:#2c2c4a}
.gs-btn.ghost{border-color:var(--line);color:var(--mut)}.gs-btn.danger{border-color:var(--bad);color:var(--bad)}.gs-btn.small{padding:5px 11px;font-size:12px}
.gs-btn:disabled{opacity:.45;cursor:not-allowed}
.gs-btn:focus-visible,.gs-tab:focus-visible,.gs-in:focus-visible,.gs-sw:focus-visible,.gs-step:focus-visible,.gs-link:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2a6df4;outline-offset:2px}
.gs-banner{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:12px;font:13px 'DM Mono',monospace;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.gs-banner.ok{background:#e1f5ee;border-color:#9fe1cb;color:#0b5a46}.gs-banner.bad{background:#fceaea;border-color:#f0b4b4;color:#7d1f1f}.gs-bact{display:flex;gap:8px}
.gs-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.gs-tab{font:500 13px 'DM Mono',monospace;padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--mut);cursor:pointer}
.gs-tab.on{background:var(--ink);color:var(--gold);border-color:var(--ink)}
.gs-badge{margin-left:7px;font:600 11px 'DM Mono',monospace;border-radius:99px;padding:1px 7px;color:#fff}.gs-badge.bad{background:var(--bad)}.gs-badge.warn{background:#b7791f}
.gs-card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.gs-group{padding:18px 22px;border-bottom:1px solid #efede4}.gs-group:last-child{border-bottom:0}
.gs-gl{font:500 12px 'DM Mono',monospace;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px}
.gs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px 16px}.gs-grid.five{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
.gs-lab{font:500 12px 'DM Mono',monospace;color:#44443f;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px}
.gs-in{font:14px 'DM Mono',monospace;width:100%;min-height:38px;background:#faf9f5;border:1px solid #bdb9ab;border-radius:6px;padding:7px 10px;color:#222}
.gs-in.locked{background:#eeece4;color:var(--mut)}.gs-in.short{width:110px}.gs-in.name{font:600 16px 'Fraunces',serif;max-width:260px;background:#fff}
.gs-in.bad{border-color:var(--bad);background:#fff6f6}
.gs-hint{font:12.5px/1.45 'DM Mono',monospace;color:var(--mut);margin:5px 0 0}.gs-err{font:600 12.5px 'DM Mono',monospace;color:var(--bad);margin:5px 0 0}.gs-warn{font:600 12.5px/1.45 'DM Mono',monospace;color:var(--warn);margin:6px 0 0}.gs-okt{font:600 12.5px 'DM Mono',monospace;color:var(--ok)}
.gs-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #f1efe7}.gs-row:last-child{border-bottom:0}
.gs-rowlabel{font:600 15px 'Fraunces',serif;display:block}.gs-rowtxt{flex:1}
.gs-wire{display:inline-block;font:500 11px 'DM Mono',monospace;border-radius:4px;padding:2px 7px;margin-top:6px}.gs-wire.off{background:#faeeda;color:#7a4f08;border:1px solid #fac775}.gs-wire.on{color:var(--mut);padding-left:0}
.gs-sw{width:48px;height:28px;border-radius:99px;border:1px solid #9a968a;background:#e1ded3;position:relative;cursor:pointer;flex-shrink:0;padding:0}
.gs-sw span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:left .15s}.gs-sw.on{background:var(--ink);border-color:var(--ink)}.gs-sw.on span{left:23px}
.gs-tl{background:#f6f5f0;border-radius:10px;padding:14px 16px}.gs-tlhead{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:26px}.gs-tlnote{font:600 13px 'DM Mono',monospace}.gs-tlnote.green{color:var(--ok)}.gs-tlnote.amber{color:var(--warn)}.gs-tlnote.blue{color:#185fa5}
.gs-bar{position:relative;height:10px;background:#dedbd0;border-radius:6px;margin:0 6px 14px}.gs-bar .seg{position:absolute;top:0;bottom:0;display:block}.gs-bar .seg.green{background:#1d9e75}.gs-bar .seg.amber{background:#e8b04a}
.gs-bar .tick{position:absolute;top:-3px;width:3px;height:16px;background:var(--ink);transform:translateX(-1px)}
.gs-bar .today{position:absolute;top:-10px;width:0;height:30px;border-left:2px dashed #2a6df4;text-decoration:none}.gs-bar .today em{position:absolute;top:-14px;left:-18px;font:600 11px 'DM Mono',monospace;color:#2a6df4;font-style:normal}
.gs-tlfoot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font:12.5px 'DM Mono',monospace;color:var(--mut)}.gs-tlfoot strong{color:var(--ink)}
.gs-steps{list-style:none;display:flex;gap:6px;flex-wrap:wrap;padding:0;margin:0 0 6px}
.gs-step{font:500 13px 'DM Mono',monospace;border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px 6px 8px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--mut)}
.gs-step .n{width:22px;height:22px;border-radius:50%;background:#e7e4da;display:inline-flex;align-items:center;justify-content:center;font-size:11px}.gs-step.done .n{background:#1d9e75;color:#fff}.gs-step.now{border-color:var(--ink);color:var(--ink);background:#f4f2ea}.gs-step.now .n{background:var(--ink);color:var(--gold)}
.gs-panel{border:1px solid var(--line);background:#faf9f5;border-radius:10px;padding:12px 16px;margin-top:10px}.gs-panel h4{margin:0 0 8px;font-size:15px}
.gs-checks{list-style:none;margin:0;padding:0}.gs-checks li{font:13px/1.4 'DM Mono',monospace;padding:5px 0 5px 24px;position:relative}
.gs-checks li:before{position:absolute;left:0;top:5px;font-weight:700}.gs-checks .ok:before{content:"✓";color:var(--ok)}.gs-checks .warn:before{content:"!";color:#b7791f}.gs-checks .block:before,.gs-checks .bad:before{content:"✕";color:var(--bad)}.gs-checks .info:before{content:"i";color:#185fa5}
.gs-checks .block,.gs-checks .bad{color:var(--bad)}
.gs-link{font:600 12px 'DM Mono',monospace;background:none;border:0;color:#185fa5;text-decoration:underline;cursor:pointer;margin-left:8px}
.gs-btnrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.gs-div{padding:16px 22px;border-bottom:1px solid #efede4}.gs-div.off{background:#fbfaf6}.gs-divhead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.gs-divname{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gs-divname code{font:11px 'DM Mono',monospace;background:#efede4;border-radius:4px;padding:2px 6px;color:var(--mut)}
.gs-cap{margin-top:12px}.gs-meter{position:relative;height:10px;border-radius:6px;background:#e5e2d8;overflow:visible}.gs-meter i{display:block;height:100%;background:#1d9e75;border-radius:6px}.gs-meter i.over{background:var(--bad)}.gs-meter b{position:absolute;top:-3px;width:2px;height:16px;background:var(--ink)}
.gs-try{margin-top:14px;padding:12px 16px;background:#f6f5f0;border-radius:10px}.gs-result{font:13.5px/1.5 'DM Mono',monospace;margin:8px 0 0}
.gs-range{display:flex;gap:12px;align-items:center}.gs-range input[type=range]{flex:1;accent-color:var(--ink)}
.gs-table{width:100%;border-collapse:collapse;font:13px 'DM Mono',monospace}.gs-table th,.gs-table td{padding:9px 12px;border-bottom:1px solid #efede4;text-align:left}.gs-table thead th{background:#faf9f5;color:#44443f;font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
.gs-table td.yes{color:var(--ok);font-weight:700;text-align:center}.gs-table td.no{color:#8a8678;text-align:center}.gs-tablewrap{overflow-x:auto}
.gs-hist{list-style:none;padding:0;margin:0}.gs-hist>li{padding:10px 0;border-bottom:1px solid #f1efe7;font:13px 'DM Mono',monospace}.gs-hist summary{cursor:pointer;margin-bottom:6px}
.gs-chg{list-style:none;margin:6px 0 8px;padding:0 0 0 12px;font:12.5px/1.6 'DM Mono',monospace;color:#33332f}.gs-chg span:first-child{font-weight:600;margin-right:6px}del{color:var(--bad);background:#fdeeee;text-decoration:line-through;padding:0 3px}ins{color:#0b5a46;background:#e6f6ef;text-decoration:none;padding:0 3px}
.gs-chg.big{padding:0;margin:0 0 12px;max-height:46vh;overflow:auto}.gs-chg.big li{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #efede4}
.gs-confirm{display:inline-flex;gap:8px;align-items:center;margin-left:8px;flex-wrap:wrap}
.gs-bottom{position:sticky;bottom:12px;margin-top:14px;background:var(--ink);color:#fff;border-radius:10px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font:13px 'DM Mono',monospace;box-shadow:0 6px 24px rgba(0,0,0,.25)}.gs-bottom .gs-btn{margin-left:8px}
.gs-modal{position:fixed;inset:0;background:rgba(20,20,40,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px}.gs-dlg{background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:22px 24px}.gs-dlg h2{margin:0 0 12px;font-size:22px}
.gs-ack{display:flex;gap:8px;align-items:center;font:13px 'DM Mono',monospace;margin:10px 0}
.gs-fail{background:#fff;border:1px solid #f0b4b4;border-radius:12px;padding:22px;max-width:560px}.gs-fail h2{margin:0 0 8px;color:var(--bad)}.gs-load{font:14px 'DM Mono',monospace;color:var(--mut)}
@media (max-width:640px){.gs-root{padding:16px 12px 90px}.gs-title{font-size:24px}}
@media print{.gs-actions,.gs-tabs,.gs-bottom{display:none}}
`
  });
}