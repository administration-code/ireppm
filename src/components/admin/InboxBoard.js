"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";

const CATS = { maintenance: "Maintenance", rent: "Rent", lease: "Lease & Signatures", notices: "Notices", landlord: "Landlord", general: "General" };

// Staff: emails to administration@, sorted into categories with a one-line summary.
export default function InboxBoard() {
  const [rows, setRows] = useState(null);
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState("new");
  async function load() {
    let q = getBrowserClient().from("inbound_emails").select("*").eq("direction", "in").eq("status", tab).order("received_at", { ascending: false }).limit(200);
    if (cat) q = q.eq("category", cat);
    const { data } = await q;
    setRows(data || []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, tab]);
  async function mark(id, status) {
    await getBrowserClient().from("inbound_emails").update({ status }).eq("id", id);
    load();
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Assistant</span>
        <h1 className="admin-title">Inbox</h1>
        <p className="small">Emails to administration@, sorted automatically. Reply in Gmail; mark them handled here.</p>
      </div>
      <div className="req-actions">
        <div className="seg">
          {["new", "handled", "ignored"].map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">Nothing here. Emails appear once the mailbox script is set up.</p>
      ) : (
        <ul className="req-list">
          {rows.map((r) => (
            <li key={r.id} className="req">
              <div className="req-top">
                <b>{r.subject || "(no subject)"}</b>
                <span className="small">
                  {CATS[r.category] || "Not sorted"} · {shortDate(String(r.received_at).slice(0, 10))}
                </span>
              </div>
              <span className="small">
                From {r.from_name || r.from_email}
                {r.party_kind && r.party_kind !== "unmatched" ? ` · ${r.party_kind === "landlord" ? "Landlord" : r.party_kind === "tenant" ? "Tenant" : r.party_kind === "partner" ? "Partner" : r.party_kind === "applicant" ? "Applicant" : "Ignored"}${r.party_name ? `: ${r.party_name}` : ""}` : " · Unmatched"}
                {r.thread_id ? (
                  <>
                    {" · "}
                    <a href={`https://mail.google.com/mail/u/administration@ireppm.ca/#all/${r.thread_id}`} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  </>
                ) : null}
              </span>
              {r.summary ? <p className="small" style={{ margin: "4px 0" }}>{r.summary}</p> : null}
              {tab === "new" ? (
                <div className="req-actions">
                  <button type="button" className="btn ghost sm" onClick={() => mark(r.id, "handled")}>
                    Handled
                  </button>
                  <button type="button" className="link-btn small" onClick={() => mark(r.id, "ignored")}>
                    Ignore
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
