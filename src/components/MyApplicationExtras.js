"use client";

import { useState } from "react";
import AppThread from "@/components/AppThread";
import { getBrowserClient } from "@/lib/supabase";
import { CONSENT_TEXT } from "@/lib/documents";

const OPEN = ["submitted", "reviewing", "approved"];
const LABELS = { owner: "Landlord", staff: "IRep", applicant: "You" };

// Under each of the renter's applications: questions from the landlord or IRep, and
// (for applications made before landlords were part of the consent) a one-click agreement.
export default function MyApplicationExtras({ app, messages, onReload }) {
  const [agreeing, setAgreeing] = useState(false);
  const [error, setError] = useState("");
  const open = OPEN.includes(app.status);
  const needsShare = ["submitted", "reviewing"].includes(app.status) && !/owner/i.test(app.consent_text || "");
  const last = messages[messages.length - 1];
  const asked = open && last && last.sender_role !== "applicant";

  if (!open && !messages.length) return null;

  async function agree() {
    setAgreeing(true);
    setError("");
    const { error: err } = await getBrowserClient().rpc("applicant_agree_owner_review", {
      p_application_id: app.id,
      p_consent_text: CONSENT_TEXT,
    });
    setAgreeing(false);
    if (err) return setError("We couldn't save your agreement. Try again.");
    onReload();
  }

  return (
    <div className="app-extra">
      {needsShare ? (
        <div className="consent">
          <p style={{ fontWeight: 600 }}>To let the property owner review your application, please agree to share it with them.</p>
          <p className="small">{CONSENT_TEXT}</p>
          <div className="row">
            <button type="button" className="btn primary sm" onClick={agree} disabled={agreeing}>
              {agreeing ? "Saving…" : "Agree and share"}
            </button>
            {error ? (
              <span className="small err" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {asked ? (
        <div className="warnbox" role="status">
          The landlord asked a question. Please reply below.
        </div>
      ) : null}
      <AppThread
        appId={app.id}
        messages={messages}
        labels={LABELS}
        mine="applicant"
        onSent={onReload}
        canReply={open}
        heading="Messages about this application"
        replyLabel={asked ? "Your answer" : "Send a message to IRep and the landlord"}
      />
    </div>
  );
}
