"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.YEARS_DIVISOR = exports.YEARS_CAP = exports.TIER_VALUES = exports.TIER_DESCRIPTIONS = exports.ADJUSTMENT_RANGE = void 0;
exports.computeScore = computeScore;
exports.formatReturningBadge = formatReturningBadge;
exports.formatScoreLabel = formatScoreLabel;
exports.isSandbagging = isSandbagging;
exports.scoreBreakdown = scoreBreakdown;
/**
 * GRSH Tournament Manager — Player Scoring Module
 *
 * Mirrors the PHP scoring engine on the React side so the UI can render
 * draft scores without round-tripping to the API. Used by both Players.jsx
 * and Draft.jsx.
 *
 * Drop this file at: src/lib/playerScoring.js
 */

// ---------------------------------------------------------------------------
// Tier value lookup — must match GRSH_Scoring::TIER_VALUES in PHP
// ---------------------------------------------------------------------------

const TIER_VALUES = exports.TIER_VALUES = {
  A1: 15,
  A2: 14,
  A3: 13,
  B1: 11,
  B2: 10,
  B3: 9,
  C1: 7,
  C2: 6,
  R1: 5,
  R2: 4,
  R3: 3
};
const TIER_DESCRIPTIONS = exports.TIER_DESCRIPTIONS = {
  A1: "Professional (any level)",
  A2: "NCAA Division 1 or 3 College",
  A3: "Major Jr., Tier 1 Junior",
  B1: "Tier II/III Junior, ACHA",
  B2: "Midget Major AAA",
  B3: "Prep Varsity High School",
  C1: "High School Level",
  C2: "Lower Midget Level",
  R1: "Recreational Adult Platinum/Gold",
  R2: "Recreational Silver/B level",
  R3: "Recreational Bronze/C/D Beginner"
};
const YEARS_CAP = exports.YEARS_CAP = 60;
const YEARS_DIVISOR = exports.YEARS_DIVISOR = 5;
const ADJUSTMENT_RANGE = exports.ADJUSTMENT_RANGE = 5;

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

/**
 * Compute the composite draft score for a player.
 * Formula: tier_value + min(years, 60) / 5 + committee_adjustment
 */
function computeScore(tier, years = 0, adjustment = 0) {
  const tierValue = TIER_VALUES[tier] || 0;
  const cappedYears = Math.min(Math.max(years, 0), YEARS_CAP);
  const yearsContrib = cappedYears / YEARS_DIVISOR;
  const clamped = Math.max(-ADJUSTMENT_RANGE, Math.min(ADJUSTMENT_RANGE, adjustment));
  return Math.round((tierValue + yearsContrib + clamped) * 10) / 10;
}

/**
 * Return a structured breakdown for tooltip display.
 */
function scoreBreakdown(tier, years, adjustment = 0) {
  const tierValue = TIER_VALUES[tier] || 0;
  const cappedYears = Math.min(Math.max(years, 0), YEARS_CAP);
  const yearsContrib = Math.round(cappedYears / YEARS_DIVISOR * 10) / 10;
  const clamped = Math.max(-ADJUSTMENT_RANGE, Math.min(ADJUSTMENT_RANGE, adjustment));
  return {
    tier,
    tierValue,
    yearsRaw: years,
    yearsCapped: cappedYears,
    yearsContrib,
    adjustment: Math.round(clamped * 100) / 100,
    total: Math.round((tierValue + yearsContrib + clamped) * 10) / 10
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * The single-line label format: "Tier B1 · 30 yrs · Score: 17.0"
 */
function formatScoreLabel(tier, years, adjustment = 0) {
  const score = computeScore(tier, years, adjustment);
  return `Tier ${tier} · ${years} yrs · Score: ${score.toFixed(1)}`;
}

/**
 * Returning-player badge text: "Y3" for third year, etc.
 */
function formatReturningBadge(seasons) {
  if (!seasons || seasons === 0) return null;
  if (seasons === 1) return "RETURNING";
  return `Y${seasons + 1}`; // "Y3" = third year (2 prior + this one)
}

// ---------------------------------------------------------------------------
// Sandbagging detection — mirrors PHP detect_sandbagging()
// ---------------------------------------------------------------------------

function isSandbagging(tier, divisionRequested) {
  const band = tier?.[0];
  if (band === "A" && divisionRequested !== "gold_open") return true;
  if (band === "B" && (divisionRequested === "senior_b" || divisionRequested === "senior_c")) return true;
  return false;
}