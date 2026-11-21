// Full Team Rosters (admin list): status words, filtering, sorting and the bulk-remove plan.
// Pure functions only (tested in tests/js/fullTeamsEngine.test.mjs).

export const STATUS_LABELS = {
  not_submitted: "Not submitted",
  sent_back: "Sent back",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  change_pending: "Change requested",
};

/** One status per team, so the list never shows two competing pills. */
export function statusOf(team) {
  const rs = team && team.review_status ? String(team.review_status) : "";
  let key;
  if (!team || !team.draft_locked) key = rs === "changes_requested" ? "sent_back" : "not_submitted";
  else if (rs === "under_review") key = "under_review";
  else if (rs === "approved") key = "approved";
  else if (rs === "change_pending") key = "change_pending";
  else key = "submitted";
  return { key, label: STATUS_LABELS[key] };
}

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

/** Search box: name, captain, captain email, division. */
export function matchesQuery(team, q) {
  const needle = norm(q);
  if (!needle) return true;
  return [team.name, team.captain_name, team.captain_email, team.division_label]
    .some((v) => norm(v).includes(needle));
}

export const SORTS = [
  { key: "division", label: "Division, then name" },
  { key: "name", label: "Name A to Z" },
  { key: "newest", label: "Newest first" },
  { key: "players_low", label: "Fewest players first" },
];

const byName = (a, b) => norm(a.name).localeCompare(norm(b.name));

/** f = { q, division, status, show: "all" | "test" | "real", sort }. Returns a new array. */
export function filterAndSort(teams, f = {}) {
  const list = (Array.isArray(teams) ? teams : []).filter((t) => {
    if (!matchesQuery(t, f.q)) return false;
    if (f.division && f.division !== "all" && t.division !== f.division) return false;
    if (f.status && f.status !== "all" && statusOf(t).key !== f.status) return false;
    if (f.show === "test" && !t.looks_test) return false;
    if (f.show === "real" && t.looks_test) return false;
    return true;
  });
  const sorters = {
    name: byName,
    newest: (a, b) => (norm(b.created_at) > norm(a.created_at) ? 1 : norm(b.created_at) < norm(a.created_at) ? -1 : byName(a, b)),
    players_low: (a, b) => (a.player_count - b.player_count) || byName(a, b),
    division: (a, b) => norm(a.division_label).localeCompare(norm(b.division_label)) || byName(a, b),
  };
  return list.sort(sorters[f.sort] || sorters.division);
}

/** Numbers for the one-line summary under the page title. */
export function summarize(teams) {
  const list = Array.isArray(teams) ? teams : [];
  return {
    total: list.length,
    notSubmitted: list.filter((t) => statusOf(t).key === "not_submitted").length,
    needReview: list.filter((t) => ["submitted", "change_pending"].includes(statusOf(t).key)).length,
    looksTest: list.filter((t) => t.looks_test).length,
    duplicates: list.filter((t) => Array.isArray(t.duplicates) && t.duplicates.length > 0).length,
  };
}

export function testTeamIds(teams) {
  return (Array.isArray(teams) ? teams : []).filter((t) => t.looks_test).map((t) => t.id);
}

/**
 * What a bulk remove would do with the picked teams. Only teams Captain Sync's bulk delete accepts
 * (no players, no payment, no deposit entry, no history) are removable; the rest are kept with the
 * reason, and are removed one at a time from their own page where the full impact is shown.
 */
export function bulkPlan(teams, selectedIds) {
  const picked = new Set(selectedIds || []);
  const removable = [], kept = [];
  (Array.isArray(teams) ? teams : []).forEach((t) => {
    if (!picked.has(t.id)) return;
    const removal = t.cleanup && t.cleanup.removal;
    if (removal && removal.bulk_allowed) removable.push({ id: t.id, name: t.name });
    else kept.push({
      id: t.id, name: t.name,
      reasons: removal && removal.reasons && removal.reasons.length ? removal.reasons : ["its removal details could not be read"],
    });
  });
  return { removable, kept };
}

/** The remove dialog's confirm button: reason, exact team name, and the tick when the team holds players or money. */
export function canConfirmRemove({ reason, typedName, teamName, needsAck, acknowledged }) {
  if (String(reason || "").trim().length < 3) return false;
  if (norm(typedName) !== norm(teamName) || norm(teamName) === "") return false;
  if (needsAck && !acknowledged) return false;
  return true;
}

/** "7/11" style waiver text, "—" when the roster is empty so an empty team is not shown as 0/0 failures. */
export function waiverText(team) {
  const total = Number(team && team.waivers_total) || 0;
  if (total === 0) return "—";
  return `${Number(team.waivers_signed) || 0}/${total}`;
}

export function waiversComplete(team) {
  const total = Number(team && team.waivers_total) || 0;
  return total > 0 && Number(team.waivers_signed) === total;
}

/** Short reason text for the Test? badge tooltip. */
export function testReason(team) {
  const flags = (team && team.test_flags) || [];
  const parts = [];
  if (flags.includes("test_name")) parts.push('a name with "test", "demo" or similar');
  if (flags.includes("alias_email")) parts.push("a captain email with a + alias");
  return parts.length ? `Looks like test data: ${parts.join(" and ")}.` : "";
}

export function duplicateText(team) {
  const d = (team && team.duplicates) || [];
  if (!d.length) return "";
  return d.map((o) => `${o.same_division ? "same division" : o.division_label}${o.captain_name ? ", captain " + o.captain_name : ""}`).join("; ");
}
