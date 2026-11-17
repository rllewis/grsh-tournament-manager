import { useState, useEffect } from "react";

// Other plugins' admin notices (review requests, redirect banners, theme warnings) can push this app 400px down the page.
// Selector lists were never enough: every plugin invents its own banner markup. So instead we hide whatever sits ABOVE our app
// inside the WordPress content area, whatever it is called, and say how many things are hidden so a real warning is never invisible.
const KEEP = /^(screen-meta|screen-meta-links|ajax-response|wpfooter|grsh-)/;
const ATTR = "data-grsh-hidden";
const KEY = "grsh_hide_notices";
const get = () => { try { return window.localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } };
const set = (v) => { try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { /* storage can be blocked */ } };

// Elements before the app, at every level between the app and #wpbody-content, that are not WordPress furniture.
export function findAbove(root, stop) {
  const out = [];
  let node = root;
  while (node && node !== stop && node.parentElement) {
    let p = node.previousElementSibling;
    while (p) {
      const tag = p.tagName;
      const skip = tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "TEMPLATE" || tag === "NOSCRIPT"
        || KEEP.test(p.id || "") || (p.classList && (p.classList.contains("clear") || p.classList.contains("wp-header-end")));
      if (!skip) out.push(p);
      p = p.previousElementSibling;
    }
    node = node.parentElement;
  }
  return out;
}

export default function NoticeToggle() {
  const [hide, setHide] = useState(get);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const el = document.createElement("style"); el.id = "grsh-hide-notices";
    el.textContent = hide ? "[" + ATTR + "]{display:none!important}" : "";
    document.head.appendChild(el);
    return () => el.remove();
  }, [hide]);
  useEffect(() => {
    const root = document.getElementById("grsh-app");
    const stop = document.getElementById("wpbody-content");
    if (!root || !stop) return undefined;
    const mark = () => {
      const found = findAbove(root, stop);
      // Only count and mark things that have content; empty spacer divs are not notices.
      const real = found.filter((n) => (n.textContent || "").trim() !== "" || n.querySelector("img,svg,iframe"));
      document.querySelectorAll("[" + ATTR + "]").forEach((n) => { if (!real.includes(n)) n.removeAttribute(ATTR); });
      real.forEach((n) => n.setAttribute(ATTR, "1"));
      setCount(real.length);
    };
    mark();
    const t = window.setTimeout(mark, 1500); // some plugins add theirs after load
    let mo = null;
    if (typeof MutationObserver !== "undefined") { mo = new MutationObserver(() => mark()); mo.observe(stop, { childList: true }); }
    return () => { window.clearTimeout(t); if (mo) mo.disconnect(); document.querySelectorAll("[" + ATTR + "]").forEach((n) => n.removeAttribute(ATTR)); };
  }, []);
  if (!count) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 20px 0", fontFamily: "system-ui,sans-serif", fontSize: 13, color: "#55556a" }}>
      <button type="button" onClick={() => { set(!hide); setHide(!hide); }} style={{ background: "none", border: "none", color: "#1a1a2e", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>
        {hide ? `${count} notice${count === 1 ? "" : "s"} from other plugins hidden — show` : "Hide notices from other plugins"}
      </button>
    </div>
  );
}
