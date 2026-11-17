import { useState, useEffect } from "react";

// Other plugins' admin notices (review requests, theme warnings) can push this app 400px down the page.
// This hides them on GRSH pages only — and says how many are hidden, so a real warning is never invisible.
// also catches banners that wrap their notice in a div, or sit one level down (for example "please review us" boxes)
const SEL = "#wpbody-content > .notice,#wpbody-content > .updated,#wpbody-content > .error,#wpbody-content > .update-nag,.wrap > .notice,#wpbody-content > div[class*=\"notice\"],#wpbody-content .wrap > div[class*=\"notice\"],#wpbody-content > div[class*=\"review\"],#wpbody-content > div[class*=\"rating\"],#wpbody-content > div:not(#grsh-app):not(#screen-meta):not(#screen-meta-links):not(.clear):not(#ajax-response):not(#wpfooter)";
const KEY = "grsh_hide_notices";
const get = () => { try { return window.localStorage.getItem(KEY) !== "0"; } catch (e) { return true; } };
const set = (v) => { try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) { /* storage can be blocked */ } };

export default function NoticeToggle() {
  const [hide, setHide] = useState(get);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const el = document.createElement("style"); el.id = "grsh-hide-notices";
    el.textContent = hide ? SEL + "{display:none!important}" : "";
    document.head.appendChild(el);
    return () => el.remove();
  }, [hide]);
  useEffect(() => {
    const count_ = () => setCount(document.querySelectorAll(SEL).length);
    count_(); const t = window.setTimeout(count_, 1500); // some plugins add theirs after load
    return () => window.clearTimeout(t);
  }, []);
  if (!count) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 20px 0", fontFamily: "system-ui,sans-serif", fontSize: 12, color: "#6b6b7b" }}>
      <button onClick={() => { set(!hide); setHide(!hide); }} style={{ background: "none", border: "none", color: "#1a1a2e", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>
        {hide ? `${count} notice${count === 1 ? "" : "s"} from other plugins hidden — show` : "Hide notices from other plugins"}
      </button>
    </div>
  );
}
