"use client";

import { useEffect, useState } from "react";
import { prettyDateTime } from "@/lib/admin-requests";
import { DELETED_EVENT } from "@/lib/delete-records";

const LIMIT = 50;

export default function DeletedRecords({ records, failed }) {
  const [rows, setRows] = useState(records);

  useEffect(() => {
    const onDeleted = (e) => {
      const { summary, reason } = e.detail || {};
      const row = { id: `local-${Date.now()}`, summary, reason, deleted_at: new Date().toISOString(), who: "You" };
      setRows((list) => [row, ...list].slice(0, LIMIT));
    };
    window.addEventListener(DELETED_EVENT, onDeleted);
    return () => window.removeEventListener(DELETED_EVENT, onDeleted);
  }, []);

  return (
    <details className="deleted-records">
      <summary>
        <span className="eyebrow">Deleted records</span>
        <span className="small"> ({rows.length ? `last ${rows.length}` : "none"})</span>
      </summary>
      {failed ? (
        <p className="small err">The deletion history couldn&apos;t load. Refresh the page to try again.</p>
      ) : rows.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Reason</th>
                <th scope="col">Who</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">{prettyDateTime(r.deleted_at)}</td>
                  <td>{r.summary || "Record"}</td>
                  <td className="small">{r.reason || "—"}</td>
                  <td className="small">{r.who || "Staff"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small">Nothing has been deleted yet.</p>
      )}
    </details>
  );
}
