"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

const toKey = (b64) => {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
async function authed(path, method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

// "Phone notifications" on/off for this phone, in the Agent Portal. Free: no texting service involved.
export default function PushToggle() {
  const [state, setState] = useState("loading"); // loading | unsupported | ios-install | off | on | blocked | unconfigured
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      const { configured } = await fetch("/api/push/key").then((r) => r.json()).catch(() => ({}));
      if (!configured) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    setMsg("");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
    const { key } = await fetch("/api/push/key").then((r) => r.json());
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const out = await authed("/api/push/subscribe", "POST", sub.toJSON());
    if (out.error) return setMsg(out.error);
    setState("on");
    await authed("/api/push/test", "POST");
    setMsg("On. A test notification is on its way.");
  }
  async function turnOff() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await authed("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("");
  }

  if (state === "loading" || state === "unconfigured") return null;
  return (
    <section id="push" className="boxed stack" aria-labelledby="push-title" style={{ gap: 8 }}>
      <h2 id="push-title" className="sec-title">
        Phone Notifications
      </h2>
      {state === "ios-install" ? (
        <p className="small">On an iPhone, first add IRep to your home screen (Share → Add to Home Screen), open it from there, then turn notifications on here.</p>
      ) : state === "unsupported" ? (
        <p className="small">This browser can&apos;t show notifications. Open ireppm.ca/agent in Chrome or Safari, or from the IRep app on your home screen.</p>
      ) : state === "blocked" ? (
        <p className="small">Notifications are blocked for IRep on this phone. Allow them in your phone&apos;s settings for IRep (or your browser), then come back.</p>
      ) : state === "on" ? (
        <div className="req-actions">
          <span className="small">On for this phone: new jobs, urgent jobs and notices to serve pop up here.</span>
          <button type="button" className="link-btn small" onClick={() => authed("/api/push/test", "POST").then(() => setMsg("Test sent."))}>
            Send a Test
          </button>
          <button type="button" className="link-btn small" onClick={turnOff}>
            Turn Off
          </button>
        </div>
      ) : (
        <div className="req-actions">
          <span className="small">Get new jobs, urgent jobs and notices to serve as notifications on this phone, like a text. Free.</span>
          <button type="button" className="btn primary sm" onClick={turnOn}>
            Turn On
          </button>
        </div>
      )}
      {msg ? <span className="small">{msg}</span> : null}
    </section>
  );
}
