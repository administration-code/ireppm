"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  ONE_CURRENT_MESSAGE,
  TENANCY_STATUS,
  prettyDate,
  tenancyForm,
  tenancyRow,
  todayISO,
  validateTenancy,
} from "@/lib/admin-properties";
import TenancyFields from "./TenancyFields";
import TenantsEditor from "./TenantsEditor";

async function updateTenancy(id, changes) {
  const { data, error } = await getBrowserClient().from("tenancies").update(changes).eq("id", id).select("id");
  if (error?.code === "23505") throw new Error(ONE_CURRENT_MESSAGE);
  if (error || !data?.length) throw new Error("That didn't save. Try again.");
}

export default function CurrentTenancy({ tenancy, onChanged }) {
  const [mode, setMode] = useState("");
  const [form, setForm] = useState(() => tenancyForm(tenancy));
  const [moveOut, setMoveOut] = useState(tenancy.move_out_date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = (next) => {
    setError("");
    setMode(next);
    if (next === "edit") setForm(tenancyForm(tenancy));
    if (next === "notice" || next === "end") setMoveOut(tenancy.move_out_date || (next === "end" ? todayISO() : ""));
  };

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      setMode("");
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  function saveDetails(e) {
    e.preventDefault();
    const problem = validateTenancy(form);
    if (problem) return setError(problem);
    return run(() => updateTenancy(tenancy.id, tenancyRow(form)));
  }

  function recordNotice(e) {
    e.preventDefault();
    if (!moveOut) return setError("Add the move-out date from the notice.");
    return run(() => updateTenancy(tenancy.id, { status: "notice", move_out_date: moveOut }));
  }

  function endTenancy(e) {
    e.preventDefault();
    return run(() => updateTenancy(tenancy.id, { status: "ended", move_out_date: moveOut || null }));
  }

  const cancelBooking = () =>
    run(async () => {
      const { error: delError } = await getBrowserClient().from("tenancies").delete().eq("id", tenancy.id);
      if (delError) throw new Error("We couldn't cancel this tenancy. Try again.");
    });

  const markMovedIn = () => run(() => updateTenancy(tenancy.id, { status: "active" }));

  return (
    <section className="boxed stack" aria-labelledby="sec-current">
      <div className="req-top">
        <h2 id="sec-current" className="sec-title">
          Current tenancy
        </h2>
        <span className={`pill ts-${tenancy.status}`}>{TENANCY_STATUS[tenancy.status]}</span>
      </div>

      {mode === "edit" ? (
        <form className="stack" onSubmit={saveDetails} noValidate aria-label="Edit tenancy details">
          <TenancyFields form={form} setForm={setForm} idPrefix="edit" />
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => open("")} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="req-facts">
            <div>
              <dt>Start</dt>
              <dd>{prettyDate(tenancy.start_date)}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{tenancy.end_date ? prettyDate(tenancy.end_date) : "Month-to-month"}</dd>
            </div>
            {tenancy.move_out_date ? (
              <div>
                <dt>Moving out</dt>
                <dd>{prettyDate(tenancy.move_out_date)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Rent</dt>
              <dd className="num">
                {money(tenancy.rent)} / month, due on day {tenancy.rent_due_day}
              </dd>
            </div>
            <div>
              <dt>Last month&apos;s rent deposit</dt>
              <dd className="num">{tenancy.last_month_deposit !== null ? money(tenancy.last_month_deposit) : "None recorded"}</dd>
            </div>
            <div>
              <dt>Key deposit</dt>
              <dd className="num">{tenancy.key_deposit !== null ? money(tenancy.key_deposit) : "None recorded"}</dd>
            </div>
            <div>
              <dt>PayProp reference</dt>
              <dd>{tenancy.payprop_reference || "Not set"}</dd>
            </div>
          </dl>
          {tenancy.notes ? <p className="req-note">{tenancy.notes}</p> : null}
        </>
      )}

      <TenantsEditor tenancyId={tenancy.id} tenants={tenancy.tenancy_tenants || []} onChanged={onChanged} />

      {mode === "notice" ? (
        <form className="confirm-box stack" onSubmit={recordNotice} noValidate aria-label="Record notice">
          <div className="field">
            <label htmlFor="notice-date">Move-out date from the notice</label>
            <input id="notice-date" type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} />
          </div>
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Saving…" : "Record notice"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => open("")} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : mode === "end" ? (
        <form className="confirm-box stack" onSubmit={endTenancy} noValidate aria-label="Confirm end of tenancy">
          <p>
            <b>End this tenancy?</b> It moves to past tenancies and the unit is marked as turnover. This can&apos;t be
            undone here.
          </p>
          <div className="field">
            <label htmlFor="end-date">Move-out date</label>
            <input id="end-date" type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} />
          </div>
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Ending…" : "Yes, end tenancy"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => open("")} disabled={busy}>
              Keep it
            </button>
          </div>
        </form>
      ) : mode === "cancel" ? (
        <div className="confirm-box stack" role="group" aria-label="Confirm cancellation">
          <p>
            <b>Cancel this upcoming tenancy?</b> It and its tenants are deleted. The unit&apos;s status doesn&apos;t change.
          </p>
          <div className="req-actions">
            <button type="button" className="btn primary sm" onClick={cancelBooking} disabled={busy}>
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => open("")} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      ) : mode !== "edit" ? (
        <div className="req-actions">
          <button type="button" className="btn ghost sm" onClick={() => open("edit")}>
            Edit details
          </button>
          {tenancy.status === "upcoming" ? (
            <>
              <button type="button" className="btn primary sm" onClick={markMovedIn} disabled={busy}>
                {busy ? "Saving…" : "Mark as moved in"}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => open("cancel")}>
                Cancel tenancy
              </button>
            </>
          ) : (
            <>
              {tenancy.status === "active" ? (
                <button type="button" className="btn ghost sm" onClick={() => open("notice")}>
                  Record notice
                </button>
              ) : (
                <button type="button" className="btn ghost sm" onClick={() => open("notice")}>
                  Change move-out date
                </button>
              )}
              <button type="button" className="btn primary sm" onClick={() => open("end")}>
                End tenancy
              </button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
