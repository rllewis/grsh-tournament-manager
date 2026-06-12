/**
 * GRSH Tournament Manager — Committee Score Adjustment Editor
 *
 * Modal/inline editor for committee members to apply manual score adjustments
 * to individual players. Range: -5.0 to +5.0 in 0.5 increments.
 *
 * Drop this file at: src/components/CommitteeAdjustmentEditor.jsx
 *
 * Usage in Players.jsx:
 *   <CommitteeAdjustmentEditor
 *     player={selectedPlayer}
 *     onSave={(value, note) => saveAdjustment(playerId, value, note)}
 *     onClose={() => setEditing(null)}
 *   />
 */

import { useState } from "react";
import { scoreBreakdown, ADJUSTMENT_RANGE } from "../lib/playerScoring";

export default function CommitteeAdjustmentEditor({ player, onSave, onClose }) {
  const [value, setValue] = useState(player.committee_score_adjustment || 0);
  const [note,  setNote]  = useState(player.committee_adjustment_note || "");

  const tier  = player.skill_tier_reported;
  const years = player.years_experience || 0;

  const previewBreakdown = scoreBreakdown(tier, years, value);
  const originalBreakdown = scoreBreakdown(tier, years, 0);

  const handleSave = () => {
    onSave(value, note);
    onClose();
  };

  // Build slider steps from -5 to +5 in 0.5 increments
  const steps = [];
  for (let v = -ADJUSTMENT_RANGE; v <= ADJUSTMENT_RANGE; v += 0.5) {
    steps.push(Math.round(v * 10) / 10);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "92vw",
          background: "#fff", borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,.22)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 22px 14px",
          borderBottom: "1px solid #F0EEE8",
        }}>
          <p style={{
            fontFamily: "'DM Mono',monospace", fontSize: 10,
            color: "#aaa", textTransform: "uppercase", letterSpacing: ".08em",
            margin: "0 0 4px",
          }}>Committee adjustment</p>
          <p style={{
            fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700,
            color: "#1a1a2e", margin: 0,
          }}>{player.first_name} {player.last_name}</p>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 22px 22px" }}>

          {/* Score preview */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18,
          }}>
            <div style={{
              padding: "10px 12px",
              background: "#FAFAF8",
              border: "1px solid #E8E6DF",
              borderRadius: 8,
            }}>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#aaa",
                textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 4px",
              }}>Without adjustment</p>
              <p style={{
                fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700,
                color: "#555", margin: 0,
              }}>{originalBreakdown.total.toFixed(1)}</p>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#aaa", margin: "2px 0 0",
              }}>{tier} ({originalBreakdown.tierValue}) + {originalBreakdown.yearsContrib} yrs</p>
            </div>

            <div style={{
              padding: "10px 12px",
              background: value !== 0 ? "#FFFBEB" : "#FAFAF8",
              border: `1px solid ${value !== 0 ? "#FDE68A" : "#E8E6DF"}`,
              borderRadius: 8,
            }}>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#aaa",
                textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 4px",
              }}>With adjustment</p>
              <p style={{
                fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700,
                color: value > 0 ? "#166534" : value < 0 ? "#991B1B" : "#1a1a2e",
                margin: 0,
              }}>{previewBreakdown.total.toFixed(1)}</p>
              <p style={{
                fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#aaa", margin: "2px 0 0",
              }}>
                {value !== 0
                  ? `Adjustment: ${value > 0 ? "+" : ""}${value.toFixed(1)}`
                  : "No adjustment applied"
                }
              </p>
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", marginBottom: 6,
            }}>
              <label style={{
                fontFamily: "'DM Mono',monospace", fontSize: 10,
                color: "#aaa", textTransform: "uppercase", letterSpacing: ".07em",
              }}>Adjustment value</label>
              <span style={{
                fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 600,
                color: value > 0 ? "#166534" : value < 0 ? "#991B1B" : "#1a1a2e",
              }}>{value > 0 ? "+" : ""}{value.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={-ADJUSTMENT_RANGE} max={ADJUSTMENT_RANGE} step={0.5}
              value={value}
              onChange={e => setValue(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#1a1a2e" }}
            />
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#bbb",
              marginTop: 4,
            }}>
              <span>−{ADJUSTMENT_RANGE}.0</span>
              <span>0</span>
              <span>+{ADJUSTMENT_RANGE}.0</span>
            </div>
          </div>

          {/* Quick reset buttons */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {[-2, -1, 0, +1, +2].map(v => (
              <button
                key={v}
                onClick={() => setValue(v)}
                style={{
                  flex: 1,
                  fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 500,
                  background: value === v ? "#1a1a2e" : "#F6F5F0",
                  color:      value === v ? "#D4A017" : "#888",
                  border: `1px solid ${value === v ? "#1a1a2e" : "#E8E6DF"}`,
                  padding: "6px 0", borderRadius: 6, cursor: "pointer",
                }}
              >{v > 0 ? "+" : ""}{v}</button>
            ))}
          </div>

          {/* Note field */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#aaa",
              textTransform: "uppercase", letterSpacing: ".07em",
              display: "block", marginBottom: 6,
            }}>Reason (required if adjusted)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Injury-shortened last season, sandbagged at C1 in 2026..."
              rows={3}
              style={{
                width: "100%",
                fontFamily: "'DM Mono',monospace", fontSize: 12,
                background: "#F6F5F0", border: "1px solid #E8E6DF",
                borderRadius: 6, padding: "8px 10px", color: "#333",
                outline: "none", resize: "vertical",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, fontFamily: "'DM Mono',monospace", fontSize: 12,
                background: "#F6F5F0", color: "#666", border: "1px solid #E8E6DF",
                padding: "10px", borderRadius: 8, cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={value !== 0 && !note.trim()}
              style={{
                flex: 2, fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 500,
                background: "#1a1a2e", color: "#D4A017", border: "none",
                padding: "10px", borderRadius: 8,
                cursor: (value !== 0 && !note.trim()) ? "not-allowed" : "pointer",
                opacity: (value !== 0 && !note.trim()) ? 0.5 : 1,
              }}
            >Save adjustment</button>
          </div>
        </div>
      </div>
    </div>
  );
}
