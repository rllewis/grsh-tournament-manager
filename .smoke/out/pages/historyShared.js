"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  API: true,
  NONCE: true,
  adminUrl: true,
  apiCall: true,
  DIVISION_COLOR: true,
  DIVISION_HUE: true,
  POSITION_LABEL: true,
  TIER_COLOR: true,
  AVATAR_COLORS: true,
  avatarColor: true,
  MONO: true,
  wowBtn: true,
  fL: true,
  sel: true,
  TH: true,
  TD: true
};
exports.adminUrl = exports.TIER_COLOR = exports.TH = exports.TD = exports.POSITION_LABEL = exports.NONCE = exports.MONO = exports.DIVISION_HUE = exports.DIVISION_COLOR = exports.AVATAR_COLORS = exports.API = void 0;
exports.apiCall = apiCall;
exports.wowBtn = exports.sel = exports.fL = exports.avatarColor = void 0;
var _historyEngine = require("../lib/historyEngine.js");
Object.keys(_historyEngine).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _historyEngine[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _historyEngine[key];
    }
  });
});
// Player History: things every History file needs (server calls, colours, shared styles). Rules live in src/lib/historyEngine.js.

const API = exports.API = window.grshConfig?.apiUrl || "/wp-json/grsh/v1";
const NONCE = exports.NONCE = window.grshConfig?.nonce || "";
const adminUrl = page => `/wp-admin/admin.php?page=${page}`;

// one place for every request: never throws, always says what went wrong in plain words
exports.adminUrl = adminUrl;
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
const DIVISION_COLOR = exports.DIVISION_COLOR = {
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
const DIVISION_HUE = exports.DIVISION_HUE = {
  gold_open: "#D4A017",
  "45a": "#2196a8",
  senior_b: "#7B5EA7",
  senior_c: "#B05E3A",
  womens: "#C2410C"
};
const POSITION_LABEL = exports.POSITION_LABEL = {
  defenseman: "Defense",
  center: "Center",
  winger: "Winger",
  goaltender: "Goalie"
};
const TIER_COLOR = t => {
  if (!t) return {
    bg: "#F3F4F6",
    color: "#555"
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
exports.TIER_COLOR = TIER_COLOR;
const AVATAR_COLORS = exports.AVATAR_COLORS = ["#1a1a2e", "#1E3A5F", "#3B1F5E", "#1F4E3B", "#5E3B1F", "#4A1F1F", "#1F3D4E", "#3D2B1F"];
const avatarColor = id => AVATAR_COLORS[id % AVATAR_COLORS.length];

// shared styles. Labels are 12px and mid-grey #555 or darker on white or cream so they pass 4.5:1 contrast.
exports.avatarColor = avatarColor;
const MONO = exports.MONO = "'DM Mono',monospace";
const wowBtn = exports.wowBtn = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 500,
  background: "#EEF2FF",
  border: "1px solid #C7D2FE",
  color: "#1a1a2e",
  padding: "7px 11px",
  borderRadius: 7,
  cursor: "pointer"
};
const fL = exports.fL = {
  fontFamily: MONO,
  fontSize: 12,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  display: "block",
  marginBottom: 4
};
const sel = exports.sel = {
  fontFamily: MONO,
  fontSize: 12,
  background: "#F6F5F0",
  border: "1px solid #D8D6CE",
  borderRadius: 6,
  padding: "6px 8px",
  color: "#222",
  outline: "none",
  minWidth: 120,
  height: 32
};
const TH = exports.TH = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 500,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  padding: "10px 14px",
  textAlign: "left",
  borderBottom: "1px solid #E8E6DF",
  background: "#FAFAF8",
  userSelect: "none",
  whiteSpace: "nowrap"
};
const TD = exports.TD = {
  padding: "11px 14px",
  verticalAlign: "middle",
  borderBottom: "1px solid #F3F2ED"
};