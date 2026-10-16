"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SigStatus from "@/components/admin/signatures/SigStatus";
import { SIG_KIND, shortDate } from "@/lib/signatures";

// Signature requests linked to one record. `column` is tenancy_id, property_id, application_id or unit_id.
export default function DocumentsList({ column, value, title = "Documents", bare = false }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!value) return;
    let live = true;
    getBrowserClient()
      .from("signature_requests")
      .select("id, kind, title, status, sent_at, completed_at, created_at")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => live && setRows(data || []));
    return () => {
      live = false;
    };
  }, [column, value]);

  const list =
    rows === null ? (
      <p className="small">Loading documents…</p>
    ) : rows.length === 0 ? (
      <p className="small">No documents sent through DocuSign yet.</p>
    ) : (
      <ul className="sig-docs">
        {rows.map((r) => (
          <li key={r.id}>
            <div style={{ minWidth: 0 }}>
              <Link href={`/admin/signatures/${r.id}`}>{r.title}</Link>
              <div className="small">
                {SIG_KIND[r.kind] || r.kind} ·{" "}
                {r.completed_at ? `Signed ${shortDate(r.completed_at)}` : r.sent_at ? `Sent ${shortDate(r.sent_at)}` : `Created ${shortDate(r.created_at)}`}
              </div>
            </div>
            <SigStatus status={r.status} />
          </li>
        ))}
      </ul>
    );

  if (bare) return list;
  return (
    <section className="boxed stack" aria-label={title}>
      <h2 className="sub-title">{title}</h2>
      {list}
    </section>
  );
}
