"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = CaptainSync;
var _react = require("react");
var I = _interopRequireWildcard(require("../lib/importEngine"));
var C = _interopRequireWildcard(require("../lib/captainEngine"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const API = window.grshConfig && window.grshConfig.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig && window.grshConfig.nonce || "";
const ICONS = {
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 11v5m0-8.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  download: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  cal: "M7 3v4m10-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 1 8 6 8-6",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  userplus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  dollar: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chev: "M6 9l6 6 6-6"
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
const saveBlob = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], {
    type: "text/csv;charset=utf-8"
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
const post = (path, body) => call(path, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});
const adminUrl = page => "admin.php?page=" + page;
const dateOnly = s => s ? I.fmtStamp(s).replace(/\s*·?\s*\d{1,2}:\d{2}.*$/, "") : "";
function Modal({
  title,
  onClose,
  children,
  side
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
      const f = [...el.querySelectorAll("button,input,select,textarea,[href]")].filter(n => !n.disabled);
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
    className: "gc-scrim" + (side ? " side" : ""),
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-modal" + (side ? " drawer" : ""),
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "gc-modal-t",
      ref: ref,
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-modal-h",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
          id: "gc-modal-t",
          className: "gc-h2",
          children: title
        }), side ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-x",
          "aria-label": "Close",
          onClick: onClose,
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "x"
          })
        }) : null]
      }), children]
    })
  });
}
const Pill = ({
  tone,
  children
}) => /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
  className: "gc-pill " + (tone || "mute"),
  children: children
});
function DivFix({
  teamId,
  divisions,
  value,
  onChange,
  onSave
}) {
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
    className: "gc-inline",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
      className: "gc-sr",
      htmlFor: "gc-div-" + teamId,
      children: "Division"
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
      id: "gc-div-" + teamId,
      className: "gc-select",
      value: value || "",
      onChange: e => onChange(teamId, e.target.value),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
        value: "",
        children: "Choose division\u2026"
      }), (divisions || []).map(d => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
        value: d.key,
        children: [d.label, d.active ? "" : " (not enabled)"]
      }, d.key))]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
      type: "button",
      className: "gc-btn",
      disabled: !value,
      onClick: () => onSave(teamId),
      children: "Save"
    })]
  });
}
function Funnel({
  teams,
  active,
  onPick
}) {
  const steps = (0, _react.useMemo)(() => C.funnelSteps(teams), [teams]);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
    className: "gc-card",
    "aria-labelledby": "gc-fun-t",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-card-h",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
        id: "gc-fun-t",
        className: "gc-h2",
        children: "Captain pipeline"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gc-sub",
        children: "How many teams have reached each step. Click one to filter the Teams tab."
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-fun",
      children: steps.map((s, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-fun-step" + (active === s.key ? " on" : ""),
        "aria-pressed": active === s.key,
        onClick: () => onPick(active === s.key ? "" : s.key),
        title: s.help,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          className: "gc-fun-n",
          children: [s.n, /*#__PURE__*/(0, _jsxRuntime.jsxs)("small", {
            children: [" of ", s.total]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-fun-l",
          children: s.label
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-fun-bar",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
            style: {
              width: s.pct + "%"
            }
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-fun-p",
          children: s.showPct ? s.pct + "%" : i === 0 ? "all teams" : s.n === s.total ? "all" : s.n === 0 ? "none yet" : ""
        })]
      }, s.key))
    })]
  });
}
function CaptainPicker({
  team,
  onDone,
  onClose,
  toast
}) {
  const [q, setQ] = (0, _react.useState)("");
  const [rows, setRows] = (0, _react.useState)([]);
  const [pick, setPick] = (0, _react.useState)(0);
  const [busy, setBusy] = (0, _react.useState)(false);
  const [searched, setSearched] = (0, _react.useState)(false);
  const rid = (0, _react.useRef)(0);
  (0, _react.useEffect)(() => {
    if (q.trim().length < 2) {
      setRows([]);
      setSearched(false);
      return undefined;
    }
    const id = ++rid.current;
    const t = window.setTimeout(async () => {
      const r = await call("/captain-sync/players?q=" + encodeURIComponent(q.trim()));
      if (id !== rid.current) return;
      setRows(r.ok ? r.j.players || [] : []);
      setSearched(true);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const save = async () => {
    if (!pick || busy) return;
    setBusy(true);
    const r = await post("/captain-sync/team-captain", {
      team_id: team.id,
      player_id: pick
    });
    setBusy(false);
    toast(r.j.message || (r.ok ? "Saved." : "Could not save."), r.ok && r.j.success ? "" : "bad");
    if (r.ok && r.j.success) onDone();
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: team.captain ? `Change captain of ${team.name}` : `Add a captain to ${team.name}`,
    onClose: onClose,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
      className: "gc-lbl",
      htmlFor: "gc-pq",
      children: "Find a player by name or email"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
      id: "gc-pq",
      "data-autofocus": true,
      className: "gc-input",
      type: "search",
      value: q,
      onChange: e => setQ(e.target.value),
      placeholder: "Type at least two letters",
      autoComplete: "off"
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-pl",
      role: "radiogroup",
      "aria-label": "Players found",
      "aria-live": "polite",
      children: [rows.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        className: "gc-opt" + (pick === p.id ? " on" : ""),
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "radio",
          name: "gc-pp",
          checked: pick === p.id,
          onChange: () => setPick(p.id)
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: p.name
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sub",
            children: p.email
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
          tone: p.account === "active" ? "ok" : p.account === "pending" ? "warn" : "mute",
          children: p.account === "active" ? "Has login" : p.account === "pending" ? "Invite pending" : "No login"
        })]
      }, p.id)), searched && !rows.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        className: "gc-sub",
        children: "No player matches. A new captain starts with an invite."
      }) : null]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-sub",
      children: ["Not on the list? ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
        className: "gc-a",
        href: adminUrl("grsh-tm-invite-captain"),
        children: ["Invite a new captain ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "ext",
          s: 12
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn gold",
        disabled: !pick || busy,
        onClick: save,
        children: busy ? "Saving…" : "Make captain"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: onClose,
        children: "Cancel"
      })]
    })]
  });
}
function NudgeDialog({
  teams,
  onClose,
  onDone,
  toast
}) {
  const ids = (0, _react.useMemo)(() => teams.slice(0, 25).map(t => t.id), [teams]);
  const [prev, setPrev] = (0, _react.useState)(null);
  const [busy, setBusy] = (0, _react.useState)(false);
  const [open, setOpen] = (0, _react.useState)(false);
  (0, _react.useEffect)(() => {
    let live = true;
    (async () => {
      const r = await post("/captain-sync/nudge", {
        team_ids: ids,
        dry_run: true
      });
      if (live) setPrev(r.ok && r.j.success ? r.j : {
        error: r.j.message || "Could not build the preview."
      });
    })();
    return () => {
      live = false;
    };
  }, [ids]);
  const ready = prev && prev.results ? prev.results.filter(x => x.status === "ready") : [];
  const skipped = prev && prev.results ? prev.results.filter(x => x.status !== "ready") : [];
  const send = async () => {
    if (busy) return;
    setBusy(true);
    const r = await post("/captain-sync/nudge", {
      team_ids: ready.map(x => x.team_id),
      confirm: true
    });
    setBusy(false);
    toast(r.ok && r.j.success ? `Sent ${I.plural(r.j.sent, "reminder")}.` : r.j.message || "Could not send.", r.ok && r.j.success ? "" : "bad");
    if (r.ok) onDone();
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "Remind captains",
    onClose: onClose,
    children: [!prev ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-sub",
      role: "status",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gc-spin"
      }), " Building the preview\u2026"]
    }) : prev.error ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-alert bad",
      role: "alert",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " ", prev.error]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: I.plural(ready.length, "captain")
        }), " will get a short reminder with a login link. Nothing is sent until you press the button.", teams.length > 25 ? ` Showing the first 25 of ${teams.length}.` : ""]
      }), ready.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-mails",
        children: ready.map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: x.name
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-sub",
            children: ["to ", x.to]
          })]
        }, x.team_id))
      }) : null, ready.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-link",
        "aria-expanded": open,
        onClick: () => setOpen(!open),
        children: [open ? "Hide" : "Show", " the first email"]
      }) : null, open && ready.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("pre", {
        className: "gc-pre",
        "aria-label": "Email preview",
        children: "Subject: " + ready[0].subject + "\n\n" + ready[0].body
      }) : null, skipped.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
        className: "gc-det",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("summary", {
          children: [I.plural(skipped.length, "team"), " skipped"]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
          className: "gc-res",
          children: skipped.map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
              children: x.name || "#" + x.team_id
            }), ": ", x.message]
          }, x.team_id))
        })]
      }) : null]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn gold",
        "data-autofocus": true,
        disabled: !ready.length || busy,
        onClick: send,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "bell",
          s: 16
        }), " ", busy ? "Sending…" : `Send ${I.plural(ready.length, "reminder")}`]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: onClose,
        children: "Cancel"
      })]
    })]
  });
}
function RemoveDialog({
  team,
  onClose,
  onDone,
  toast
}) {
  const [imp, setImp] = (0, _react.useState)(null);
  const [typed, setTyped] = (0, _react.useState)("");
  const [reason, setReason] = (0, _react.useState)("");
  const [ack, setAck] = (0, _react.useState)(false);
  const [busy, setBusy] = (0, _react.useState)(false);
  (0, _react.useEffect)(() => {
    let live = true;
    (async () => {
      const r = await post("/captain-sync/remove-team", {
        team_id: team.id,
        dry_run: true
      });
      if (live) setImp(r.ok && r.j.success ? r.j.impact : {
        error: r.j.message || "Could not check this team."
      });
    })();
    return () => {
      live = false;
    };
  }, [team.id]);
  const L = C.removalLines(imp && !imp.error ? imp : null);
  const ok = imp && !imp.error && C.removalReady(imp, team.name, typed, reason, ack);
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const r = await post("/captain-sync/remove-team", {
      team_id: team.id,
      reason,
      confirm_name: typed,
      acknowledge: ack
    });
    setBusy(false);
    toast(r.j.message || (r.ok ? "Removed." : "Could not remove."), r.ok && r.j.success ? "" : "bad");
    if (r.ok && r.j.success) onDone();
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: `Remove ${team.name}?`,
    onClose: onClose,
    children: [!imp ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-sub",
      role: "status",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gc-spin"
      }), " Checking what is attached\u2026"]
    }) : imp.error ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-alert bad",
      role: "alert",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " ", imp.error]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        className: "gc-h3",
        children: "This will remove"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-res",
        children: L.removes.map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
          children: x
        }, x))
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        className: "gc-h3",
        children: "This will keep"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-res",
        children: L.keeps.map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
          children: x
        }, x))
      }), L.blocked.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        className: "gc-alert bad",
        role: "alert",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "alert",
          s: 16
        }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          children: ["Cannot remove: ", L.blocked.join(" and "), "."]
        })]
      }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gc-sub",
          children: "The History tab keeps a full copy, including roster rows and the payment, so an admin can restore it."
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
          className: "gc-lbl",
          htmlFor: "gc-rm-why",
          children: "Reason (goes in the history)"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          id: "gc-rm-why",
          "data-autofocus": true,
          className: "gc-input",
          value: reason,
          onChange: e => setReason(e.target.value),
          autoComplete: "off"
        }), imp.needs_ack ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
          className: "gc-check",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
            type: "checkbox",
            checked: ack,
            onChange: e => setAck(e.target.checked)
          }), " I understand this team has players or a payment on it"]
        }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
          className: "gc-lbl",
          htmlFor: "gc-rm-name",
          children: ["Type the team name ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: team.name
          }), " to confirm"]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          id: "gc-rm-name",
          className: "gc-input",
          value: typed,
          onChange: e => setTyped(e.target.value),
          autoComplete: "off",
          spellCheck: "false"
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn danger",
        disabled: !ok || busy,
        onClick: go,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "trash",
          s: 16
        }), " ", busy ? "Removing…" : "Remove team"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: onClose,
        children: "Cancel"
      })]
    })]
  });
}
function ReasonDialog({
  title,
  body,
  confirm,
  path,
  extra,
  onClose,
  onDone,
  toast,
  option
}) {
  const [reason, setReason] = (0, _react.useState)("");
  const [opt, setOpt] = (0, _react.useState)(false);
  const [busy, setBusy] = (0, _react.useState)(false);
  const go = async () => {
    if (reason.trim().length < 3 || busy) return;
    setBusy(true);
    const r = await post(path, {
      ...extra,
      reason,
      ...(option ? {
        [option.key]: opt
      } : {})
    });
    setBusy(false);
    toast(r.j.message || (r.ok ? "Done." : "Could not do that."), r.ok && r.j.success ? "" : "bad");
    if (r.ok && r.j.success) onDone();
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: title,
    onClose: onClose,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      children: body
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
      className: "gc-lbl",
      htmlFor: "gc-why",
      children: "Reason (goes in the history)"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
      id: "gc-why",
      "data-autofocus": true,
      className: "gc-input",
      value: reason,
      onChange: e => setReason(e.target.value),
      autoComplete: "off"
    }), option ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      className: "gc-check",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        type: "checkbox",
        checked: opt,
        onChange: e => setOpt(e.target.checked)
      }), " ", option.label]
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn danger",
        disabled: reason.trim().length < 3 || busy,
        onClick: go,
        children: busy ? "Working…" : confirm
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: onClose,
        children: "Cancel"
      })]
    })]
  });
}
function DigestDialog({
  onClose,
  toast
}) {
  const [d, setD] = (0, _react.useState)(null);
  const [busy, setBusy] = (0, _react.useState)(false);
  (0, _react.useEffect)(() => {
    let live = true;
    (async () => {
      const r = await post("/captain-sync/digest", {});
      if (live) setD(r.ok && r.j.success ? r.j : {
        error: r.j.message || "Could not build the summary."
      });
    })();
    return () => {
      live = false;
    };
  }, []);
  const send = async () => {
    setBusy(true);
    const r = await post("/captain-sync/digest", {
      send: true
    });
    setBusy(false);
    toast(r.j.message || (r.ok ? "Sent." : "Could not send."), r.ok && r.j.success ? "" : "bad");
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: "What needs you",
    onClose: onClose,
    children: [!d ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-sub",
      role: "status",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
        className: "gc-spin"
      }), " Building the summary\u2026"]
    }) : d.error ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-alert bad",
      role: "alert",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " ", d.error]
    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("pre", {
      className: "gc-pre gc-digest",
      "aria-label": "Summary",
      children: d.text
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gc-sub",
      children: "Email goes only to the address on your own WordPress account."
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn gold",
        "data-autofocus": true,
        disabled: !d || !!d.error || busy,
        onClick: send,
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "mail",
          s: 16
        }), " ", busy ? "Sending…" : "Email me this"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: () => window.print(),
        children: "Print"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: onClose,
        children: "Close"
      })]
    })]
  });
}
function TeamTools({
  t,
  ov,
  actions
}) {
  const [det, setDet] = (0, _react.useState)(null);
  const n0 = t.note || {};
  const [note, setNote] = (0, _react.useState)(n0.note || "");
  const [tag, setTag] = (0, _react.useState)(n0.tag || "");
  const [fu, setFu] = (0, _react.useState)(n0.follow_up || "");
  const [saving, setSaving] = (0, _react.useState)(false);
  (0, _react.useEffect)(() => {
    let live = true;
    setDet(null);
    (async () => {
      const r = await call("/captain-sync/team-detail?team_id=" + t.id);
      if (live) setDet(r.ok && r.j.success ? r.j : {
        error: r.j.message || "Could not load details."
      });
    })();
    return () => {
      live = false;
    };
  }, [t.id]);
  const save = async () => {
    setSaving(true);
    const r = await post("/captain-sync/note", {
      team_id: t.id,
      note,
      tag,
      follow_up: fu
    });
    setSaving(false);
    actions.toast(r.j.message || (r.ok ? "Saved." : "Could not save."), r.ok && r.j.success ? "" : "bad");
    if (r.ok) actions.reload();
  };
  const rd = C.readiness(t);
  const idle = C.idleFlag(t);
  const fee = C.teamFeeLine(t, ov.money);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-badges",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
        tone: rd.tone,
        children: rd.label
      }), idle ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
        tone: idle.tone,
        children: idle.label
      }) : null, t.note && t.note.tag ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
        tone: "info",
        children: C.noteTagLabel(t.note.tag)
      }) : null]
    }), rd.why ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gc-sub",
      children: rd.why
    }) : null, fee ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-note",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "clock",
        s: 14
      }), " ", fee]
    }) : null, det && !det.error && det.ledger.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        className: "gc-h3",
        children: "Money for this team"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-res",
        children: det.ledger.map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
          children: [x.label, ": ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: C.money(x.amount)
          }), x.date ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-sub",
            children: [" ", dateOnly(x.date.length === 10 ? x.date + " 00:00:00" : x.date)]
          }) : null, x.state === "due" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sub",
            children: " still due"
          }) : null]
        }, i))
      })]
    }) : null, det && !det.error && det.players.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h3", {
        className: "gc-h3",
        children: ["Roster (", det.players.length, ")"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        className: "gc-sub",
        children: det.players.join(", ")
      })]
    }) : null, det && !det.error && det.timeline.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        className: "gc-h3",
        children: "Everything that happened"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-res",
        children: det.timeline.slice(0, 10).map((x, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
          children: [x.notes || C.historyTitle(x.action), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-sub",
            children: [I.fmtStamp(x.at), " \xB7 ", x.by]
          })]
        }, i))
      })]
    }) : null, det && det.error ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
      className: "gc-sub",
      children: det.error
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
      className: "gc-h3",
      children: "Your note"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
      className: "gc-sr",
      htmlFor: "gc-note",
      children: "Note"
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("textarea", {
      id: "gc-note",
      className: "gc-input",
      rows: 2,
      maxLength: 500,
      value: note,
      onChange: e => setNote(e.target.value),
      placeholder: "Phoned Sam, paying by check next week"
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-bar-f",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        className: "gc-sr",
        htmlFor: "gc-tag",
        children: "Tag"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
        id: "gc-tag",
        className: "gc-select",
        value: tag,
        onChange: e => setTag(e.target.value),
        children: C.NOTE_TAGS.map(x => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
          value: x.key,
          children: x.label
        }, x.key))
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
        className: "gc-sr",
        htmlFor: "gc-fu",
        children: "Follow up on"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        id: "gc-fu",
        className: "gc-input gc-date",
        type: "date",
        value: fu,
        onChange: e => setFu(e.target.value)
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        disabled: saving,
        onClick: save,
        children: saving ? "Saving…" : "Save note"
      })]
    })]
  });
}
function TeamDrawer({
  team,
  ov,
  onClose,
  actions
}) {
  const t = team;
  const min = t.min_players;
  const steps = [{
    k: "c",
    label: "Team created",
    on: true,
    when: t.created_at ? dateOnly(t.created_at) : ""
  }, {
    k: "l",
    label: "Captain logged in",
    on: C.stageIndex(t.stage) >= 1,
    when: t.account === "pending" ? "invite pending" : t.account === "none" ? "no login yet" : ""
  }, {
    k: "r",
    label: `Roster started (${t.roster_size} of ${min})`,
    on: C.stageIndex(t.stage) >= 2,
    when: ""
  }, {
    k: "d",
    label: "Deposit paid",
    on: C.stageIndex(t.stage) >= 3,
    when: t.deposit_paid_at ? dateOnly(t.deposit_paid_at) + (t.fee_tier ? " · " + t.fee_tier + " fee" : "") : ""
  }, {
    k: "p",
    label: "Paid in full",
    on: t.stage === "paid",
    when: ""
  }];
  const hist = (ov.history || []).filter(h => h.team_id === t.id).slice(0, 5);
  const sd = C.stuckDays(t);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
    title: t.name,
    onClose: onClose,
    side: true,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-sub",
      children: [t.division_ok ? t.division_label || t.division : "No valid division", " \xB7 ", t.captain ? t.captain.name : "no captain"]
    }), t.looks_test ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
      className: "gc-alert warn",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
        n: "alert",
        s: 16
      }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
        children: ["Looks like test data: ", C.testReasons(t).join(" and "), "."]
      })]
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("ol", {
      className: "gc-tl",
      children: steps.map(s => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
        className: s.on ? "on" : "",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-tl-dot",
          "aria-hidden": "true",
          children: s.on ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "check",
            s: 12
          }) : null
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: s.label
          }), s.when ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-sub",
            children: [" ", s.when]
          }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sr",
            children: s.on ? " (done)" : " (not yet)"
          })]
        })]
      }, s.k))
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("dl", {
      className: "gc-dl",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("dt", {
        children: "Captain"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dd", {
        children: t.captain ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
          children: [t.captain.name, /*#__PURE__*/(0, _jsxRuntime.jsx)("br", {}), /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
            className: "gc-a",
            href: "mailto:" + t.captain.email,
            children: t.captain.email
          })]
        }) : "None"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dt", {
        children: "Waiting"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dd", {
        children: sd ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
          tone: C.stuckTone(sd),
          children: [C.ageLabel(sd), " before the deposit"]
        }) : t.age_days !== null && t.age_days !== undefined ? "Created " + C.ageLabel(t.age_days) + " ago" : "—"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dt", {
        children: "Last reminder"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dd", {
        children: t.last_nudged_at ? I.fmtStamp(t.last_nudged_at) : "Never"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dt", {
        children: "Money"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("dd", {
        children: t.deposit_paid_at ? `${C.statusLabel(t.payment_status)} · balance ${C.money(t.balance_due)}` : "No deposit yet"
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(TeamTools, {
      t: t,
      ov: ov,
      actions: actions
    }), hist.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
        className: "gc-h3",
        children: "Recent changes"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-res",
        children: hist.map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
          children: [C.historyTitle(h.action), ": ", h.notes, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sub",
            children: I.fmtStamp(h.at)
          })]
        }, h.id))
      })]
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-actions",
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn",
        onClick: () => actions.captain(t),
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "userplus",
          s: 16
        }), " ", t.captain ? "Change captain" : "Add a captain"]
      }), t.captain && t.account === "none" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
        className: "gc-btn ghost",
        href: adminUrl("grsh-tm-invite-captain"),
        children: ["Send an invite ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "ext",
          s: 14
        })]
      }) : null]
    }), t.captain && t.account === "pending" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-actions",
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: () => actions.revoke(t),
        children: "Revoke invite link"
      })
    }) : null, t.captain ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-actions",
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: () => actions.detach(t),
        children: "Detach captain"
      })
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-danger-zone",
      children: [t.delete && t.delete.allowed ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        className: "gc-sub",
        children: "Nothing real is attached to this team."
      }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        className: "gc-sub gc-lock",
        children: C.protectedHelp(t)
      }), t.delete && t.delete.allowed ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn ghost",
        onClick: () => actions.clean(t),
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "trash",
          s: 16
        }), " Select for clean-up"]
      }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
        type: "button",
        className: "gc-btn ghost",
        disabled: !ov.can_write,
        onClick: () => actions.remove(t),
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "trash",
          s: 16
        }), " Remove team\u2026"]
      })]
    })]
  });
}
function CaptainSync() {
  const [ov, setOv] = (0, _react.useState)(null);
  const [err, setErr] = (0, _react.useState)("");
  const [loading, setLoading] = (0, _react.useState)(true);
  const [tab, setTab] = (0, _react.useState)("deposits");
  const [toasts, setToasts] = (0, _react.useState)([]);
  const [modal, setModal] = (0, _react.useState)(null);
  const [sel, setSel] = (0, _react.useState)([]);
  const [email, setEmail] = (0, _react.useState)(false);
  const [prog, setProg] = (0, _react.useState)(null);
  const [report, setReport] = (0, _react.useState)(null);
  const [q, setQ] = (0, _react.useState)("");
  const [stage, setStage] = (0, _react.useState)("");
  const [onlyProblems, setOnlyProblems] = (0, _react.useState)(false);
  const [stuck, setStuck] = (0, _react.useState)(0);
  const [noCap, setNoCap] = (0, _react.useState)(false);
  const [divPick, setDivPick] = (0, _react.useState)({});
  const [entryFilter, setEntryFilter] = (0, _react.useState)("all");
  const [healthOpen, setHealthOpen] = (0, _react.useState)(false);
  const [cleanSel, setCleanSel] = (0, _react.useState)([]);
  const [cleanReport, setCleanReport] = (0, _react.useState)(null);
  const [delText, setDelText] = (0, _react.useState)("");
  const busy = (0, _react.useRef)(false);
  const reqId = (0, _react.useRef)(0);
  const toast = (0, _react.useCallback)((msg, tone) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, {
      id,
      msg,
      tone
    }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);
  const load = (0, _react.useCallback)(async quiet => {
    const id = ++reqId.current;
    if (!quiet) setLoading(true);
    const r = await call("/captain-sync/overview");
    if (id !== reqId.current) return;
    setLoading(false);
    if (!r.ok) {
      setErr(r.j.message || "Could not load Captain Sync. Nothing was changed.");
      return;
    }
    setErr("");
    setOv(r.j);
    setSel(s => s.filter(x => (r.j.entries || []).some(e => e.entry_id === x && e.state === "needs_recording")));
    setCleanSel(s => s.filter(x => (r.j.teams || []).some(t => t.id === x && t.delete && t.delete.allowed)));
  }, []);
  (0, _react.useEffect)(() => {
    load(false);
  }, [load]);
  const pendingEntries = (0, _react.useMemo)(() => ov ? ov.entries.filter(e => e.state === "needs_recording") : [], [ov]);
  const issues = (0, _react.useMemo)(() => ov ? C.groupIssues(ov.issues) : [], [ov]);
  const counts = (0, _react.useMemo)(() => C.issueCounts(issues), [issues]);
  const v = C.verdict(ov);
  const actionsList = (0, _react.useMemo)(() => C.actionQueue(ov), [ov]);
  const groups = (0, _react.useMemo)(() => C.cleanupGroups(ov ? ov.teams : []), [ov]);
  const hs = (0, _react.useMemo)(() => C.healthSummary(ov ? ov.health : []), [ov]);
  const teams = (0, _react.useMemo)(() => {
    if (!ov) return [];
    const base = C.filterTeams(ov.teams, {
      q,
      stage,
      problemsOnly: onlyProblems,
      problemTeamIds: C.problemTeamIds(issues)
    });
    return C.filterTeamsMore(base, {
      stuck,
      noCaptain: noCap
    });
  }, [ov, q, stage, onlyProblems, issues, stuck, noCap]);
  const nudgeList = (0, _react.useMemo)(() => ov ? C.nudgeCandidates(teams, ov.cooldown_days || 3) : [], [ov, teams]);
  const shownEntries = (0, _react.useMemo)(() => ov ? ov.entries.filter(e => entryFilter === "all" || (entryFilter === "open" ? e.state === "needs_recording" : e.state === entryFilter)) : [], [ov, entryFilter]);
  const canWrite = !!(ov && ov.can_write);
  const summary = (0, _react.useMemo)(() => ov ? C.recordSummary(ov.entries, sel, email) : null, [ov, sel, email]);
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleClean = id => setCleanSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const go = g => {
    if (!g) return;
    setTab(g.tab);
    if (g.filter === "nocaptain") setNoCap(true);
    if (g.action === "nudge") {
      setModal({
        t: "nudge",
        ids: C.nudgeCandidates(ov.teams, ov.cooldown_days || 3).filter(t => !g.minStuck || C.stuckDays(t) >= g.minStuck).map(t => t.id)
      });
    }
  };
  const runRecord = async ids => {
    if (busy.current) return;
    busy.current = true;
    setModal(null);
    setReport(null);
    const batches = C.chunk(ids, 5);
    const all = [];
    let failed = "";
    setProg({
      done: 0,
      total: ids.length
    });
    for (const b of batches) {
      const r = await post("/captain-sync/record", {
        entry_ids: b,
        confirm: true,
        send_email: email
      });
      if (!r.ok || !r.j.success) {
        failed = r.j.message || "A batch failed.";
        break;
      }
      all.push(...r.j.results);
      setProg({
        done: all.length,
        total: ids.length
      });
    }
    setProg(null);
    busy.current = false;
    const t = C.tallyResults(all);
    setReport({
      results: all,
      tally: t,
      failed,
      email
    });
    toast(failed ? failed : t.recorded ? `Recorded ${I.plural(t.recorded, "deposit")}.` : "Nothing was recorded.", failed ? "bad" : "");
    setSel([]);
    load(true);
  };
  const doUndo = async id => {
    setModal(null);
    const r = await post("/captain-sync/undo", {
      audit_id: id
    });
    toast(r.j.message || (r.ok ? "Undone." : "Could not undo."), r.ok && r.j.success ? "" : "bad");
    load(true);
  };
  const doRestore = async id => {
    setModal(null);
    const r = await post("/captain-sync/restore-team", {
      audit_id: id
    });
    toast(r.j.message || (r.ok ? "Restored." : "Could not restore."), r.ok && r.j.success ? "" : "bad");
    load(true);
  };
  const saveDivision = async teamId => {
    const d = divPick[teamId];
    if (!d) return;
    const r = await post("/captain-sync/team-division", {
      team_id: teamId,
      division: d
    });
    toast(r.j.message || "Could not save.", r.ok && r.j.success ? "" : "bad");
    if (r.ok) load(true);
  };
  const runDelete = async () => {
    if (busy.current || !C.deleteWordOk(delText)) return;
    busy.current = true;
    const ids = cleanSel.slice();
    setModal(null);
    const r = await post("/captain-sync/delete-teams", {
      team_ids: ids,
      confirm: C.DELETE_WORD
    });
    busy.current = false;
    setDelText("");
    if (!r.ok || !r.j.success) {
      toast(r.j.message || "Nothing was deleted.", "bad");
      return;
    }
    setCleanReport(r.j);
    toast(r.j.message, r.j.deleted ? "" : "bad");
    setCleanSel([]);
    load(true);
  };
  const setDiv = (id, val) => setDivPick(p => ({
    ...p,
    [id]: val
  }));
  if (loading && !ov) return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gc",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-wrap",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        className: "gc-sub",
        role: "status",
        style: {
          padding: 40
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-spin"
        }), " Loading captains and deposits\u2026"]
      })
    })]
  });
  if (err && !ov) return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gc",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-wrap",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-card",
        role: "alert",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
          className: "gc-h2",
          children: "Captain Sync did not load"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          children: err
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gc-sub",
          children: "Nothing was changed. This page only reads until you record something."
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn",
          onClick: () => load(false),
          children: "Try again"
        })]
      })
    })]
  });
  const m = ov.money;
  const tabs = [["deposits", "Deposits", ov.pending || 0], ["teams", "Teams", ov.teams.length], ["cleanup", "Clean-up", groups.suspect.length], ["problems", "Problems", counts.bad + counts.warn], ["history", "History", 0]];
  const sel2 = C.deleteSummary(ov.teams, cleanSel);
  const teamActions = {
    toast,
    reload: () => load(true),
    remove: t => setModal({
      t: "remove",
      id: t.id
    }),
    revoke: t => setModal({
      t: "revoke",
      id: t.id
    }),
    detach: t => setModal({
      t: "detach",
      id: t.id
    }),
    captain: t => setModal({
      t: "captain",
      id: t.id
    }),
    clean: t => {
      setCleanSel([t.id]);
      setModal(null);
      setTab("cleanup");
    }
  };
  const openTeam = ov.teams.find(t => modal && modal.id === t.id);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    className: "gc",
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: CSS
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("header", {
      className: "gc-hero",
      children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-hero-in",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gc-kicker",
            children: "Gold Rush Senior Hockey"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
            className: "gc-h1",
            children: "Captain Sync"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gc-lead",
            children: "Every captain team, how far each has got, and any deposit that was paid on the form but never reached its team."
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-last",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "cal",
              s: 15
            }), " Season ", ov.season.year || "not set", ov.season.exists ? "" : " (missing)", " \xB7 checked ", I.fmtStamp(ov.generated_at)]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-hero-btns",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn onnavy",
            onClick: () => load(true),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "refresh",
              s: 16
            }), " Refresh"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn onnavy",
            onClick: () => setModal({
              t: "digest"
            }),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "mail",
              s: 16
            }), " What needs me"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn onnavy",
            onClick: () => saveBlob("captain-teams.csv", C.teamsCSV(ov)),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "download",
              s: 16
            }), " Export teams"]
          })]
        })]
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "gc-wrap",
      children: [err ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        className: "gc-alert bad",
        role: "alert",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "alert",
          s: 16
        }), " ", err]
      }) : null, v ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-verdict " + v.tone,
        role: "status",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          className: "gc-vic",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: v.tone === "ok" ? "check" : v.tone === "info" ? "info" : "alert"
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-grow",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            className: "gc-h3",
            children: v.headline
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: v.detail
          })]
        }), v.cta ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          className: "gc-btn",
          onClick: () => setTab(v.cta.tab),
          children: [v.cta.label, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "arrow",
            s: 16
          })]
        }) : null]
      }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-health",
        "aria-label": "Wiring checks",
        children: [hs.failed.map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          className: "gc-chip2 bad",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "alert",
            s: 14
          }), h.text]
        }, h.key)), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          className: "gc-chip2 " + (hs.allOk ? "ok" : "mute"),
          "aria-expanded": healthOpen,
          onClick: () => setHealthOpen(!healthOpen),
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: hs.allOk ? "check" : "info",
            s: 14
          }), C.healthLabel(hs, v), /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "chev",
            s: 12
          })]
        }), healthOpen ? ov.health.filter(h => h.ok).map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
          className: "gc-chip2 ok",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "check",
            s: 14
          }), h.text]
        }, h.key)) : null]
      }), actionsList.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
        className: "gc-card gc-next",
        "aria-labelledby": "gc-next-t",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-card-h",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            id: "gc-next-t",
            className: "gc-h2",
            children: "Do this next"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sub",
            children: "Most urgent first."
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ol", {
          className: "gc-acts",
          children: actionsList.map((a, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
            className: "gc-act " + a.tone,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gc-act-n",
              "aria-hidden": "true",
              children: i + 1
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              className: "gc-grow",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: a.title
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-sub",
                children: a.detail
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gc-btn ghost",
              onClick: () => go(a.go),
              children: [a.cta, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: "arrow",
                s: 14
              })]
            })]
          }, a.key))
        })]
      }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)(Funnel, {
        teams: ov.teams,
        active: stage,
        onPick: s => {
          setStage(s);
          setTab("teams");
        }
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-two",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
          className: "gc-card",
          "aria-labelledby": "gc-money-t",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-card-h",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
              id: "gc-money-t",
              className: "gc-h2",
              children: "Money"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gc-sub",
              children: m.balance_due_date ? "Balance due " + dateOnly(m.balance_due_date + " 00:00:00") : ""
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-tiles",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gc-tile",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-tile-n",
                children: C.money(m.collected)
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-tile-l",
                children: "Collected"
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gc-tile",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-tile-n",
                children: C.money(m.outstanding)
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-tile-l",
                children: "Balance owed by teams that paid a deposit"
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gc-tile",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                className: "gc-tile-n",
                children: C.money(m.potential_now)
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gc-tile-l",
                children: ["Expected if ", I.plural(m.waiting, "waiting team"), " paid now at ", C.money(m.fee_now), " each"]
              })]
            })]
          }), C.earlyBirdLine(m) ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gc-note",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "clock",
              s: 14
            }), " ", C.earlyBirdLine(m)]
          }) : null]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
          className: "gc-card",
          "aria-labelledby": "gc-bal-t",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-card-h",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
              id: "gc-bal-t",
              className: "gc-h2",
              children: "Division balance"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gc-sub",
              children: "Teams against the plan in Settings."
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gc-dv",
            children: ov.balance.rows.map(r => {
              const st = C.balanceStatus(r);
              const pct = r.expected ? Math.min(100, Math.round(r.actual / r.expected * 100)) : 0;
              return /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  className: "gc-dv-h",
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: r.label
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    children: [r.actual, r.expected !== null ? " of " + r.expected : ""]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                    tone: st.tone,
                    children: st.label
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gc-dv-bar",
                  role: "img",
                  "aria-label": `${r.label}: ${r.actual} of ${r.expected === null ? "no target" : r.expected} teams`,
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
                    className: st.tone,
                    style: {
                      width: pct + "%"
                    }
                  })
                })]
              }, r.key);
            })
          }), ov.balance.other ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            className: "gc-note",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "alert",
              s: 14
            }), " ", I.plural(ov.balance.other, "team"), " outside these divisions. Fix them in Problems."]
          }) : null]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gc-tabs",
        role: "tablist",
        "aria-label": "Captain Sync sections",
        children: tabs.map(([k, l, n]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          role: "tab",
          id: "gc-tab-" + k,
          "aria-selected": tab === k,
          "aria-controls": "gc-panel-" + k,
          tabIndex: tab === k ? 0 : -1,
          className: "gc-tab",
          onClick: () => setTab(k),
          onKeyDown: e => {
            const ks = tabs.map(x => x[0]);
            const i = ks.indexOf(k);
            if (e.key === "ArrowRight") setTab(ks[(i + 1) % ks.length]);
            if (e.key === "ArrowLeft") setTab(ks[(i + ks.length - 1) % ks.length]);
          },
          children: [l, n ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-badge" + (k !== "teams" ? " hot" : ""),
            children: n
          }) : null]
        }, k))
      }), tab === "deposits" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gc-panel-deposits",
        "aria-labelledby": "gc-tab-deposits",
        className: "gc-card",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gc-note",
          children: ["Reads the live team form (#", ov.forms.live.id, ") and the test form (#", ov.forms.test.id, "). Nothing here writes until you confirm. The fee tier comes from the day the form was submitted, not today."]
        }), prog ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-prog",
          role: "progressbar",
          "aria-valuemin": 0,
          "aria-valuemax": prog.total,
          "aria-valuenow": prog.done,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
            style: {
              width: (prog.total ? prog.done / prog.total * 100 : 0) + "%"
            }
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            children: ["Recording ", prog.done, " of ", prog.total, "\u2026"]
          })]
        }) : null, report ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-verdict " + (report.failed || report.tally.error ? "warn" : "ok"),
          role: "status",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-vic",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: report.failed || report.tally.error ? "alert" : "check"
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
              className: "gc-h3",
              children: report.tally.recorded ? `Recorded ${I.plural(report.tally.recorded, "deposit")}` : "Nothing was recorded"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              children: [report.tally.skipped ? `${report.tally.skipped} skipped. ` : "", report.tally.error ? `${report.tally.error} failed. ` : "", report.failed ? report.failed + " " : "", report.email && report.tally.recorded ? "Confirmation emails were sent. " : "", "You can undo these in History."]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
              className: "gc-res",
              children: report.results.map(r => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: r.status === "recorded" ? "ok" : r.status === "error" ? "bad" : "mute",
                  children: r.status
                }), " #", r.entry_id, r.team ? " · " + r.team : "", ": ", r.message]
              }, r.entry_id))
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gc-link",
              onClick: () => setReport(null),
              children: "Dismiss"
            })]
          })]
        }) : null, /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-bar-f",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            className: "gc-chips",
            role: "group",
            "aria-label": "Filter entries",
            children: [["all", "All"], ["open", "Not recorded"], ["recorded", "Recorded"], ["duplicate", "Duplicates"], ["test", "Test"]].map(([k, l]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gc-chip" + (entryFilter === k ? " on" : ""),
              "aria-pressed": entryFilter === k,
              onClick: () => setEntryFilter(k),
              children: l
            }, k))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-grow"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            onClick: () => saveBlob("captain-deposit-entries.csv", C.entriesCSV(ov)),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "download",
              s: 16
            }), " Export entries"]
          })]
        }), !canWrite ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gc-alert bad",
          role: "alert",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "alert",
            s: 16
          }), " Recording is switched off because the season does not exist."]
        }) : null, shownEntries.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gc-tablewrap",
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
            className: "gc-table",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gc-sr",
                    children: "Select"
                  })
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Entry"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Team and captain"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Status"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: "Recording it would write"
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  scope: "col",
                  children: /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gc-sr",
                    children: "Action"
                  })
                })]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("tbody", {
              children: shownEntries.map(e => {
                const st = C.entryState(e.state);
                const w = e.would;
                return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    children: e.state === "needs_recording" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                      type: "checkbox",
                      "aria-label": `Select entry ${e.entry_id}`,
                      checked: sel.includes(e.entry_id),
                      disabled: !canWrite,
                      onChange: () => toggle(e.entry_id)
                    }) : null
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                      className: "gc-strong",
                      children: ["#", e.entry_id]
                    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                      className: "gc-sm",
                      children: [e.form === "test" ? "test form" : "live form", " \xB7 ", e.date ? I.fmtStamp(e.date) + " GMT" : "no date"]
                    })]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    children: e.team ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        className: "gc-strong",
                        children: e.team
                      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        className: "gc-sm",
                        children: e.captain
                      })]
                    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "gc-dim",
                      children: "\u2014"
                    })
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                      tone: st.tone,
                      children: st.label
                    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "gc-sm",
                      children: st.help
                    })]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    className: "gc-detail",
                    children: w ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("ul", {
                      className: "gc-diff",
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                        children: ["status: unpaid \u2192 ", C.statusLabel(w.payment_status)]
                      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                        children: ["tier: ", w.fee_tier, " (", e.date_used ? "paid " + e.date_used.slice(0, 10) : "", ")"]
                      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                        children: ["fee total: ", C.money(w.fee_total)]
                      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                        children: ["deposit ", C.money(w.deposit_amount), " \xB7 balance ", C.money(w.balance_due)]
                      })]
                    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      className: "gc-dim",
                      children: "\u2014"
                    })
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    children: w ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                      type: "button",
                      className: "gc-btn ghost",
                      disabled: !canWrite,
                      onClick: () => {
                        setSel([e.entry_id]);
                        setModal({
                          t: "record"
                        });
                      },
                      children: "Record this one"
                    }) : null
                  })]
                }, e.entry_id);
              })
            })]
          })
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gc-empty",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: ov.entries.length ? "No entries match this filter." : "No entries on the team forms yet."
          })
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-actions",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn gold",
            disabled: !canWrite || !sel.length || !!prog,
            onClick: () => setModal({
              t: "record"
            }),
            children: ["Record ", sel.length ? I.plural(sel.length, "selected deposit") : "selected", "\u2026"]
          }), pendingEntries.length > 1 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            disabled: !canWrite || !!prog,
            onClick: () => setSel(pendingEntries.map(e => e.entry_id)),
            children: ["Select all ", pendingEntries.length]
          }) : null, sel.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            className: "gc-link",
            onClick: () => setSel([]),
            children: "Clear selection"
          }) : null]
        })]
      }) : null, tab === "teams" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gc-panel-teams",
        "aria-labelledby": "gc-tab-teams",
        className: "gc-card",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-bar-f",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-grow gc-search",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "search",
              s: 16
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
              htmlFor: "gc-q",
              className: "gc-sr",
              children: "Search teams or captains"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              id: "gc-q",
              className: "gc-input",
              type: "search",
              placeholder: "Search team, captain or email",
              value: q,
              onChange: e => setQ(e.target.value)
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
            className: "gc-sr",
            htmlFor: "gc-st",
            children: "Stage"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
            id: "gc-st",
            className: "gc-select",
            value: stage,
            onChange: e => setStage(e.target.value),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: "",
              children: "All stages"
            }), C.STAGES.map(s => /*#__PURE__*/(0, _jsxRuntime.jsxs)("option", {
              value: s.key,
              children: [s.label, " or later"]
            }, s.key))]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
            className: "gc-sr",
            htmlFor: "gc-stuck",
            children: "Waiting"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
            id: "gc-stuck",
            className: "gc-select",
            value: stuck,
            onChange: e => setStuck(Number(e.target.value)),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: 0,
              children: "Any wait"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: 3,
              children: "3+ days stuck"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: 7,
              children: "7+ days stuck"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: 14,
              children: "14+ days stuck"
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-bar-f",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
            className: "gc-check",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              type: "checkbox",
              checked: noCap,
              onChange: e => setNoCap(e.target.checked)
            }), " No captain"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
            className: "gc-check",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
              type: "checkbox",
              checked: onlyProblems,
              onChange: e => setOnlyProblems(e.target.checked)
            }), " Only teams with problems"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-grow"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            disabled: !nudgeList.length || !canWrite,
            onClick: () => setModal({
              t: "nudge",
              ids: nudgeList.map(t => t.id)
            }),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "bell",
              s: 16
            }), " Remind captains (", nudgeList.length, ")"]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gc-sub",
          "aria-live": "polite",
          children: [I.plural(teams.length, "team"), stage ? ` at ${C.STAGES.find(s => s.key === stage).label.toLowerCase()} or later` : ""]
        }), teams.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
          className: "gc-teams",
          children: teams.map(t => {
            const si = C.stageIndex(t.stage);
            const sd = C.stuckDays(t);
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              className: "gc-team" + (t.looks_test ? " test" : ""),
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gc-team-h",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  type: "button",
                  className: "gc-team-name",
                  onClick: () => setModal({
                    t: "team",
                    id: t.id
                  }),
                  "aria-label": `Open details for ${t.name}`,
                  children: t.name
                }), t.division_ok ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: "mute",
                  children: t.division_label || t.division
                }) : null, t.looks_test ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: "warn",
                  children: "Test data?"
                }) : null]
              }), !t.division_ok ? /*#__PURE__*/(0, _jsxRuntime.jsx)(DivFix, {
                teamId: t.id,
                divisions: ov.divisions,
                value: divPick[t.id],
                onChange: setDiv,
                onSave: saveDivision
              }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                className: "gc-team-cap",
                children: t.captain ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gc-strong",
                    children: t.captain.name
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gc-sm",
                    children: t.captain.email
                  })]
                }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    className: "gc-neg",
                    children: "No captain"
                  }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                    type: "button",
                    className: "gc-btn ghost sm",
                    onClick: () => teamActions.captain(t),
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                      n: "userplus",
                      s: 14
                    }), " Add"]
                  })]
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gc-team-row",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gc-dots",
                  role: "img",
                  "aria-label": "Stage: " + C.STAGES[si].label,
                  children: C.STAGES.map((s, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("i", {
                    className: i <= si ? "on" : "",
                    title: s.label
                  }, s.key))
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  children: C.STAGES[si].label
                }), sd ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
                  tone: C.stuckTone(sd),
                  children: [C.ageLabel(sd), " stuck"]
                }) : null, C.idleFlag(t) ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: C.idleFlag(t).tone,
                  children: C.idleFlag(t).label
                }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: C.readiness(t).tone,
                  children: C.readiness(t).label
                }), t.note && t.note.tag ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: "info",
                  children: C.noteTagLabel(t.note.tag)
                }) : null]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                className: "gc-team-row",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  className: t.roster_size >= t.min_players ? "" : "gc-dim",
                  children: ["Roster ", t.roster_size, "/", t.min_players]
                }), t.deposit_paid_at ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Pill, {
                  tone: t.payment_status === "paid_in_full" ? "ok" : "info",
                  children: [C.statusLabel(t.payment_status), " \xB7 ", C.money(t.balance_due), " due"]
                }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  className: "gc-dim",
                  children: "No deposit"
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
                className: "gc-team-next",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                  children: "Next:"
                }), " ", C.nextStep(t), t.account === "none" && t.captain ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                  children: [" \xB7 ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
                    className: "gc-a",
                    href: adminUrl("grsh-tm-invite-captain"),
                    children: ["Invite ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                      n: "ext",
                      s: 12
                    })]
                  })]
                }) : null, t.last_nudged_at ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  className: "gc-sub",
                  children: [" \xB7 reminded ", dateOnly(t.last_nudged_at)]
                }) : null]
              })]
            }, t.id);
          })
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gc-empty",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: ov.teams.length ? "No teams match." : "No captain teams this season yet. Teams are created by Invite Captain and the captain signup page."
          })
        })]
      }) : null, tab === "cleanup" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tabpanel",
        id: "gc-panel-cleanup",
        "aria-labelledby": "gc-tab-cleanup",
        className: "gc-card",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          className: "gc-note",
          children: "A team can be deleted for good only when it has no players, no payment, no deposit form entry and no history. Captain accounts and player records are never touched. Each deletion is logged, and an admin can restore a team from History."
        }), cleanReport ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-verdict " + (cleanReport.deleted ? "ok" : "warn"),
          role: "status",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-vic",
            children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: cleanReport.deleted ? "check" : "alert"
            })
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h3", {
              className: "gc-h3",
              children: cleanReport.message
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
              className: "gc-res",
              children: cleanReport.results.map(r => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                  tone: r.status === "deleted" ? "ok" : r.status === "error" ? "bad" : "mute",
                  children: r.status
                }), " ", r.name || "#" + r.team_id, ": ", r.message]
              }, r.team_id))
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              type: "button",
              className: "gc-link",
              onClick: () => setCleanReport(null),
              children: "Dismiss"
            })]
          })]
        }) : null, !canWrite ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          className: "gc-alert bad",
          role: "alert",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "alert",
            s: 16
          }), " Deleting is switched off because the season does not exist."]
        }) : null, [["suspect", "Looks like test data", groups.suspect], ["other", "Other teams with nothing attached", groups.other]].map(([k, label, list]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("section", {
          className: "gc-sec",
          "aria-labelledby": "gc-cl-" + k,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-sec-h",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("h3", {
              id: "gc-cl-" + k,
              className: "gc-h3",
              children: [label, " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gc-sub",
                children: ["(", list.length, ")"]
              })]
            }), list.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              type: "button",
              className: "gc-link",
              onClick: () => setCleanSel(s => [...new Set([...s, ...list.map(t => t.id)])]),
              children: ["Select all ", list.length]
            }) : null]
          }), list.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gc-clean",
            children: list.map(t => /*#__PURE__*/(0, _jsxRuntime.jsx)("li", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
                className: "gc-clean-row",
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                  type: "checkbox",
                  checked: cleanSel.includes(t.id),
                  disabled: !canWrite,
                  onChange: () => toggleClean(t.id),
                  "aria-label": `Select ${t.name}`
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  className: "gc-grow",
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                    children: t.name
                  }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
                    tone: "mute",
                    children: t.division_ok ? t.division_label || t.division : "no division"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    className: "gc-sub",
                    children: [t.captain ? t.captain.name + " · " + t.captain.email : "No captain", t.age_days !== null && t.age_days !== undefined ? " · created " + C.ageLabel(t.age_days) + " ago" : ""]
                  }), t.looks_test ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    className: "gc-sub gc-why",
                    children: ["Why: ", C.testReasons(t).join(" and ")]
                  }) : null]
                })]
              })
            }, t.id))
          }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gc-sub",
            children: k === "suspect" ? "Nothing looks like test data." : "None."
          })]
        }, k)), groups.protected.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("details", {
          className: "gc-det",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("summary", {
            children: [I.plural(groups.protected.length, "team"), " kept because of real data (players or money)"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
            className: "gc-res",
            children: groups.protected.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: t.name
              }), ": ", C.protectedHelp(t), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                type: "button",
                className: "gc-link",
                onClick: () => setModal({
                  t: "team",
                  id: t.id
                }),
                children: "Open team"
              })]
            }, t.id))
          })]
        }) : null, cleanSel.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          className: "gc-sticky",
          role: "region",
          "aria-label": "Selected teams",
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            "aria-live": "polite",
            children: [I.plural(cleanSel.length, "team"), " selected"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-grow"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            type: "button",
            className: "gc-link",
            onClick: () => setCleanSel([]),
            children: "Clear"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn danger",
            disabled: !canWrite || !cleanSel.length,
            onClick: () => {
              setDelText("");
              setModal({
                t: "delete"
              });
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "trash",
              s: 16
            }), " Delete ", I.plural(cleanSel.length, "team"), " permanently\u2026"]
          })]
        }) : null]
      }) : null, tab === "problems" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        role: "tabpanel",
        id: "gc-panel-problems",
        "aria-labelledby": "gc-tab-problems",
        className: "gc-card",
        children: !issues.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gc-empty",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: "No problems found."
          })
        }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
          className: "gc-issues",
          children: issues.map((i, k) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
            className: "gc-issue " + i.level,
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              className: "gc-issue-ic",
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                n: i.level === "info" ? "info" : "alert",
                s: 16
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              className: "gc-issue-b",
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: i.title
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                children: i.detail
              }), i.fix && i.fix.type === "division" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(DivFix, {
                teamId: i.fix.team_id,
                divisions: ov.divisions,
                value: divPick[i.fix.team_id],
                onChange: setDiv,
                onSave: saveDivision
              }) : null, i.fix && i.fix.type === "record" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                type: "button",
                className: "gc-btn ghost",
                onClick: () => {
                  setSel([i.fix.entry_id]);
                  setTab("deposits");
                },
                children: "Review in Deposits"
              }) : null, i.fix && i.fix.type === "link" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("a", {
                className: "gc-btn ghost",
                href: adminUrl(i.fix.page),
                children: [i.fix.label, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                  n: "ext",
                  s: 14
                })]
              }) : null, i.fix && i.fix.type === "cleanup" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                type: "button",
                className: "gc-btn ghost",
                onClick: () => setTab("cleanup"),
                children: "Open clean-up"
              }) : null, i.fix && i.fix.type === "captain" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                type: "button",
                className: "gc-btn ghost",
                onClick: () => setModal({
                  t: "captain",
                  id: i.fix.team_id
                }),
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
                  n: "userplus",
                  s: 14
                }), " Add a captain"]
              }) : null]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
              tone: i.level === "bad" ? "bad" : i.level === "warn" ? "warn" : "mute",
              children: i.level === "bad" ? "Fix" : i.level === "warn" ? "Check" : "FYI"
            })]
          }, k))
        })
      }) : null, tab === "history" ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        role: "tabpanel",
        id: "gc-panel-history",
        "aria-labelledby": "gc-tab-history",
        className: "gc-card",
        children: !ov.history.length ? /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          className: "gc-empty",
          children: /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            children: "Nothing changed from this page yet. Every deposit, division, captain and deletion made here is listed with who did it and when."
          })
        }) : ov.history.map(h => /*#__PURE__*/(0, _jsxRuntime.jsxs)("article", {
          className: "gc-log" + (h.undone ? " undone" : ""),
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            className: "gc-log-h",
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                children: C.historyTitle(h.action)
              }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                className: "gc-sub",
                children: ["#", h.id, " \xB7 ", I.fmtStamp(h.at), " \xB7 ", h.by]
              })]
            }), h.undone ? /*#__PURE__*/(0, _jsxRuntime.jsx)(Pill, {
              children: h.action === "captain_sync_team_deleted" ? "Restored" : "Undone"
            }) : null]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            className: "gc-note",
            children: h.notes
          }), h.can_undo ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            onClick: () => setModal({
              t: "undo",
              id: h.id
            }),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "undo",
              s: 15
            }), " Undo"]
          }) : h.action === "captain_sync_deposit" && !h.undone ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            className: "gc-sub",
            children: "The team has changed since, so this can no longer be undone safely."
          }) : null, h.can_reattach ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            onClick: async () => {
              const r = await post("/captain-sync/reattach-captain", {
                audit_id: h.id
              });
              toast(r.j.message || (r.ok ? "Done." : "Could not do that."), r.ok && r.j.success ? "" : "bad");
              load(true);
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "undo",
              s: 15
            }), " Put captain back"]
          }) : null, h.can_restore ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            className: "gc-btn ghost",
            onClick: () => setModal({
              t: "restore",
              id: h.id
            }),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
              n: "undo",
              s: 15
            }), " Restore team"]
          }) : null]
        }, h.id))
      }) : null]
    }), modal && modal.t === "record" && summary ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: `Record ${I.plural(summary.count, "deposit")}?`,
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        children: ["This writes the deposit onto ", summary.count === 1 ? "the team" : "each team", ": ", summary.early ? `${summary.early} early-tier` : "", summary.early && summary.late ? " and " : "", summary.late ? `${summary.late} late-tier` : "", ", ", C.money(summary.deposit), " in deposits, ", C.money(summary.balance), " left to collect. The tier comes from each entry's submission date."]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        className: "gc-check",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "checkbox",
          checked: email,
          onChange: e => setEmail(e.target.checked)
        }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "mail",
          s: 15
        }), " Also send each captain the deposit confirmation email"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        className: "gc-sub",
        children: "Off by default: these deposits may be weeks old. An email cannot be unsent if you undo."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn gold",
          "data-autofocus": true,
          disabled: !summary.count,
          onClick: () => runRecord(sel),
          children: "Record now"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn ghost",
          onClick: () => setModal(null),
          children: "Cancel"
        })]
      })]
    }) : null, modal && modal.t === "undo" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: "Undo this deposit?",
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: "The team goes back to showing no deposit, and the entry returns to Not recorded. A confirmation email that was already sent cannot be unsent."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn danger",
          "data-autofocus": true,
          onClick: () => doUndo(modal.id),
          children: "Undo"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn ghost",
          onClick: () => setModal(null),
          children: "Keep it"
        })]
      })]
    }) : null, modal && modal.t === "restore" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: "Restore this team?",
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: "The team comes back with the same id, name, division and captain it had when it was deleted."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn gold",
          "data-autofocus": true,
          onClick: () => doRestore(modal.id),
          children: "Restore"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn ghost",
          onClick: () => setModal(null),
          children: "Cancel"
        })]
      })]
    }) : null, modal && modal.t === "delete" ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(Modal, {
      title: `Delete ${I.plural(sel2.ok.length, "team")} for good?`,
      onClose: () => setModal(null),
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: "These teams have no players, no payments and no form entries:"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("ul", {
        className: "gc-mails",
        children: sel2.ok.map(t => /*#__PURE__*/(0, _jsxRuntime.jsxs)("li", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
            children: t.name
          }), " ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            className: "gc-sub",
            children: [t.division_label || t.division || "no division", t.captain ? " · " + t.captain.name : ""]
          })]
        }, t.id))
      }), sel2.blocked.length ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
        className: "gc-alert warn",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
          n: "alert",
          s: 16
        }), " ", I.plural(sel2.blocked.length, "selected team"), " cannot be deleted and will be kept."]
      }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
        children: "This removes them from the season. Captain accounts and player records stay. The History tab keeps a copy so an admin can restore a team."
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        className: "gc-lbl",
        htmlFor: "gc-del",
        children: ["Type ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
          children: C.DELETE_WORD
        }), " to confirm"]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        id: "gc-del",
        "data-autofocus": true,
        className: "gc-input",
        value: delText,
        onChange: e => setDelText(e.target.value),
        autoComplete: "off",
        spellCheck: "false"
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        className: "gc-actions",
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
          type: "button",
          className: "gc-btn danger",
          disabled: !C.deleteWordOk(delText) || !sel2.ok.length,
          onClick: runDelete,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(Ic, {
            n: "trash",
            s: 16
          }), " Delete ", I.plural(sel2.ok.length, "team")]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          type: "button",
          className: "gc-btn ghost",
          onClick: () => setModal(null),
          children: "Cancel"
        })]
      })]
    }) : null, modal && modal.t === "captain" && ov.teams.find(t => t.id === modal.id) ? /*#__PURE__*/(0, _jsxRuntime.jsx)(CaptainPicker, {
      team: ov.teams.find(t => t.id === modal.id),
      toast: toast,
      onClose: () => setModal(null),
      onDone: () => {
        setModal(null);
        load(true);
      }
    }) : null, modal && modal.t === "nudge" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(NudgeDialog, {
      teams: ov.teams.filter(t => (modal.ids || []).includes(t.id)),
      toast: toast,
      onClose: () => setModal(null),
      onDone: () => {
        setModal(null);
        load(true);
      }
    }) : null, modal && modal.t === "remove" && openTeam ? /*#__PURE__*/(0, _jsxRuntime.jsx)(RemoveDialog, {
      team: openTeam,
      toast: toast,
      onClose: () => setModal(null),
      onDone: () => {
        setModal(null);
        load(true);
      }
    }) : null, modal && modal.t === "revoke" && openTeam ? /*#__PURE__*/(0, _jsxRuntime.jsx)(ReasonDialog, {
      title: "Revoke the invite link?",
      body: `The link sent to ${openTeam.captain ? openTeam.captain.name : "the captain"} stops working. Their account and player record are kept. Send a new link from Invite Captain if you change your mind.`,
      confirm: "Revoke link",
      path: "/captain-sync/revoke-invite",
      extra: {
        team_id: openTeam.id
      },
      toast: toast,
      onClose: () => setModal(null),
      onDone: () => {
        setModal(null);
        load(true);
      }
    }) : null, modal && modal.t === "detach" && openTeam ? /*#__PURE__*/(0, _jsxRuntime.jsx)(ReasonDialog, {
      title: "Detach the captain?",
      body: `${openTeam.captain ? openTeam.captain.name : "The captain"} stops being captain of ${openTeam.name}. Nothing is deleted, and History can put them back.`,
      confirm: "Detach captain",
      path: "/captain-sync/detach-captain",
      extra: {
        team_id: openTeam.id
      },
      option: openTeam.account === "pending" ? {
        key: "revoke_invite",
        label: "Also revoke their unused invite link (cannot be undone)"
      } : null,
      toast: toast,
      onClose: () => setModal(null),
      onDone: () => {
        setModal(null);
        load(true);
      }
    }) : null, modal && modal.t === "digest" ? /*#__PURE__*/(0, _jsxRuntime.jsx)(DigestDialog, {
      toast: toast,
      onClose: () => setModal(null)
    }) : null, modal && modal.t === "team" && openTeam ? /*#__PURE__*/(0, _jsxRuntime.jsx)(TeamDrawer, {
      team: openTeam,
      ov: ov,
      onClose: () => setModal(null),
      actions: teamActions
    }) : null, /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      className: "gc-toasts",
      role: "status",
      "aria-live": "polite",
      children: toasts.map(t => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        className: "gc-toast" + (t.tone === "bad" ? " bad" : ""),
        children: t.msg
      }, t.id))
    })]
  });
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=DM+Mono:wght@400;500&display=swap');
.gc{--navy:#1a1a2e;--gold:#d4a017;--goldt:#7a5a05;--cream:#f6f5f0;--line:#e3e0d6;--mut:#55556a;--ok:#1f6f46;--okb:#e6f4ec;--warn:#85540a;--warnb:#fdf3dc;--bad:#b3261e;--badb:#fdeceb;--info:#27578f;--infob:#e8f0fa;
 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:var(--navy);background:var(--cream);margin:0 -20px;padding:0 20px 56px;min-height:100vh;box-sizing:border-box}
.gc *,.gc *::before,.gc *::after{box-sizing:border-box}
.gc :where(button,select,input,textarea){font-family:inherit;font-size:inherit;color:inherit}
.gc button:focus-visible,.gc select:focus-visible,.gc input:focus-visible,.gc textarea:focus-visible,.gc [tabindex]:focus-visible,.gc a:focus-visible,.gc summary:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.gc-wrap{max-width:1180px;margin:0 auto}
.gc-hero{background:linear-gradient(135deg,#1a1a2e 0%,#2a2a4a 100%);color:#fff;border-radius:0 0 18px 18px;margin:0 -20px 16px;padding:16px 20px 14px;position:relative;overflow:hidden}
.gc-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(212,160,23,.35),transparent 70%)}
.gc-hero-in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;position:relative;z-index:1}
.gc-kicker{color:#f0cf6e;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px}
.gc-h1{font-family:'Fraunces',Georgia,serif;font-size:28px;line-height:1.1;margin:0 0 4px;font-weight:700;color:#fff}
.gc-lead{margin:0;color:#e4e4ee;max-width:640px}
.gc-last{margin-top:12px;display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:5px 14px;font-size:13px;color:#fff}
.gc-h2{font-family:'Fraunces',Georgia,serif;font-size:21px;margin:0;font-weight:600;color:var(--navy)}
.gc-h3{font-family:'Fraunces',Georgia,serif;font-size:17px;margin:0;font-weight:600}
.gc-sub{color:var(--mut);font-size:13px}
.gc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px}
.gc-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;gap:12px;align-items:center;min-height:84px}
.gc-stat-ic{width:40px;height:40px;border-radius:11px;background:var(--cream);color:var(--goldt);display:grid;place-items:center;flex:none}
.gc-stat-n{font-family:'Fraunces',Georgia,serif;font-size:27px;font-weight:700;line-height:1}
.gc-stat-l{color:var(--mut);font-size:13px;margin-top:3px}.gc-stat-s{color:var(--mut);font-size:12px}
.gc-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:20px}
.gc-card-h{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.gc-covwrap{overflow-x:auto}
.gc-cov{border-collapse:separate;border-spacing:4px;width:100%;min-width:420px}
.gc-cov th{font-weight:500;text-align:left;font-size:13px;color:var(--mut);padding:4px 8px}
.gc-cov td{text-align:center;border-radius:8px;padding:8px;font-weight:500;background:#f1efe7;color:var(--mut)}
.gc-cov td.h1{background:#f6e7b5}.gc-cov td.h2{background:#efcf6c}.gc-cov td.h3{background:#e2b73a}.gc-cov td.h4{background:#d4a017;color:var(--navy)}
.gc-cov td.h1,.gc-cov td.h2,.gc-cov td.h3{color:var(--navy)}
.gc-gap{font-size:12px;font-weight:400}
.gc-note{margin:10px 0 0;color:var(--mut);font-size:13px}
.gc-tabs{display:flex;gap:4px;border-bottom:2px solid var(--line);margin-bottom:20px;overflow-x:auto}
.gc-tab{background:none;border:0;padding:12px 18px;cursor:pointer;color:var(--mut);font-weight:500;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;display:inline-flex;gap:8px;align-items:center;min-height:44px}
.gc-tab[aria-selected=true]{color:var(--navy);border-bottom-color:var(--gold)}
.gc-tab:hover{color:var(--navy)}
.gc-badge{background:var(--navy);color:#fff;border-radius:999px;padding:0 8px;font-size:12px;line-height:20px}
.gc-steps{display:flex;gap:6px;margin:0 0 20px;padding:0;list-style:none;flex-wrap:wrap}
.gc-step{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);color:var(--mut);font-size:13px}
.gc-step b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--cream);font-size:12px}
.gc-step.on{border-color:var(--navy);color:var(--navy);font-weight:500}.gc-step.on b{background:var(--navy);color:#fff}
.gc-step.done b{background:var(--ok);color:#fff}
.gc-grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:20px}
@media(max-width:900px){.gc-grid2{grid-template-columns:1fr}.gc-h1{font-size:28px}}
.gc-drop{border:2px dashed #b9b49f;border-radius:16px;background:#fff;padding:34px 20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}
.gc-drop:hover,.gc-drop.over{border-color:var(--gold);background:#fffaf0}
.gc-drop-ic{width:56px;height:56px;border-radius:16px;background:var(--navy);color:var(--gold);display:grid;place-items:center;margin:0 auto 12px}
.gc-drop strong{display:block;font-family:'Fraunces',Georgia,serif;font-size:19px;font-weight:600;margin-bottom:4px}
.gc-or{display:flex;align-items:center;gap:12px;color:var(--mut);margin:16px 0;font-size:13px}.gc-or::before,.gc-or::after{content:"";flex:1;height:1px;background:var(--line)}
.gc-ta{width:100%;min-height:96px;border:1px solid #b9b49f;border-radius:10px;padding:10px;background:#fff;resize:vertical}
.gc-btn{border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-weight:500;display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:44px;background:var(--navy);color:#fff;transition:transform .1s,background .15s}
.gc-btn:hover:not(:disabled){background:#2d2d52}.gc-btn:active:not(:disabled){transform:translateY(1px)}
.gc-btn.gold{background:var(--gold);color:var(--navy)}.gc-btn.gold:hover:not(:disabled){background:#e3b12b}
.gc-btn.ghost{background:#fff;color:var(--navy);border:1px solid #b9b49f}.gc-btn.ghost:hover:not(:disabled){background:var(--cream)}
.gc-btn.danger{background:var(--bad)}.gc-btn.danger:hover:not(:disabled){background:#8f1d17}
.gc-btn.onnavy{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3)}.gc-btn.onnavy:hover{background:rgba(255,255,255,.2)}
.gc-btn:disabled{opacity:.5;cursor:not-allowed}
.gc-link{background:none;border:0;color:var(--navy);text-decoration:underline;cursor:pointer;padding:6px;min-height:32px}.gc-link:disabled{opacity:.5;cursor:default;text-decoration:none}
.gc-file{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:16px}
.gc-file-ic{width:40px;height:40px;border-radius:10px;background:var(--cream);display:grid;place-items:center;color:var(--goldt)}
.gc-file-meta{flex:1;min-width:160px}.gc-file-meta b{display:block;word-break:break-all}
.gc-sec{border-top:1px solid var(--line);padding:18px 0 4px;margin-top:16px}
.gc-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.gc-verdict{display:flex;gap:14px;align-items:flex-start;border-radius:14px;padding:16px 18px;border:1px solid}
.gc-verdict.ok{background:var(--okb);border-color:#a9d6bd}.gc-verdict.warn{background:var(--warnb);border-color:#ecd093}.gc-verdict.bad{background:var(--badb);border-color:#efb3ae}.gc-verdict.info{background:var(--infob);border-color:#b6cdea}
.gc-verdict h3{margin:0 0 2px}.gc-verdict p{margin:0;color:#33334a}
.gc-vic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
.ok .gc-vic{background:var(--ok)}.warn .gc-vic{background:var(--warn)}.bad .gc-vic{background:var(--bad)}.info .gc-vic{background:var(--info)}
.gc-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--line);margin:16px 0 8px}
.gc-bar i{display:block;min-width:3px}
.gc-bar .insert{background:#2e9e6b}.gc-bar .update{background:#3b78c4}.gc-bar .unchanged{background:#a7a79c}.gc-bar .skip{background:#d9a21b}.gc-bar .error{background:#c9453b}
.gc-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:#33334a;margin:0 0 4px;padding:0;list-style:none}
.gc-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.gc-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:8px}
.gc-opt{border:2px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;display:block;background:#fff}
.gc-opt:has(input:checked){border-color:var(--navy);background:#fbfaf5}
.gc-opt:has(input:focus-visible){outline:3px solid var(--gold);outline-offset:2px}
.gc-opt input{margin-right:8px;accent-color:var(--navy)}
.gc-opt b{font-weight:500}.gc-opt span{display:block;color:var(--mut);font-size:13px;margin-top:2px;padding-left:24px}
.gc-select{border:1px solid #b9b49f;border-radius:8px;padding:8px 10px;background:#fff;min-height:40px;max-width:100%}
.gc-input{border:1px solid #b9b49f;border-radius:8px;padding:8px 12px;background:#fff;min-height:40px;min-width:0}
.gc-tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:10px;background:#fff}
.gc-table{width:100%;border-collapse:collapse;font-size:13px}
.gc-table th{text-align:left;font-weight:500;color:var(--mut);background:#faf9f4;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.gc-table td{padding:10px 12px;border-bottom:1px solid #efede4;vertical-align:top}
.gc-table tr:last-child td{border-bottom:0}
.gc-strong{font-weight:500;display:block}.gc-sm{display:block;font-size:12px;color:var(--mut)}.gc-dim{color:var(--mut)}
.gc-detail{min-width:200px;max-width:420px}
.gc-diff{margin:0 0 4px;padding:0;list-style:none}.gc-diff li{background:var(--infob);border-radius:6px;padding:2px 8px;margin-bottom:3px;display:inline-block}
.gc-pill{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:500;border:1px solid transparent;white-space:nowrap}
.gc-pill.ok{background:var(--okb);color:var(--ok)}.gc-pill.warn{background:var(--warnb);color:var(--warn)}.gc-pill.bad{background:var(--badb);color:var(--bad)}.gc-pill.info{background:var(--infob);color:var(--info)}.gc-pill.mute{background:#eeece4;color:#4a4a5c}
.gc-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.gc-chip{background:#fff;border:1px solid #b9b49f;border-radius:999px;padding:6px 14px;cursor:pointer;min-height:36px}
.gc-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.gc-chip b{font-weight:500;margin-left:4px}
.gc-pager{display:flex;gap:14px;align-items:center;justify-content:center;margin-top:12px}
.gc-alert{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13px}
.gc-alert.bad{background:var(--badb);color:#7d1a14}.gc-alert.warn{background:var(--warnb);color:#6b4308}.gc-alert.info{background:var(--infob);color:#1d4573}
.gc-alert svg{flex:none;margin-top:2px}
.gc-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}
.gc-spin{width:16px;height:16px;border-radius:50%;border:2px solid #b9b49f;border-top-color:var(--navy);animation:gc-sp .8s linear infinite;display:inline-block}
@keyframes gc-sp{to{transform:rotate(360deg)}}
.gc-done{text-align:center;padding:10px 0 4px}
.gc-done-ic{width:64px;height:64px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;margin:0 auto 12px;animation:gc-pop .4s ease-out}
@keyframes gc-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.gc-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:18px 0}
.gc-count{background:var(--cream);border-radius:12px;padding:12px}.gc-count b{display:block;font-family:'Fraunces',Georgia,serif;font-size:26px}
.gc-unlock{text-align:left;max-width:640px;margin:0 auto;padding:0;list-style:none}
.gc-unlock li{display:flex;gap:10px;margin:8px 0;align-items:flex-start}.gc-unlock svg{color:var(--ok);flex:none;margin-top:3px}
.gc-guide{width:100%}
.gc-guide summary{cursor:pointer;font-weight:500;min-height:32px}
.gc-guide dl{margin:10px 0 0}.gc-guide dt{font-weight:500;margin-top:10px}.gc-guide dd{margin:0;color:var(--mut);font-size:13px}
.gc-req{color:var(--bad);font-size:12px;margin-left:6px}
.gc-bar-f{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.gc-bar-f .grow{flex:1;min-width:200px;position:relative}.gc-bar-f .grow input{width:100%;padding-left:36px}.gc-bar-f .grow svg{position:absolute;left:10px;top:11px;color:var(--mut)}
.gc-log{border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px;margin-bottom:12px}
.gc-log-h{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;align-items:flex-start}
.gc-log.undone{opacity:.75}
.gc-log ul{margin:8px 0 0;padding-left:20px;color:#33334a;font-size:13px}
.gc-empty{text-align:center;padding:40px 16px;color:var(--mut)}.gc-empty .gc-drop-ic{background:var(--cream);color:var(--goldt)}
.gc-scrim{position:fixed;inset:0;background:rgba(26,26,46,.55);display:grid;place-items:center;z-index:100000;padding:16px}
.gc-modal{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.gc-modal.wide{max-width:640px}.gc-modal p{margin:10px 0}
.gc-toasts{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.gc-toast{background:var(--navy);color:#fff;border-radius:10px;padding:10px 18px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;animation:gc-up .25s ease-out}
.gc-toast.bad{background:var(--bad)}
@keyframes gc-up{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
.gc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.gc *,.gc *::before,.gc *::after{animation:none!important;transition:none!important}}

.gc-hero-btns{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
.gc-health{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 20px}
.gc-chip2{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 12px;font-size:13px;border:1px solid}
.gc-chip2.ok{background:var(--okb);color:var(--ok);border-color:#a9d6bd}.gc-chip2.bad{background:var(--badb);color:#8f1d17;border-color:#efb3ae}
.gc-fun{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-fun-step{background:var(--cream);border:2px solid transparent;border-radius:14px;padding:12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.gc-fun-step:hover{border-color:#cfc9b4}.gc-fun-step.on{border-color:var(--navy);background:#fff}
.gc-fun-n{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:700;line-height:1}
.gc-fun-l{font-weight:500}.gc-fun-p{color:var(--mut);font-size:12px}
.gc-fun-bar{display:block;height:6px;border-radius:3px;background:#e4e1d4;margin:6px 0 2px;overflow:hidden}.gc-fun-bar i{display:block;height:100%;background:var(--gold)}
.gc-dots{display:inline-flex;gap:4px}.gc-dots i{width:10px;height:10px;border-radius:50%;background:#dcd8c8}.gc-dots i.on{background:var(--ok)}
.gc-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
.gc-grow{flex:1;min-width:0}.gc-search{position:relative;min-width:200px}.gc-search input{width:100%;padding-left:36px}.gc-search svg{position:absolute;left:10px;top:11px;color:var(--mut)}
.gc-check{display:inline-flex;gap:8px;align-items:center;cursor:pointer}.gc-check input{accent-color:var(--navy);width:16px;height:16px}
.gc-a{color:var(--navy);text-decoration:underline}
.gc-prog{position:relative;height:30px;border-radius:8px;background:var(--cream);overflow:hidden;margin:12px 0}.gc-prog i{position:absolute;inset:0 auto 0 0;background:#efcf6c;transition:width .2s}.gc-prog span{position:relative;display:block;text-align:center;line-height:30px;font-size:13px}
.gc-res{margin:8px 0;padding:0;list-style:none;font-size:13px}.gc-res li{margin:4px 0}
.gc-issues{margin:0;padding:0;list-style:none}.gc-issue{display:flex;gap:12px;align-items:flex-start;padding:14px 4px;border-bottom:1px solid var(--line)}.gc-issue:last-child{border-bottom:0}
.gc-issue-ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff}.gc-issue.bad .gc-issue-ic{background:var(--bad)}.gc-issue.warn .gc-issue-ic{background:var(--warn)}.gc-issue.info .gc-issue-ic{background:var(--info)}
.gc-issue-b{flex:1;min-width:0}.gc-issue-b p{margin:2px 0 6px;color:#33334a;font-size:13px}
a.gc-btn{text-decoration:none}
.gc-badge.hot{background:var(--bad)}

.gc{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gc-hero,.gc-hero *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gc-lbl{display:block;font-weight:500;margin:10px 0 4px}
.gc-pre{white-space:pre-wrap;background:var(--cream);border:1px solid var(--line);border-radius:10px;padding:12px;font-size:13px;margin:8px 0;max-height:240px;overflow:auto}
.gc-det{margin:12px 0;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:#fff}.gc-det summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
.gc-dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:14px 0}.gc-dl dt{color:var(--mut)}.gc-dl dd{margin:0}
.gc-neg{color:var(--bad);font-weight:500}
.gc-x{background:none;border:0;cursor:pointer;width:44px;height:44px;border-radius:10px;display:grid;place-items:center;color:var(--navy)}.gc-x:hover{background:var(--cream)}
.gc-modal-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.gc-mails{list-style:none;margin:8px 0;padding:0;max-height:200px;overflow:auto}.gc-mails li{padding:6px 0;border-bottom:1px solid var(--line)}.gc-mails li:last-child{border-bottom:0}
.gc-pl{margin:8px 0;max-height:260px;overflow:auto}
.gc-pl .gc-opt{display:flex;gap:10px;align-items:center;margin:6px 0;padding:10px 12px}.gc-pl .gc-opt.on{border-color:var(--navy);background:#fbfaf5}
.gc-pl .gc-opt span:nth-child(2){flex:1;min-width:0;word-break:break-word}
.gc-hero-btns{display:flex;gap:10px;flex-wrap:wrap;position:relative;z-index:1}
.gc-health{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 20px}
.gc-chip2{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 12px;font-size:13px;border:1px solid;background:#fff;cursor:default}
button.gc-chip2{cursor:pointer;min-height:32px}
.gc-chip2.ok{background:var(--okb);color:var(--ok);border-color:#a9d6bd}.gc-chip2.bad{background:var(--badb);color:#8f1d17;border-color:#efb3ae}.gc-chip2.mute{background:#eeece4;color:#33334a;border-color:#d4d0c0}
.gc-verdict{margin-bottom:14px;align-items:center}.gc-grow{flex:1;min-width:0}
.gc-fun{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-fun-step{background:var(--cream);border:2px solid transparent;border-radius:14px;padding:12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.gc-fun-step:hover{border-color:#cfc9b4}.gc-fun-step.on{border-color:var(--navy);background:#fff}
.gc-fun-n{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:700;line-height:1}
.gc-fun-l{font-weight:500}.gc-fun-p{color:var(--mut);font-size:12px}
.gc-fun-bar{display:block;height:6px;border-radius:3px;background:#e4e1d4;margin:6px 0 2px;overflow:hidden}.gc-fun-bar i{display:block;height:100%;background:var(--gold)}
.gc-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
@media(max-width:900px){.gc-two{grid-template-columns:1fr}}
.gc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.gc-tile{background:var(--cream);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.gc-tile-n{font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:700;line-height:1.1}.gc-tile-l{color:var(--mut);font-size:13px}
.gc-dv{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.gc-dv-h{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:4px}.gc-dv-h b{flex:1}
.gc-dv-bar{display:block;height:8px;border-radius:4px;background:#e4e1d4;overflow:hidden}.gc-dv-bar i{display:block;height:100%;background:var(--ok)}.gc-dv-bar i.warn{background:var(--warn)}.gc-dv-bar i.info{background:var(--info)}
.gc-acts{list-style:none;margin:0;padding:0}
.gc-act{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.gc-act:last-child{border-bottom:0}
.gc-act .gc-grow{display:flex;flex-direction:column}
.gc-act-n{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff;font-weight:500;background:var(--info)}
.gc-act.bad .gc-act-n{background:var(--bad)}.gc-act.warn .gc-act-n{background:var(--warn)}
.gc-teams{list-style:none;margin:12px 0 18px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.gc-team{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:8px}
.gc-team.test{border-style:dashed;border-color:#d9a21b;background:#fffdf5}
.gc-team-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gc-team-name{background:none;border:0;padding:0;font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;text-align:left;cursor:pointer;text-decoration:underline;text-decoration-color:var(--gold);text-underline-offset:4px;min-height:32px}
.gc-team-cap{margin:0;display:flex;flex-direction:column;gap:2px;align-items:flex-start}
.gc-team-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gc-team-next{margin:0;font-size:13px;color:#33334a}
.gc-btn.sm{min-height:32px;padding:4px 10px;font-size:13px}
.gc-dots{display:inline-flex;gap:4px}.gc-dots i{width:10px;height:10px;border-radius:50%;background:#dcd8c8}.gc-dots i.on{background:var(--ok)}
.gc-sm{display:block;color:var(--mut);font-size:12px;word-break:break-all}.gc-strong{font-weight:500}.gc-dim{color:var(--mut)}
.gc-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
.gc-search{position:relative;min-width:200px}.gc-search input{width:100%;padding-left:36px}.gc-search svg{position:absolute;left:10px;top:13px;color:var(--mut)}
.gc-check{display:inline-flex;gap:8px;align-items:center;cursor:pointer;min-height:32px}.gc-check input{accent-color:var(--navy);width:16px;height:16px}
.gc-a{color:var(--navy);text-decoration:underline}
.gc-prog{position:relative;height:30px;border-radius:8px;background:var(--cream);overflow:hidden;margin:12px 0}.gc-prog i{position:absolute;inset:0 auto 0 0;background:#efcf6c;transition:width .2s}.gc-prog span{position:relative;display:block;text-align:center;line-height:30px;font-size:13px}
.gc-res{margin:8px 0;padding:0;list-style:none;font-size:13px}.gc-res li{margin:4px 0}
.gc-issues{margin:0;padding:0;list-style:none}.gc-issue{display:flex;gap:12px;align-items:flex-start;padding:14px 4px;border-bottom:1px solid var(--line)}.gc-issue:last-child{border-bottom:0}
.gc-issue-ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none;color:#fff}.gc-issue.bad .gc-issue-ic{background:var(--bad)}.gc-issue.warn .gc-issue-ic{background:var(--warn)}.gc-issue.info .gc-issue-ic{background:var(--info)}
.gc-issue-b{flex:1;min-width:0}.gc-issue-b p{margin:2px 0 6px;color:#33334a;font-size:13px}
a.gc-btn{text-decoration:none}.gc-badge.hot{background:var(--bad)}
.gc-clean{list-style:none;margin:0;padding:0}.gc-clean li{border-bottom:1px solid var(--line)}.gc-clean li:last-child{border-bottom:0}
.gc-clean-row{display:flex;gap:12px;align-items:flex-start;padding:10px 4px;cursor:pointer}.gc-clean-row input{margin-top:4px;width:18px;height:18px;accent-color:var(--bad)}
.gc-clean-row .gc-grow{display:flex;flex-direction:column;gap:2px}.gc-why{color:var(--warn)}
.gc-sticky{position:sticky;z-index:5;bottom:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border-top:2px solid var(--line);margin:18px -20px -20px;padding:12px 20px;border-radius:0 0 16px 16px}
.gc-scrim.side{place-items:stretch end;padding:0}
.gc-modal.drawer{max-width:440px;width:100%;height:100%;max-height:100vh;border-radius:16px 0 0 16px;animation:gc-in .2s ease-out}
@keyframes gc-in{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.gc-tl{list-style:none;margin:14px 0;padding:0}.gc-tl li{display:flex;gap:12px;align-items:flex-start;padding:6px 0;position:relative;color:var(--mut)}
.gc-tl li.on{color:var(--navy)}
.gc-tl li:not(:last-child)::before{content:"";position:absolute;left:10px;top:28px;bottom:-6px;width:2px;background:var(--line)}
.gc-tl-dot{width:22px;height:22px;border-radius:50%;border:2px solid #cfcab6;display:grid;place-items:center;flex:none;background:#fff;color:#fff}.gc-tl li.on .gc-tl-dot{background:var(--ok);border-color:var(--ok)}
.gc-danger-zone{margin-top:18px;border:1px dashed #d9a21b;border-radius:12px;padding:12px}.gc-lock{margin-top:18px}
@media(max-width:600px){.gc-modal.drawer{max-width:100%;border-radius:0}.gc-dl{grid-template-columns:1fr}.gc-verdict{flex-wrap:wrap}.gc-act{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.gc *{animation:none!important;transition:none!important}}
@media print{.gc-scrim,.gc-toasts{display:none}}

.gc-lead{display:none}
.gc-fun-n small{font-size:13px;font-weight:500;color:var(--mut);font-family:inherit}
.gc-fun{grid-template-columns:repeat(5,minmax(0,1fr))}
@media(max-width:900px){.gc-fun{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
.gc-badges{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.gc-date{max-width:170px}
.gc-digest{white-space:pre-wrap;font-family:inherit}
.gc-tile-n,.gc-fun-n,.gc-dv-h span{font-variant-numeric:tabular-nums}
@media print{.gc-hero-btns,.gc-tabs,.gc-sticky,.gc-scrim .gc-actions{display:none!important}.gc{background:#fff}.gc-card{break-inside:avoid;box-shadow:none}}
`;