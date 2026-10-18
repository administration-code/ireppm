"use client";

import { useEffect, useRef } from "react";

// Keeps a page's information current without a manual refresh.
// - Re-runs `refresh` every `everyMs` while the page is open on screen.
// - Re-runs it right away when someone comes back to the tab or app after 30+ seconds away.
// - Never while someone is typing in a box or has a pop-up open, so nothing they're entering is lost.
export function useLiveRefresh(refresh, everyMs = 60000) {
  const fn = useRef(refresh);
  fn.current = refresh;
  const last = useRef(Date.now());

  useEffect(() => {
    const busy = () => {
      const a = document.activeElement;
      if (a && (a.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName))) return true;
      return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
    };
    const run = () => {
      if (document.visibilityState !== "visible" || busy()) return;
      last.current = Date.now();
      Promise.resolve(fn.current?.()).catch(() => {});
    };
    const timer = setInterval(run, everyMs);
    const back = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 30000) run();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [everyMs]);
}
