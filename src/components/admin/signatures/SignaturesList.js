"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SigStatus from "@/components/admin/signatures/SigStatus";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { canDeleteSignature, deleteSignatureRequest } from "@/lib/delete-records";
import { SIG_FILTERS, SIG_KIND, SIG_LIST_SELECT, docusignApi, outTo, shortDate } from "@/lib/signatures";

export default function SignaturesList() {
  const [filter, setFilter] = useState("awaiting");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState({});

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
    } catch (err) {
      setBusy((b) => ({ ...b, [r.id]: `Couldn't resend: ${err.message}` }));
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
    q.then(({ data, error: e }) => {
      if (!live) return;
      setRows(data || []);
      setError(e ? "We couldn't load signature requests. Refresh the page to try again." : "");
    });
    return () => {
      live = false;
    };
  }, [filter, kind, version]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">Signatures</h1>
            <p className="small">Leases, contracts and notices sent through DocuSign.</p>
          </div>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={sync} disabled={syncing}>
              {syncing ? "Checking DocuSign…" : "Refresh from DocuSign"}
            </button>
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
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="sig-kind" className="visually-hidden">
            Kind
          </label>
          <select id="sig-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {Object.entries(SIG_KIND).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}
      {syncNote ? <p className="small" role="status">{syncNote}</p> : null}
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
                  <td>{SIG_KIND[r.kind] || r.kind}</td>
                  <td className="small">{outTo(r) || "—"}</td>
                  <td>
                    <SigStatus status={r.status} />
                  </td>
                  <td className="small">{shortDate(r.sent_at) || "—"}</td>
                  <td className="small">{shortDate(r.completed_at) || "—"}</td>
                  <td className="r">
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
