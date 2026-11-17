"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = History;
var _react = require("react");
var _jsxRuntime = require("react/jsx-runtime");
// ─── API ──────────────────────────────────────────────────────────────────────
const API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = window.grshConfig?.nonce || "";

// ─── Config ───────────────────────────────────────────────────────────────────
const DIVISION_LABEL = {
  gold_open: "Gold Open",
  "45a": "45A",
  senior_b: "Senior B",
  senior_c: "Senior C",
  womens: "Women's"
};
const DIVISION_KEYS = ["gold_open", "45a", "senior_b", "senior_c", "womens"];
const adminUrl = page => `/wp-admin/admin.php?page=${page}`;

// one place for every request: never throws, always says what went wrong in plain words
async function apiCall(path, opts = {}) {
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
      status: r.status,
      error: json && (json.error || json.message) || `The server answered ${r.status}.`
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
const DIVISION_COLOR = {
  gold_open: {
    bg: "#FEF9E7",
    color: "#92601A",
    border: "#F5D77E"
  },
  "45a": {
    bg: "#E8F6F8",
    color: "#1A5F6B",
    border: "#9DD5DC"
  },
  senior_b: {
    bg: "#F3EEF9",
    color: "#4A3070",
    border: "#C4AEED"
  },
  senior_c: {
    bg: "#FDF0E8",
    color: "#7A3318",
    border: "#F5B993"
  },
  womens: {
    bg: "#FCEAF3",
    color: "#7A1F4E",
    border: "#EDB1D1"
  }
};
const DIVISION_HUE = {
  gold_open: "#D4A017",
  "45a": "#2196a8",
  senior_b: "#7B5EA7",
  senior_c: "#B05E3A",
  womens: "#C2410C"
};
const POSITION_LABEL = {
  defenseman: "Defense",
  center: "Center",
  winger: "Winger",
  goaltender: "Goalie"
};
const TIER_ORDER = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "R1", "R2", "R3"];
const TIER_VAL = t => TIER_ORDER.indexOf(t);
const TIER_COLOR = t => {
  if (!t) return {
    bg: "#F3F4F6",
    color: "#6B7280"
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
    color: "#7A5A18"
  };
  return {
    bg: "#E8F0FE",
    color: "#1A3F8F"
  };
};
const AVATAR_COLORS = ["#1a1a2e", "#1E3A5F", "#3B1F5E", "#1F4E3B", "#5E3B1F", "#4A1F1F", "#1F3D4E", "#3D2B1F"];
const avatarColor = id => AVATAR_COLORS[id % AVATAR_COLORS.length];

// #2 Title-case helper
const titleCase = s => s ? s.replace(/\b\w/g, c => c.toUpperCase()) : "";

// ─── Aggregate flat API records → player objects ──────────────────────────────
const toB = v => v === true || v === 1 || v === "1" || v === "yes" || v === "Yes" || v === "true";
function aggregateRecords(records) {
  const map = {};
  let skipped = 0;
  records.forEach(r => {
    const key = r.player_id ? "p" + r.player_id : (r.email || "").toLowerCase().trim();
    if (!key) {
      skipped++;
      return;
    } // a row we truly cannot attach to anyone; the page says how many
    if (!map[key]) {
      map[key] = {
        id: r.player_id || r.id,
        first_name: r.first_name || "",
        last_name: r.last_name || "",
        email: r.email || "",
        skill_tier_reported: r.skill_tier_reported || r.skill_tier || null,
        position: r.position || null,
        sandbagging_flag: false,
        no_show_count: 0,
        attendance_rating: null,
        history: [],
        _latest: 0
      };
    }
    const p = map[key];
    const isCaptain = toB(r.was_captain) || toB(r.is_captain);
    const isSandbag = toB(r.sandbagging_flag) || toB(r.is_sandbagging);
    const num = v => v === null || v === undefined || v === "" ? null : +v;
    p.history.push({
      row_id: r.id,
      season: +r.season_year,
      division: r.division_played || r.division || "",
      team: r.team_name || r.team || "",
      finish: r.finish_position || r.finish || null,
      championship: r.championship_result || r.championship || "none",
      was_captain: isCaptain,
      sandbagging_flag: isSandbag,
      was_alternate: toB(r.was_alternate),
      skill_tier: r.skill_tier_reported || r.skill_tier || null,
      games_scheduled: num(r.games_scheduled),
      games_attended: num(r.games_attended),
      no_show: +r.no_show_count || 0,
      notes: r.committee_notes || ""
    });
    p.no_show_count += +r.no_show_count || 0;
    if (isSandbag) p.sandbagging_flag = true;
    if (+r.season_year > p._latest) {
      p._latest = +r.season_year;
      p.skill_tier_reported = r.skill_tier_reported || r.skill_tier || p.skill_tier_reported;
    }
  });
  const players = Object.values(map).map(p => {
    delete p._latest;
    const sch = p.history.reduce((s, h) => s + (h.games_scheduled || 0), 0);
    const att = p.history.reduce((s, h) => s + (h.games_attended || 0), 0);
    p.attendance_rating = sch > 0 ? Math.round(att / sch * 100) : null;
    p.games_recorded = p.history.some(h => h.games_scheduled !== null);
    p.history.sort((a, b) => b.season - a.season);
    // what is missing, so the page can list and filter it instead of quietly showing dashes
    p.gaps = [];
    if (p.history.some(h => !h.skill_tier)) p.gaps.push("no_tier");
    if (p.history.some(h => !h.division)) p.gaps.push("no_division");
    if (p.history.some(h => h.games_scheduled === null)) p.gaps.push("no_games");
    if (p.history.some(h => !h.team)) p.gaps.push("no_team");
    if (!p.email) p.gaps.push("no_email");
    return p;
  });
  return {
    players,
    skipped
  };
}

// ─── Tier trend ───────────────────────────────────────────────────────────────
function tierTrend(history) {
  const t = history.filter(h => TIER_VAL(h.skill_tier) >= 0); // newest first
  if (t.length < 2) return "unknown";
  // lower index in TIER_ORDER = better skill
  const newest = TIER_VAL(t[0].skill_tier);
  const earliest = TIER_VAL(t[t.length - 1].skill_tier);
  if (newest < earliest) return "improved";
  if (newest > earliest) return "declined";
  return "stable";
}
const TREND = {
  improved: {
    arrow: "↑",
    color: "#166534",
    label: "Improving"
  },
  declined: {
    arrow: "↓",
    color: "#991B1B",
    label: "Declining"
  },
  stable: {
    arrow: "→",
    color: "#6B7280",
    label: "Stable"
  },
  unknown: {
    arrow: "–",
    color: "#6B7280",
    label: "Not enough tier history"
  }
};

// Big moves: a tier change of 3+ steps between two seasons in a row (e.g. B2 → A2). Worth a human look at draft time.
function tierMoves(players) {
  const out = [];
  players.forEach(p => {
    const t = p.history.filter(h => TIER_VAL(h.skill_tier) >= 0).sort((a, b) => a.season - b.season);
    for (let i = 1; i < t.length; i++) {
      const d = TIER_VAL(t[i - 1].skill_tier) - TIER_VAL(t[i].skill_tier); // positive = got better
      if (Math.abs(d) >= 3) out.push({
        player: p,
        from: t[i - 1],
        to: t[i],
        steps: Math.abs(d),
        better: d > 0
      });
    }
  });
  return out.sort((a, b) => b.steps - a.steps);
}

// ─── WOW 2: Tier sparkline ────────────────────────────────────────────────────
function TierSparkline({
  history
}) {
  const withTier = history.filter(h => TIER_VAL(h.skill_tier) >= 0);
  if (withTier.length < 2) {
    const tc = TIER_COLOR(withTier[0]?.skill_tier);
    return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: withTier.length ? "Only one season has a tier" : "No tier recorded",
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        background: tc.bg,
        color: tc.color,
        padding: "1px 5px",
        borderRadius: 3
      },
      children: withTier[0]?.skill_tier || "—"
    });
  }
  const vals = [...withTier].sort((a, b) => a.season - b.season).map(h => TIER_VAL(h.skill_tier));
  const min = Math.min(...vals),
    max = Math.max(...vals, min + 1);
  const W = 52,
    H = 18,
    pad = 2;
  const x = i => pad + i / (vals.length - 1) * (W - pad * 2);
  const y = v => pad + (v - min) / (max - min + 1) * (H - pad * 2);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const trend = tierTrend(withTier);
  const col = trend === "improved" ? "#166534" : trend === "declined" ? "#991B1B" : "#6B7280";
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("svg", {
      width: W,
      height: H,
      style: {
        flexShrink: 0
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("polyline", {
        points: pts,
        fill: "none",
        stroke: col,
        strokeWidth: "1.5",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }), vals.map((v, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("circle", {
        cx: x(i),
        cy: y(v),
        r: i === vals.length - 1 ? 2.5 : 1.5,
        fill: i === vals.length - 1 ? col : "#E8E6DF"
      }, i))]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        fontWeight: 700,
        color: col
      },
      children: TREND[trend].arrow
    })]
  });
}

// ─── WOW 4: DNA avatar ────────────────────────────────────────────────────────
function DNAAvatar({
  player,
  size = 32
}) {
  const seasons = player.history.length;
  const champs = player.history.filter(h => h.championship === "winner").length;
  const att = player.attendance_rating || 100;
  const divs = [...new Set(player.history.map(h => h.division))];
  const baseColor = DIVISION_HUE[divs[0]] || avatarColor(player.id);
  const rings = Math.min(seasons, 4);
  const glow = champs > 0;
  const initials = `${titleCase(player.first_name)[0] || ""}${titleCase(player.last_name)[0] || ""}`;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      position: "relative",
      width: size,
      height: size,
      flexShrink: 0
    },
    children: [[...Array(rings)].map((_, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        position: "absolute",
        inset: -(i + 1) * 2,
        borderRadius: "50%",
        border: `1px solid ${baseColor}`,
        opacity: 0.15 + i * 0.05
      }
    }, i)), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        background: baseColor,
        boxShadow: glow ? `0 0 0 2px #fff, 0 0 0 3px #D4A017` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono',monospace",
        fontSize: size * 0.32,
        fontWeight: 500,
        color: "#D4A017"
      },
      children: initials
    })]
  });
}

// ─── WOW 1: Career Timeline ───────────────────────────────────────────────────
function CareerTimeline({
  player
}) {
  const sorted = [...player.history].sort((a, b) => a.season - b.season);
  const [hov, setHov] = (0, _react.useState)(null);
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: "16px 20px",
      borderBottom: "1px solid #F0EEE8"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        color: "#aaa",
        textTransform: "uppercase",
        letterSpacing: ".08em",
        marginBottom: 12
      },
      children: ["Career timeline \xB7 ", sorted[0]?.season, "\u2013", sorted[sorted.length - 1]?.season]
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 0,
        overflowX: "auto",
        paddingBottom: 4
      },
      children: sorted.map((h, i) => {
        const dc = DIVISION_COLOR[h.division] || {};
        const isChamp = h.championship === "winner";
        const isHov = hov === i;
        return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            alignItems: "center",
            flex: 1,
            minWidth: 60
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
              flex: 1
            },
            onMouseEnter: () => setHov(i),
            onMouseLeave: () => setHov(null),
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                width: isChamp ? 22 : 16,
                height: isChamp ? 22 : 16,
                borderRadius: "50%",
                background: isChamp ? "#D4A017" : dc.bg || "#F0EEE8",
                border: `2px solid ${isChamp ? "#B8860B" : dc.border || "#E8E6DF"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isChamp ? 10 : 8,
                transition: "all .2s",
                transform: isHov ? "scale(1.2)" : "scale(1)"
              },
              children: isChamp ? "🏆" : h.was_captain ? "©" : ""
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#1a1a2e"
              },
              children: h.season
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: dc.color || "#888",
                textAlign: "center",
                lineHeight: 1.2
              },
              children: DIVISION_LABEL[h.division] || h.division
            })]
          }), i < sorted.length - 1 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              height: 2,
              flex: 0.5,
              background: "#E8E6DF",
              minWidth: 8
            }
          })]
        }, h.season);
      })
    }), hov !== null && sorted[hov] && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        marginTop: 10,
        background: "#F6F5F0",
        borderRadius: 8,
        padding: "10px 12px",
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        color: "#555",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6
      },
      children: [["Season", sorted[hov].season], ["Division", DIVISION_LABEL[sorted[hov].division] || sorted[hov].division], ["Team", sorted[hov].team], ["Tier", sorted[hov].skill_tier], ["Result", sorted[hov].championship === "winner" ? "🏆 Champion" : sorted[hov].championship], ["Captain", sorted[hov].was_captain ? "Yes" : "No"], ["Attended", sorted[hov].games_scheduled === null ? "not recorded" : `${sorted[hov].games_attended ?? 0}/${sorted[hov].games_scheduled} games`], ["No-shows", sorted[hov].no_show]].map(([k, v]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 6
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            color: "#aaa",
            minWidth: 56
          },
          children: k
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
          style: {
            color: "#1a1a2e"
          },
          children: v
        })]
      }, k))
    })]
  });
}

// ─── WOW 8: Career card generator ────────────────────────────────────────────
function generateCareerCard(player) {
  const sorted = [...player.history].sort((a, b) => a.season - b.season);
  const champs = player.history.filter(h => h.championship === "winner");
  const caps = player.history.filter(h => h.was_captain);
  const divs = [...new Set(player.history.map(h => DIVISION_LABEL[h.division] || h.division))];
  const name = `${titleCase(player.first_name)} ${titleCase(player.last_name)}`;
  const win = window.open("", "_blank", "width=500,height=360");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${name} · GRSH Career</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Georgia,serif;padding:20px}
  .card{width:440px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .head{background:#1a1a2e;padding:24px;display:flex;align-items:center;gap:16}
  .av{width:56px;height:56px;border-radius:50%;background:#D4A017;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#1a1a2e;border:3px solid rgba(212,160,23,.3)}
  h1{font-size:20px;color:#fff;margin:0 0 3px}
  .sub{font-family:monospace;font-size:11px;color:rgba(255,255,255,.4)}
  .body{padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:14}
  .stat{text-align:center;padding:12px;background:#F6F5F0;border-radius:8px}
  .val{font-size:24px;font-weight:700;color:#1a1a2e}
  .lab{font-family:monospace;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-top:3px}
  .timeline{background:#F6F5F0;padding:14px;margin:0 20px 20px;border-radius:8px}
  .tl-title{font-family:monospace;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}
  .tl-row{display:flex;align-items:center;gap:8;padding:3px 0;font-family:monospace;font-size:11px;color:#555}
  .tl-dot{width:8px;height:8px;border-radius:50%;background:#1a1a2e;flex-shrink:0}
  footer{background:#F6F5F0;padding:10px 20px;display:flex;justify-content:space-between;font-family:monospace;font-size:9px;color:#aaa;border-top:1px solid #E8E6DF}
  .badge{background:#D4A017;color:#1a1a2e;padding:1px 6px;border-radius:3px;font-weight:700}
  </style></head><body><div class="card">
  <div class="head">
    <div class="av">${name.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
    <div><h1>${name}</h1><div class="sub">${player.email}</div></div>
    ${champs.length > 0 ? `<div style="margin-left:auto"><span class="badge">🏆 ${champs.length}× Champion</span></div>` : ""}
  </div>
  <div class="body">
    <div class="stat"><div class="val">${player.history.length}</div><div class="lab">Seasons played</div></div>
    <div class="stat"><div class="val">${champs.length}</div><div class="lab">Championships</div></div>
    <div class="stat"><div class="val">${caps.length}</div><div class="lab">Seasons as captain</div></div>
    <div class="stat"><div class="val">${player.attendance_rating != null ? player.attendance_rating + "%" : "—"}</div><div class="lab">Attendance rate</div></div>
  </div>
  <div class="timeline">
    <div class="tl-title">Career history</div>
    ${sorted.map(h => `<div class="tl-row"><div class="tl-dot"></div><strong>${h.season}</strong> &nbsp; ${DIVISION_LABEL[h.division] || h.division} &nbsp; ${h.skill_tier} ${h.championship === "winner" ? " · 🏆" : ""} ${h.was_captain ? " · © Captain" : ""}</div>`).join("")}
  </div>
  <footer><span>Gold Rush Senior Hockey Tournament</span><span>Season 2027</span></footer>
  </div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ─── WOW 5: Sandbagging predictor ────────────────────────────────────────────
function SandbagPredictor({
  players,
  onClose
}) {
  const risks = (0, _react.useMemo)(() => {
    return players.map(p => {
      const hist = p.history.filter(h => h.skill_tier);
      if (!hist.length) return null;
      const avgIdx = hist.reduce((s, h) => s + TIER_VAL(h.skill_tier), 0) / hist.length;
      const curIdx = TIER_VAL(p.skill_tier_reported);
      const gap = curIdx - avgIdx; // positive = reported lower tier than history = risk
      return {
        ...p,
        avgIdx,
        curIdx,
        gap,
        riskScore: Math.round(Math.min(100, Math.max(0, gap * 20))),
        avgTier: TIER_ORDER[Math.round(avgIdx)] || "—"
      };
    }).filter(Boolean).sort((a, b) => b.riskScore - a.riskScore);
  }, [players]);
  const high = risks.filter(p => p.riskScore >= 70);
  const medium = risks.filter(p => p.riskScore >= 40 && p.riskScore < 70);
  const low = risks.filter(p => p.riskScore < 40 && p.riskScore > 0);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 620,
        width: "100%",
        maxHeight: "85vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "18px 22px 14px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#D4A017",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 3
            },
            children: "\u26A1 2027 Risk Analysis"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              margin: 0
            },
            children: "Historical Sandbagging Predictor"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "rgba(255,255,255,.4)",
              marginTop: 3
            },
            children: "Compares 2027 self-reported tier against 5-season historical average"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          style: {
            background: "none",
            border: "none",
            color: "#D4A017",
            fontSize: 16,
            cursor: "pointer"
          },
          children: "\u2715"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          overflowY: "auto",
          flex: 1
        },
        children: [[{
          label: "High risk",
          items: high,
          col: "#991B1B",
          bg: "#FEF2F2",
          border: "#FCA5A5"
        }, {
          label: "Medium risk",
          items: medium,
          col: "#92400E",
          bg: "#FFFBEB",
          border: "#FDE68A"
        }, {
          label: "Low risk / consistent",
          items: low,
          col: "#166534",
          bg: "#F0FDF4",
          border: "#86EFAC"
        }].map(grp => grp.items.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            borderBottom: "1px solid #F0EEE8"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              padding: "10px 22px",
              background: grp.bg,
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              fontWeight: 600,
              color: grp.col,
              textTransform: "uppercase",
              letterSpacing: ".07em",
              display: "flex",
              justifyContent: "space-between"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              children: grp.label
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              children: [grp.items.length, " player", grp.items.length !== 1 ? "s" : ""]
            })]
          }), grp.items.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderBottom: "1px solid #F9F8F4"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
              player: p,
              size: 28
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: "'Fraunces',serif",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1a1a2e"
                },
                children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#888"
                },
                children: ["Historical avg tier: ", p.avgTier, " \xB7 Self-reported for 2027: ", p.skill_tier_reported, p.gap > 0 ? " — registered LOWER than history" : p.gap < 0 ? " — registered HIGHER than history" : " — consistent"]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                textAlign: "right",
                flexShrink: 0
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontFamily: "'Fraunces',serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: grp.col
                },
                children: p.riskScore
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#aaa"
                },
                children: "risk score"
              })]
            })]
          }, p.id))]
        }, grp.label)), risks.every(p => p.riskScore === 0) && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            padding: "48px 24px",
            textAlign: "center"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: 28,
              marginBottom: 8
            },
            children: "\u2705"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 16,
              fontWeight: 700,
              color: "#166534",
              margin: 0
            },
            children: "All players consistent with historical tiers"
          })]
        })]
      })]
    })
  });
}

// ─── WOW 3: Season diff mode ──────────────────────────────────────────────────
function SeasonDiff({
  players,
  onClose
}) {
  const allYears = (0, _react.useMemo)(() => {
    const s = new Set();
    players.forEach(p => p.history.forEach(h => s.add(h.season)));
    return [...s].sort((a, b) => b - a);
  }, [players]);
  const [yr1, setYr1] = (0, _react.useState)(allYears[1] || allYears[0]);
  const [yr2, setYr2] = (0, _react.useState)(allYears[0]);
  const s1 = new Set(players.filter(p => p.history.some(h => +h.season === +yr1)).map(p => p.email));
  const s2 = new Set(players.filter(p => p.history.some(h => +h.season === +yr2)).map(p => p.email));
  const joined = players.filter(p => s2.has(p.email) && !s1.has(p.email));
  const left = players.filter(p => s1.has(p.email) && !s2.has(p.email));
  const both = players.filter(p => s1.has(p.email) && s2.has(p.email));
  const selS = {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    background: "rgba(255,255,255,.1)",
    border: "1px solid rgba(255,255,255,.2)",
    borderRadius: 6,
    color: "#fff",
    padding: "5px 10px",
    outline: "none"
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 680,
        width: "100%",
        maxHeight: "85vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "18px 22px 14px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#D4A017",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 3
            },
            children: "Season Comparison"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 17,
              fontWeight: 700,
              color: "#fff",
              margin: 0
            },
            children: "Season diff view"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
            value: yr1,
            onChange: e => setYr1(+e.target.value),
            style: selS,
            children: allYears.map(y => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: y,
              children: y
            }, y))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "rgba(255,255,255,.4)"
            },
            children: "vs"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("select", {
            value: yr2,
            onChange: e => setYr2(+e.target.value),
            style: selS,
            children: allYears.map(y => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
              value: y,
              children: y
            }, y))
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            onClick: onClose,
            style: {
              background: "none",
              border: "none",
              color: "#D4A017",
              fontSize: 16,
              cursor: "pointer"
            },
            children: "\u2715"
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "1fr 1fr 2fr",
          overflowY: "auto",
          flex: 1
        },
        children: [{
          label: `Joined in ${yr2}`,
          subtitle: `New to ${yr2}`,
          items: joined,
          bg: "#F0FDF4",
          col: "#166534"
        }, {
          label: `Left after ${yr1}`,
          subtitle: `Not in ${yr2}`,
          items: left,
          bg: "#FEF2F2",
          col: "#991B1B"
        }, {
          label: "Played both seasons",
          subtitle: `${both.length} returning players`,
          items: both,
          bg: "#fff",
          col: "#1a1a2e"
        }].map(col => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            borderRight: "1px solid #F0EEE8",
            background: col.bg
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              padding: "10px 14px",
              borderBottom: "1px solid #E8E6DF"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 13,
                fontWeight: 700,
                color: col.col
              },
              children: col.label
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#aaa"
              },
              children: col.subtitle
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              padding: "8px 14px",
              maxHeight: 380,
              overflowY: "auto"
            },
            children: col.items.length === 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#ccc",
                textAlign: "center",
                padding: "24px 0"
              },
              children: "None"
            }) : col.items.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid rgba(0,0,0,.04)"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
                player: p,
                size: 22
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: "'Fraunces',serif",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#1a1a2e"
                  },
                  children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    color: "#aaa"
                  },
                  children: [p.skill_tier_reported, col.items === both && (() => {
                    const h1 = p.history.find(h => +h.season === +yr1);
                    const h2 = p.history.find(h => +h.season === +yr2);
                    if (!h1 || !h2) return "";
                    const delta = TIER_VAL(h2.skill_tier) - TIER_VAL(h1.skill_tier);
                    return delta < 0 ? " ↑ tier improved" : delta > 0 ? " ↓ tier declined" : "";
                  })()]
                })]
              })]
            }, p.id))
          })]
        }, col.label))
      })]
    })
  });
}

// ─── WOW 7: Cohort retention ──────────────────────────────────────────────────
function CohortChart({
  players,
  onClose
}) {
  const allYears = (0, _react.useMemo)(() => {
    const s = new Set();
    players.forEach(p => p.history.forEach(h => s.add(+h.season)));
    return [...s].sort();
  }, [players]);
  const cohorts = (0, _react.useMemo)(() => {
    return allYears.map(yr => {
      const firstTimers = players.filter(p => {
        const hs = [...p.history].sort((a, b) => a.season - b.season);
        return hs[0] && +hs[0].season === yr;
      });
      const retention = allYears.filter(y => y > yr).map(y => ({
        year: y,
        n: firstTimers.filter(p => p.history.some(h => +h.season === y)).length,
        pct: firstTimers.length > 0 ? Math.round(firstTimers.filter(p => p.history.some(h => +h.season === y)).length / firstTimers.length * 100) : 0
      }));
      return {
        year: yr,
        n: firstTimers.length,
        retention
      };
    });
  }, [players, allYears]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 640,
        width: "100%",
        maxHeight: "80vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "18px 22px 14px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#D4A017",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 3
            },
            children: "Cohort Analysis"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 17,
              fontWeight: 700,
              color: "#fff",
              margin: 0
            },
            children: "Player retention by cohort"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          style: {
            background: "none",
            border: "none",
            color: "#D4A017",
            fontSize: 16,
            cursor: "pointer"
          },
          children: "\u2715"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          overflowY: "auto",
          flex: 1,
          padding: "16px 22px"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#888",
            marginBottom: 16
          },
          children: "Each row shows a first-year cohort and how many returned in subsequent seasons."
        }), cohorts.map(c => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 16,
            background: "#FAFAF8",
            borderRadius: 10,
            padding: "12px 16px"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 15,
                fontWeight: 700,
                color: "#1a1a2e"
              },
              children: [c.year, " cohort"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#aaa"
              },
              children: [c.n, " first-time players"]
            })]
          }), c.retention.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#aaa"
            },
            children: "No subsequent seasons to show yet"
          }), c.retention.map(r => {
            const col = r.pct >= 70 ? "#166534" : r.pct >= 50 ? "#92400E" : "#991B1B";
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 5
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#888",
                  minWidth: 36
                },
                children: r.year
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  flex: 1,
                  height: 5,
                  background: "#E8E6DF",
                  borderRadius: 99,
                  overflow: "hidden"
                },
                children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                  style: {
                    height: "100%",
                    width: `${r.pct}%`,
                    background: col,
                    borderRadius: 99,
                    transition: "width .8s ease"
                  }
                })
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: col,
                  minWidth: 36
                },
                children: [r.pct, "%"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#aaa"
                },
                children: [r.n, "/", c.n]
              })]
            }, r.year);
          })]
        }, c.year))]
      })]
    })
  });
}

// ─── WOW 9: Where Are They Now (real registrations for the current season) ───
const csvCell = c => `"${String(c ?? "").replace(/"/g, '""')}"`;
function WhereAreTheyNow({
  players,
  registeredIds,
  year,
  onClose
}) {
  const known = registeredIds instanceof Set;
  const registered = known ? players.filter(p => registeredIds.has(p.id)) : [];
  const notReturned = known ? players.filter(p => !registeredIds.has(p.id)).sort((a, b) => (b.history[0]?.season || 0) - (a.history[0]?.season || 0)) : [];
  const pct = players.length > 0 ? Math.round(registered.length / players.length * 100) : null;
  const exportList = () => {
    const rows = [["Last", "First", "Email", "Last season", "Last division"], ...notReturned.map(p => [titleCase(p.last_name), titleCase(p.first_name), p.email, p.history[0]?.season || "", DIVISION_LABEL[p.history[0]?.division] || ""])];
    const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join("\n")], {
      type: "text/csv"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grsh-not-yet-registered-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Where are they now",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 600,
        width: "100%",
        maxHeight: "85vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "18px 22px 14px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#D4A017",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 3
            },
            children: [year, " registrations"]
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              margin: 0
            },
            children: "Where are they now?"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "rgba(255,255,255,.6)",
              marginTop: 3
            },
            children: !known ? "Registration data could not be loaded." : pct === null ? "No players on record yet." : `${registered.length} of ${players.length} history players have registered for ${year} (${pct}%)`
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          "aria-label": "Close",
          style: {
            background: "none",
            border: "none",
            color: "#D4A017",
            fontSize: 18,
            cursor: "pointer"
          },
          children: "\u2715"
        })]
      }), !known ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: 24,
          fontSize: 14,
          color: "#991B1B"
        },
        children: ["The list of ", year, " registrations did not load, so nobody can be matched. Close this and use Reload on the page."]
      }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          overflowY: "auto",
          flex: 1
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            padding: "12px 22px",
            background: "#E6F4EA",
            borderBottom: "1px solid #86EFAC"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 12,
              color: "#166534",
              fontWeight: 600,
              marginBottom: 8
            },
            children: ["\u2713 Registered for ", year, " (", registered.length, ")"]
          }), registered.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontSize: 13,
              color: "#166534"
            },
            children: "Nobody yet."
          }), registered.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
              player: p,
              size: 24
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#1a1a2e"
              },
              children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#6b6b7b"
              },
              children: ["\xB7 last played ", p.history[0]?.season]
            })]
          }, p.id))]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            padding: "12px 22px"
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#991B1B",
                fontWeight: 600
              },
              children: ["\u2717 Not yet registered (", notReturned.length, ")"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                gap: 6
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
                href: adminUrl("grsh-tm-players"),
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  background: "#F6F5F0",
                  color: "#1a1a2e",
                  border: "1px solid #E8E6DF",
                  padding: "5px 12px",
                  borderRadius: 6,
                  textDecoration: "none"
                },
                children: "Send invites (Players \u2192 Renewals)"
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: exportList,
                disabled: !notReturned.length,
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  background: "#1a1a2e",
                  color: "#D4A017",
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: notReturned.length ? "pointer" : "default",
                  opacity: notReturned.length ? 1 : .5
                },
                children: "\u2193 Export contact list"
              })]
            })]
          }), notReturned.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 0",
              borderBottom: "1px solid #F9F8F4"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
              player: p,
              size: 24
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'Fraunces',serif",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#444"
                },
                children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#6b6b7b",
                  marginLeft: 6
                },
                children: ["last played ", p.history[0]?.season, " \xB7 ", DIVISION_LABEL[p.history[0]?.division] || "no division", p.email ? "" : " · no email"]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: (p.history[0]?.season || 0) >= year - 2 ? "#166534" : (p.history[0]?.season || 0) >= year - 4 ? "#92400E" : "#6b6b7b"
              },
              children: (p.history[0]?.season || 0) >= year - 2 ? "Recent" : "Inactive"
            })]
          }, p.id))]
        })]
      })]
    })
  });
}

// ─── WOW 10: Season story modal ───────────────────────────────────────────────
function SeasonStory({
  players,
  season,
  onClose
}) {
  const sp = players.filter(p => p.history.some(h => +h.season === +season));
  const champs = sp.filter(p => p.history.some(h => +h.season === +season && h.championship === "winner"));
  const newPlayers = sp.filter(p => {
    const sorted = [...p.history].sort((a, b) => a.season - b.season);
    return +sorted[0]?.season === +season;
  });
  const divGroups = {};
  sp.forEach(p => {
    const h = p.history.find(hh => +hh.season === +season);
    if (h) {
      (divGroups[h.division] = divGroups[h.division] || []).push(p);
    }
  });
  const mostSeasoned = sp.slice().sort((a, b) => b.history.length - a.history.length)[0];
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 600,
        width: "100%",
        maxHeight: "85vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "20px 24px 16px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#D4A017",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 3
            },
            children: "Season story"
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("h2", {
            style: {
              fontFamily: "'Fraunces',serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: 0
            },
            children: ["Gold Rush ", season]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          style: {
            background: "none",
            border: "none",
            color: "#D4A017",
            fontSize: 16,
            cursor: "pointer"
          },
          children: "\u2715"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          overflowY: "auto",
          flex: 1,
          padding: "20px 24px"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 12,
            color: "#555",
            lineHeight: 1.8,
            marginBottom: 20
          },
          children: ["The ", season, " Gold Rush tournament brought together ", /*#__PURE__*/(0, _jsxRuntime.jsxs)("strong", {
            style: {
              color: "#1a1a2e"
            },
            children: [sp.length, " players"]
          }), " across", " ", Object.keys(divGroups).length, " divisions \u2014 ", newPlayers.length, " of them playing in their first ever Gold Rush season.", champs.length > 0 && ` The championship was claimed by ${champs.map(p => `${titleCase(p.first_name)} ${titleCase(p.last_name)}`).slice(0, 3).join(", ")}.`, mostSeasoned && ` ${titleCase(mostSeasoned.first_name)} ${titleCase(mostSeasoned.last_name)} was the most experienced player with ${mostSeasoned.history.length} seasons on record.`]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 20
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#aaa",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 10
            },
            children: "Division breakdown"
          }), Object.entries(divGroups).map(([div, ps]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: DIVISION_HUE[div] || "#1a1a2e",
                flexShrink: 0
              }
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#555",
                minWidth: 80
              },
              children: DIVISION_LABEL[div] || div
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                flex: 1,
                height: 5,
                background: "#F0EEE8",
                borderRadius: 99,
                overflow: "hidden"
              },
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  height: "100%",
                  width: `${Math.round(ps.length / sp.length * 100)}%`,
                  background: DIVISION_HUE[div] || "#1a1a2e",
                  borderRadius: 99
                }
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#888"
              },
              children: [ps.length, " players"]
            })]
          }, div))]
        }), champs.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 16
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#92400E",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 8
            },
            children: "\uD83C\uDFC6 Champions"
          }), champs.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
              player: p,
              size: 24
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 12,
                fontWeight: 600,
                color: "#1a1a2e"
              },
              children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#aaa"
              },
              children: ["\xB7 ", DIVISION_LABEL[p.history.find(h => +h.season === +season)?.division] || "", p.history.find(h => +h.season === +season)?.was_captain ? " · Captain" : ""]
            })]
          }, p.id))]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            marginBottom: 8
          },
          children: ["\uD83C\uDD95 First-season players (", newPlayers.length, ")"]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: 6
          },
          children: newPlayers.map(p => /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              background: "#F6F5F0",
              color: "#555",
              padding: "2px 10px",
              borderRadius: 99
            },
            children: [titleCase(p.first_name), " ", titleCase(p.last_name)]
          }, p.id))
        })]
      })]
    })
  });
}

// ─── Needs review: data gaps, possible duplicates, big tier moves ───────────────
const GAP_FILTER_LABEL = {
  no_tier: "No skill tier",
  no_division: "No division",
  no_games: "No attendance recorded",
  no_team: "No team",
  no_email: "No email"
};
function NeedsReview({
  overview,
  overviewErr,
  players,
  startTab,
  onClose,
  onShowGap,
  onOpenPlayer,
  onMerge,
  onDismiss,
  busyKey
}) {
  const [tab, setTab] = (0, _react.useState)(startTab || "gaps");
  const [confirm, setConfirm] = (0, _react.useState)(null); // {key, keepId}
  const moves = (0, _react.useMemo)(() => tierMoves(players), [players]);
  const dupes = overview && overview.duplicates || [];
  const quality = overview && overview.quality || [];
  const gapTotal = quality.reduce((s, q) => s + (q.count || 0), 0);
  const tabBtn = (k, l, n) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
    role: "tab",
    "aria-selected": tab === k,
    onClick: () => {
      setTab(k);
      setConfirm(null);
    },
    style: {
      fontFamily: "'DM Mono',monospace",
      fontSize: 12,
      padding: "8px 14px",
      border: "none",
      borderBottom: `3px solid ${tab === k ? "#D4A017" : "transparent"}`,
      background: "none",
      color: tab === k ? "#1a1a2e" : "#6b6b7b",
      fontWeight: tab === k ? 700 : 500,
      cursor: "pointer"
    },
    children: [l, " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      style: {
        background: n > 0 ? "#FEF3C7" : "#E6F4EA",
        color: n > 0 ? "#92400E" : "#166534",
        borderRadius: 99,
        padding: "1px 8px",
        marginLeft: 4
      },
      children: n
    })]
  }, k);
  const pname = p => `${titleCase(p.first_name)} ${titleCase(p.last_name)}`;
  const btn = {
    fontFamily: "'DM Mono',monospace",
    fontSize: 12,
    background: "#F6F5F0",
    border: "1px solid #E8E6DF",
    color: "#1a1a2e",
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer"
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Needs review",
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.5)",
      zIndex: 2000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        background: "#fff",
        borderRadius: 14,
        maxWidth: 720,
        width: "100%",
        maxHeight: "88vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,.25)"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "16px 22px",
          background: "#1a1a2e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("h2", {
          style: {
            fontFamily: "'Fraunces',serif",
            fontSize: 18,
            fontWeight: 700,
            color: "#fff",
            margin: 0
          },
          children: "Needs review"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
          onClick: onClose,
          "aria-label": "Close",
          style: {
            background: "none",
            border: "none",
            color: "#D4A017",
            fontSize: 18,
            cursor: "pointer"
          },
          children: "\u2715"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        role: "tablist",
        style: {
          display: "flex",
          borderBottom: "1px solid #E8E6DF",
          padding: "0 12px"
        },
        children: [tabBtn("gaps", "Missing data", gapTotal), tabBtn("dupes", "Possible duplicates", dupes.length), tabBtn("moves", "Big tier moves", moves.length)]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          overflowY: "auto",
          flex: 1,
          padding: "14px 22px 20px"
        },
        children: [overviewErr && tab !== "moves" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          role: "alert",
          style: {
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13
          },
          children: ["The data checks could not load: ", overviewErr]
        }), tab === "gaps" && overview && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              fontSize: 13,
              color: "#555",
              margin: "0 0 12px"
            },
            children: "Dashes on this page usually mean \"never recorded\", not \"none\". These counts show where that is happening."
          }), quality.map(q => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom: "1px solid #F3F2ED"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 20,
                fontWeight: 700,
                minWidth: 44,
                color: q.count > 0 ? "#92400E" : "#166534"
              },
              children: q.count
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontSize: 14,
                  fontWeight: 600
                },
                children: q.label
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontSize: 12,
                  color: "#6b6b7b"
                },
                children: q.hint
              })]
            }), q.count > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn,
              onClick: () => onShowGap(q.key),
              children: "Show players"
            })]
          }, q.key))]
        }), tab === "dupes" && overview && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              fontSize: 13,
              color: "#555",
              margin: "0 0 12px"
            },
            children: "Two records with the same season are two different people, so those are never listed. Merging moves all history onto the record you keep and removes the other. Check before you confirm."
          }), dupes.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              padding: 16,
              color: "#166534",
              fontSize: 14
            },
            children: "No likely duplicates."
          }), dupes.map(d => {
            const key = d.a.id + "-" + d.b.id;
            return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                border: "1px solid #E8E6DF",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 10
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontSize: 12,
                  color: "#92400E",
                  marginBottom: 6
                },
                children: d.why
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12
                },
                children: [d.a, d.b].map(x => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                    style: {
                      fontWeight: 600,
                      fontSize: 14
                    },
                    children: x.name
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                    style: {
                      fontSize: 12,
                      color: "#6b6b7b"
                    },
                    children: x.email || "no email"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                    style: {
                      fontSize: 12,
                      color: "#6b6b7b"
                    },
                    children: ["Seasons: ", x.seasons.slice().sort().join(", ") || "none"]
                  })]
                }, x.id))
              }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  flexWrap: "wrap"
                },
                children: confirm && confirm.key === key ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                    style: {
                      fontSize: 13,
                      alignSelf: "center"
                    },
                    children: ["Keep ", /*#__PURE__*/(0, _jsxRuntime.jsx)("b", {
                      children: (confirm.keepId === d.a.id ? d.a : d.b).name
                    }), " and remove the other?"]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    style: {
                      ...btn,
                      background: "#1a1a2e",
                      color: "#D4A017"
                    },
                    disabled: busyKey === key,
                    onClick: () => {
                      onMerge(d, confirm.keepId);
                      setConfirm(null);
                    },
                    children: "Yes, merge"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    style: btn,
                    onClick: () => setConfirm(null),
                    children: "Cancel"
                  })]
                }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                    style: btn,
                    disabled: busyKey === key,
                    onClick: () => setConfirm({
                      key,
                      keepId: d.a.id
                    }),
                    children: ["Keep ", d.a.name.split(" ")[0], "'s record"]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                    style: btn,
                    disabled: busyKey === key,
                    onClick: () => setConfirm({
                      key,
                      keepId: d.b.id
                    }),
                    children: ["Keep ", d.b.name.split(" ")[0], "'s record"]
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    style: btn,
                    disabled: busyKey === key,
                    onClick: () => onDismiss(d),
                    children: "Not the same person"
                  })]
                })
              })]
            }, key);
          })]
        }), tab === "moves" && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
            style: {
              fontSize: 13,
              color: "#555",
              margin: "0 0 12px"
            },
            children: "A skill tier that changed by 3 or more steps between two seasons in a row (for example B2 to A2). Often real, sometimes a typing mistake. Worth a look before the draft."
          }), moves.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              padding: 16,
              color: "#166534",
              fontSize: 14
            },
            children: "No big tier moves."
          }), moves.map((m, i) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 0",
              borderBottom: "1px solid #F3F2ED"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontWeight: 600,
                  fontSize: 14
                },
                children: pname(m.player)
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontSize: 12,
                  color: "#6b6b7b"
                },
                children: [m.from.season, ": ", m.from.skill_tier, " \u2192 ", m.to.season, ": ", m.to.skill_tier]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontSize: 12,
                fontWeight: 700,
                color: m.better ? "#166534" : "#991B1B"
              },
              children: [m.better ? "↑" : "↓", " ", m.steps, " steps"]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              style: btn,
              onClick: () => onOpenPlayer(m.player),
              children: "Open"
            })]
          }, m.player.id + "-" + i))]
        })]
      })]
    })
  });
}

// ─── Fix-in-place editors (drawer) ─────────────────────────────────────────────
const inp = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 12,
  border: "1px solid #D8D6CE",
  borderRadius: 6,
  padding: "5px 8px",
  background: "#fff",
  color: "#222",
  minWidth: 0
};
const lab = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 11,
  color: "#6b6b7b",
  display: "flex",
  flexDirection: "column",
  gap: 3
};
function RowEditor({
  h,
  onDone,
  onToast
}) {
  const init = {
    skill_tier_reported: h.skill_tier || "",
    division_played: h.division || "",
    team_name: h.team || "",
    championship_result: h.championship || "none",
    games_scheduled: h.games_scheduled === null ? "" : String(h.games_scheduled),
    games_attended: h.games_attended === null ? "" : String(h.games_attended),
    no_show_count: String(h.no_show || 0),
    sandbagging_flag: !!h.sandbagging_flag,
    committee_notes: h.notes || ""
  };
  const [f, setF] = (0, _react.useState)(init);
  const [busy, setBusy] = (0, _react.useState)(false);
  const [err, setErr] = (0, _react.useState)("");
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const save = async () => {
    if (busy) return;
    const changed = {};
    Object.keys(f).forEach(k => {
      if (f[k] !== init[k]) changed[k] = f[k];
    });
    if (!Object.keys(changed).length) {
      setErr("Nothing changed.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await apiCall(`/history/records/${h.row_id}`, {
      method: "POST",
      body: JSON.stringify(changed)
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    onToast("✓ Saved " + h.season);
    onDone(true);
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      background: "#FAFAF8",
      border: "1px solid #E8E6DF",
      borderRadius: 8,
      padding: 12,
      marginTop: 8
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Skill tier", /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: f.skill_tier_reported,
          onChange: e => set("skill_tier_reported", e.target.value),
          style: inp,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "",
            children: "Not recorded"
          }), TIER_ORDER.map(t => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: t,
            children: t
          }, t))]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Division", /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: f.division_played,
          onChange: e => set("division_played", e.target.value),
          style: inp,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "",
            children: "Not recorded"
          }), DIVISION_KEYS.map(d => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: d,
            children: DIVISION_LABEL[d]
          }, d))]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Team", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          value: f.team_name,
          maxLength: 100,
          onChange: e => set("team_name", e.target.value),
          style: inp
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Result", /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
          value: f.championship_result,
          onChange: e => set("championship_result", e.target.value),
          style: inp,
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "none",
            children: "None"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "participant",
            children: "Participant"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "runner_up",
            children: "Runner-up"
          }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: "winner",
            children: "Champion"
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Games scheduled", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          inputMode: "numeric",
          value: f.games_scheduled,
          onChange: e => set("games_scheduled", e.target.value),
          style: inp,
          placeholder: "not recorded"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Games attended", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          inputMode: "numeric",
          value: f.games_attended,
          onChange: e => set("games_attended", e.target.value),
          style: inp,
          placeholder: "not recorded"
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["No-shows", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          inputMode: "numeric",
          value: f.no_show_count,
          onChange: e => set("no_show_count", e.target.value),
          style: inp
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: {
          ...lab,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingTop: 16
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          type: "checkbox",
          checked: f.sandbagging_flag,
          onChange: e => set("sandbagging_flag", e.target.checked)
        }), "Sandbagging flag"]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      style: {
        ...lab,
        marginTop: 8
      },
      children: ["Committee notes", /*#__PURE__*/(0, _jsxRuntime.jsx)("textarea", {
        rows: 2,
        maxLength: 2000,
        value: f.committee_notes,
        onChange: e => set("committee_notes", e.target.value),
        style: {
          ...inp,
          resize: "vertical"
        }
      })]
    }), err && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "alert",
      style: {
        color: "#991B1B",
        fontSize: 12,
        marginTop: 6
      },
      children: err
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 8,
        marginTop: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: save,
        disabled: busy,
        style: {
          ...inp,
          background: "#1a1a2e",
          color: "#D4A017",
          border: "none",
          cursor: "pointer",
          padding: "6px 14px"
        },
        children: busy ? "Saving…" : "Save"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: () => onDone(false),
        style: {
          ...inp,
          cursor: "pointer",
          padding: "6px 14px"
        },
        children: "Cancel"
      })]
    })]
  });
}
function PlayerEditor({
  player,
  onDone,
  onToast
}) {
  const init = {
    first_name: player.first_name || "",
    last_name: player.last_name || "",
    email: player.email || ""
  };
  const [f, setF] = (0, _react.useState)(init);
  const [busy, setBusy] = (0, _react.useState)(false);
  const [err, setErr] = (0, _react.useState)("");
  const save = async () => {
    if (busy) return;
    const changed = {};
    Object.keys(f).forEach(k => {
      if (f[k].trim() !== init[k]) changed[k] = f[k].trim();
    });
    if (!Object.keys(changed).length) {
      setErr("Nothing changed.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await apiCall(`/history/players/${player.id}`, {
      method: "POST",
      body: JSON.stringify(changed)
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    onToast("✓ Player saved");
    onDone(true);
  };
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      background: "#FAFAF8",
      border: "1px solid #E8E6DF",
      borderRadius: 8,
      padding: 12,
      margin: "10px 18px"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["First name", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          value: f.first_name,
          onChange: e => setF({
            ...f,
            first_name: e.target.value
          }),
          style: inp
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
        style: lab,
        children: ["Last name", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
          value: f.last_name,
          onChange: e => setF({
            ...f,
            last_name: e.target.value
          }),
          style: inp
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
      style: {
        ...lab,
        marginTop: 8
      },
      children: ["Email", /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
        type: "email",
        value: f.email,
        onChange: e => setF({
          ...f,
          email: e.target.value
        }),
        style: inp
      })]
    }), err && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      role: "alert",
      style: {
        color: "#991B1B",
        fontSize: 12,
        marginTop: 6
      },
      children: err
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        display: "flex",
        gap: 8,
        marginTop: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: save,
        disabled: busy,
        style: {
          ...inp,
          background: "#1a1a2e",
          color: "#D4A017",
          border: "none",
          cursor: "pointer",
          padding: "6px 14px"
        },
        children: busy ? "Saving…" : "Save"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: () => onDone(false),
        style: {
          ...inp,
          cursor: "pointer",
          padding: "6px 14px"
        },
        children: "Cancel"
      })]
    })]
  });
}

// ─── History Panel (right drawer) ─────────────────────────────────────────────
function HistoryPanel({
  player,
  onClose,
  onSaved,
  onToast
}) {
  const [editRow, setEditRow] = (0, _react.useState)(null);
  const [editPlayer, setEditPlayer] = (0, _react.useState)(false);
  const name = `${titleCase(player.first_name)} ${titleCase(player.last_name)}`;
  const champs = player.history.filter(h => h.championship === "winner");
  const caps = player.history.filter(h => h.was_captain);
  const divisions = [...new Set(player.history.map(h => h.division))];
  const trend = tierTrend(player.history);
  const trendInfo = TREND[trend];
  const lastSeason = player.history[0]?.season;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 32px)"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        padding: "14px 18px",
        borderBottom: "1px solid #F0EEE8",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
        player: player,
        size: 36
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          flex: 1,
          minWidth: 0
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: "'Fraunces',serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap"
          },
          children: [name, champs.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: 11
            },
            children: "\uD83C\uDFC6"
          }), player.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: 11,
              color: "#EF4444"
            },
            children: "\u26A0"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: player.email ? "#aaa" : "#991B1B",
            marginTop: 1
          },
          children: [player.email || "No email on record", " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            onClick: () => setEditPlayer(e => !e),
            style: {
              background: "none",
              border: "none",
              color: "#1a1a2e",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 11,
              padding: 0
            },
            children: "Edit"
          })]
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          textAlign: "right",
          flexShrink: 0
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#aaa",
            textTransform: "uppercase"
          },
          children: "Last active"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontFamily: "'Fraunces',serif",
            fontSize: 13,
            fontWeight: 700,
            color: lastSeason >= new Date().getFullYear() - 2 ? "#166534" : lastSeason >= new Date().getFullYear() - 4 ? "#92400E" : "#6b6b7b"
          },
          children: lastSeason
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: onClose,
        style: {
          background: "none",
          border: "none",
          fontSize: 14,
          color: "#aaa",
          cursor: "pointer"
        },
        children: "\u2715"
      })]
    }), player.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 11,
        background: "#FFFBEB",
        borderBottom: "1px solid #FDE68A",
        color: "#92400E",
        padding: "7px 18px",
        fontWeight: 500
      },
      children: "\u26A0 Sandbagging review \u2014 historical tier exceeds self-reported. Committee action required."
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        flex: 1,
        overflowY: "auto",
        minHeight: 0
      },
      children: [editPlayer && /*#__PURE__*/(0, _jsxRuntime.jsx)(PlayerEditor, {
        player: player,
        onToast: onToast,
        onDone: saved => {
          setEditPlayer(false);
          if (saved) onSaved();
        }
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)(CareerTimeline, {
        player: player
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "14px 18px",
          borderBottom: "1px solid #F0EEE8"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            marginBottom: 10
          },
          children: "Career summary"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 10
          },
          children: [["Seasons", player.history.length], ["Championships", champs.length], ["Captaincies", caps.length], ["Attendance", player.attendance_rating != null ? `${player.attendance_rating}%` : "—"], ["No-shows", player.games_recorded ? player.no_show_count : "n/a"], ["Tier trend", trend === "unknown" ? "—" : trendInfo.arrow + " " + trendInfo.label]].map(([k, v]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              textAlign: "center",
              background: "#F6F5F0",
              borderRadius: 8,
              padding: "8px"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a2e"
              },
              children: v
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#aaa",
                textTransform: "uppercase",
                marginTop: 2
              },
              children: k
            })]
          }, k))
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "14px 18px",
          borderBottom: "1px solid #F0EEE8"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            marginBottom: 10
          },
          children: "Season by season"
        }), player.history.map(h => {
          const dc = DIVISION_COLOR[h.division] || {};
          const tc = TIER_COLOR(h.skill_tier);
          const isChamp = h.championship === "winner";
          const attOk = h.games_scheduled > 0 ? Math.round((h.games_attended || 0) / h.games_scheduled * 100) : null;
          return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 0",
              borderBottom: "1px solid #F9F8F4"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                width: 38,
                textAlign: "center",
                flexShrink: 0
              },
              children: /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                style: {
                  fontFamily: "'Fraunces',serif",
                  fontSize: 14,
                  fontWeight: 700,
                  color: h.season === player.history[0]?.season ? "#1a1a2e" : "#aaa"
                },
                children: h.season
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 4
                },
                children: [dc.bg ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    background: dc.bg,
                    color: dc.color,
                    padding: "1px 6px",
                    borderRadius: 99,
                    border: `1px solid ${dc.border || dc.bg}`
                  },
                  children: DIVISION_LABEL[h.division] || h.division
                }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    color: "#991B1B",
                    border: "1px dashed #FCA5A5",
                    padding: "1px 6px",
                    borderRadius: 99
                  },
                  children: "No division"
                }), h.skill_tier ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    fontWeight: 500,
                    background: tc.bg,
                    color: tc.color,
                    padding: "1px 5px",
                    borderRadius: 99
                  },
                  children: h.skill_tier
                }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    color: "#991B1B",
                    border: "1px dashed #FCA5A5",
                    padding: "1px 6px",
                    borderRadius: 99
                  },
                  children: "No tier"
                }), isChamp && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontSize: 11
                  },
                  children: "\uD83C\uDFC6"
                }), h.was_captain && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    background: "#EDE9FE",
                    color: "#4C1D95",
                    padding: "1px 5px",
                    borderRadius: 99
                  },
                  children: "\xA9 Captain"
                }), h.was_alternate && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    background: "#F3F4F6",
                    color: "#888",
                    padding: "1px 5px",
                    borderRadius: 99
                  },
                  children: "Sub"
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#aaa"
                },
                children: [h.team || "No team recorded", attOk != null ? ` · ${attOk}% attendance` : " · attendance not recorded", h.no_show > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  style: {
                    color: "#92400E"
                  },
                  children: [" \xB7 ", h.no_show, " no-show"]
                }), " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  onClick: () => setEditRow(editRow === h.row_id ? null : h.row_id),
                  style: {
                    background: "none",
                    border: "none",
                    color: "#1a1a2e",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0
                  },
                  children: editRow === h.row_id ? "Close" : "Edit"
                })]
              }), editRow === h.row_id && /*#__PURE__*/(0, _jsxRuntime.jsx)(RowEditor, {
                h: h,
                onToast: onToast,
                onDone: saved => {
                  setEditRow(null);
                  if (saved) onSaved();
                }
              })]
            })]
          }, h.row_id || h.season);
        })]
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          padding: "12px 18px",
          borderBottom: "1px solid #F0EEE8"
        },
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
          href: `/wp-admin/admin.php?page=grsh-tm-players`,
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#1a1a2e",
            textDecoration: "underline"
          },
          children: "Open the Players page \u2192"
        })
      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          padding: "14px 18px"
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 11,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            marginBottom: 8
          },
          children: "All divisions played"
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            display: "flex",
            gap: 5,
            flexWrap: "wrap"
          },
          children: divisions.map(d => {
            const dc = DIVISION_COLOR[d] || {};
            return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                fontWeight: 500,
                background: dc.bg || "#F6F5F0",
                color: dc.color || "#555",
                border: `1px solid ${dc.border || "#E8E6DF"}`,
                padding: "2px 8px",
                borderRadius: 99
              },
              children: DIVISION_LABEL[d] || d
            }, d);
          })
        })]
      })]
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      style: {
        padding: "12px 18px",
        borderTop: "1px solid #F0EEE8",
        display: "flex",
        gap: 8,
        flexShrink: 0
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: () => generateCareerCard(player),
        style: {
          flex: 1,
          fontFamily: "'DM Mono',monospace",
          fontSize: 11,
          background: "#F6F5F0",
          border: "1px solid #E8E6DF",
          color: "#555",
          padding: "8px",
          borderRadius: 8,
          cursor: "pointer"
        },
        children: "\uD83D\uDCC4 Career card"
      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
        onClick: onClose,
        style: {
          flex: 2,
          fontFamily: "'DM Mono',monospace",
          fontSize: 12,
          fontWeight: 500,
          background: "#1a1a2e",
          color: "#D4A017",
          border: "none",
          padding: "8px",
          borderRadius: 8,
          cursor: "pointer"
        },
        children: "Close"
      })]
    })]
  });
}

// ─── Main History component ────────────────────────────────────────────────────
function History() {
  const [players, setPlayers] = (0, _react.useState)([]); // real records only; never sample data
  const [loadState, setLoadState] = (0, _react.useState)("loading");
  const [search, setSearch] = (0, _react.useState)(() => {
    try {
      return new URLSearchParams(window.location.search).get("search") || "";
    } catch (e) {
      return "";
    }
  });
  const [filterDiv, setFilterDiv] = (0, _react.useState)("");
  const [filterSeason, setFilterSeason] = (0, _react.useState)("");
  const [filterReliability, setFilterReliability] = (0, _react.useState)("");
  const [filterWarn, setFilterWarn] = (0, _react.useState)(false);
  const [filterChamps, setFilterChamps] = (0, _react.useState)(false);
  const [filterNoShow, setFilterNoShow] = (0, _react.useState)(false);
  const [filterRecent, setFilterRecent] = (0, _react.useState)(false); // #15
  const [selectedId, setSelectedId] = (0, _react.useState)(null);
  const [loadError, setLoadError] = (0, _react.useState)("");
  const [loadInfo, setLoadInfo] = (0, _react.useState)({
    rows: 0,
    total: 0,
    skipped: 0,
    complete: true
  });
  const [overview, setOverview] = (0, _react.useState)(null); // /history/overview: data checks, last import, registrations, duplicates
  const [overviewErr, setOverviewErr] = (0, _react.useState)("");
  const [filterMissing, setFilterMissing] = (0, _react.useState)("");
  const [showReview, setShowReview] = (0, _react.useState)(null); // null | "gaps" | "dupes" | "moves"
  const [showTools, setShowTools] = (0, _react.useState)(false);
  const [busyKey, setBusyKey] = (0, _react.useState)("");
  const [sortKey, setSortKey] = (0, _react.useState)("last_name");
  const [sortDir, setSortDir] = (0, _react.useState)("asc");
  const [hoveredRow, setHoveredRow] = (0, _react.useState)(null);
  const [showFilters, setShowFilters] = (0, _react.useState)(true); // #8 collapsible
  const [showCols, setShowCols] = (0, _react.useState)(false); // #10 column toggle
  const [visibleCols, setVisibleCols] = (0, _react.useState)(["player", "seasons", "divisions", "tier", "attendance", "flags"]); // championships hidden by default #3
  const [showPredictor, setShowPredictor] = (0, _react.useState)(false); // WOW 5
  const [showDiff, setShowDiff] = (0, _react.useState)(false); // WOW 3
  const [showCohort, setShowCohort] = (0, _react.useState)(false); // WOW 7
  const [showWhere, setShowWhere] = (0, _react.useState)(false); // WOW 9
  const [showStory, setShowStory] = (0, _react.useState)(null); // WOW 10
  const [toast, setToast] = (0, _react.useState)(null);
  const colRef = (0, _react.useRef)(null); // click-outside for column toggle
  const toolsRef = (0, _react.useRef)(null);
  const loadingRef = (0, _react.useRef)(false);
  const selected = (0, _react.useMemo)(() => players.find(p => p.id === selectedId) || null, [players, selectedId]);
  const setSelected = p => setSelectedId(p ? p.id : null);
  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Click-outside closes column toggle dropdown
  (0, _react.useEffect)(() => {
    const h = e => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowCols(false);
    };
    const t = e => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setShowTools(false);
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("mousedown", t);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("mousedown", t);
    };
  }, []);

  // Load every page of records (the server hands out at most 500 per page), then the data checks.
  const loadAll = (0, _react.useCallback)(async silent => {
    if (loadingRef.current) return; // one load at a time
    loadingRef.current = true;
    if (!silent) setLoadState("loading");
    try {
      let page = 1,
        pages = 1,
        total = 0,
        flat = [];
      do {
        const res = await fetch(`${API}/history/records?per_page=500&page=${page}`, {
          credentials: "same-origin",
          headers: {
            "X-WP-Nonce": NONCE
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
      } = aggregateRecords(flat);
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
    const o = await apiCall("/history/overview");
    if (o.ok) {
      setOverview(o.data);
      setOverviewErr("");
    } else setOverviewErr(o.error);
    loadingRef.current = false;
  }, []);
  (0, _react.useEffect)(() => {
    loadAll(false);
  }, [loadAll]);
  // coming back to the tab after a while: refresh so nobody acts on an old view
  (0, _react.useEffect)(() => {
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

  // merge / not-a-duplicate reuse the Players endpoints
  const doMerge = async (pair, keepId) => {
    const removeId = keepId === pair.a.id ? pair.b.id : pair.a.id;
    const key = pair.a.id + "-" + pair.b.id;
    if (busyKey) return;
    setBusyKey(key);
    const r = await apiCall("/players/merge", {
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
    showToast("✓ Merged");
    if (selectedId === removeId) setSelectedId(keepId);
    loadAll(true);
  };
  const doDismiss = async pair => {
    const key = pair.a.id + "-" + pair.b.id;
    if (busyKey) return;
    setBusyKey(key);
    const r = await apiCall("/players/not-duplicate", {
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

  // Keyboard nav
  (0, _react.useEffect)(() => {
    const h = e => {
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (!selected) return;
      const idx = filtered.findIndex(p => p.id === selected.id);
      if (e.key === "ArrowDown" && idx < filtered.length - 1) {
        e.preventDefault();
        setSelected(filtered[idx + 1]);
      }
      if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        setSelected(filtered[idx - 1]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  const allSeasons = (0, _react.useMemo)(() => {
    const s = new Set();
    players.forEach(p => p.history.forEach(h => s.add(+h.season)));
    return [...s].sort((a, b) => b - a);
  }, [players]);

  // ── BUG FIX: cast both sides to number — season filter now works ──
  const filtered = (0, _react.useMemo)(() => {
    let p = [...players];
    if (search) p = p.filter(x => `${x.first_name} ${x.last_name} ${x.email} ${x.skill_tier_reported} ${x.history.map(h => DIVISION_LABEL[h.division] || "").join(" ")}`.toLowerCase().includes(search.toLowerCase()));
    if (filterDiv) p = p.filter(x => x.history.some(h => h.division === filterDiv));
    if (filterSeason) p = p.filter(x => x.history.some(h => +h.season === +filterSeason)); // ← BUG FIX
    if (filterMissing) p = p.filter(x => x.gaps.includes(filterMissing));
    if (filterWarn) p = p.filter(x => x.sandbagging_flag);
    if (filterChamps) p = p.filter(x => x.history.some(h => h.championship === "winner"));
    if (filterNoShow) p = p.filter(x => x.no_show_count > 0);
    if (filterRecent) p = p.filter(x => x.history.some(h => +h.season >= allSeasons[0] - 1)); // last 2 seasons
    if (filterReliability === "perfect") p = p.filter(x => x.attendance_rating === 100 || x.attendance_rating == null);
    if (filterReliability === "concern") p = p.filter(x => x.attendance_rating != null && x.attendance_rating < 80);
    if (filterReliability === "noshows") p = p.filter(x => x.no_show_count > 0);
    p.sort((a, b) => {
      let av, bv;
      if (sortKey === "seasons") {
        av = a.history.length;
        bv = b.history.length;
      } else if (sortKey === "champs") {
        av = a.history.filter(h => h.championship === "winner").length;
        bv = b.history.filter(h => h.championship === "winner").length;
      } else if (sortKey === "attendance") {
        av = a.attendance_rating ?? -1;
        bv = b.attendance_rating ?? -1;
      } else {
        av = (a[sortKey] || "").toString().toLowerCase();
        bv = (b[sortKey] || "").toString().toLowerCase();
      }
      return sortDir === "asc" ? av > bv ? 1 : -1 : av < bv ? 1 : -1;
    });
    return p;
  }, [players, search, filterDiv, filterSeason, filterMissing, filterWarn, filterChamps, filterNoShow, filterRecent, filterReliability, sortKey, sortDir, allSeasons]);
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // #4 stats — robust normalization handles "0"/"1"/true/false from any API response
  const toBool = v => v === true || v === 1 || v === "1" || v === "yes" || v === "Yes" || v === "true";
  const stats = (0, _react.useMemo)(() => ({
    total: players.length,
    champions: players.filter(p => p.history.some(h => h.championship === "winner")).length,
    captains: players.filter(p => p.history.some(h => toBool(h.was_captain))).length,
    sandbagging: players.filter(p => toBool(p.sandbagging_flag) || p.history.some(h => toBool(h.sandbagging_flag))).length,
    noShows: players.filter(p => p.no_show_count > 0).length,
    noShowsKnown: players.some(p => p.games_recorded)
  }), [players]);
  const reviewCount = (0, _react.useMemo)(() => {
    const gaps = overview ? (overview.quality || []).reduce((n, q) => n + (q.count > 0 ? 1 : 0), 0) : 0; // number of kinds of gap, not number of rows
    return gaps + (overview ? (overview.duplicates || []).length : 0) + tierMoves(players).length;
  }, [overview, players]);
  const registeredIds = (0, _react.useMemo)(() => overview && Array.isArray(overview.registered_ids) ? new Set(overview.registered_ids.map(Number)) : null, [overview]);
  const sortProps = k => ({
    tabIndex: 0,
    "aria-sort": sortKey === k ? sortDir === "asc" ? "ascending" : "descending" : "none",
    onClick: () => handleSort(k),
    onKeyDown: e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSort(k);
      }
    }
  });
  const activeFilters = [filterDiv, filterSeason, filterReliability, filterMissing].filter(Boolean).length + (filterWarn ? 1 : 0) + (filterChamps ? 1 : 0) + (filterNoShow ? 1 : 0) + (filterRecent ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setFilterDiv("");
    setFilterSeason("");
    setFilterReliability("");
    setFilterWarn(false);
    setFilterChamps(false);
    setFilterNoShow(false);
    setFilterRecent(false);
    setFilterMissing("");
  };

  // #18 export scoped to filter
  const exportCSV = () => {
    const rows = [["Last", "First", "Email", "Seasons", "Championships", "Captaincies", "Attendance%", "No-Shows", "Sandbagging", "Division History", "Tier History"], ...filtered.map(p => [titleCase(p.last_name), titleCase(p.first_name), p.email, p.history.length, p.history.filter(h => h.championship === "winner").length, p.history.filter(h => h.was_captain).length, p.attendance_rating ?? 0, p.no_show_count, p.sandbagging_flag ? "Yes" : "No", [...new Set(p.history.map(h => DIVISION_LABEL[h.division] || h.division))].join("|"), p.history.map(h => `${h.season}:${h.skill_tier}`).join("|")])];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grsh-history${filterSeason ? "-" + filterSeason : ""}${filterDiv ? "-" + filterDiv : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Exported ${filtered.length} players`);
  };
  const SortIcon = ({
    k
  }) => /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
    style: {
      marginLeft: 4,
      opacity: sortKey === k ? 1 : 0.25,
      fontSize: 11
    },
    children: sortKey === k ? sortDir === "asc" ? "↑" : "↓" : "↕"
  });
  const ALL_COLS = [{
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
        onClick: () => loadAll(false),
        style: {
          marginTop: 12,
          fontSize: 14,
          fontWeight: 600,
          background: "#1a1a2e",
          color: "#D4A017",
          border: "none",
          padding: "8px 18px",
          borderRadius: 8,
          cursor: "pointer"
        },
        children: "Try again"
      })]
    })]
  });
  if (loadState === "loading") return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    style: {
      padding: 48,
      fontFamily: "'DM Mono',monospace",
      fontSize: 13,
      color: "#aaa",
      background: "#F6F5F0",
      minHeight: "100vh"
    },
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`
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
        fontFamily: "'DM Mono',monospace",
        fontSize: 12,
        color: "#aaa",
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
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("style", {
      children: `
        *{box-sizing:border-box}
        @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .hrow:hover{background:#F0F4FF!important}
        .hrow:focus{outline:2px solid #1a1a2e;outline-offset:-2px}
        .hth{position:sticky;top:0;z-index:10}
        @media(max-width:768px){.hsplit{flex-direction:column!important}}
      `
    }), showPredictor && /*#__PURE__*/(0, _jsxRuntime.jsx)(SandbagPredictor, {
      players: players,
      onClose: () => setShowPredictor(false)
    }), showDiff && /*#__PURE__*/(0, _jsxRuntime.jsx)(SeasonDiff, {
      players: players,
      onClose: () => setShowDiff(false)
    }), showCohort && /*#__PURE__*/(0, _jsxRuntime.jsx)(CohortChart, {
      players: players,
      onClose: () => setShowCohort(false)
    }), showWhere && /*#__PURE__*/(0, _jsxRuntime.jsx)(WhereAreTheyNow, {
      players: players,
      registeredIds: registeredIds,
      year: overview && overview.registered_year || new Date().getFullYear(),
      onClose: () => setShowWhere(false)
    }), showReview && /*#__PURE__*/(0, _jsxRuntime.jsx)(NeedsReview, {
      overview: overview,
      overviewErr: overviewErr,
      players: players,
      startTab: showReview,
      onClose: () => setShowReview(null),
      busyKey: busyKey,
      onShowGap: k => {
        setFilterMissing(k);
        setShowFilters(true);
        setShowReview(null);
      },
      onOpenPlayer: p => {
        setSelected(p);
        setShowReview(null);
      },
      onMerge: doMerge,
      onDismiss: doDismiss
    }), showStory && /*#__PURE__*/(0, _jsxRuntime.jsx)(SeasonStory, {
      players: players,
      season: showStory,
      onClose: () => setShowStory(null)
    }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
      className: "hsplit",
      style: {
        display: "flex",
        height: "calc(100vh - 32px)",
        overflow: "hidden",
        background: "#F6F5F0"
      },
      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          flex: 1,
          overflowY: "auto",
          padding: "22px 20px",
          minWidth: 0
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 14,
            flexWrap: "wrap",
            gap: 10
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
              style: {
                display: "inline-block",
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                background: "#1a1a2e",
                color: "#D4A017",
                padding: "3px 12px",
                borderRadius: 99,
                marginBottom: 7
              },
              children: "Historical records"
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("h1", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 26,
                fontWeight: 700,
                color: "#1a1a2e",
                margin: "0 0 3px",
                letterSpacing: "-.5px"
              },
              children: "Player History"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#555",
                margin: 0
              },
              children: [players.length, " players \xB7 ", loadInfo.rows, " season rows", allSeasons.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                children: [" \xB7 ", allSeasons.length === 1 ? `season ${allSeasons[0]}` : `${allSeasons[allSeasons.length - 1]}–${allSeasons[0]} (${allSeasons.length} seasons)`]
              })]
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
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#6b6b7b",
                margin: "4px 0 0"
              },
              children: [overview && overview.last_import ? /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
                children: ["Last import: ", overview.last_import.file || "file", " \xB7 ", overview.last_import.by || "unknown", " \xB7 ", overview.last_import.at, " "]
              }) : overviewErr ? "Import details unavailable. " : "No import recorded. ", /*#__PURE__*/(0, _jsxRuntime.jsx)("a", {
                href: adminUrl("grsh-tm-history-import"),
                style: {
                  color: "#1a1a2e"
                },
                children: "Import History \u2192"
              })]
            })]
          }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
              onClick: () => setShowReview("gaps"),
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                fontWeight: 600,
                background: reviewCount > 0 ? "#FEF3C7" : "#E6F4EA",
                color: reviewCount > 0 ? "#92400E" : "#166534",
                border: `1px solid ${reviewCount > 0 ? "#FDE68A" : "#86EFAC"}`,
                padding: "8px 14px",
                borderRadius: 8,
                cursor: "pointer",
                whiteSpace: "nowrap"
              },
              children: overview || players.length ? reviewCount > 0 ? `Needs review (${reviewCount})` : "All checks clear" : "Needs review"
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              ref: toolsRef,
              style: {
                position: "relative"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setShowTools(t => !t),
                "aria-haspopup": "menu",
                "aria-expanded": showTools,
                style: {
                  ...wowBtn,
                  fontSize: 12,
                  padding: "8px 14px"
                },
                children: "Tools \u25BE"
              }), showTools && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                role: "menu",
                style: {
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  background: "#fff",
                  border: "1px solid #E8E6DF",
                  borderRadius: 10,
                  padding: 6,
                  zIndex: 300,
                  minWidth: 220,
                  boxShadow: "0 8px 32px rgba(0,0,0,.14)"
                },
                children: [["⚡ Risk analysis", () => setShowPredictor(true)], ["⇔ Compare seasons", () => setShowDiff(true)], ["📊 Cohort retention", () => setShowCohort(true)], ["🔍 Where are they now?", () => setShowWhere(true)]].concat(allSeasons.map(yr => [`📖 ${yr} story`, () => setShowStory(yr)])).map(([l, fn]) => /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                  role: "menuitem",
                  onClick: () => {
                    fn();
                    setShowTools(false);
                  },
                  style: {
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: "8px 12px",
                    fontSize: 13,
                    fontFamily: "'DM Mono',monospace",
                    cursor: "pointer",
                    borderRadius: 6
                  },
                  children: l
                }, l))
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
              onClick: exportCSV,
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                background: "#F6F5F0",
                color: "#444",
                border: "1px solid #E8E6DF",
                padding: "8px 14px",
                borderRadius: 8,
                cursor: "pointer",
                whiteSpace: "nowrap"
              },
              children: ["\u2193 Export ", filtered.length < players.length ? `${filtered.length} filtered` : "all"]
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            display: "flex",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap"
          },
          children: [{
            label: "On record",
            val: stats.total,
            color: "#1a1a2e",
            filter: null
          }, {
            label: "Past champions",
            val: stats.champions,
            color: "#92400E",
            filter: () => setFilterChamps(f => !f),
            active: filterChamps
          }, {
            label: "Captains",
            val: stats.captains,
            color: "#4C1D95",
            filter: null
          }, {
            label: "Sandbagging",
            val: stats.sandbagging,
            color: "#991B1B",
            filter: () => setFilterWarn(f => !f),
            active: filterWarn
          }, {
            label: "No-show flag",
            val: stats.noShowsKnown ? stats.noShows : "n/a",
            color: "#7A4518",
            filter: () => setFilterNoShow(f => !f),
            active: filterNoShow
          }].map(chip => /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
            type: "button",
            onClick: chip.filter,
            disabled: !chip.filter,
            "aria-pressed": chip.filter ? !!chip.active : undefined,
            title: chip.label === "No-show flag" && !stats.noShowsKnown ? "No season has attendance recorded, so no-shows cannot be counted." : undefined,
            style: {
              font: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: chip.active ? "#E8E6DF" : "#fff",
              border: `1px solid ${chip.active ? "#1a1a2e" : "#E8E6DF"}`,
              borderRadius: 99,
              padding: "5px 14px",
              cursor: chip.filter ? "pointer" : "default",
              userSelect: "none",
              transition: "background .12s"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'Fraunces',serif",
                fontSize: 16,
                fontWeight: 700,
                color: chip.color,
                lineHeight: 1
              },
              children: chip.val
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                color: "#6b6b7b",
                textTransform: "uppercase",
                letterSpacing: ".07em"
              },
              children: chip.label
            })]
          }, chip.label))
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 12
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              background: "#fff",
              border: "1px solid #E8E6DF",
              borderRadius: 10,
              overflow: "hidden"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom: showFilters ? "1px solid #F0EEE8" : "none"
              },
              onClick: () => setShowFilters(f => !f),
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  color: "#555",
                  fontWeight: 500
                },
                children: [showFilters ? "↑ Collapse filters" : "↓ Show filters", activeFilters > 0 && !showFilters && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                  style: {
                    marginLeft: 10,
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    background: "#1a1a2e",
                    color: "#D4A017",
                    padding: "1px 8px",
                    borderRadius: 99
                  },
                  children: [activeFilters, " active"]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  display: "flex",
                  gap: 8
                },
                onClick: e => e.stopPropagation(),
                children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  ref: colRef,
                  style: {
                    position: "relative"
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    onClick: () => setShowCols(c => !c),
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      background: showCols ? "#1a1a2e" : "#F6F5F0",
                      color: showCols ? "#D4A017" : "#666",
                      border: `1px solid ${showCols ? "#1a1a2e" : "#E8E6DF"}`,
                      padding: "4px 10px",
                      borderRadius: 6,
                      cursor: "pointer"
                    },
                    children: "\u229E Columns"
                  }), showCols && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                    style: {
                      position: "absolute",
                      top: "110%",
                      right: 0,
                      background: "#fff",
                      border: "1px solid #E8E6DF",
                      borderRadius: 10,
                      padding: "10px 12px",
                      zIndex: 300,
                      minWidth: 170,
                      boxShadow: "0 8px 32px rgba(0,0,0,.14)"
                    },
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                      style: {
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: "#aaa",
                        textTransform: "uppercase",
                        letterSpacing: ".07em",
                        marginBottom: 8
                      },
                      children: "Visible columns"
                    }), ALL_COLS.map(col => /*#__PURE__*/(0, _jsxRuntime.jsxs)("label", {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 0",
                        cursor: "pointer",
                        borderBottom: "1px solid #F9F8F4",
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: "#555"
                      },
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                        type: "checkbox",
                        checked: visibleCols.includes(col.k),
                        onChange: () => setVisibleCols(v => v.includes(col.k) ? v.filter(c => c !== col.k) : [...v, col.k])
                      }), col.l]
                    }, col.k))]
                  })]
                }), activeFilters > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("button", {
                  onClick: clearFilters,
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    background: "#FEE2E2",
                    border: "1px solid #FCA5A5",
                    color: "#991B1B",
                    padding: "4px 10px",
                    borderRadius: 6,
                    cursor: "pointer"
                  },
                  children: ["Clear ", activeFilters]
                })]
              })]
            }), showFilters && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
              style: {
                padding: "12px 14px",
                display: "flex",
                gap: 12,
                alignItems: "flex-end",
                flexWrap: "wrap"
              },
              children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Search"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    position: "relative"
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    style: {
                      position: "absolute",
                      top: 7,
                      left: 8,
                      color: "#aaa",
                      fontSize: 14,
                      pointerEvents: "none"
                    },
                    children: "\u2315"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("input", {
                    value: search,
                    onChange: e => {
                      setSearch(e.target.value);
                    },
                    placeholder: "Name, email, tier, division\u2026",
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      background: "#F6F5F0",
                      border: "1px solid #E8E6DF",
                      borderRadius: 6,
                      padding: "6px 10px 6px 26px",
                      color: "#333",
                      outline: "none",
                      width: 200
                    }
                  })]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Prior division"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                  value: filterDiv,
                  onChange: e => setFilterDiv(e.target.value),
                  style: sel,
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "",
                    children: "All divisions"
                  }), DIVISION_KEYS.map(d => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: d,
                    children: DIVISION_LABEL[d]
                  }, d))]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Season"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                  value: filterSeason,
                  onChange: e => setFilterSeason(e.target.value),
                  style: sel,
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "",
                    children: "All seasons"
                  }), allSeasons.map(y => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: y,
                    children: y
                  }, y))]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Attendance"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                  value: filterReliability,
                  onChange: e => setFilterReliability(e.target.value),
                  style: sel,
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "",
                    children: "Any"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "perfect",
                    children: "Perfect (100%)"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "concern",
                    children: "Concern (<80%)"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "noshows",
                    children: "Has no-shows"
                  })]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Data gaps"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("select", {
                  value: filterMissing,
                  onChange: e => setFilterMissing(e.target.value),
                  style: sel,
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: "",
                    children: "Any"
                  }), Object.keys(GAP_FILTER_LABEL).map(k => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
                    value: k,
                    children: GAP_FILTER_LABEL[k]
                  }, k))]
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("label", {
                  style: fL,
                  children: "Quick filters"
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    display: "flex",
                    gap: 5
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    onClick: () => setFilterWarn(w => !w),
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "5px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: filterWarn ? "#FEF2F2" : "#F6F5F0",
                      color: filterWarn ? "#991B1B" : "#888",
                      border: `1px solid ${filterWarn ? "#FCA5A5" : "#E8E6DF"}`
                    },
                    children: "\u26A0 Flags"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    onClick: () => setFilterRecent(r => !r),
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "5px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: filterRecent ? "#E0F0FF" : "#F6F5F0",
                      color: filterRecent ? "#1A4F8A" : "#888",
                      border: `1px solid ${filterRecent ? "#93C5FD" : "#E8E6DF"}`
                    },
                    children: "Recent"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    onClick: () => setFilterChamps(c => !c),
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "5px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: filterChamps ? "#FFFBEB" : "#F6F5F0",
                      color: filterChamps ? "#92400E" : "#888",
                      border: `1px solid ${filterChamps ? "#FDE68A" : "#E8E6DF"}`
                    },
                    children: "\uD83C\uDFC6 Champs"
                  })]
                })]
              })]
            })]
          }), activeFilters > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
            style: {
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 8
            },
            children: [filterDiv && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#EEF2FF",
                color: "#1a1a2e",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Division: ", DIVISION_LABEL[filterDiv], /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterDiv(""),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#888",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterSeason && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#EEF2FF",
                color: "#1a1a2e",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Season: ", filterSeason, /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterSeason(""),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#888",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterReliability && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#EEF2FF",
                color: "#1a1a2e",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Attendance: ", filterReliability, /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterReliability(""),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#888",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterMissing && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#FEF3C7",
                color: "#92400E",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: [GAP_FILTER_LABEL[filterMissing], /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterMissing(""),
                "aria-label": "Remove filter",
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#92400E",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterWarn && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#FEF2F2",
                color: "#991B1B",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Sandbagging only", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterWarn(false),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#991B1B",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterRecent && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#E0F0FF",
                color: "#1A4F8A",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Recent players", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterRecent(false),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#1A4F8A",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            }), filterChamps && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 11,
                background: "#FFFBEB",
                color: "#92400E",
                padding: "2px 10px",
                borderRadius: 99,
                display: "flex",
                alignItems: "center",
                gap: 4
              },
              children: ["Champions", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                onClick: () => setFilterChamps(false),
                style: {
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 0 0 4px",
                  color: "#92400E",
                  fontSize: 12
                },
                children: "\u2715"
              })]
            })]
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("p", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#888",
              margin: 0
            },
            children: ["Showing ", /*#__PURE__*/(0, _jsxRuntime.jsx)("strong", {
              children: filtered.length
            }), " of ", players.length, " players", filtered.length < players.length && activeFilters > 0 ? " (filtered)" : "", filterSeason && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                color: "#1a1a2e",
                fontWeight: 600
              },
              children: [" matching season ", filterSeason]
            })]
          }), selected && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 11,
              color: "#aaa"
            },
            children: "\u2191\u2193 navigate \xB7 Esc close"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
          style: {
            background: "#fff",
            border: "1px solid #E8E6DF",
            borderRadius: 10,
            overflowX: "auto",
            marginBottom: 16
          },
          children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("table", {
            style: {
              width: "100%",
              borderCollapse: "collapse"
            },
            children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("thead", {
              children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                children: [visibleCols.includes("player") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("th", {
                  className: "hth",
                  style: {
                    ...TH,
                    left: 0,
                    zIndex: 11
                  },
                  ...sortProps("last_name"),
                  children: ["Player ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortIcon, {
                    k: "last_name"
                  })]
                }), visibleCols.includes("seasons") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("th", {
                  className: "hth",
                  style: TH,
                  ...sortProps("seasons"),
                  children: ["Seasons ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortIcon, {
                    k: "seasons"
                  })]
                }), visibleCols.includes("champs") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("th", {
                  className: "hth",
                  style: TH,
                  ...sortProps("champs"),
                  children: ["Championships ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortIcon, {
                    k: "champs"
                  })]
                }), visibleCols.includes("divisions") && /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  className: "hth",
                  style: TH,
                  children: "Prior divisions"
                }), visibleCols.includes("tier") && /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  className: "hth",
                  style: TH,
                  children: "Tier / trend"
                }), visibleCols.includes("attendance") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("th", {
                  className: "hth",
                  style: TH,
                  ...sortProps("attendance"),
                  children: ["Attendance ", /*#__PURE__*/(0, _jsxRuntime.jsx)(SortIcon, {
                    k: "attendance"
                  })]
                }), visibleCols.includes("flags") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("th", {
                  className: "hth",
                  style: TH,
                  children: ["Flags ", /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                    title: "Sandbagging: historical tier significantly exceeds self-reported. No-show: missed games without notice.",
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      color: "#bbb",
                      cursor: "help",
                      border: "1px solid #E8E6DF",
                      borderRadius: "50%",
                      padding: "0 3px"
                    },
                    children: "?"
                  })]
                }), /*#__PURE__*/(0, _jsxRuntime.jsx)("th", {
                  className: "hth",
                  style: TH
                })]
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("tbody", {
              children: [filtered.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("tr", {
                children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                  colSpan: 10,
                  style: {
                    padding: "60px 24px",
                    textAlign: "center"
                  },
                  children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                    style: {
                      fontSize: 28,
                      marginBottom: 10
                    },
                    children: activeFilters || search ? "🔍" : "🏒"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                    style: {
                      fontFamily: "'Fraunces',serif",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#1a1a2e",
                      margin: "0 0 6px"
                    },
                    children: activeFilters || search ? "No players match these filters" : "No history records yet"
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("p", {
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      color: "#aaa",
                      margin: "0 0 16px"
                    },
                    children: activeFilters || search ? `Filtered to: ${[filterSeason && `Season ${filterSeason}`, filterDiv && DIVISION_LABEL[filterDiv]].filter(Boolean).join(" · ") || "current filters"} — try adjusting.` : "Import historical seasons via the Import History page."
                  }), (activeFilters || search) && /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
                    onClick: clearFilters,
                    style: {
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 12,
                      background: "#1a1a2e",
                      color: "#D4A017",
                      border: "none",
                      padding: "8px 20px",
                      borderRadius: 8,
                      cursor: "pointer"
                    },
                    children: "Clear all filters"
                  })]
                })
              }), filtered.map(p => {
                const name = `${titleCase(p.first_name)} ${titleCase(p.last_name)}`; // #2 title case
                const champs = p.history.filter(h => h.championship === "winner");
                const captainSns = p.history.filter(h => h.was_captain).length;
                const divisions = [...new Set(p.history.map(h => h.division))];
                const trend = tierTrend(p.history);
                const trendInfo = TREND[trend];
                const isSelected = selected?.id === p.id;
                const lastSeason = p.history[0]?.season;
                const isRecent = lastSeason >= allSeasons[0] - 1;
                return /*#__PURE__*/(0, _jsxRuntime.jsxs)("tr", {
                  className: "hrow",
                  tabIndex: 0,
                  onMouseEnter: () => setHoveredRow(p.id),
                  onMouseLeave: () => setHoveredRow(null),
                  onClick: () => setSelected(p),
                  onKeyDown: e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(p);
                    }
                  },
                  "aria-selected": isSelected,
                  style: {
                    background: isSelected ? "#EEF2FF" : p.sandbagging_flag ? "#FFFBEB" : "transparent",
                    borderLeft: `3px solid ${isSelected ? "#1a1a2e" : p.sandbagging_flag ? "#FDE68A" : "transparent"}`,
                    cursor: "pointer",
                    transition: "background .1s"
                  },
                  children: [visibleCols.includes("player") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: {
                      ...TD,
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: isSelected ? "#EEF2FF" : p.sandbagging_flag ? "#FFFBEB" : "#fff"
                    },
                    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                      },
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(DNAAvatar, {
                        player: p,
                        size: 32
                      }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                        children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                          style: {
                            fontFamily: "'Fraunces',serif",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a2e",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          },
                          children: [name, champs.length > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                            title: "Past champion",
                            style: {
                              fontSize: 11
                            },
                            children: "\uD83C\uDFC6"
                          }), p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                            title: "Sandbagging review",
                            style: {
                              fontSize: 11,
                              color: "#EF4444"
                            },
                            children: "\u26A0"
                          }), captainSns > 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                            title: `${captainSns}× captain`,
                            style: {
                              fontFamily: "'DM Mono',monospace",
                              fontSize: 11,
                              background: "#EDE9FE",
                              color: "#4C1D95",
                              padding: "1px 4px",
                              borderRadius: 2
                            },
                            children: "C"
                          })]
                        }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                          style: {
                            fontFamily: "'DM Mono',monospace",
                            fontSize: 11,
                            color: "#bbb"
                          },
                          children: p.email
                        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                          style: {
                            fontFamily: "'DM Mono',monospace",
                            fontSize: 11,
                            color: isRecent ? "#166534" : "#aaa",
                            marginTop: 1
                          },
                          children: ["Last active ", lastSeason, isRecent ? " ·  recent" : lastSeason < allSeasons[0] - 2 ? " · inactive" : ""]
                        })]
                      })]
                    })
                  }), visibleCols.includes("seasons") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    style: TD,
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
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        marginTop: 2,
                        lineHeight: 1.5
                      },
                      children: p.history.map(h => h.season).sort((a, b) => b - a).map((yr, i) => /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        style: {
                          color: i === 0 ? "#1a1a2e" : "#bbb",
                          marginRight: 3,
                          fontWeight: i === 0 ? 600 : 400
                        },
                        children: yr
                      }, yr))
                    })]
                  }), visibleCols.includes("champs") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: champs.length > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                      children: [/*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginBottom: 2
                        },
                        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                          style: {
                            fontSize: 12
                          },
                          children: "\uD83C\uDFC6"
                        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                          style: {
                            fontFamily: "'Fraunces',serif",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#92400E"
                          },
                          children: [champs.length, "\xD7"]
                        }), captainSns > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                          style: {
                            fontFamily: "'DM Mono',monospace",
                            fontSize: 11,
                            color: "#aaa"
                          },
                          children: ["(", captainSns, "\xD7 captain)"]
                        })]
                      }), /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          color: "#92400E"
                        },
                        children: champs.map(h => h.season).join(", ")
                      })]
                    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      style: {
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: "#ccc"
                      },
                      children: "\u2014"
                    })
                  }), visibleCols.includes("divisions") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                      style: {
                        display: "flex",
                        gap: 3,
                        alignItems: "center",
                        flexWrap: "nowrap"
                      },
                      children: [divisions.slice(0, 1).map(d => {
                        const dc = DIVISION_COLOR[d] || {};
                        return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                          style: {
                            fontFamily: "'DM Mono',monospace",
                            fontSize: 11,
                            fontWeight: 500,
                            background: dc.bg || "#F6F5F0",
                            color: dc.color || "#555",
                            border: `1px solid ${dc.border || "#E8E6DF"}`,
                            padding: "1px 6px",
                            borderRadius: 99
                          },
                          children: DIVISION_LABEL[d] || d
                        }, d);
                      }), divisions.length > 1 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          color: "#aaa",
                          cursor: "help"
                        },
                        title: divisions.slice(1).map(d => DIVISION_LABEL[d] || d).join(", "),
                        children: ["+", divisions.length - 1]
                      })]
                    })
                  }), visibleCols.includes("tier") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    style: TD,
                    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(TierSparkline, {
                      history: p.history
                    }), trend === "unknown" && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      style: {
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: trendInfo.color,
                        marginTop: 2,
                        display: "block"
                      },
                      children: trendInfo.label
                    })]
                  }), visibleCols.includes("attendance") && /*#__PURE__*/(0, _jsxRuntime.jsxs)("td", {
                    style: {
                      ...TD,
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
                            borderRadius: 99,
                            background: p.attendance_rating === 100 ? "#22c55e" : p.attendance_rating >= 80 ? "#1a1a2e" : "#EF4444",
                            transition: "width .5s ease"
                          }
                        })
                      }), p.attendance_rating < 100 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          color: p.attendance_rating >= 80 ? "#555" : "#991B1B",
                          fontWeight: 600
                        },
                        children: [p.attendance_rating, "%"]
                      })]
                    }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                      title: "Attendance was never recorded for this player",
                      style: {
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: "#6b6b7b"
                      },
                      children: "not recorded"
                    }), p.no_show_count > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                      style: {
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 11,
                        color: "#92400E",
                        marginTop: 2
                      },
                      children: [p.no_show_count, " no-show", p.no_show_count > 1 ? "s" : ""]
                    })]
                  }), visibleCols.includes("flags") && /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: TD,
                    children: /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: 3
                      },
                      children: [p.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          fontWeight: 500,
                          background: "#FEF2F2",
                          color: "#991B1B",
                          padding: "1px 6px",
                          borderRadius: 99,
                          border: "1px solid #FCA5A5"
                        },
                        children: "\u26A0 Sandbagging"
                      }), p.no_show_count > 0 && /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          fontWeight: 500,
                          background: "#FEF3C7",
                          color: "#92400E",
                          padding: "1px 6px",
                          borderRadius: 99,
                          border: "1px solid #FDE68A"
                        },
                        children: ["\uD83D\uDEAB ", p.no_show_count, " no-show", p.no_show_count > 1 ? "s" : ""]
                      }), !p.sandbagging_flag && p.no_show_count === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                        style: {
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          color: "#ccc"
                        },
                        children: "\u2014"
                      })]
                    })
                  }), /*#__PURE__*/(0, _jsxRuntime.jsx)("td", {
                    style: {
                      ...TD,
                      width: 24,
                      color: "#ccc",
                      fontSize: 12,
                      textAlign: "right",
                      opacity: hoveredRow === p.id ? 1 : 0,
                      transition: "opacity .15s"
                    },
                    children: "\u2192"
                  })]
                }, p.id);
              })]
            })]
          })
        })]
      }), selected && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
        style: {
          width: 420,
          borderLeft: "1px solid #E8E6DF",
          background: "#fff",
          height: "calc(100vh - 32px)",
          overflowY: "auto",
          flexShrink: 0
        },
        children: /*#__PURE__*/(0, _jsxRuntime.jsx)(HistoryPanel, {
          player: selected,
          onClose: () => setSelected(null),
          onSaved: () => loadAll(true),
          onToast: showToast
        })
      })]
    }), toast && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "'DM Mono',monospace",
        fontSize: 12,
        fontWeight: 500,
        background: "#1a1a2e",
        color: "#D4A017",
        padding: "10px 22px",
        borderRadius: 99,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        zIndex: 2000,
        animation: "slideUp .25s ease",
        whiteSpace: "nowrap"
      },
      children: toast
    })]
  });
}
const wowBtn = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 11,
  fontWeight: 500,
  background: "#EEF2FF",
  border: "1px solid #C7D2FE",
  color: "#1a1a2e",
  padding: "7px 11px",
  borderRadius: 7,
  cursor: "pointer"
};
const fL = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 11,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  display: "block",
  marginBottom: 4
};
const sel = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 11,
  background: "#F6F5F0",
  border: "1px solid #E8E6DF",
  borderRadius: 6,
  padding: "5px 8px",
  color: "#333",
  outline: "none",
  minWidth: 120
};
const TH = {
  fontFamily: "'DM Mono',monospace",
  fontSize: 11,
  fontWeight: 500,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  padding: "11px 14px",
  textAlign: "left",
  borderBottom: "1px solid #E8E6DF",
  background: "#FAFAF8",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap"
};
const TD = {
  padding: "11px 14px",
  verticalAlign: "middle",
  borderBottom: "1px solid #F3F2ED"
};