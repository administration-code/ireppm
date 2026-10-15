"use client";

import { useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { todayISO } from "@/lib/rent";
import {
  NOTICE_FIELDS,
  NOTICE_FORMS,
  NOTICE_STATUS,
  SERVICE_METHODS,
  amountLabel,
  effectiveLabel,
} from "@/lib/notices";

function toForm(n) {
  return {
    form: n?.form || "N4",
    title: n?.title || "",
    served_on: n?.served_on || todayISO(),
    service_method: n?.service_method || "in_person",
    served_by: n?.served_by || "",
    effective_date: n?.effective_date || "",
    amount: n?.amount != null ? String(n.amount) : "",
    status: n?.status || "served",
    ltb_file_number: n?.ltb_file_number || "",
    notes: n?.notes || "",
  };
}

const orNull = (v) => (String(v ?? "").trim() ? String(v).trim() : null);

export default function NoticeForm({ tenancyId, notice, onSaved, onCancel }) {
  const id = useId();
  const [form, setForm] = useState(() => toForm(notice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.served_on)) return setError("Add the date the notice was served.");
    if (form.form === "other" && !form.title.trim()) return setError("Give the notice a short title.");
    const amount = form.amount.trim();
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) return setError("Enter the amount in dollars, like 2100 or 1850.50.");

    const row = {
      form: form.form,
      title: orNull(form.title),
      served_on: form.served_on,
      service_method: form.service_method || null,
      served_by: orNull(form.served_by),
      effective_date: orNull(form.effective_date),
      amount: amount ? Number(amount) : null,
      status: form.status,
      ltb_file_number: orNull(form.ltb_file_number),
      notes: orNull(form.notes),
    };
    setSaving(true);
    setError("");
    const sb = getBrowserClient();
    const { data, error: err } = notice
      ? await sb.from("notices").update(row).eq("id", notice.id).select(NOTICE_FIELDS)
      : await sb.from("notices").insert({ ...row, tenancy_id: tenancyId }).select(NOTICE_FIELDS);
    setSaving(false);
    if (err || !data?.length) return setError("That didn't save. Try again.");
    onSaved(data[0]);
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-form`}>Form</label>
          <select id={`${id}-form`} value={form.form} onChange={set("form")}>
            {Object.entries(NOTICE_FORMS).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "other" ? v : `${k} ${v}`}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-title`}>Title{form.form === "other" ? "" : " (optional)"}</label>
          <input id={`${id}-title`} value={form.title} onChange={set("title")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-status`}>Status</label>
          <select id={`${id}-status`} value={form.status} onChange={set("status")}>
            {Object.entries(NOTICE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-served`}>Served on</label>
          <input id={`${id}-served`} type="date" value={form.served_on} onChange={set("served_on")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-method`}>Method</label>
          <select id={`${id}-method`} value={form.service_method} onChange={set("service_method")}>
            {Object.entries(SERVICE_METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-by`}>Served by</label>
          <input id={`${id}-by`} value={form.served_by} onChange={set("served_by")} />
        </div>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={`${id}-eff`}>{effectiveLabel(form.form)}</label>
          <input id={`${id}-eff`} type="date" value={form.effective_date} onChange={set("effective_date")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-amt`}>{amountLabel(form.form)} ($)</label>
          <input id={`${id}-amt`} inputMode="decimal" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-ltb`}>LTB file number</label>
          <input id={`${id}-ltb`} value={form.ltb_file_number} onChange={set("ltb_file_number")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} rows={3} value={form.notes} onChange={set("notes")} />
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={saving}>
          {saving ? "Saving…" : notice ? "Save notice" : "Log notice"}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
