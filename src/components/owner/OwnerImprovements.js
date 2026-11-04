"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import InspectionChecks from "@/components/InspectionChecks";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

// Landlord: an inspection report's recommended improvements, approved or declined line by line.
export default function OwnerImprovements({ id }) {
  const [report, setReport] = useState(undefined);
  const [choices, setChoices] = useState({});
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/owner/improvements?id=${encodeURIComponent(id)}`, { headers: await authHeader() });
      const json = await res.json().catch(() => ({}));
      setReport(res.ok ? json.report : null);
    })();
  }, [id]);

  if (report === undefined) return <p className="small">Loading…</p>;
  if (!report)
    return (
      <div className="empty">
        <h1>Recommended Improvements</h1>
        <p>We couldn&apos;t find this report on your account.</p>
        <Link href="/owner">Back to your portal</Link>
      </div>
    );

  const pick = (itemId, d) => setChoices((c) => ({ ...c, [itemId]: d }));
  const changed = report.items.filter((i) => choices[i.id] && (choices[i.id] !== i.decision || (notes[i.id] ?? i.owner_note ?? "") !== (i.owner_note ?? "")));

  async function save() {
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await fetch("/api/owner/improvements", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        id,
        decisions: changed.map((i) => ({ item_id: i.id, decision: choices[i.id], note: notes[i.id] ?? i.owner_note ?? "" })),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "err", text: json.error || "That didn't save. Try again." });
    setReport(json.report);
    setChoices({});
    setMsg({ kind: "ok", text: "Thanks, we have your answers. We'll send you a price for each approved item before any work starts." });
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/owner">
          ← Your portal
        </Link>
        <span className="eyebrow">Owner Portal</span>
        <h1 className="admin-title">Recommended Improvements</h1>
        <p className="small" style={{ margin: 0 }}>
          {report.property.address} · inspected {shortDate(report.inspected_on)}
        </p>
      </div>

      <section className="boxed stack" aria-labelledby="oi-items">
        <h2 id="oi-items" className="sec-title">
          Approve or Decline Each Item
        </h2>
        <p className="small" style={{ margin: 0 }}>
          Nothing is done or charged yet. We&apos;ll price each item you approve and confirm with you before work starts.
        </p>
        <ul className="plain-list stack" style={{ gap: 0 }}>
          {report.items.map((i, n) => {
            const current = choices[i.id] || i.decision;
            return (
              <li key={i.id} className="stack" style={{ gap: 8, padding: "14px 0", borderTop: n ? "1px solid var(--line)" : 0 }}>
                <div>
                  <b>
                    {n + 1}. {i.description}
                  </b>
                  {i.unit ? <span className="small"> · {i.unit}</span> : null}
                  {i.details ? <span className="small sub-line">{i.details}</span> : null}
                  {i.price != null && i.decision === "approved" ? (
                    <span className="small sub-line">
                      Price: {money(i.price)} + HST ({money(Math.round(Number(i.price) * 113) / 100)})
                    </span>
                  ) : null}
                </div>
                <div className="req-actions">
                  <button type="button" className={`btn sm ${current === "approved" ? "primary" : "ghost"}`} aria-pressed={current === "approved"} onClick={() => pick(i.id, "approved")}>
                    Approve
                  </button>
                  <button type="button" className={`btn sm ${current === "declined" ? "primary" : "ghost"}`} aria-pressed={current === "declined"} onClick={() => pick(i.id, "declined")}>
                    Decline
                  </button>
                  {i.decision !== "pending" && !choices[i.id] ? (
                    <span className="small">
                      You {i.decision} this{i.decided_at ? ` on ${shortDate(String(i.decided_at).slice(0, 10))}` : ""}.
                    </span>
                  ) : null}
                </div>
                {choices[i.id] ? (
                  <div className="field">
                    <label htmlFor={`oi-n-${i.id}`}>Note for IRep (optional)</label>
                    <input id={`oi-n-${i.id}`} value={notes[i.id] ?? i.owner_note ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [i.id]: e.target.value }))} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {msg.text ? (
          <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="button" className="btn primary" onClick={save} disabled={busy || !changed.length}>
            {busy ? "Saving…" : `Save ${changed.length || ""} answer${changed.length === 1 ? "" : "s"}`.replace("  ", " ")}
          </button>
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="oi-checks">
        <h2 id="oi-checks" className="sec-title">
          What We Checked
        </h2>
        <InspectionChecks checks={report.checks} units={report.units} />
        {report.notes ? <p className="req-note pre-line">{report.notes}</p> : null}
      </section>
      <p className="small">Questions? Call {SITE.phone} or email {SITE.email}.</p>
    </div>
  );
}
