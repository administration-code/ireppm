"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import AppFileButton from "@/components/AppFileButton";

export const SECURE_TYPES = new Set(["photo_id", "bank_statement"]);

// Landlord: ID and sensitive documents IRep saved for this applicant. They open on a secure page
// (expires, watermarked, no download), and IRep records each view.
export default function OwnerSensitiveDocs({ appId }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    getBrowserClient()
      .rpc("application_sensitive_docs", { p_application_id: appId })
      .then(({ data }) => setInfo(data || null));
  }, [appId]);
  if (!info) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {info.verified ? (
        <p className="small" style={{ margin: 0 }}>
          ✓ ID verified by {info.verified.by} (IRep) on{" "}
          {new Date(`${info.verified.on}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      ) : null}
      {(info.docs || []).length ? (
        <ul className="doc-list">
          {info.docs.map((d) => (
            <li key={d.id}>
              <span className="doc-name">
                <b>{d.label}</b>
                <span className="small">Sensitive · opens on a secure page</span>
              </span>
              <AppFileButton appId={appId} doc={`sensitive:${d.id}`} label="View Securely" />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small" style={{ margin: 0 }}>
        Photo ID and other sensitive documents open on a secure IRep page for 15 minutes. Each view is recorded. Please don&apos;t save, screenshot or share them.
      </p>
    </div>
  );
}
