"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { orNull, prettyDate, text } from "@/lib/admin-properties";
import { STATUS_LABEL as LISTING_STATUS } from "@/lib/admin-listings";
import {
  TASK_SELECT,
  TURNOVER_SELECT,
  TURNOVER_STATUS,
  daysVacant,
  relativeDays,
  tenantNames,
} from "@/lib/turnovers";
import TurnoverChecklist from "./TurnoverChecklist";
import InspectionsList from "./InspectionsList";

async function loadTurnover(id) {
  const sb = getBrowserClient();
  const [t, tasks] = await Promise.all([
    sb.from("turnovers").select(TURNOVER_SELECT).eq("id", id).maybeSingle(),
    sb.from("turnover_tasks").select(TASK_SELECT).eq("turnover_id", id),
  ]);
  return {
    turnover: t.data,
    tasks: tasks.data || [],
    error: t.error || tasks.error ? "We couldn't load this turnover. Refresh the page to try again." : "",
  };
}

const toForm = (t) => ({
  status: t.status,
  move_out_date: text(t.move_out_date),
  target_ready_date: text(t.target_ready_date),
  notes: text(t.notes),
});

export default function TurnoverEditor({ id }) {
  const [state, setState] = useState({ loading: true, turnover: null, tasks: [], error: "" });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    let alive = true;
    loadTurnover(id).then((data) => {
      if (!alive) return;
      setState({ loading: false, ...data });
      if (data.turnover) setForm(toForm(data.turnover));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, turnover, tasks, error } = state;
  if (loading) return <p className="small">Loading turnover…</p>;
  if (!turnover || !form) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Turnover not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/turnovers">
          Back to turnovers
        </Link>
      </div>
    );
  }

  const unit = turnover.unit;
  const listing = unit?.listing;
  const vacant = daysVacant(turnover);
  const closed = turnover.status === "leased" || turnover.status === "cancelled";

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setMsg({ kind: "", text: "" });
  };

  async function persist(changes, okText) {
    setSaving(true);
    const { data, error: err } = await getBrowserClient()
      .from("turnovers")
      .update(changes)
      .eq("id", turnover.id)
      .select(TURNOVER_SELECT);
    setSaving(false);
    if (err || !data?.length) {
      setMsg({ kind: "err", text: "We couldn't save this turnover. Check the fields and try again." });
      return false;
    }
    setState((s) => ({ ...s, turnover: data[0] }));
    setForm(toForm(data[0]));
    setMsg({ kind: "ok", text: okText });
    return true;
  }

  function save(e) {
    e.preventDefault();
    if (form.move_out_date && form.target_ready_date && form.target_ready_date < form.move_out_date) {
      return setMsg({ kind: "err", text: "The target ready date should be on or after the move-out date." });
    }
    persist(
      {
        status: form.status,
        move_out_date: form.move_out_date || null,
        target_ready_date: form.target_ready_date || null,
        notes: orNull(form.notes),
      },
      "Turnover saved."
    );
  }

  function cancelTurnover() {
    if (!window.confirm("Cancel this turnover? It moves to Closed and the checklist stays for the record.")) return;
    persist({ status: "cancelled" }, "Turnover cancelled.");
  }

  const place = [unit?.property?.address, unit?.label].filter(Boolean).join(" · ");
  const unitHref = `/admin/units/${turnover.unit_id}`;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/turnovers">
          ← Turnovers
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">Staff · Turnover</span>
            <h1 className="admin-title">{place || "Turnover"}</h1>
            <p className="small">
              {[
                unit?.property?.city,
                turnover.move_out_date ? `Move-out ${prettyDate(turnover.move_out_date)} (${relativeDays(turnover.move_out_date)})` : "",
                vacant === null ? "" : `${vacant} ${vacant === 1 ? "day" : "days"} vacant`,
                turnover.ready_on ? `Ready ${prettyDate(turnover.ready_on)}` : "",
                turnover.leased_on ? `Leased ${prettyDate(turnover.leased_on)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className={`pill tv-${turnover.status}`}>{TURNOVER_STATUS[turnover.status]}</span>
        </div>
        <div className="pill-row turn-links">
          <Link className="btn ghost sm" href={unitHref}>
            Unit page
          </Link>
          {turnover.ended_tenancy ? (
            <Link className="btn ghost sm" href={`${unitHref}#tenancy-${turnover.ended_tenancy.id}`}>
              Previous tenancy: {tenantNames(turnover.ended_tenancy) || "no tenants recorded"}
            </Link>
          ) : null}
          {turnover.new_tenancy ? (
            <Link className="btn ghost sm" href={`${unitHref}#tenancy-${turnover.new_tenancy.id}`}>
              New tenancy: {tenantNames(turnover.new_tenancy) || "no tenants recorded"}
            </Link>
          ) : null}
          {listing ? (
            <Link className="btn ghost sm" href={`/admin/listings/${listing.id}`}>
              Listing
            </Link>
          ) : null}
        </div>
      </div>

      <form className="admin-form boxed stack" onSubmit={save} noValidate aria-labelledby="sec-turn-details">
        <h2 id="sec-turn-details" className="sec-title">
          Details
        </h2>
        <div className="row3">
          <div className="field">
            <label htmlFor="t-status">Status</label>
            <select id="t-status" value={form.status} onChange={update("status")}>
              {Object.entries(TURNOVER_STATUS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-moveout">Move-out date</label>
            <input id="t-moveout" type="date" value={form.move_out_date} onChange={update("move_out_date")} />
          </div>
          <div className="field">
            <label htmlFor="t-target">Target ready date</label>
            <input id="t-target" type="date" value={form.target_ready_date} onChange={update("target_ready_date")} />
          </div>
        </div>
        <p className="small">
          Setting the status to Ready or Listed marks the unit vacant. The turnover closes as Leased on its own when a new
          tenancy starts on this unit.
        </p>
        <div className="field">
          <label htmlFor="t-notes">Notes</label>
          <textarea id="t-notes" value={form.notes} onChange={update("notes")} rows={3} />
        </div>
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {!closed ? (
            <button type="button" className="btn ghost" onClick={cancelTurnover} disabled={saving}>
              Cancel turnover
            </button>
          ) : null}
          {msg.text ? (
            <span className={`small ${msg.kind === "err" ? "err" : ""}`} role={msg.kind === "err" ? "alert" : "status"}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </form>

      <TurnoverChecklist
        turnoverId={turnover.id}
        unitId={turnover.unit_id}
        tasks={tasks}
        onTasks={(next) => setState((s) => ({ ...s, tasks: next }))}
      />

      <section className="boxed stack" aria-labelledby="sec-turn-listing">
        <h2 id="sec-turn-listing" className="sec-title">
          Listing
        </h2>
        {listing ? (
          <div className="sec-head">
            <p className="small" style={{ margin: 0 }}>
              This unit&apos;s listing is <span className={`pill ls-${listing.status}`}>{LISTING_STATUS[listing.status] || listing.status}</span>
            </p>
            <Link className="btn ghost sm" href={`/admin/listings/${listing.id}`}>
              Edit listing
            </Link>
          </div>
        ) : (
          <div className="sec-head">
            <p className="small" style={{ margin: 0 }}>
              This unit has no listing yet.
            </p>
            <Link className="btn primary sm" href={`/admin/listings/new?unit=${turnover.unit_id}`}>
              Create listing for this unit
            </Link>
          </div>
        )}
      </section>

      <InspectionsList
        unitId={turnover.unit_id}
        newHref={`/admin/inspections/new?turnover=${turnover.id}&kind=move_out`}
        newLabel="New move-out inspection"
      />
    </div>
  );
}
