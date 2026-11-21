"use client";

// wasMaintenanceOnly: editing a maintenance-only tenancy, so unticking the box starts rent collection.
export default function TenancyFields({ form, setForm, idPrefix, wasMaintenanceOnly = false }) {
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const id = (k) => `${idPrefix}-${k}`;

  const mo = Boolean(form.maintenance_only);
  const converting = wasMaintenanceOnly && !mo;

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 4 }}>
        <label className="check-line">
          <input
            type="checkbox"
            checked={mo}
            onChange={(e) => {
              const on = e.target.checked;
              setForm((f) => ({ ...f, maintenance_only: on, ...(on ? {} : { rent_from: f.rent_from || new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7) }) }));
            }}
          />
          Maintenance only (no rent collection)
        </label>
        <span className="small">
          {mo
            ? "The landlord collects the rent. IRep handles repairs: the tenant can use the portal to report problems, and work orders go on the landlord's statement as usual. No rent charges, arrears or PayProp."
            : "Tick this when IRep handles repairs but the landlord collects the rent directly."}
        </span>
      </div>
      <div className="row3">
        <div className="field">
          <label htmlFor={id("start")}>Start date</label>
          <input id={id("start")} type="date" value={form.start_date} onChange={update("start_date")} required />
          {form.start_date_estimated ? (
            <label className="check small">
              <input
                type="checkbox"
                checked
                onChange={(e) => setForm((f) => ({ ...f, start_date_estimated: e.target.checked }))}
              />
              Start date estimated (untick once confirmed)
            </label>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={id("end")}>End date</label>
          <input id={id("end")} type="date" value={form.end_date} onChange={update("end_date")} />
          <span className="small">Leave empty for month-to-month.</span>
        </div>
        {mo ? null : (
        <div className="field">
          <label htmlFor={id("due")}>Rent due day (1–28)</label>
          <input id={id("due")} type="number" inputMode="numeric" min="1" max="28" step="1" value={form.rent_due_day} onChange={update("rent_due_day")} />
        </div>
        )}
      </div>
      {converting ? (
        <div className="okbox stack" style={{ gap: 8 }}>
          <b>Starting rent collection</b>
          <span className="small">
            Add the rent below. IRep charges rent from the month you choose; earlier months are never charged. The tenant, their portal account
            and their repair history stay as they are.
          </span>
          <div className="field" style={{ maxWidth: 240 }}>
            <label htmlFor={id("rent-from")}>First month IRep collects rent</label>
            <input id={id("rent-from")} type="month" value={form.rent_from || ""} onChange={update("rent_from")} />
          </div>
        </div>
      ) : null}
      {mo ? null : (
      <div className="row3">
        <div className="field">
          <label htmlFor={id("rent")}>Monthly rent (CAD)</label>
          <input id={id("rent")} type="number" inputMode="decimal" min="0" step="0.01" value={form.rent} onChange={update("rent")} placeholder="1850" required />
        </div>
        <div className="field">
          <label htmlFor={id("lmr")}>Last month&apos;s rent deposit</label>
          <input id={id("lmr")} type="number" inputMode="decimal" min="0" step="0.01" value={form.last_month_deposit} onChange={update("last_month_deposit")} />
        </div>
        <div className="field">
          <label htmlFor={id("key")}>Key deposit</label>
          <input id={id("key")} type="number" inputMode="decimal" min="0" step="0.01" value={form.key_deposit} onChange={update("key_deposit")} />
        </div>
      </div>
      )}
      <div className="row2">
        {mo ? null : (
        <div className="field">
          <label htmlFor={id("payprop")}>PayProp reference</label>
          <input id={id("payprop")} value={form.payprop_reference} onChange={update("payprop_reference")} autoComplete="off" />
        </div>
        )}
        <div className="field">
          <label htmlFor={id("notes")}>Notes</label>
          <textarea id={id("notes")} value={form.notes} onChange={update("notes")} rows={2} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={id("consent")}>Email service consent</label>
        <input
          id={id("consent")}
          value={form.email_service_consent ?? ""}
          onChange={update("email_service_consent")}
          placeholder="e.g. Consented in lease, March 2026"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
