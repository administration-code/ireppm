"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { loadIsAdmin } from "@/lib/accounting";

// Staff hours (staff_hours, migration 0048). Everyone logs their own hours per day; an admin approves
// or sends back each entry. Approved entries are locked. Pay periods are calendar months.
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const monthOf = (d) => d.slice(0, 7);
const monthLabel = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
const shiftMonth = (m, by) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 15));
  return d.toISOString().slice(0, 7);
};
const lastDay = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
};
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
const hrs = (n) => `${Number(n || 0).toLocaleString("en-CA", { maximumFractionDigits: 2 })} h`;
const sum = (list) => list.reduce((a, r) => a + Number(r.hours || 0), 0);
const STATUS = { submitted: "Waiting for approval", approved: "Approved", rejected: "Sent back" };

export default function StaffHours() {
  const sb = getBrowserClient();
  const [me, setMe] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [month, setMonth] = useState(monthOf(today()));
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState("");
  const [form, setForm] = useState({ work_date: today(), hours: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setMe(data?.user || null));
    loadIsAdmin().then(setIsAdmin);
  }, [sb]);

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("staff_hours")
      .select("*")
      .gte("work_date", `${month}-01`)
      .lte("work_date", lastDay(month))
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (err) {
      setError("We couldn't load hours. Refresh the page to try again.");
      setRows([]);
      return;
    }
    setError("");
    setRows(data || []);
    const ids = [...new Set((data || []).map((r) => r.staff_id))];
    if (ids.length) {
      const { data: people } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      setNames(Object.fromEntries((people || []).map((p) => [p.id, p.full_name || p.email || "Staff member"])));
    }
  }, [sb, month]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = useMemo(() => (rows || []).filter((r) => r.staff_id === me?.id), [rows, me]);
  const byPerson = useMemo(() => {
    const out = {};
    for (const r of rows || []) (out[r.staff_id] ||= []).push(r);
    return out;
  }, [rows]);

  const save = async (e) => {
    e.preventDefault();
    const hours = Number(form.hours);
    if (!form.work_date || !(hours > 0 && hours <= 24)) {
      setError("Enter the date and the hours worked (up to 24).");
      return;
    }
    setSaving(true);
    const payload = { work_date: form.work_date, hours, notes: form.notes.trim() || null };
    const { error: err } = editing
      ? await sb.from("staff_hours").update(payload).eq("id", editing)
      : await sb.from("staff_hours").insert(payload);
    setSaving(false);
    if (err) {
      setError(/locked/i.test(err.message) ? err.message : "We couldn't save that. Try again.");
      return;
    }
    setEditing(null);
    setForm({ work_date: today(), hours: "", notes: "" });
    if (monthOf(payload.work_date) !== month) setMonth(monthOf(payload.work_date));
    else load();
  };

  const remove = async (r) => {
    const { error: err } = await sb.from("staff_hours").delete().eq("id", r.id);
    if (err) setError("We couldn't delete that entry.");
    else load();
  };

  const review = async (ids, status, note) => {
    const { error: err } = await sb.from("staff_hours").update({ status, review_note: note || null }).in("id", ids);
    if (err) setError("We couldn't update those entries.");
    else load();
  };

  const downloadCsv = () => {
    const lines = [["Staff", "Date", "Hours", "Status", "Notes", "Review note"]];
    for (const r of [...(rows || [])].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
      lines.push([names[r.staff_id] || "", r.work_date, r.hours, STATUS[r.status], r.notes || "", r.review_note || ""]);
    }
    const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `staff-hours-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      {error ? <div className="warnbox" role="alert">{error}</div> : null}

      <form className="boxed stack" onSubmit={save} style={{ gap: 14 }}>
        <h2 className="sub-title">{editing ? "Edit Entry" : "Log Hours"}</h2>
        <div className="row3">
          <div className="field">
            <label htmlFor="h-date">Date</label>
            <input id="h-date" type="date" value={form.work_date} max={today()} onChange={(e) => setForm((f) => ({ ...f, work_date: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="h-hours">Hours worked</label>
            <input id="h-hours" inputMode="decimal" placeholder="e.g. 7.5" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="h-notes">What you worked on</label>
          <textarea id="h-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Hours"}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setEditing(null);
                setForm({ work_date: today(), hours: "", notes: "" });
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
        <p className="small" style={{ margin: 0 }}>
          Hours are paid monthly once an admin approves them. You can change or delete an entry until it&apos;s approved.
        </p>
      </form>

      <div className="sec-head">
        <div className="req-actions">
          <button type="button" className="btn ghost sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            ←
          </button>
          <strong>{monthLabel(month)}</strong>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= monthOf(today())}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        {isAdmin && rows?.length ? (
          <button type="button" className="btn ghost sm" onClick={downloadCsv}>
            Download CSV
          </button>
        ) : null}
      </div>

      {rows === null ? (
        <p className="small">Loading…</p>
      ) : (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="sub-title">
            My Hours: {hrs(sum(mine))} logged, {hrs(sum(mine.filter((r) => r.status === "approved")))} approved
          </h2>
          {!mine.length ? (
            <p className="small">Nothing logged for {monthLabel(month)}.</p>
          ) : (
            <HoursTable
              rows={mine}
              actions={(r) =>
                r.status === "approved" ? null : (
                  <>
                    <button
                      type="button"
                      className="link-btn small"
                      onClick={() => {
                        setEditing(r.id);
                        setForm({ work_date: r.work_date, hours: String(r.hours), notes: r.notes || "" });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </button>{" "}
                    <button type="button" className="link-btn small" onClick={() => remove(r)}>
                      Delete
                    </button>
                  </>
                )
              }
            />
          )}
        </section>
      )}

      {isAdmin && rows ? (
        <section className="stack" style={{ gap: 16 }}>
          <h2 className="sub-title">Team Hours for {monthLabel(month)}</h2>
          {!Object.keys(byPerson).length ? <p className="small">No one has logged hours this month.</p> : null}
          {Object.entries(byPerson).map(([id, list]) => (
            <PersonHours key={id} name={names[id] || "Staff member"} rows={list} onReview={review} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PersonHours({ name, rows, onReview }) {
  const waiting = rows.filter((r) => r.status === "submitted");
  return (
    <div className="boxed stack" style={{ gap: 10 }}>
      <div className="sec-head">
        <strong>
          {name}: {hrs(sum(rows.filter((r) => r.status === "approved")))} approved
          {waiting.length ? `, ${hrs(sum(waiting))} waiting` : ""}
        </strong>
        {waiting.length ? (
          <button type="button" className="btn primary sm" onClick={() => onReview(waiting.map((r) => r.id), "approved")}>
            Approve All Waiting ({waiting.length})
          </button>
        ) : null}
      </div>
      <HoursTable rows={rows} actions={(r) => <ReviewActions row={r} onReview={onReview} />} />
    </div>
  );
}

function ReviewActions({ row, onReview }) {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  if (sending)
    return (
      <span className="req-actions" style={{ justifyContent: "flex-end" }}>
        <input aria-label="Why it's sent back" placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} style={{ maxWidth: 180 }} />
        <button type="button" className="link-btn small" onClick={() => onReview([row.id], "rejected", note.trim())}>
          Send Back
        </button>
        <button type="button" className="link-btn small" onClick={() => setSending(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <>
      {row.status !== "approved" ? (
        <button type="button" className="link-btn small" onClick={() => onReview([row.id], "approved")}>
          Approve
        </button>
      ) : null}{" "}
      <button type="button" className="link-btn small" onClick={() => setSending(true)}>
        {row.status === "approved" ? "Unapprove" : "Send Back"}
      </button>
    </>
  );
}

function HoursTable({ rows, actions }) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" className="r">Hours</th>
            <th scope="col">What was worked on</th>
            <th scope="col">Status</th>
            <th scope="col" className="r"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{day(r.work_date)}</td>
              <td className="r">{hrs(r.hours)}</td>
              <td className="small">{r.notes || "—"}</td>
              <td className="small">
                {STATUS[r.status]}
                {r.status === "rejected" && r.review_note ? `: ${r.review_note}` : ""}
              </td>
              <td className="r">{actions(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
