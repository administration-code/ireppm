"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { docusignApi } from "@/lib/signatures";
import { blockedReason, useDocusignStatus } from "@/lib/use-docusign-status";

// getForm() returns the form object, or throws an Error with a message for staff.
export default function SendButtons({ kind, getForm, onCancel }) {
  const router = useRouter();
  const status = useDocusignStatus();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorId, setErrorId] = useState("");
  const blocked = blockedReason(status, kind);

  async function submit(mode) {
    setError("");
    setErrorId("");
    let form;
    try {
      form = getForm();
    } catch (err) {
      setError(err.message);
      return;
    }
    setBusy(mode);
    const tab = mode === "review" ? window.open("", "_blank") : null;
    try {
      const res = await docusignApi("/send", { body: { kind, mode, form } });
      if (tab && res.url) tab.location.href = res.url;
      else tab?.close();
      refreshStaffCounts();
      router.push(`/admin/signatures/${res.id}`);
    } catch (err) {
      tab?.close();
      setError(err.message);
      setErrorId(err.id || "");
      setBusy("");
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="req-actions">
        <button type="button" className="btn primary" disabled={Boolean(blocked) || Boolean(busy)} onClick={() => submit("review")}>
          {busy === "review" ? "Opening DocuSign…" : "Review in DocuSign"}
        </button>
        {kind !== "pm_contract" ? (
          <button type="button" className="btn ghost" disabled={Boolean(blocked) || Boolean(busy)} onClick={() => submit("send")}>
            {busy === "send" ? "Sending…" : "Send now"}
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" className="link-btn small" onClick={onCancel} disabled={Boolean(busy)}>
            Cancel
          </button>
        ) : null}
      </div>
      {blocked ? <p className="small">{blocked}</p> : null}
      {error ? (
        <p className="small err" role="alert">
          {error}
          {errorId ? (
            <>
              {" "}
              <Link href={`/admin/signatures/${errorId}`}>See the saved request</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
