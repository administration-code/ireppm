"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile "are you human?" check. Most people never see a puzzle; it checks quietly.
// The token goes to Supabase with the sign-in request, and Supabase verifies it with our secret key.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFamM5rxYQ0u-VWv";
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!window.__turnstileLoading) {
    window.__turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return window.__turnstileLoading;
}

const Turnstile = forwardRef(function Turnstile({ onToken }, ref) {
  const box = useRef(null);
  const widget = useRef(null);

  useImperativeHandle(ref, () => ({
    reset() {
      onToken("");
      if (window.turnstile && widget.current !== null) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let alive = true;
    loadScript()
      .then((ts) => {
        if (!alive || !box.current || widget.current !== null) return;
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          callback: (t) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => onToken(""));
    return () => {
      alive = false;
      if (window.turnstile && widget.current !== null) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="turnstile-box" />;
});

export default Turnstile;
