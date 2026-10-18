"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// The privacy breach record (privacy_breaches, migration 0045). Records can be updated as the
// response goes on, but not deleted.
const FIELDS = [
  ["discovered_on", "Date we found out", "date"],
  ["happened_on", "Date it happened (if known)", "date"],
  ["description", "What happened", "area"],
  ["info_involved", "What information (e.g. ID, credit report, banking, contact details)", "area"],
  ["people_affected", "Who and how many people", "text"],
  ["real_risk", "Real risk of significant harm?", "risk"],
  ["risk_reason", "Why (how sensitive, how likely to be misused)", "area"],
  ["contained_steps", "What we did to contain it and stop it happening again", "area"],
  ["reported_opc_on", "Reported to the Privacy Commissioner on", "date"],
  ["notified_people_on", "Told the people affected on", "date"],
  ["notified_others", "Others told (bank, PayProp, police…)", "text"],
  ["closed_on", "Closed on", "date"],
];
const blank = () => ({ discovered_on: new Date().toISOString().slice(0, 10) });
const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");

export default function BreachRecord() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // {} for a new record, or a row
  const [error, setError] = useState("");

  const load = () =>
    getBrowserClient()
      .from("privacy_breaches")
      .select("*")
      .order("discovered_on", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError("We couldn't load the breach record. Refresh the page to try again.");
        setRows(data || []);
      });

  useEffect(() => {
    load();
  }, []);

  if (!rows) return <p className="small">Loading…</p>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      {error ? <div className="warnbox">{error}</div> : null}
      {editing ? (
        <BreachForm
          row={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <button type="button" className="btn primary" style={{ justifySelf: "start" }} onClick={() => setEditing(blank())}>
          Log a Breach
        </button>
      )}
      {!rows.length ? (
        <div className="empty">
          <p>No breaches recorded. Good.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Found</th>
                <th scope="col">What happened</th>
                <th scope="col">Real risk</th>
                <th scope="col">Reported / told</th>
                <th scope="col">Status</th>
                <th scope="col" className="r"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmt(r.discovered_on)}</td>
                  <td>
                    <b>{r.description}</b>
                    {r.people_affected ? <span className="small sub-line">{r.people_affected}</span> : null}
                  </td>
                  <td>{r.real_risk == null ? <span className="small">Not decided</span> : r.real_risk ? "Yes" : "No"}</td>
                  <td className="small">
                    {r.reported_opc_on ? `Commissioner ${fmt(r.reported_opc_on)}` : r.real_risk ? <b>Not yet reported</b> : "—"}
                    {r.notified_people_on ? <span className="sub-line">People told {fmt(r.notified_people_on)}</span> : null}
                  </td>
                  <td>
                    <span className={`pill${r.closed_on ? " st-available" : " st-draft"}`}>{r.closed_on ? "Closed" : "Open"}</span>
                  </td>
                  <td className="r">
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(r)}>
                      Open
                    </button>
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

function BreachForm({ row, onCancel, onSaved }) {
  const [v, setV] = useState(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));

  async function save(e) {
    e.preventDefault();
    if (!String(v.description || "").trim()) return setError("Say what happened.");
    setBusy(true);
    setError("");
    const changes = Object.fromEntries(FIELDS.map(([k]) => [k, v[k] === "" || v[k] === undefined ? null : v[k]]));
    changes.discovered_on = changes.discovered_on || new Date().toISOString().slice(0, 10);
    const t = getBrowserClient().from("privacy_breaches");
    const { error: err } = row.id ? await t.update(changes).eq("id", row.id) : await t.insert(changes);
    setBusy(false);
    if (err) return setError("That didn't save. Try again.");
    onSaved();
  }

  return (
    <form className="boxed stack" style={{ gap: 12 }} onSubmit={save} noValidate>
      <h2 className="sub-title">{row.id ? "Breach Details" : "Log a Breach"}</h2>
      {FIELDS.map(([k, label, type]) => (
        <div className="field" key={k}>
          <label htmlFor={`br-${k}`}>{label}</label>
          {type === "area" ? (
            <textarea id={`br-${k}`} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />
          ) : type === "risk" ? (
            <select
              id={`br-${k}`}
              value={v[k] == null ? "" : v[k] ? "yes" : "no"}
              onChange={(e) => set(k, e.target.value === "" ? null : e.target.value === "yes")}
            >
              <option value="">Not decided yet</option>
              <option value="yes">Yes: report to the Commissioner and tell the people affected</option>
              <option value="no">No</option>
            </select>
          ) : (
            <input id={`br-${k}`} type={type} value={v[k] || ""} onChange={(e) => set(k, e.target.value)} />
          )}
        </div>
      ))}
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="row" style={{ gap: 10 }}>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="link-btn small" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
