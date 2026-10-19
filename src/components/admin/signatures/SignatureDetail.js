"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { canDeleteSignature, deleteSignatureRequest } from "@/lib/delete-records";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import SigStatus from "@/components/admin/signatures/SigStatus";
import ServePanel from "@/components/admin/signatures/ServePanel";
import { SIG_KIND, SIG_STATUS, docusignApi, openInTab, shortDate } from "@/lib/signatures";

const TENANCY_SELECT =
  "id, unit_id, start_date, rent, email_service_ok, email_service_consent, unit:units(id, label, property:properties(id, address, city, postal_code)), tenancy_tenants(full_name, email)";

async function load(id) {
  const sb = getBrowserClient();
  const { data: row, error } = await sb.from("signature_requests").select("*").eq("id", id).maybeSingle();
  if (error || !row) return { row: null, error: error ? "We couldn't load this request. Refresh to try again." : "" };
  const [events, tenancy, notice, certs, parent] = await Promise.all([
    sb.from("signature_events").select("id, event, recipient_email, occurred_at").eq("signature_request_id", id).order("occurred_at", { ascending: false }),
    row.tenancy_id ? sb.from("tenancies").select(TENANCY_SELECT).eq("id", row.tenancy_id).maybeSingle() : { data: null },
    row.notice_id ? sb.from("notices").select("*").eq("id", row.notice_id).maybeSingle() : { data: null },
    sb.from("signature_requests").select("id, title, status").eq("related_request_id", id).order("created_at", { ascending: false }),
    row.related_request_id ? sb.from("signature_requests").select("id, title").eq("id", row.related_request_id).maybeSingle() : { data: null },
  ]);
  return { row, events: events.data || [], tenancy: tenancy.data, notice: notice.data, certs: certs.data || [], parent: parent.data, error: "" };
}

const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function SignatureDetail({ id }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const reload = useCallback(() => load(id).then((d) => setState({ loading: false, ...d })), [id]);
  useEffect(() => {
    reload();
  }, [reload]);

  async function act(action, extra = {}, done) {
    setBusy(action);
    setMessage({ text: "", tone: "" });
    try {
      const res = await docusignApi(`/requests/${id}`, { body: { action, ...extra } });
      if (done) setMessage({ text: done, tone: "ok" });
      refreshStaffCounts();
      await reload();
      return res;
    } catch (err) {
      setMessage({ text: err.message, tone: "err" });
    } finally {
      setBusy("");
    }
  }

  async function openUrl(action, extra) {
    setMessage({ text: "", tone: "" });
    try {
      await openInTab(async () => (await docusignApi(`/requests/${id}`, { body: { action, ...extra } })).url);
    } catch (err) {
      setMessage({ text: err.message, tone: "err" });
    }
  }

  if (state.loading) return <p className="small">Loading…</p>;
  const { row, events, tenancy, notice, certs, parent } = state;
  if (!row) {
    return (
      <div className="empty">
        <h2>{state.error ? "Something went wrong" : "Request not found"}</h2>
        <p>{state.error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/signatures">
          Back to Signatures
        </Link>
      </div>
    );
  }

  const open = ["draft", "sent", "delivered"].includes(row.status);
  const recipients = Array.isArray(row.recipients) ? row.recipients : [];
  const isNForm = ["N1", "N4", "N5"].includes(row.kind);
  const unitId = tenancy?.unit_id || row.unit_id;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/signatures">
          ← Signatures
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">Staff · {SIG_KIND[row.kind] || row.kind}</span>
            <h1 className="admin-title">{row.title}</h1>
            <p className="small">
              {[row.sent_at ? `Sent ${shortDate(row.sent_at)}` : `Created ${shortDate(row.created_at)}`, row.completed_at ? `Completed ${shortDate(row.completed_at)}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <SigStatus status={row.status} />
        </div>
      </div>

      {row.status === "error" && row.error ? <div className="warnbox">DocuSign error: {row.error}</div> : null}
      {row.void_reason ? <div className="warnbox">Voided: {row.void_reason}</div> : null}
      {message.text ? (
        <div className={message.tone === "ok" ? "okbox" : "warnbox"} role="status">
          {message.text}
        </div>
      ) : null}

      <section className="boxed stack" aria-label="Actions">
        <div className="req-actions">
          {row.envelope_id ? (
            <button type="button" className="btn primary sm" onClick={() => openUrl("open")}>
              Open in DocuSign
            </button>
          ) : null}
          {row.kind === "pm_contract" && row.status === "draft" && row.envelope_id ? (
            <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => act("pm-fields", {}, "Initials, owner phone numbers and the page 10 boxes are on the draft. Open it in DocuSign to check.")}>
              {busy === "pm-fields" ? "Adding…" : "Add Initials and Contract Fields"}
            </button>
          ) : null}
          {["sent", "delivered"].includes(row.status) ? (
            <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => act("remind", {}, "Reminder sent.")}>
              {busy === "remind" ? "Sending…" : "Send reminder"}
            </button>
          ) : null}
          {row.envelope_id ? (
            <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => act("refresh", {}, "Status refreshed.")}>
              {busy === "refresh" ? "Refreshing…" : "Refresh status"}
            </button>
          ) : null}
          {row.signed_file_path ? (
            <button type="button" className="btn ghost sm" onClick={() => openUrl("file", { which: "signed" })}>
              View signed PDF
            </button>
          ) : null}
          {row.certificate_file_path ? (
            <button type="button" className="btn ghost sm" onClick={() => openUrl("file", { which: "certificate" })}>
              View certificate
            </button>
          ) : null}
          {open && !voiding ? (
            <button type="button" className="link-btn small" onClick={() => setVoiding(true)}>
              Void
            </button>
          ) : null}
          {canDeleteSignature(row) ? (
            <span className="req-actions-end">
              <DeleteRecord
                summary={`"${row.title}"`}
                run={(r) => deleteSignatureRequest(row, r)}
                onDeleted={() => router.push("/admin/signatures")}
              />
            </span>
          ) : null}
        </div>
        {voiding ? (
          <form
            className="stack"
            style={{ gap: 8 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              await act("void", { reason }, "Envelope voided.");
              setVoiding(false);
            }}
          >
            <div className="field">
              <label htmlFor="void-reason">Reason for voiding</label>
              <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
            </div>
            <div className="req-actions">
              <button type="submit" className="btn primary sm" disabled={Boolean(busy) || !reason.trim()}>
                {busy === "void" ? "Voiding…" : "Void envelope"}
              </button>
              <button type="button" className="link-btn small" onClick={() => setVoiding(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        <ul className="row" style={{ listStyle: "none", padding: 0, margin: 0, flexWrap: "wrap", gap: 8 }} aria-label="Related records">
          {unitId ? (
            <li>
              <Link className="btn ghost sm" href={`/admin/units/${unitId}${row.tenancy_id ? `#tenancy-${row.tenancy_id}` : ""}`}>{row.tenancy_id ? "Open tenancy" : "Open unit"}</Link>
            </li>
          ) : null}
          {row.property_id ? (
            <li>
              <Link className="btn ghost sm" href={`/admin/properties/${row.property_id}`}>Open Property</Link>
            </li>
          ) : null}
          {row.application_id ? (
            <li>
              <Link className="btn ghost sm" href="/admin/requests?tab=applications">Open Application</Link>
            </li>
          ) : null}
          {row.notice_id ? (
            <li>
              <Link className="btn ghost sm" href="/admin/notices">Open Notice</Link>
            </li>
          ) : null}
          {parent ? (
            <li>
              <Link className="btn ghost sm" href={`/admin/signatures/${parent.id}`}>For: {parent.title}</Link>
            </li>
          ) : null}
        </ul>
      </section>

      {isNForm && row.status === "completed" ? (
        <ServePanel row={row} tenancy={tenancy} notice={notice} certs={certs} onServed={reload} />
      ) : null}

      <section className="boxed stack" aria-labelledby="sig-recipients">
        <h2 id="sig-recipients" className="sub-title">
          Recipients
        </h2>
        {recipients.length ? (
          <ul className="sig-docs">
            {recipients.map((r, i) => (
              <li key={`${r.email}-${r.role}-${i}`}>
                <div style={{ minWidth: 0 }}>
                  <strong>{r.name}</strong> <span className="small">({r.role})</span>
                  <div className="small">{r.email}</div>
                </div>
                <div className="small" style={{ textAlign: "right" }}>
                  {SIG_STATUS[r.status] || r.status || "—"}
                  {r.signed_at ? <div>{when(r.signed_at)}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No recipients recorded.</p>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="sig-events">
        <h2 id="sig-events" className="sub-title">
          History
        </h2>
        {events.length ? (
          <ul className="sig-events">
            {events.map((e) => (
              <li key={e.id}>
                <span>{e.event.replace(/-/g, " ")}</span>
                <span className="small">
                  {e.recipient_email ? `${e.recipient_email} · ` : ""}
                  {when(e.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No DocuSign events yet. Refresh status if this seems late.</p>
        )}
      </section>
    </div>
  );
}
