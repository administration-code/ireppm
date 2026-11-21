"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import EmailTabs from "./EmailTabs";

export default function EmailsList() {
  const [tab, setTab] = useState("draft");
  const [rows, setRows] = useState(null);
  useEffect(() => {
    getBrowserClient()
      .from("email_drafts")
      .select("id, subject, to_emails, status, source, created_at, sent_at")
      .eq("status", tab)
      .order(tab === "sent" ? "sent_at" : "created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setRows(data || []));
  }, [tab]);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <EmailTabs title="Emails" subtitle="Drafts made from templates (or by the assistant) wait here until you review and send them." />
      <div className="seg">
        {["draft", "sent", "discarded"].map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {k === "draft" ? "Drafts" : k === "sent" ? "Sent" : "Discarded"}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">Nothing here.</p>
      ) : (
        <ul className="req-list">
          {rows.map((r) => (
            <li key={r.id} className="req">
              <div className="req-top">
                <Link href={`/admin/emails/${r.id}`}>
                  <b>{r.subject || "(no subject)"}</b>
                </Link>
                <span className="small">
                  {r.source === "ai" ? "Assistant · " : ""}
                  {shortDate(String(r.sent_at || r.created_at).slice(0, 10))}
                </span>
              </div>
              <span className="small">To {(r.to_emails || []).join(", ") || "no one yet"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
