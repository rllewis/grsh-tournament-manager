"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TEST_REASON = exports.STAGES = exports.NOTE_TAGS = exports.IDLE_DAYS = exports.ENTRY_STATES = exports.DELETE_WORD = void 0;
exports.actionQueue = actionQueue;
exports.ageLabel = void 0;
exports.balanceStatus = balanceStatus;
exports.chunk = chunk;
exports.cleanupGroups = cleanupGroups;
exports.deleteSummary = deleteSummary;
exports.deleteWordOk = void 0;
exports.earlyBirdLine = earlyBirdLine;
exports.entriesCSV = entriesCSV;
exports.entryState = void 0;
exports.filterTeams = filterTeams;
exports.filterTeamsMore = filterTeamsMore;
exports.funnelSteps = funnelSteps;
exports.groupIssues = groupIssues;
exports.healthLabel = healthLabel;
exports.healthSummary = healthSummary;
exports.historyTitle = historyTitle;
exports.idleFlag = idleFlag;
exports.issueCounts = issueCounts;
exports.money = void 0;
exports.nextStep = nextStep;
exports.noteTagLabel = void 0;
exports.nudgeCandidates = nudgeCandidates;
exports.problemTeamIds = void 0;
exports.protectedHelp = protectedHelp;
exports.readiness = readiness;
exports.recordSummary = recordSummary;
exports.removalLines = removalLines;
exports.statusLabel = exports.stageIndex = exports.removalReady = void 0;
exports.stuckDays = stuckDays;
exports.stuckTone = void 0;
exports.tallyResults = tallyResults;
exports.teamFeeLine = teamFeeLine;
exports.teamsCSV = teamsCSV;
exports.testReasons = void 0;
exports.verdict = verdict;
var _importEngine = require("./importEngine");
// Captain Sync — pure logic (no DOM, no fetch), so it can be tested on its own.

const STAGES = exports.STAGES = [{
  key: "invited",
  label: "Invited",
  help: "Team exists, captain has not logged in yet."
}, {
  key: "active",
  label: "Logged in",
  help: "Captain has set a password and can sign in."
}, {
  key: "roster",
  label: "Roster started",
  help: "At least one player is on the roster."
}, {
  key: "deposit",
  label: "Deposit paid",
  help: "The deposit is recorded on the team."
}, {
  key: "paid",
  label: "Paid in full",
  help: "Nothing left to pay."
}];
const ORDER = STAGES.map(s => s.key);
const stageIndex = k => Math.max(0, ORDER.indexOf(k));

// How many teams have reached each step (a team that paid has also logged in, started a roster... so counts are cumulative
// from the stage the team is at, not from separate flags).
exports.stageIndex = stageIndex;
function funnelSteps(teams) {
  const total = (teams || []).length;
  return STAGES.map((s, i) => {
    const n = (teams || []).filter(t => stageIndex(t.stage) >= i).length;
    // Percentages mean nothing with a handful of teams, so callers show "n of total" and only show pct when showPct is true.
    return {
      key: s.key,
      label: s.label,
      help: s.help,
      n,
      total,
      pct: total ? Math.round(n / total * 100) : 0,
      showPct: total >= 8
    };
  });
}
const ENTRY_STATES = exports.ENTRY_STATES = {
  needs_recording: {
    label: "Not recorded",
    tone: "bad",
    help: "The form was submitted but the team shows no deposit."
  },
  recorded: {
    label: "Recorded",
    tone: "ok",
    help: "The deposit is on the team."
  },
  duplicate: {
    label: "Duplicate",
    tone: "mute",
    help: "An earlier entry already covers this team."
  },
  test: {
    label: "Test form",
    tone: "mute",
    help: "Entries from the $1 test form are never recorded."
  },
  no_team: {
    label: "No team",
    tone: "bad",
    help: "This captain has no team this season."
  },
  no_player: {
    label: "Unknown user",
    tone: "warn",
    help: "The logged-in user is not a known player."
  },
  no_user: {
    label: "No login",
    tone: "warn",
    help: "Submitted without being logged in, so it cannot be matched."
  }
};
const entryState = s => ENTRY_STATES[s] || {
  label: s || "?",
  tone: "mute",
  help: ""
};

// One plain headline for the whole page.
exports.entryState = entryState;
function verdict(ov) {
  if (!ov) return null;
  if (!ov.season || !ov.season.exists) return {
    tone: "bad",
    headline: "No season to write to",
    detail: `Settings says season ${ov.season && ov.season.year ? ov.season.year : "(none)"}, but it does not exist. Nothing can be recorded until it does.`
  };
  const bad = (ov.issues || []).filter(i => i.level === "bad").length;
  const warn = (ov.issues || []).filter(i => i.level === "warn").length;
  const probs = bad + warn;
  if (ov.pending > 0) return {
    tone: "bad",
    headline: `${(0, _importEngine.plural)(ov.pending, "deposit")} never reached ${ov.pending === 1 ? "its team" : "their teams"}`,
    detail: "A captain paid through the form but the team shows no deposit." + (probs ? ` ${(0, _importEngine.plural)(probs, "other problem")} also listed.` : ""),
    cta: {
      tab: "deposits",
      label: "Review deposits"
    }
  };
  if (bad) return {
    tone: "warn",
    headline: `${(0, _importEngine.plural)(bad, "problem")} to fix`,
    detail: "None of them are deposits waiting to be recorded.",
    cta: {
      tab: "problems",
      label: "See problems"
    }
  };
  if (warn) return {
    tone: "warn",
    headline: `${(0, _importEngine.plural)(warn, "thing")} worth a look`,
    detail: "Nothing is broken, but a few teams need attention.",
    cta: {
      tab: "problems",
      label: "See problems"
    }
  };
  if (!(ov.teams || []).length) return {
    tone: "info",
    headline: "No captain teams this season yet",
    detail: "Invite a captain to create the first one."
  };
  return {
    tone: "ok",
    headline: "Every deposit is on its team",
    detail: "Captains, teams and form entries line up."
  };
}
function issueCounts(issues) {
  const c = {
    bad: 0,
    warn: 0,
    info: 0
  };
  for (const i of issues || []) {
    if (c[i.level] !== undefined) c[i.level]++;
  }
  return c;
}
function filterTeams(teams, {
  q = "",
  stage = "",
  problemsOnly = false,
  problemTeamIds = []
} = {}) {
  const needle = String(q).trim().toLowerCase();
  const probs = new Set(problemTeamIds);
  return (teams || []).filter(t => {
    if (stage && stageIndex(t.stage) < stageIndex(stage)) return false;
    if (problemsOnly && !probs.has(t.id)) return false;
    if (!needle) return true;
    return [t.name, t.captain && t.captain.name, t.captain && t.captain.email].some(v => String(v || "").toLowerCase().includes(needle));
  });
}
function nextStep(t) {
  if (!t.captain) return "Add a captain";
  if (t.account === "none") return "Send an invite";
  if (t.account === "pending") return "Waiting for the captain to set a password";
  if (t.roster_size === 0) return "Waiting for a roster";
  if (!t.deposit_paid_at) return "Waiting for the deposit";
  if (t.payment_status !== "paid_in_full") return "Balance due";
  return "Done";
}
const money = n => n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
exports.money = money;
const AFTER_LABEL = {
  deposit_paid: "deposit paid",
  paid_in_full: "paid in full",
  unpaid: "unpaid"
};
const statusLabel = s => AFTER_LABEL[s] || s || "unpaid";

// What a confirmation dialog tells the admin before anything is written.
exports.statusLabel = statusLabel;
function recordSummary(entries, ids, sendEmail) {
  const pick = (entries || []).filter(e => ids.includes(e.entry_id) && e.state === "needs_recording" && e.would);
  const early = pick.filter(e => e.would.fee_tier === "early").length;
  const late = pick.filter(e => e.would.fee_tier === "late").length;
  const balance = pick.reduce((s, e) => s + (e.would.balance_due || 0), 0);
  return {
    count: pick.length,
    early,
    late,
    balance,
    deposit: pick.reduce((s, e) => s + (e.would.deposit_amount || 0), 0),
    email: !!sendEmail
  };
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Totals for the result card after recording in batches.
function tallyResults(results) {
  const t = {
    recorded: 0,
    skipped: 0,
    error: 0
  };
  for (const r of results || []) {
    if (t[r.status] !== undefined) t[r.status]++;
  }
  return t;
}
function teamsCSV(ov) {
  const rows = (ov.teams || []).map(t => [t.name, t.division || "", t.captain ? t.captain.name : "", t.captain ? t.captain.email : "", t.account, t.roster_size, t.stage, t.payment_status, t.fee_tier || "", t.fee_total ?? "", t.balance_due ?? "", t.age_days ?? "", t.looks_test ? "yes" : "", t.last_nudged_at || ""]);
  return (0, _importEngine.toCSV)(["team", "division", "captain", "captain_email", "account", "roster_size", "stage", "payment_status", "fee_tier", "fee_total", "balance_due", "age_days", "looks_test", "last_nudged_at"], rows, {
    guardFormulas: true
  });
}
function entriesCSV(ov) {
  const rows = (ov.entries || []).map(e => [e.entry_id, e.form, e.date, e.team || "", e.captain || "", e.state, e.would ? e.would.fee_tier : "", e.would ? e.would.fee_total : "", e.would ? e.would.balance_due : ""]);
  return (0, _importEngine.toCSV)(["entry_id", "form", "date_gmt", "team", "captain", "state", "would_tier", "would_fee_total", "would_balance_due"], rows, {
    guardFormulas: true
  });
}

// Problems grouped for the tab, worst first.
function groupIssues(issues) {
  const order = {
    bad: 0,
    warn: 1,
    info: 2
  };
  return [...(issues || [])].sort((a, b) => order[a.level] - order[b.level] || String(a.title).localeCompare(String(b.title)));
}
const problemTeamIds = issues => [...new Set((issues || []).filter(i => i.team_id && i.level !== "info").map(i => i.team_id))];

// ---------------------------------------------------------------------------------------------------------------
// Clean-up, nudges, money, division balance, next actions
// ---------------------------------------------------------------------------------------------------------------
exports.problemTeamIds = problemTeamIds;
const ageLabel = d => d === null || d === undefined ? "" : d === 0 ? "today" : d === 1 ? "1 day" : d + " days";

// Days a captain team has been sitting before the deposit step. Zero once a deposit exists.
exports.ageLabel = ageLabel;
function stuckDays(t) {
  if (!t || t.age_days === null || t.age_days === undefined) return 0;
  return ["invited", "active", "roster"].includes(t.stage) ? t.age_days : 0;
}
const stuckTone = d => d >= 14 ? "bad" : d >= 7 ? "warn" : "mute";
exports.stuckTone = stuckTone;
const TEST_REASON = exports.TEST_REASON = {
  test_name: "has \"test\" in a name",
  alias_email: "captain email uses a + alias"
};
const testReasons = t => (t.test_flags || []).map(f => TEST_REASON[f] || f);

// Three piles for the clean-up tab.
exports.testReasons = testReasons;
function cleanupGroups(teams) {
  const list = teams || [];
  const suspect = list.filter(t => t.looks_test && t.delete && t.delete.allowed);
  const other = list.filter(t => !t.looks_test && t.delete && t.delete.allowed);
  const protectedTeams = list.filter(t => !(t.delete && t.delete.allowed));
  return {
    suspect,
    other,
    protected: protectedTeams,
    deletable: suspect.length + other.length
  };
}
const DELETE_WORD = exports.DELETE_WORD = "DELETE";
const deleteWordOk = txt => String(txt || "").trim().toUpperCase() === DELETE_WORD;
exports.deleteWordOk = deleteWordOk;
function deleteSummary(teams, ids) {
  const pick = (teams || []).filter(t => ids.includes(t.id));
  const ok = pick.filter(t => t.delete && t.delete.allowed);
  return {
    picked: pick.length,
    ok,
    blocked: pick.filter(t => !(t.delete && t.delete.allowed)),
    withCaptain: ok.filter(t => t.captain).length
  };
}

// Teams a reminder email makes sense for, mirrored from the server rules so the button can show a count.
function nudgeCandidates(teams, cooldownDays = 3, nowMs = Date.now()) {
  return (teams || []).filter(t => {
    if (!t.captain || !t.captain.email || t.looks_test) return false;
    if (["deposit", "paid"].includes(t.stage)) return false;
    if (t.last_nudged_at) {
      const when = Date.parse(String(t.last_nudged_at).replace(" ", "T") + "Z");
      if (!Number.isNaN(when) && nowMs - when < cooldownDays * 86400000 - 14 * 3600000) return false; // site time vs UTC drift, final say is the server's
    }
    return true;
  });
}
function healthSummary(health) {
  const list = health || [];
  const failed = list.filter(h => !h.ok);
  return {
    failed,
    okCount: list.length - failed.length,
    allOk: failed.length === 0 && list.length > 0
  };
}

// The wiring checks say nothing about deposits. When the page headline is not green, say so, so the two never look contradictory.
function healthLabel(hs, v) {
  if (!hs || !hs.okCount) return "";
  const calm = !v || v.tone === "ok";
  if (hs.allOk) return calm ? `Setup checks: all ${hs.okCount} passed` : `Setup is fine (${hs.okCount} checks). The problem above is in the data, not the wiring.`;
  return `${hs.okCount} setup checks passed`;
}
function balanceStatus(row) {
  if (row && row.format === "draft") return {
    tone: "mute",
    label: row.actual ? `Draft division, ${row.actual} registered` : "Draft"
  };
  if (!row || row.expected === null || row.expected === undefined) return {
    tone: "mute",
    label: `${row.actual} team${row.actual === 1 ? "" : "s"}`
  };
  if (row.delta === 0) return {
    tone: "ok",
    label: "On target"
  };
  if (row.delta > 0) return {
    tone: "warn",
    label: `${row.delta} over`
  };
  return {
    tone: "info",
    label: `${-row.delta} to find`
  };
}
function earlyBirdLine(m) {
  if (!m) return "";
  if (m.tier_now === "early" && m.days_left !== null && m.waiting > 0) {
    const save = m.saves_per_team > 0 ? ` Each team saves ${money(m.saves_per_team)}.` : "";
    return `Early fee ends in ${(0, _importEngine.plural)(m.days_left, "day")}. ${(0, _importEngine.plural)(m.waiting, "team")} still to pay.${save}`;
  }
  if (m.tier_now === "late" && m.waiting > 0) return `The early fee has ended. ${(0, _importEngine.plural)(m.waiting, "team")} still to pay at ${money(m.fee_now)}.`;
  return m.waiting === 0 ? "Every team has paid a deposit." : "";
}

// One ranked to-do list. Most urgent first, at most six.
function actionQueue(ov) {
  if (!ov || !ov.season || !ov.season.exists) return [];
  const out = [];
  const teams = ov.teams || [];
  if (ov.pending > 0) out.push({
    key: "record",
    tone: "bad",
    title: `Record ${(0, _importEngine.plural)(ov.pending, "deposit")}`,
    detail: "Paid on the form, missing on the team.",
    cta: "Review",
    go: {
      tab: "deposits"
    }
  });
  const noDiv = teams.filter(t => !t.division_ok).length;
  if (noDiv) out.push({
    key: "division",
    tone: "bad",
    title: `Fix ${(0, _importEngine.plural)(noDiv, "division")}`,
    detail: "Blank or invalid, so the team cannot be placed.",
    cta: "Fix",
    go: {
      tab: "problems"
    }
  });
  const g = cleanupGroups(teams);
  if (g.suspect.length) out.push({
    key: "cleanup",
    tone: "warn",
    title: `Remove ${(0, _importEngine.plural)(g.suspect.length, "test team")}`,
    detail: "Dummy data is skewing every number on this page.",
    cta: "Clean up",
    go: {
      tab: "cleanup"
    }
  });
  const noCap = teams.filter(t => !t.captain && !t.looks_test).length;
  if (noCap) out.push({
    key: "captain",
    tone: "warn",
    title: `Assign a captain to ${(0, _importEngine.plural)(noCap, "team")}`,
    detail: "No captain means no login, no deposit email and no form match.",
    cta: "Assign",
    go: {
      tab: "teams",
      filter: "nocaptain"
    }
  });
  const nudge = nudgeCandidates(teams, ov.cooldown_days || 3).filter(t => stuckDays(t) >= 7).length;
  if (nudge) out.push({
    key: "nudge",
    tone: "warn",
    title: `Remind ${(0, _importEngine.plural)(nudge, "captain")} stuck for a week or more`,
    detail: "One preview, one click.",
    cta: "Preview",
    go: {
      tab: "teams",
      action: "nudge",
      minStuck: 7
    }
  });
  const over = (ov.balance && ov.balance.rows || []).filter(r => r.delta !== null && r.delta > 0);
  if (over.length) out.push({
    key: "balance",
    tone: "info",
    title: `${over.map(r => r.label).join(", ")} ${over.length === 1 ? "has" : "have"} more teams than planned`,
    detail: "Usually leftovers. Check the clean-up tab.",
    cta: "Look",
    go: {
      tab: "cleanup"
    }
  });
  const eb = ov.money && ov.money.tier_now === "early" && ov.money.days_left !== null && ov.money.days_left <= 21 && ov.money.waiting > 0;
  if (eb) out.push({
    key: "earlybird",
    tone: "info",
    title: `Early fee ends in ${(0, _importEngine.plural)(ov.money.days_left, "day")}`,
    detail: `${(0, _importEngine.plural)(ov.money.waiting, "team")} still to pay.`,
    cta: "Remind",
    go: {
      tab: "teams",
      action: "nudge",
      minStuck: 0
    }
  });
  return out.slice(0, 6);
}
function filterTeamsMore(teams, {
  stuck = 0,
  noCaptain = false
} = {}) {
  return (teams || []).filter(t => (!stuck || stuckDays(t) >= stuck) && (!noCaptain || !t.captain));
}
function historyTitle(a) {
  return {
    captain_sync_invite_revoked: "Invite link revoked",
    captain_sync_captain_detached: "Captain detached",
    captain_sync_captain_reattached: "Captain put back",
    captain_sync_note: "Note",
    captain_sync_deposit: "Deposit recorded",
    captain_sync_undo: "Deposit removed (undo)",
    captain_sync_division: "Division changed",
    captain_sync_team_deleted: "Team deleted",
    captain_sync_team_restored: "Team restored",
    captain_sync_captain: "Captain changed"
  }[a] || a;
}
const NOTE_TAGS = exports.NOTE_TAGS = [{
  key: "",
  label: "No tag"
}, {
  key: "phoned",
  label: "Phoned"
}, {
  key: "paying_by_check",
  label: "Paying by check"
}, {
  key: "waiting",
  label: "Waiting on them"
}, {
  key: "dropped",
  label: "May drop out"
}, {
  key: "vip",
  label: "Keep close"
}];
const noteTagLabel = k => (NOTE_TAGS.find(t => t.key === k) || {}).label || "";
exports.noteTagLabel = noteTagLabel;
const IDLE_DAYS = exports.IDLE_DAYS = 14;

// Can this team field a roster yet? One badge, one reason.
function readiness(t) {
  if (!t) return {
    tone: "mute",
    label: "Unknown",
    why: ""
  };
  const need = t.min_players || 0;
  const have = t.roster_size || 0;
  if (!t.captain) return {
    tone: "bad",
    label: "No captain",
    why: "Nobody can log in to build a roster."
  };
  if (!have) return {
    tone: "bad",
    label: "No roster",
    why: "No players added yet."
  };
  if (need && have < need) return {
    tone: "warn",
    label: `${need - have} short`,
    why: `${have} of ${need} players.`
  };
  if (!t.deposit_paid_at) return {
    tone: "info",
    label: "Roster ready, no deposit",
    why: "Roster is full but no deposit is recorded."
  };
  return {
    tone: "ok",
    label: "Ready",
    why: "Roster is full and the deposit is in."
  };
}

// A team with no deposit and no activity for a while. Teams that paid are never idle.
function idleFlag(t) {
  if (!t || t.idle_days === null || t.idle_days === undefined || t.idle_days < IDLE_DAYS) return null;
  return {
    tone: t.idle_days >= 30 ? "bad" : "warn",
    label: `Quiet ${t.idle_days} days`
  };
}

// Per-team early fee: what this team would save by paying before the cutoff.
function teamFeeLine(t, m) {
  if (!t || !m || t.deposit_paid_at) return "";
  if (m.tier_now === "early" && m.days_left !== null && m.days_left !== undefined) return `Pays ${money(m.fee_now)} if they pay in ${(0, _importEngine.plural)(m.days_left, "day")}, ${money((m.fee_now || 0) + (m.saves_per_team || 0))} after.`;
  if (m.tier_now === "late") return `Early fee has ended. They owe ${money(m.fee_now)}.`;
  return "";
}

// What the Remove dialog tells the person before they type anything.
function removalLines(impact) {
  if (!impact) return {
    removes: [],
    keeps: [],
    blocked: []
  };
  return {
    removes: impact.removes || [],
    keeps: impact.keeps || [],
    blocked: impact.blocked || []
  };
}
const removalReady = (impact, name, typed, reason, ack) => !!impact && impact.allowed !== false && String(typed || "").trim().toLowerCase() === String(name || "").trim().toLowerCase() && String(name || "").trim() !== "" && String(reason || "").trim().length >= 3 && (!impact.needs_ack || !!ack);

// Why a team is protected, and the honest next step.
exports.removalReady = removalReady;
function protectedHelp(t) {
  const reasons = t && t.delete && t.delete.reasons || [];
  if (!reasons.length) return "";
  return `Kept because it has ${reasons.join(" and ")}. Open the team and use Remove team to take it out on purpose; you will see exactly what goes first, and History can bring it back.`;
}