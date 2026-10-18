"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { longDate } from "@/lib/format";
import { prettyDateTime } from "@/lib/admin-requests";
import { docusignApi, openInTab } from "@/lib/signatures";

const SELECT = `id, tenancy_id, status, termination_date, reason, phone, decision_note, decided_at, created_at,
  tenancy:tenancies(id, unit:units(id, label, property:properties(id, address, owner:owners(id, name, email))),
  tenancy_tenants(full_name, is_primary, created_at))`;

const STATUS_TEXT = {
  approved: "Approved, N11 sent",
  declined: "Declined",
  cancelled: "Cancelled by tenant",
  signed: "Signed",
};

const placeOf = (r) =>
  [r.tenancy?.unit?.property?.address, r.tenancy?.unit?.label].filter(Boolean).join(", ") || "Unknown unit";

const namesOf = (r) =>
  [...(r.tenancy?.tenancy_tenants || [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || String(a.created_at).localeCompare(String(b.created_at)))
    .map((t) => t.full_name)
    .filter(Boolean)
    .join(", ");

export default function EarlyMoveOuts() {
  const id = useId();
  const [state, setState] = useState({ loading: true, open: [], recent: [], earliest: {}, error: "" });

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    const [open, recent] = await Promise.all([
      sb.from("n11_requests").select(SELECT).eq("status", "requested").order("created_at", { ascending: true }),
      sb
        .from("n11_requests")
        .select(SELECT)
        .neq("status", "requested")
        .order("decided_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const openRows = open.data || [];
    const earliestPairs = await Promise.all(
      openRows.map(async (r) => {
        const { data } = await sb.rpc("n9_earliest_date", {
          p_tenancy_id: r.tenancy_id,
          p_given_on: String(r.created_at).slice(0, 10),
        });
        return [r.id, data || null];
      })
    );
    setState({
      loading: false,
      open: openRows,
      recent: recent.data || [],
      earliest: Object.fromEntries(earliestPairs),
      error: open.error ? "We couldn't load early move-out requests. Refresh the page to try again." : "",
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return null;
  if (!state.open.length && !state.recent.length && !state.error) return null;

  return (
    <section className="boxed stack" aria-labelledby={`${id}-title`} style={{ gap: 16 }}>
      <h2 id={`${id}-title`} className="sub-title">
        Early Move-Out Requests (N11)
      </h2>
      {state.error ? <p className="err">{state.error}</p> : null}
      {state.open.length ? (
        <ul className="n11-list plain-list">
          {state.open.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} earliest={state.earliest[r.id]} onDone={load} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No open requests.</p>
      )}
      {state.recent.length ? (
        <details className="n11-recent">
          <summary>Recent Decisions</summary>
          <ul className="plain-list stack" style={{ gap: 8, marginTop: 10 }}>
            {state.recent.map((r) => (
              <li key={r.id} className="small">
                <strong>{placeOf(r)}</strong> · {longDate(r.termination_date)} · {STATUS_TEXT[r.status] || r.status}
                {r.decision_note ? ` · "${r.decision_note}"` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function RequestCard({ request: r, earliest, onDone }) {
  const id = useId();
  const owner = r.tenancy?.unit?.property?.owner;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  async function approve() {
    const who = owner ? `${owner.name || "the landlord"}${owner.email ? `, ${owner.email}` : ""}` : "no owner on file";
    if (!window.confirm(`This sends the N11 to every tenant on the lease to sign, then to the landlord (${who}).`)) return;
    setBusy(true);
    setError(null);
    try {
      await docusignApi("/n11", { body: { request_id: r.id } });
      await onDone();
    } catch (err) {
      setError({ message: err.message, consentRequired: err.consentRequired });
      setBusy(false);
    }
  }

  async function decline(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await getBrowserClient().rpc("decline_n11_request", { p_id: r.id, p_note: note.trim() });
    if (rpcError) {
      setError({ message: rpcError.message });
      setBusy(false);
      return;
    }
    await onDone();
  }

  return (
    <article className="n11-card" aria-labelledby={`${id}-place`}>
      <h3 id={`${id}-place`}>{placeOf(r)}</h3>
      <dl className="n11-facts">
        <dt>Tenants</dt>
        <dd>{namesOf(r) || "None listed"}</dd>
        <dt>Wants to leave</dt>
        <dd>
          <strong>{longDate(r.termination_date)}</strong>
        </dd>
        <dt>Earliest N9 date</dt>
        <dd>{earliest ? longDate(earliest) : "Unknown"}</dd>
        <dt>Reason</dt>
        <dd className="n11-reason">{r.reason || "None given"}</dd>
        {r.phone ? (
          <>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a>
            </dd>
          </>
        ) : null}
        <dt>Asked</dt>
        <dd>{prettyDateTime(r.created_at)}</dd>
      </dl>

      {error ? (
        <div className="warnbox stack" style={{ gap: 8 }} role="alert">
          <span>{error.message}</span>
          {error.consentRequired ? (
            <button
              type="button"
              className="btn primary sm"
              style={{ justifySelf: "start" }}
              onClick={() => openInTab(async () => (await docusignApi("/consent", { method: "GET" })).url)}
            >
              Grant DocuSign consent
            </button>
          ) : null}
        </div>
      ) : null}

      {declining ? (
        <form className="stack" style={{ gap: 10 }} onSubmit={decline}>
          <div className="field">
            <label htmlFor={`${id}-note`}>Note for the tenant</label>
            <textarea
              id={`${id}-note`}
              rows={3}
              maxLength={1000}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="We can't agree before Dec 31 because…"
            />
          </div>
          <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="btn primary sm" disabled={busy || !note.trim()}>
              {busy ? "Saving…" : "Decline request"}
            </button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setDeclining(false)}>
              Back
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn primary sm" disabled={busy} onClick={approve}>
            {busy ? "Sending…" : "Approve and send N11"}
          </button>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}
    </article>
  );
}
