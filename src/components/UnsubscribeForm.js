"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SITE } from "@/lib/site";

// The page behind the unsubscribe link in promotional emails. It waits for a click, so link
// checkers in mail apps can't unsubscribe someone by opening the link.
export default function UnsubscribeForm() {
  const params = useSearchParams();
  const e = params.get("e") || "";
  const t = params.get("t") || "";
  const [state, setState] = useState({ busy: false, done: null, error: "" });

  async function send(action) {
    setState({ busy: true, done: null, error: "" });
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e, t, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That didn't save. Try again.");
      setState({ busy: false, done: action, error: "" });
    } catch (err) {
      setState({ busy: false, done: null, error: err.message });
    }
  }

  if (!e || !t)
    return (
      <p>
        This link is missing some details. To stop our promotional emails, email{" "}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we&apos;ll take you off the list.
      </p>
    );

  return (
    <div className="stack" style={{ gap: 14 }}>
      {state.done === "out" ? (
        <>
          <div className="okbox" role="status">
            Done. <b>{e}</b> won&apos;t get promotional emails from {SITE.name} any more.
          </div>
          <p className="small">
            We&apos;ll still email you about things you need for your tenancy, application or payments. Changed your mind?{" "}
            <button type="button" className="link-btn small" onClick={() => send("in")} disabled={state.busy}>
              Subscribe again
            </button>
          </p>
        </>
      ) : state.done === "in" ? (
        <div className="okbox" role="status">
          You&apos;re subscribed again. Thanks!
        </div>
      ) : (
        <>
          <p>
            Stop promotional emails from {SITE.name} (like portal invitations and news) to <b>{e}</b>?
          </p>
          <p className="small">
            We&apos;ll still send emails you need about your tenancy, application, repairs or payments.
          </p>
          <button type="button" className="btn primary" style={{ justifySelf: "start" }} onClick={() => send("out")} disabled={state.busy}>
            {state.busy ? "Saving…" : "Unsubscribe"}
          </button>
        </>
      )}
      {state.error ? (
        <div className="warnbox" role="alert">
          {state.error}
        </div>
      ) : null}
    </div>
  );
}
