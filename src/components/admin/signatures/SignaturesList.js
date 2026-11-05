"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SigStatus from "@/components/admin/signatures/SigStatus";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { canDeleteSignature, deleteSignatureRequest } from "@/lib/delete-records";
import { SIG_FILTERS, SIG_KIND, kindLabel, SIG_LIST_SELECT, docusignApi, openInTab, outTo, shortDate } from "@/lib/signatures";

const LANDLORD_KINDS = ["pm_contract"];

export default function SignaturesList() {
  const [filter, setFilter] = useState("awaiting");
  const [kind, setKind] = useState("");
  // Who the documents are for: tenants (leases, notices, consents) or landlords (management contracts).
  const [side, setSide] = useState("");
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("for");
    if (f === "landlords" || f === "tenants") setSide(f);
  }, []);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState({});
  const [reminded, setReminded] = useState({});
  const [openError, setOpenError] = useState("");

  // Pull the latest from DocuSign (statuses, and envelopes made directly in DocuSign) when the page opens.
  const sync = async () => {
    setSyncing(true);
    setSyncNote("");
    try {
      const r = await docusignApi("/sync");
      if (r?.error) setSyncNote(`Couldn't check DocuSign: ${r.error}`);
      else if (r?.imported) setSyncNote(`Added ${r.imported} envelope${r.imported === 1 ? "" : "s"} from DocuSign.`);
      setVersion((v) => v + 1);
    } catch (err) {
      setSyncNote(`Couldn't check DocuSign: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async (r) => {
    setBusy((b) => ({ ...b, [r.id]: "Resending…" }));
    try {
      const res = await docusignApi(`/requests/${r.id}`, { body: { action: "remind" } });
      setBusy((b) => ({ ...b, [r.id]: res?.error ? `Couldn't resend: ${res.error}` : "Resent" }));
      if (!res?.error) setReminded((m) => ({ ...m, [r.id]: res?.reminded_at || new Date().toISOString() }));
    } catch (err) {
      setBusy((b) => ({ ...b, [r.id]: `Couldn't resend: ${err.message}` }));
    }
  };

  const openDocusign = async (r) => {
    setOpenError("");
    try {
      await openInTab(async () => (await docusignApi(`/requests/${r.id}`, { body: { action: "open" } })).url);
    } catch (err) {
      setOpenError(`Couldn't open “${r.title}” in DocuSign: ${err.message}`);
    }
  };

  useEffect(() => {
    let live = true;
    const statuses = SIG_FILTERS.find((f) => f.key === filter).statuses;
    let q = getBrowserClient()
      .from("signature_requests")
      .select(SIG_LIST_SELECT)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(200);
    if (kind) q = q.eq("kind", kind);
    else if (side === "landlords") q = q.in("kind", LANDLORD_KINDS);
    else if (side === "tenants") q = q.not("kind", "in", `(${LANDLORD_KINDS.join(",")})`);
    q.then(async ({ data, error: e }) => {
      if (!live) return;
      setRows(data || []);
      setError(e ? "We couldn't load signature requests. Refresh the page to try again." : "");
      // Latest reminder per request (sent from this site, or reported by DocuSign).
      const ids = (data || []).map((r) => r.id);
      if (!ids.length) return;
      const { data: ev } = await getBrowserClient()
        .from("signature_events")
        .select("signature_request_id, event, occurred_at")
        .in("signature_request_id", ids)
        .or("event.ilike.*remind*,event.ilike.*resent*")
        .order("occurred_at", { ascending: false });
      if (!live) return;
      const latest = {};
      for (const x of ev || []) if (!latest[x.signature_request_id]) latest[x.signature_request_id] = x.occurred_at;
      setReminded(latest);
    });
    return () => {
      live = false;
    };
  }, [filter, kind, side, version]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">Signatures</h1>
            <p className="small">Tenant leases and notices, and landlord management contracts, sent through DocuSign.</p>
          </div>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={sync} disabled={syncing}>
              {syncing ? "Checking DocuSign…" : "Refresh from DocuSign"}
            </button>
            <Link className="btn primary sm" href="/admin/signatures/new?kind=upload">
              Upload a document
            </Link>
            <Link className="btn primary sm" href="/admin/signatures/new?kind=draft">
              Draft a document
            </Link>
            <Link className="btn ghost sm" href="/admin/signatures/templates">
              Check Templates
            </Link>
          </div>
        </div>
      </div>

      <div className="sec-head">
        <div className="seg" role="group" aria-label="Filter by status">
          {SIG_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Filter by who it's for">
          {[
            ["", "Everyone"],
            ["tenants", "Tenants"],
            ["landlords", "Landlords"],
          ].map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              aria-pressed={side === k}
              onClick={() => {
                setSide(k);
                setKind("");
                const url = new URL(window.location.href);
                if (k) url.searchParams.set("for", k);
                else url.searchParams.delete("for");
                window.history.replaceState(null, "", url);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="sig-kind" className="visually-hidden">
            Kind
          </label>
          <select id="sig-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {Object.entries(SIG_KIND)
              .filter(([k]) => !side || (side === "landlords") === LANDLORD_KINDS.includes(k))
              .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}
      {syncNote ? <p className="small" role="status">{syncNote}</p> : null}
      {openError ? <div className="warnbox" role="alert">{openError}</div> : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>Nothing here.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Kind</th>
                <th scope="col">Out to</th>
                <th scope="col">Status</th>
                <th scope="col">Sent</th>
                <th scope="col">Reminder sent</th>
                <th scope="col">Completed</th>
                <th scope="col" className="r">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="addr" href={`/admin/signatures/${r.id}`}>
                      {r.title}
                    </Link>
                    {r.terms?.imported ? <span className="small muted"> · made in DocuSign</span> : null}
                  </td>
                  <td>{kindLabel(r)}</td>
                  <td className="small">{outTo(r) || "—"}</td>
                  <td>
                    <SigStatus status={r.status} />
                  </td>
                  <td className="small">{shortDate(r.sent_at) || "—"}</td>
                  <td className="small">{reminded[r.id] ? shortDate(reminded[r.id]) : "—"}</td>
                  <td className="small">{shortDate(r.completed_at) || "—"}</td>
                  <td className="r">
                    {r.envelope_id && ["draft", "sent", "delivered"].includes(r.status) ? (
                      <button type="button" className="btn ghost sm" onClick={() => openDocusign(r)}>
                        Open in DocuSign<span className="visually-hidden">: {r.title}</span>
                      </button>
                    ) : null}{" "}
                    {["sent", "delivered"].includes(r.status) ? (
                      busy[r.id] ? (
                        <span className="small">{busy[r.id]}</span>
                      ) : (
                        <button type="button" className="link-btn small" onClick={() => resend(r)}>
                          Resend
                        </button>
                      )
                    ) : null}
                    {canDeleteSignature(r) ? (
                      <DeleteRecord
                        summary={`"${r.title}"`}
                        run={(reason) => deleteSignatureRequest(r, reason)}
                        onDeleted={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
