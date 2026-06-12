/**
 * GRSH Tournament Manager — Reusable Player Card
 *
 * Used by both Players.jsx and Draft.jsx to render a player's name, position,
 * tier · years · score label, and the sandbagging + returning badges.
 *
 * Drop this file at: src/components/PlayerCard.jsx
 */

import { useState } from "react";
import {
  computeScore,
  scoreBreakdown,
  formatScoreLabel,
  formatReturningBadge,
} from "../lib/playerScoring";

// ---------------------------------------------------------------------------
// Shared color tokens — keep in sync with existing pages
// ---------------------------------------------------------------------------

const POSITION_COLOR = {
  defenseman: { bg: "#E8F0FE", color: "#1A3F8F" },
  center:     { bg: "#E8F8EF", color: "#1A5C35" },
  winger:     { bg: "#FDF3E8", color: "#7A4A18" },
  goaltender: { bg: "#FCE8E8", color: "#7A1818" },
};
const POSITION_LABEL = { defenseman: "D", center: "C", winger: "W", goaltender: "G" };

const TIER_COLOR = (t) => {
  if (!t) return { bg: "#F3F4F6", color: "#6B7280" };
  const f = t[0];
  if (f === "A") return { bg: "#FCE8E8", color: "#7A1818" };
  if (f === "B") return { bg: "#FEF0E8", color: "#7A4518" };
  if (f === "C") return { bg: "#FEF9E7", color: "#7A5A18" };
  return { bg: "#E8F0FE", color: "#1A3F8F" };  // R tier
};

// ---------------------------------------------------------------------------
// Small reusable badge
// ---------------------------------------------------------------------------

function Pill({ bg, color, children, small }) {
  return (
    <span style={{
      display: "inline-block",
      background: bg,
      color,
      fontSize: small ? 9 : 10,
      fontFamily: "'DM Mono',monospace",
      fontWeight: 500,
      padding: small ? "1px 4px" : "1px 6px",
      borderRadius: 99,
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ---------------------------------------------------------------------------
// Score breakdown tooltip
// ---------------------------------------------------------------------------

function ScoreTooltip({ tier, years, adjustment }) {
  const b = scoreBreakdown(tier, years, adjustment);
  return (
    <div style={{
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%) translateY(-6px)",
      background: "#1a1a2e",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: 6,
      fontSize: 10,
      fontFamily: "'DM Mono',monospace",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,.25)",
      zIndex: 100,
      pointerEvents: "none",
    }}>
      <div style={{ color: "#D4A017", marginBottom: 3, fontWeight: 600 }}>
        Score breakdown
      </div>
      <div>tier {b.tier} = {b.tierValue}</div>
      <div>+ {b.yearsCapped} yrs ÷ 5 = {b.yearsContrib}</div>
      {b.adjustment !== 0 && (
        <div>+ committee adj {b.adjustment >= 0 ? "+" : ""}{b.adjustment}</div>
      )}
      <div style={{ borderTop: "1px solid #555", marginTop: 4, paddingTop: 4 }}>
        = {b.total.toFixed(1)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PlayerCard component
// ---------------------------------------------------------------------------

export default function PlayerCard({
  player,
  variant = "row",  // "row" (compact list) or "card" (full card)
  onClick = null,
  showScoreLabel = true,
  showBadges = true,
}) {
  const [hoverScore, setHoverScore] = useState(false);

  const tier        = player.skill_tier_reported;
  const years       = player.years_experience || 0;
  const adjustment  = player.committee_score_adjustment || 0;
  const sandbagging = player.sandbagging_flag;
  const returning   = player.returning_seasons || 0;

  const pc = POSITION_COLOR[player.position] || {};
  const tc = TIER_COLOR(tier);
  const initials = `${player.first_name?.[0] || "?"}${player.last_name?.[0] || ""}`;
  const score = computeScore(tier, years, adjustment);
  const returningBadge = formatReturningBadge(returning);

  // --- ROW variant: compact horizontal list item ---
  if (variant === "row") {
    return (
      <div
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 14px",
          background: "#fff",
          borderBottom: "1px solid #F3F2ED",
          cursor: onClick ? "pointer" : "default",
          position: "relative",
        }}
      >
        {/* Sandbagging warning bar */}
        {sandbagging && (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            background: "#EF4444", borderRadius: "0 2px 2px 0",
          }} />
        )}

        {/* Avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "#1a1a2e", color: "#D4A017",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 500,
          flexShrink: 0,
        }}>{initials}</div>

        {/* Name + score label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600,
            color: "#1a1a2e", display: "flex", alignItems: "center", gap: 5,
          }}>
            {player.first_name} {player.last_name}
            {showBadges && sandbagging && (
              <span title="Sandbagging review required"
                    style={{ fontSize: 9, color: "#EF4444" }}>⚠</span>
            )}
            {showBadges && returningBadge && (
              <span style={{
                fontFamily: "'DM Mono',monospace", fontSize: 8, fontWeight: 700,
                background: "#1a1a2e", color: "#D4A017",
                padding: "1px 4px", borderRadius: 3, letterSpacing: ".04em",
              }}>{returningBadge}</span>
            )}
          </div>

          {showScoreLabel && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, position: "relative" }}
              onMouseEnter={() => setHoverScore(true)}
              onMouseLeave={() => setHoverScore(false)}
            >
              {pc.bg && <Pill {...pc} small>{POSITION_LABEL[player.position]}</Pill>}
              <span style={{
                fontFamily: "'DM Mono',monospace", fontSize: 10,
                color: "#888", cursor: "help",
              }}>
                Tier <strong style={{ color: tc.color }}>{tier}</strong>
                {" · "}{years} yrs
                {" · "}<strong style={{ color: "#1a1a2e" }}>Score: {score.toFixed(1)}</strong>
                {adjustment !== 0 && (
                  <span style={{ color: adjustment > 0 ? "#166534" : "#991B1B", marginLeft: 4 }}>
                    ({adjustment > 0 ? "+" : ""}{adjustment})
                  </span>
                )}
              </span>
              {hoverScore && <ScoreTooltip tier={tier} years={years} adjustment={adjustment} />}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- CARD variant: vertical card with full detail ---
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${sandbagging ? "#FCA5A5" : "#E8E6DF"}`,
        borderLeft: sandbagging ? "3px solid #EF4444" : "1px solid #E8E6DF",
        borderRadius: 12,
        padding: 14,
        cursor: onClick ? "pointer" : "default",
        position: "relative",
      }}
    >
      {/* Returning badge top-right */}
      {showBadges && returningBadge && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700,
          background: "#1a1a2e", color: "#D4A017",
          padding: "2px 6px", borderRadius: 3, letterSpacing: ".05em",
        }}>{returningBadge}</div>
      )}

      {/* Header: avatar + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "#1a1a2e", color: "#D4A017",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 500,
          flexShrink: 0,
        }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700,
            color: "#1a1a2e", display: "flex", alignItems: "center", gap: 5,
          }}>
            {player.first_name} {player.last_name}
            {showBadges && sandbagging && (
              <span title="Sandbagging review required"
                    style={{ fontSize: 11, color: "#EF4444" }}>⚠</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
            {pc.bg && <Pill {...pc} small>{POSITION_LABEL[player.position]}</Pill>}
            <Pill {...tc} small>{tier}</Pill>
            {player.age && (
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#bbb" }}>
                age {player.age}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score label row */}
      {showScoreLabel && (
        <div
          style={{
            padding: "6px 10px",
            background: "#F6F5F0",
            borderRadius: 6,
            fontFamily: "'DM Mono',monospace",
            fontSize: 10,
            color: "#555",
            position: "relative",
            cursor: "help",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onMouseEnter={() => setHoverScore(true)}
          onMouseLeave={() => setHoverScore(false)}
        >
          <span>
            Tier <strong style={{ color: tc.color }}>{tier}</strong>
            {" · "}{years} yrs
          </span>
          <span style={{
            fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700,
            color: "#1a1a2e",
          }}>
            {score.toFixed(1)}
            {adjustment !== 0 && (
              <span style={{
                fontSize: 9, marginLeft: 4,
                color: adjustment > 0 ? "#166534" : "#991B1B",
              }}>
                ({adjustment > 0 ? "+" : ""}{adjustment})
              </span>
            )}
          </span>
          {hoverScore && <ScoreTooltip tier={tier} years={years} adjustment={adjustment} />}
        </div>
      )}

      {/* Sandbagging detail */}
      {sandbagging && (
        <div style={{
          marginTop: 8, padding: "6px 10px",
          background: "#FEF2F2", borderRadius: 6,
          fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#991B1B",
        }}>
          ⚠ Sandbagging review — tier {tier} requested {player.division_requested || "lower division"}
        </div>
      )}
    </div>
  );
}
