"use client";

import { useState } from "react";
import { openAppFile } from "@/lib/application-client";

export default function AppFileButton({ appId, doc, label, className = "btn ghost sm" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    setBusy(true);
    const problem = await openAppFile(appId, doc);
    setBusy(false);
    setError(problem);
  }

  return (
    <span className="file-btn">
      <button type="button" className={className} onClick={open} disabled={busy}>
        {busy ? "Opening…" : label}
      </button>
      {error ? (
        <span className="small err" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
