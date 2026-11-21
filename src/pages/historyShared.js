// Player History: things every History file needs (server calls, colours, shared styles). Rules live in src/lib/historyEngine.js.
export * from "../lib/historyEngine.js";

export const API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
export const NONCE = window.grshConfig?.nonce || "";
export const adminUrl = (page) => `/wp-admin/admin.php?page=${page}`;

// one place for every request: never throws, always says what went wrong in plain words
export async function apiCall(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", "X-WP-Nonce": NONCE, ...(opts.headers || {}) } });
    let json = null; try { json = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) return { ok: false, status: r.status, error: (json && (json.error || json.message)) || `The server answered ${r.status}.` };
    return { ok: true, data: json };
  } catch (e) { return { ok: false, error: "Could not reach the server. Check your connection." }; }
}

export const DIVISION_COLOR = {
  gold_open: { bg: "#FEF9E7", color: "#92601A", border: "#F5D77E" },
  "45a": { bg: "#E8F6F8", color: "#1A5F6B", border: "#9DD5DC" },
  senior_b: { bg: "#F3EEF9", color: "#4A3070", border: "#C4AEED" },
  senior_c: { bg: "#FDF0E8", color: "#7A3318", border: "#F5B993" },
  womens: { bg: "#FCEAF3", color: "#7A1F4E", border: "#EDB1D1" },
};
export const DIVISION_HUE = { gold_open: "#D4A017", "45a": "#2196a8", senior_b: "#7B5EA7", senior_c: "#B05E3A", womens: "#C2410C" };
export const POSITION_LABEL = { defenseman: "Defense", center: "Center", winger: "Winger", goaltender: "Goalie" };
export const TIER_COLOR = (t) => {
  if (!t) return { bg: "#F3F4F6", color: "#555" };
  const f = t[0];
  if (f === "A") return { bg: "#FCE8E8", color: "#7A1818" };
  if (f === "B") return { bg: "#FEF0E8", color: "#7A4518" };
  if (f === "C") return { bg: "#FEF9E7", color: "#7A5A18" };
  return { bg: "#E8F0FE", color: "#1A3F8F" };
};
export const AVATAR_COLORS = ["#1a1a2e", "#1E3A5F", "#3B1F5E", "#1F4E3B", "#5E3B1F", "#4A1F1F", "#1F3D4E", "#3D2B1F"];
export const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

// shared styles. Labels are 12px and mid-grey #555 or darker on white or cream so they pass 4.5:1 contrast.
export const MONO = "'DM Mono',monospace";
export const wowBtn = { fontFamily: MONO, fontSize: 12, fontWeight: 500, background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#1a1a2e", padding: "7px 11px", borderRadius: 7, cursor: "pointer" };
export const fL = { fontFamily: MONO, fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 4 };
export const sel = { fontFamily: MONO, fontSize: 12, background: "#F6F5F0", border: "1px solid #D8D6CE", borderRadius: 6, padding: "6px 8px", color: "#222", outline: "none", minWidth: 120, height: 32 };
export const TH = { fontFamily: MONO, fontSize: 12, fontWeight: 500, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #E8E6DF", background: "#FAFAF8", userSelect: "none", whiteSpace: "nowrap" };
export const TD = { padding: "11px 14px", verticalAlign: "middle", borderBottom: "1px solid #F3F2ED" };
