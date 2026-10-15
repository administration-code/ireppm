"use client";

export default function TenancyFields({ form, setForm, idPrefix }) {
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const id = (k) => `${idPrefix}-${k}`;

  return (
    <div className="stack">
      <div className="row3">
        <div className="field">
          <label htmlFor={id("start")}>Start date</label>
          <input id={id("start")} type="date" value={form.start_date} onChange={update("start_date")} required />
        </div>
        <div className="field">
          <label htmlFor={id("end")}>End date</label>
          <input id={id("end")} type="date" value={form.end_date} onChange={update("end_date")} />
          <span className="small">Leave empty for month-to-month.</span>
        </div>
        <div className="field">
          <label htmlFor={id("due")}>Rent due day (1–28)</label>
          <input id={id("due")} type="number" inputMode="numeric" min="1" max="28" step="1" value={form.rent_due_day} onChange={update("rent_due_day")} />
        </div>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={id("rent")}>Monthly rent (CAD)</label>
          <input id={id("rent")} type="number" inputMode="numeric" min="1" step="1" value={form.rent} onChange={update("rent")} placeholder="1850" required />
        </div>
        <div className="field">
          <label htmlFor={id("lmr")}>Last month&apos;s rent deposit</label>
          <input id={id("lmr")} type="number" inputMode="numeric" min="0" step="1" value={form.last_month_deposit} onChange={update("last_month_deposit")} />
        </div>
        <div className="field">
          <label htmlFor={id("key")}>Key deposit</label>
          <input id={id("key")} type="number" inputMode="numeric" min="0" step="1" value={form.key_deposit} onChange={update("key_deposit")} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor={id("payprop")}>PayProp reference</label>
          <input id={id("payprop")} value={form.payprop_reference} onChange={update("payprop_reference")} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={id("notes")}>Notes</label>
          <textarea id={id("notes")} value={form.notes} onChange={update("notes")} rows={2} />
        </div>
      </div>
    </div>
  );
}
