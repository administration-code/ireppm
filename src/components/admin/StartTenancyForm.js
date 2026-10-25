"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { createTenancy, tenancyForm, tenancyRow, todayISO, validateTenancy, validateTenant } from "@/lib/admin-properties";
import TenancyFields from "./TenancyFields";
import { TenantInputs, tenantRow } from "./TenantsEditor";

const BLANK = { full_name: "", email: "", phone: "" };
const dollars = (cents) => (cents === "" || cents === null || cents === undefined ? "" : String(Math.round(Number(cents)) / 100));
const sameEmail = (a, b) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const isBlank = (p) => !p.full_name.trim() && !p.email.trim() && !p.phone.trim();

export default function StartTenancyForm({ unit, onCreated, onCancel }) {
  const [form, setForm] = useState(() => ({
    ...tenancyForm(null),
    start_date: todayISO(),
    rent: unit.market_rent ? String(unit.market_rent) : "",
  }));
  const [people, setPeople] = useState([BLANK]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [onFile, setOnFile] = useState([]);
  const [leases, setLeases] = useState([]);
  const [filledFrom, setFilledFrom] = useState("");
  const [leaseId, setLeaseId] = useState("");

  // Tenants on file but not in a tenancy, and leases sent for this unit that haven't made a tenancy yet.
  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    Promise.all([
      sb.from("tenancy_tenants").select("id, full_name, email, phone, created_at").is("tenancy_id", null).order("created_at", { ascending: false }),
      sb
        .from("signature_requests")
        .select("id, title, status, terms, created_at")
        .eq("unit_id", unit.id)
        .eq("kind", "lease")
        .is("tenancy_id", null)
        .in("status", ["draft", "sent", "delivered", "completed"])
        .order("created_at", { ascending: false }),
    ]).then(([t, l]) => {
      if (!alive) return;
      const people = t.data || [];
      const ls = (l.data || []).filter((r) => (r.terms?.tenants || []).length);
      setOnFile(people);
      setLeases(ls);
      if (ls.length) fillFromLease(ls[0], people);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id]);

  function fillFromLease(row, people = onFile) {
    const t = row.terms || {};
    setForm((f) => ({
      ...f,
      start_date: t.start_date || f.start_date,
      end_date: t.end_date || "",
      rent: t.rent ? String(t.rent) : f.rent,
      rent_due_day: t.rent_due_day ? String(t.rent_due_day) : f.rent_due_day,
      last_month_deposit: dollars(t.last_month_deposit),
      key_deposit: dollars(t.key_deposit),
    }));
    setPeople(
      (t.tenants || []).map((x) => {
        const match = people.find((p) => sameEmail(p.email, x.email));
        return match
          ? { id: match.id, full_name: match.full_name || x.full_name || "", email: match.email || x.email || "", phone: match.phone || x.phone || "" }
          : { full_name: x.full_name || "", email: x.email || "", phone: x.phone || "" };
      })
    );
    setFilledFrom(row.title);
    setLeaseId(row.id);
  }

  function addOnFile(p) {
    setPeople((ps) => {
      if (ps.some((x) => x.id === p.id)) return ps;
      const person = { id: p.id, full_name: p.full_name || "", email: p.email || "", phone: p.phone || "" };
      const blankAt = ps.findIndex(isBlank);
      return blankAt >= 0 ? ps.map((x, i) => (i === blankAt ? person : x)) : [...ps, person];
    });
  }
  const available = onFile.filter((p) => !people.some((x) => x.id === p.id));

  async function save(e) {
    e.preventDefault();
    setError("");
    const filled = people.filter((p) => p.full_name.trim() || p.email.trim() || p.phone.trim());
    const problem =
      validateTenancy(form) ||
      (filled.length ? filled.map(validateTenant).find(Boolean) : "Add at least one tenant.");
    if (problem) return setError(problem);

    setSaving(true);
    try {
      const created = await createTenancy({
        unitId: unit.id,
        tenancy: tenancyRow(form),
        tenants: filled.map((p, i) => ({ ...tenantRow(p), ...(p.id ? { id: p.id } : {}), is_primary: i === 0 })),
      });
      // Link the lease, so when it's signed DocuSign doesn't make a second tenancy.
      if (leaseId && created?.id) await getBrowserClient().from("signature_requests").update({ tenancy_id: created.id }).eq("id", leaseId).is("tenancy_id", null);
      await onCreated();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="boxed stack" onSubmit={save} noValidate aria-labelledby="start-title">
      <h2 id="start-title" className="sec-title">
        Start Tenancy
      </h2>
      <p className="small">
        If the start date is today or earlier, the tenancy starts as active and the unit is marked occupied. A future
        start date is saved as upcoming.
      </p>
      {leases.length ? (
        <div className="okbox stack" style={{ gap: 6 }}>
          <span>
            {filledFrom ? <>Filled in from <b>{filledFrom}</b>. Check the details before starting.</> : "A lease was sent for this unit."}
          </span>
          {leases.length > 1 || !filledFrom ? (
            <div className="req-actions">
              {leases.map((l) => (
                <button key={l.id} type="button" className="btn ghost sm" onClick={() => fillFromLease(l)}>
                  Fill from {l.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <TenancyFields form={form} setForm={setForm} idPrefix="start" />

      <div className="stack" style={{ gap: 12 }}>
        <h3 className="eyebrow">Tenants</h3>
        {available.length ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">On file, not in a tenancy yet. Click to add:</span>
            <ul className="plain-list reporter-picks">
              {available.map((p) => (
                <li key={p.id}>
                  <button type="button" className="btn ghost sm reporter-pick" onClick={() => addOnFile(p)}>
                    <b>{p.full_name || "Unnamed tenant"}</b>
                    <span className="small">{[p.email, p.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {people.map((p, i) => (
          <div key={i} className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>
                {i === 0 ? "Primary tenant" : `Tenant ${i + 1}`}
                {p.id ? <span className="small"> · on file</span> : null}
              </b>
              {i > 0 || p.id ? (
                <button type="button" className="btn ghost sm" onClick={() => setPeople((ps) => (ps.length === 1 ? [BLANK] : ps.filter((_, j) => j !== i)))}>
                  Remove<span className="visually-hidden"> tenant {i + 1}</span>
                </button>
              ) : null}
            </div>
            <TenantInputs
              person={p}
              idPrefix={`start-tenant-${i}`}
              onChange={(next) => setPeople((ps) => ps.map((x, j) => (j === i ? next : x)))}
            />
          </div>
        ))}
        <div>
          <button type="button" className="btn ghost sm" onClick={() => setPeople((ps) => [...ps, BLANK])}>
            Add another tenant
          </button>
        </div>
      </div>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Starting…" : "Start tenancy"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
