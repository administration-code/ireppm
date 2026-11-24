"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { QUOTE_DISCLAIMER, quoteTotals } from "@/lib/inspection-reports";
import InspectionChecks, { PhotoStrip } from "@/components/InspectionChecks";
import InspectionLetter, { normalizeOwnerReport } from "@/components/InspectionLetter";

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
    setMsg({
      kind: "ok",
      text: report.priced
        ? `Thank you, we have your answers. ${report.contact?.name || "We"} will contact you by email to schedule the approved work.`
        : "Thanks, we have your answers. We'll send you a price for each approved item before any work starts.",
    });
  }

  const hasItems = report.items.length > 0;
  function print() {
    const old = document.title;
    document.title = `${report.property.address} - Inspection Report ${report.inspected_on}`;
    window.print();
    setTimeout(() => {
      document.title = old;
    }, 1000);
  }

  return (
    <>
    <div className="print-only">
      <InspectionLetter report={normalizeOwnerReport(report)} opts={{ decisions: true, prices: true, contact: report.contact?.email }} />
    </div>
    <div className="stack no-print" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/owner">
          ← Your portal
        </Link>
        <span className="eyebrow">Owner Portal</span>
        <h1 className="admin-title">{hasItems ? (report.priced ? "Repairs and Improvements: Estimates" : "Recommended Improvements") : "Inspection Report"}</h1>
        <p className="small" style={{ margin: 0 }}>
          {report.property.address} · inspected {shortDate(report.inspected_on)}
        </p>
        <div>
          <button type="button" className="btn ghost sm" onClick={print}>
            Download PDF
          </button>
        </div>
      </div>

      {hasItems ? (
      <section className="boxed stack" aria-labelledby="oi-items">
        <h2 id="oi-items" className="sec-title">
          Approve or Decline Each Item
        </h2>
        <p className="small" style={{ margin: 0 }}>
          {report.priced
            ? `Nothing is done or charged yet. Please approve the items you would like completed. ${report.contact?.name || "We"} will contact you by email to schedule the approved work.`
            : "Nothing is done or charged yet. We'll price each item you approve and confirm with you before work starts."}
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
                  <PhotoStrip photos={i.photos} urls={report.photo_urls || {}} />
                  {i.price != null ? (
                    <span className="sub-line">
                      Estimate: <b>{money(i.price)}</b> + HST <span className="small">({money(Math.round(Number(i.price) * 113) / 100)} with HST)</span>
                    </span>
                  ) : report.priced ? (
                    <span className="small sub-line">Price to be confirmed</span>
                  ) : null}
                </div>
                <div className="req-actions">
                  <button type="button" className={`btn sm ${current === "approved" ? "primary" : "ghost"}`} aria-pressed={current === "approved"} onClick={() => pick(i.id, "approved")}>
                    Approve
                  </button>
                  <button type="button" className={`btn sm ${current === "declined" ? "primary" : "ghost"}`} aria-pressed={current === "declined"} onClick={() => pick(i.id, "declined")}>
                    {report.priced ? "Not Now" : "Decline"}
                  </button>
                  {i.decision !== "pending" && !choices[i.id] ? (
                    <span className="small">
                      You {i.decision === "declined" && report.priced ? "chose Not now for" : i.decision} this{i.decided_at ? ` on ${shortDate(String(i.decided_at).slice(0, 10))}` : ""}.
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
        {report.priced ? <QuoteTotals items={report.items} /> : null}
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
      ) : (
        <div className="okbox">No improvements are recommended from this inspection. The details are below.</div>
      )}

      <section className="boxed stack" aria-labelledby="oi-checks">
        <h2 id="oi-checks" className="sec-title">
          What We Checked
        </h2>
        <InspectionChecks checks={report.checks} units={report.units} urls={report.photo_urls || {}} />
        {report.notes ? <p className="req-note pre-line">{report.notes}</p> : null}
      </section>
      {report.priced ? (
        <p className="small" style={{ margin: 0 }}>
          <b>Disclaimer.</b> {QUOTE_DISCLAIMER}
        </p>
      ) : null}
      <p className="small">
        Questions about this report or the work? Email {report.contact?.name && report.contact.name !== "IRep" ? `${report.contact.name} at ` : ""}
        <a href={`mailto:${report.contact?.email || SITE.email}`}>{report.contact?.email || SITE.email}</a>.
      </p>
    </div>
    </>
  );
}

function QuoteTotals({ items }) {
  const t = quoteTotals(items.map((i) => i.price));
  const approved = quoteTotals(items.filter((i) => i.decision === "approved").map((i) => i.price));
  const row = (label, v, strong) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 600 : 400, fontSize: strong ? "1.1rem" : undefined }}>
      <span>{label}</span>
      <span className="num">{money(v)}</span>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 4, borderTop: "1px solid var(--line)", paddingTop: 10, maxWidth: 420, marginLeft: "auto", width: "100%" }}>
      {row("Subtotal", t.subtotal)}
      {row("HST (13%)", t.hst)}
      {row("Estimated total", t.total, true)}
      {approved.priced ? <span className="small">You&apos;ve approved {money(approved.total)} with HST so far.</span> : null}
    </div>
  );
}
