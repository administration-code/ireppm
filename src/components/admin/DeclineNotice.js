"use client";

import { useState } from "react";
import { appApi } from "@/lib/application-client";
import { CREDIT_BUREAU, DECLINE_REASONS } from "@/lib/decline-notice";
import { prettyDateTime } from "@/lib/admin-requests";

// Shown once an application is Declined: staff say what the decision relied on and email the
// applicant. If a credit report or other outside information played a part, the email carries
// the notice Ontario's Consumer Reporting Act requires (s. 10), naming the credit bureau.
export default function DeclineNotice({ app, onChange }) {
  const [reasons, setReasons] = useState(() => app.decline_reasons || (app.credit_report_path || app.credit_checked_at ? ["credit"] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (app.decline_notice_sent_at)
    return (
      <p className="small okbox" style={{ margin: 0 }}>
        Decline email sent {prettyDateTime(app.decline_notice_sent_at)}
        {app.decline_reasons?.includes("credit") ? `, with the credit report notice (${CREDIT_BUREAU.name})` : ""}
        {app.decline_reasons?.includes("other") ? ", with the notice about other information" : ""}.
      </p>
    );

  const toggle = (key, on) =>
    setReasons((list) => {
      if (key === "neither") return on ? ["neither"] : [];
      const rest = list.filter((r) => r !== key && r !== "neither");
      return on ? [...rest, key] : rest;
    });

  async function send(sendEmail) {
    if (!reasons.length) return setError("Tick what the decision relied on.");
    setBusy(true);
    setError("");
    const r = await appApi(app.id, "decline-notice", { body: { reasons, send: sendEmail } });
    setBusy(false);
    if (r.error) return setError(r.error);
    onChange({ ...app, decline_reasons: reasons, ...(r.sent ? { decline_notice_sent_at: new Date().toISOString() } : {}) });
  }

  return (
    <div className="confirm-box stack" style={{ gap: 10 }}>
      <b>Tell {app.applicant_name || "the applicant"}</b>
      {app.decline_reasons ? <p className="small" style={{ margin: 0 }}>Recorded without emailing. You can still email them below.</p> : null}
      <p className="small" style={{ margin: 0 }}>
        What did the decision rely on, even partly? If it was the credit report or someone else&apos;s information, the
        law says we must tell them so now (we name {CREDIT_BUREAU.name} and how to get their file). We don&apos;t say
        anything else about the reasons.
      </p>
      {Object.entries(DECLINE_REASONS).map(([key, label]) => (
        <label key={key} className="row small" style={{ gap: 8, alignItems: "flex-start" }}>
          <input type="checkbox" checked={reasons.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="button" className="btn primary sm" onClick={() => send(true)} disabled={busy || !app.applicant_email}>
          {busy ? "Sending…" : "Email the Applicant"}
        </button>
        <button type="button" className="link-btn small" onClick={() => send(false)} disabled={busy}>
          Save without emailing (told them another way)
        </button>
      </div>
    </div>
  );
}
