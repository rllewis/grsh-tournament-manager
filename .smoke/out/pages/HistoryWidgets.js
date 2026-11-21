"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CohortChart = CohortChart;
exports.DNAAvatar = DNAAvatar;
exports.HistoryPanel = HistoryPanel;
exports.NeedsReview = NeedsReview;
exports.SandbagPredictor = SandbagPredictor;
exports.SeasonDiff = SeasonDiff;
exports.SeasonStory = SeasonStory;
exports.TierSparkline = TierSparkline;
exports.WhereAreTheyNow = WhereAreTheyNow;
var _react = require("react");
var _historyShared = require("./historyShared.js");
var _jsxRuntime = require("react/jsx-runtime");
// Player History: the analysis tools, the data-check dialog and the player drawer. Moved out of History.jsx unchanged except where noted.

// ─── WOW 2: Tier sparkline ────────────────────────────────────────────────────
function TierSparkline({
  history
}) {
  const withTier = history.filter(h => (0, _historyShared.TIER_VAL)(h.skill_tier) >= 0);
  if (withTier.length < 2) {
    const tc = (0, _historyShared.TIER_COLOR)(withTier[0]?.skill_tier);
    return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
      title: withTier.length ? "Only one season has a tier" : "No tier recorded",
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 12,
        background: tc.bg,
        color: tc.color,
        padding: "1px 5px",
        borderRadius: 3
      },
      children: withTier[0]?.skill_tier || "—"
    });
  }
  const vals = [...withTier].sort((a, b) => a.season - b.season).map(h => (0, _historyShared.TIER_VAL)(h.skill_tier));
  const min = Math.min(...vals),
    max = Math.max(...vals, min + 1);
  const W = 52,
    H = 18,
    pad = 2;
  const x = i => pad + i / (vals.length - 1) * (W - pad * 2);
  const y = v => pad + (v - min) / (max - min + 1) * (H - pad * 2);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const trend = (0, _historyShared.tierTrend)(withTier);
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
        fontSize: 12,
        fontWeight: 700,
        color: col
      },
      children: _historyShared.TREND[trend].arrow
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
  const baseColor = _historyShared.DIVISION_HUE[divs[0]] || (0, _historyShared.avatarColor)(player.id);
  const rings = Math.min(seasons, 4);
  const glow = champs > 0;
  const initials = `${(0, _historyShared.titleCase)(player.first_name)[0] || ""}${(0, _historyShared.titleCase)(player.last_name)[0] || ""}`;
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
        fontSize: 12,
        color: "#6b6b7b",
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
        const dc = _historyShared.DIVISION_COLOR[h.division] || {};
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
                fontSize: 12,
                fontWeight: 700,
                color: "#1a1a2e"
              },
              children: h.season
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: dc.color || "#888",
                textAlign: "center",
                lineHeight: 1.2
              },
              children: _historyShared.DIVISION_LABEL[h.division] || h.division
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
        fontSize: 12,
        color: "#555",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6
      },
      children: [["Season", sorted[hov].season], ["Division", _historyShared.DIVISION_LABEL[sorted[hov].division] || sorted[hov].division], ["Team", sorted[hov].team], ["Tier", sorted[hov].skill_tier], ["Result", sorted[hov].championship === "winner" ? "🏆 Champion" : sorted[hov].championship], ["Captain", sorted[hov].was_captain ? "Yes" : "No"], ["Attended", sorted[hov].games_scheduled === null ? "not recorded" : `${sorted[hov].games_attended ?? 0}/${sorted[hov].games_scheduled} games`], ["No-shows", sorted[hov].no_show]].map(([k, v]) => /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
        style: {
          display: "flex",
          gap: 6
        },
        children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
          style: {
            color: "#6b6b7b",
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
  const divs = [...new Set(player.history.map(h => _historyShared.DIVISION_LABEL[h.division] || h.division))];
  const name = `${(0, _historyShared.titleCase)(player.first_name)} ${(0, _historyShared.titleCase)(player.last_name)}`;
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
    ${sorted.map(h => `<div class="tl-row"><div class="tl-dot"></div><strong>${h.season}</strong> &nbsp; ${_historyShared.DIVISION_LABEL[h.division] || h.division} &nbsp; ${h.skill_tier} ${h.championship === "winner" ? " · 🏆" : ""} ${h.was_captain ? " · © Captain" : ""}</div>`).join("")}
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
      const avgIdx = hist.reduce((s, h) => s + (0, _historyShared.TIER_VAL)(h.skill_tier), 0) / hist.length;
      const curIdx = (0, _historyShared.TIER_VAL)(p.skill_tier_reported);
      const gap = curIdx - avgIdx; // positive = reported lower tier than history = risk
      return {
        ...p,
        avgIdx,
        curIdx,
        gap,
        riskScore: Math.round(Math.min(100, Math.max(0, gap * 20))),
        avgTier: _historyShared.TIER_ORDER[Math.round(avgIdx)] || "—"
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
              fontSize: 12,
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
              fontSize: 12,
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
              fontSize: 12,
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
                children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 12,
                  color: "#666"
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
                  fontSize: 12,
                  color: "#6b6b7b"
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
    fontSize: 12,
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
              fontSize: 12,
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
              fontSize: 12,
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
                fontSize: 12,
                color: "#6b6b7b"
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
                fontSize: 12,
                color: "#6b6b7b",
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
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#1a1a2e"
                  },
                  children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
                }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 12,
                    color: "#6b6b7b"
                  },
                  children: [p.skill_tier_reported, col.items === both && (() => {
                    const h1 = p.history.find(h => +h.season === +yr1);
                    const h2 = p.history.find(h => +h.season === +yr2);
                    if (!h1 || !h2) return "";
                    const delta = (0, _historyShared.TIER_VAL)(h2.skill_tier) - (0, _historyShared.TIER_VAL)(h1.skill_tier);
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
              fontSize: 12,
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
            fontSize: 12,
            color: "#666",
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
                fontSize: 12,
                color: "#6b6b7b"
              },
              children: [c.n, " first-time players"]
            })]
          }), c.retention.length === 0 && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 12,
              color: "#6b6b7b"
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
                  fontSize: 12,
                  color: "#666",
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
                  fontSize: 12,
                  fontWeight: 600,
                  color: col,
                  minWidth: 36
                },
                children: [r.pct, "%"]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 12,
                  color: "#6b6b7b"
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
    const rows = [["Last", "First", "Email", "Last season", "Last division"], ...notReturned.map(p => [(0, _historyShared.titleCase)(p.last_name), (0, _historyShared.titleCase)(p.first_name), p.email, p.history[0]?.season || "", _historyShared.DIVISION_LABEL[p.history[0]?.division] || ""])];
    const blob = new Blob([rows.map(r => r.map(_historyShared.csvCell).join(",")).join("\n")], {
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
              fontSize: 12,
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
              fontSize: 12,
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
              children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
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
                href: (0, _historyShared.adminUrl)("grsh-tm-players"),
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 12,
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
                  fontSize: 12,
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
                children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 12,
                  color: "#6b6b7b",
                  marginLeft: 6
                },
                children: ["last played ", p.history[0]?.season, " \xB7 ", _historyShared.DIVISION_LABEL[p.history[0]?.division] || "no division", p.email ? "" : " · no email"]
              })]
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
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
              fontSize: 12,
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
          }), " across", " ", Object.keys(divGroups).length, " divisions \u2014 ", newPlayers.length, " of them playing in their first ever Gold Rush season.", champs.length > 0 && ` The championship was claimed by ${champs.map(p => `${(0, _historyShared.titleCase)(p.first_name)} ${(0, _historyShared.titleCase)(p.last_name)}`).slice(0, 3).join(", ")}.`, mostSeasoned && ` ${(0, _historyShared.titleCase)(mostSeasoned.first_name)} ${(0, _historyShared.titleCase)(mostSeasoned.last_name)} was the most experienced player with ${mostSeasoned.history.length} seasons on record.`]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            marginBottom: 20
          },
          children: [/*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
            style: {
              fontFamily: "'DM Mono',monospace",
              fontSize: 12,
              color: "#6b6b7b",
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
                background: _historyShared.DIVISION_HUE[div] || "#1a1a2e",
                flexShrink: 0
              }
            }), /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#555",
                minWidth: 80
              },
              children: _historyShared.DIVISION_LABEL[div] || div
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
                  background: _historyShared.DIVISION_HUE[div] || "#1a1a2e",
                  borderRadius: 99
                }
              })
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#666"
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
              fontSize: 12,
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
              children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
            }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                color: "#6b6b7b"
              },
              children: ["\xB7 ", _historyShared.DIVISION_LABEL[p.history.find(h => +h.season === +season)?.division] || "", p.history.find(h => +h.season === +season)?.was_captain ? " · Captain" : ""]
            })]
          }, p.id))]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 12,
            color: "#6b6b7b",
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
              fontSize: 12,
              background: "#F6F5F0",
              color: "#555",
              padding: "2px 10px",
              borderRadius: 99
            },
            children: [(0, _historyShared.titleCase)(p.first_name), " ", (0, _historyShared.titleCase)(p.last_name)]
          }, p.id))
        })]
      })]
    })
  });
}

// ─── Needs review: data gaps, possible duplicates, big tier moves ───────────────
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
  const moves = (0, _react.useMemo)(() => (0, _historyShared.tierMoves)(players), [players]);
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
  const pname = p => `${(0, _historyShared.titleCase)(p.first_name)} ${(0, _historyShared.titleCase)(p.last_name)}`;
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
          autoFocus: true,
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
  fontSize: 12,
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
    const r = await (0, _historyShared.apiCall)(`/history/records/${h.row_id}`, {
      method: "POST",
      body: JSON.stringify(changed)
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    // the server keeps a before/after audit row for every edit, so putting the old values back is just another save
    const undo = () => (0, _historyShared.apiCall)(`/history/records/${h.row_id}`, {
      method: "POST",
      body: JSON.stringify((0, _historyShared.inversePatch)(init, changed))
    });
    onToast("✓ Saved " + h.season, undo);
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
          }), _historyShared.TIER_ORDER.map(t => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
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
          }), _historyShared.DIVISION_KEYS.map(d => /*#__PURE__*/(0, _jsxRuntime.jsx)("option", {
            value: d,
            children: _historyShared.DIVISION_LABEL[d]
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
    const r = await (0, _historyShared.apiCall)(`/history/players/${player.id}`, {
      method: "POST",
      body: JSON.stringify(changed)
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    const undo = () => (0, _historyShared.apiCall)(`/history/players/${player.id}`, {
      method: "POST",
      body: JSON.stringify((0, _historyShared.inversePatch)(init, changed))
    });
    onToast("✓ Player saved", undo);
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
  const name = `${(0, _historyShared.titleCase)(player.first_name)} ${(0, _historyShared.titleCase)(player.last_name)}`;
  const champs = player.history.filter(h => h.championship === "winner");
  const caps = player.history.filter(h => h.was_captain);
  const divisions = [...new Set(player.history.map(h => h.division))];
  const trend = (0, _historyShared.tierTrend)(player.history);
  const trendInfo = _historyShared.TREND[trend];
  const lastSeason = player.history[0]?.season;
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
    role: "complementary",
    "aria-label": `History for ${name}`,
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
              fontSize: 12
            },
            children: "\uD83C\uDFC6"
          }), player.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
            style: {
              fontSize: 12,
              color: "#EF4444"
            },
            children: "\u26A0"
          })]
        }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
          style: {
            fontFamily: "'DM Mono',monospace",
            fontSize: 12,
            color: player.email ? "#6b6b7b" : "#991B1B",
            marginTop: 1
          },
          children: [player.email || "No email on record", " ", /*#__PURE__*/(0, _jsxRuntime.jsx)("button", {
            onClick: () => setEditPlayer(e => !e),
            "aria-expanded": editPlayer,
            style: {
              background: "none",
              border: "none",
              color: "#1a1a2e",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 12,
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
            fontSize: 12,
            color: "#6b6b7b",
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
        "aria-label": "Close player panel",
        style: {
          background: "none",
          border: "none",
          fontSize: 16,
          color: "#555",
          cursor: "pointer",
          padding: "4px 8px"
        },
        children: "\u2715"
      })]
    }), player.sandbagging_flag && /*#__PURE__*/(0, _jsxRuntime.jsx)("div", {
      style: {
        fontFamily: "'DM Mono',monospace",
        fontSize: 12,
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
            fontSize: 12,
            color: "#6b6b7b",
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
                fontSize: 12,
                color: "#6b6b7b",
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
            fontSize: 12,
            color: "#6b6b7b",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            marginBottom: 10
          },
          children: "Season by season"
        }), player.history.map(h => {
          const dc = _historyShared.DIVISION_COLOR[h.division] || {};
          const tc = (0, _historyShared.TIER_COLOR)(h.skill_tier);
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
                    fontSize: 12,
                    fontWeight: 500,
                    background: dc.bg,
                    color: dc.color,
                    padding: "1px 6px",
                    borderRadius: 99,
                    border: `1px solid ${dc.border || dc.bg}`
                  },
                  children: _historyShared.DIVISION_LABEL[h.division] || h.division
                }) : /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 12,
                    color: "#991B1B",
                    border: "1px dashed #FCA5A5",
                    padding: "1px 6px",
                    borderRadius: 99
                  },
                  children: "No division"
                }), h.skill_tier ? /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 12,
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
                    fontSize: 12,
                    color: "#991B1B",
                    border: "1px dashed #FCA5A5",
                    padding: "1px 6px",
                    borderRadius: 99
                  },
                  children: "No tier"
                }), isChamp && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontSize: 12
                  },
                  children: "\uD83C\uDFC6"
                }), h.was_captain && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 12,
                    background: "#EDE9FE",
                    color: "#4C1D95",
                    padding: "1px 5px",
                    borderRadius: 99
                  },
                  children: "\xA9 Captain"
                }), h.was_alternate && /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
                  style: {
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 12,
                    background: "#F3F4F6",
                    color: "#666",
                    padding: "1px 5px",
                    borderRadius: 99
                  },
                  children: "Sub"
                })]
              }), /*#__PURE__*/(0, _jsxRuntime.jsxs)("div", {
                style: {
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 12,
                  color: "#6b6b7b"
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
                    fontSize: 12,
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
            fontSize: 12,
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
            fontSize: 12,
            color: "#6b6b7b",
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
            const dc = _historyShared.DIVISION_COLOR[d] || {};
            return /*#__PURE__*/(0, _jsxRuntime.jsx)("span", {
              style: {
                fontFamily: "'DM Mono',monospace",
                fontSize: 12,
                fontWeight: 500,
                background: dc.bg || "#F6F5F0",
                color: dc.color || "#555",
                border: `1px solid ${dc.border || "#E8E6DF"}`,
                padding: "2px 8px",
                borderRadius: 99
              },
              children: _historyShared.DIVISION_LABEL[d] || d
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
          fontSize: 12,
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