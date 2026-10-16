"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SigStatus from "@/components/admin/signatures/SigStatus";
import { SIG_FILTERS, SIG_KIND, SIG_LIST_SELECT, outTo, shortDate } from "@/lib/signatures";

export default function SignaturesList() {
  const [filter, setFilter] = useState("awaiting");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

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
  }, [filter, kind]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin">
          ← Staff dashboard
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">Signatures</h1>
            <p className="small">Leases, contracts and notices sent through DocuSign.</p>
          </div>
          <Link className="btn ghost sm" href="/admin/signatures/templates">
            Check templates
          </Link>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="addr" href={`/admin/signatures/${r.id}`}>
                      {r.title}
                    </Link>
                  </td>
                  <td>{SIG_KIND[r.kind] || r.kind}</td>
                  <td className="small">{outTo(r) || "—"}</td>
                  <td>
                    <SigStatus status={r.status} />
                  </td>
                  <td className="small">{shortDate(r.sent_at) || "—"}</td>
                  <td className="small">{shortDate(r.completed_at) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
