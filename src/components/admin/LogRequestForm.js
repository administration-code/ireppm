"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { currentTenancy, orNull, propertyTitle } from "@/lib/admin-properties";
import { CATEGORIES, SOURCES, STAFF_LOG_SOURCES, URGENCY, URGENCY_HELP } from "@/lib/maintenance";

const EMPTY = {
  property_id: "",
  unit_id: "",
  source: "phone",
  reporter_name: "",
  reporter_phone: "",
  reporter_email: "",
  category: "plumbing",
  title: "",
  description: "",
  urgency: "routine",
  permission_to_enter: false,
  access_notes: "",
};

export default function LogRequestForm({ initialPropertyId = "", initialUnitId = "", taskId = "", initialTitle = "" }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, properties: [], error: "" });
  const [form, setForm] = useState({
    ...EMPTY,
    property_id: initialPropertyId,
    unit_id: initialUnitId,
    title: initialTitle,
    ...(taskId ? { source: "staff" } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select("id, address, city, archived, units(id, label, tenancies(id, status))")
      .eq("archived", false)
      .order("address")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, properties: data || [], error: error ? "We couldn't load the properties." : "" });
        if (initialUnitId) {
          const owner = (data || []).find((p) => (p.units || []).some((u) => u.id === initialUnitId));
          if (owner) setForm((f) => ({ ...f, property_id: owner.id, unit_id: initialUnitId }));
        }
      });
    return () => {
      alive = false;
    };
  }, [initialUnitId]);

  const property = state.properties.find((p) => p.id === form.property_id);
  const units = [...(property?.units || [])].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const unit = units.find((u) => u.id === form.unit_id) || (units.length === 1 ? units[0] : null);
  const tenancy = unit ? currentTenancy(unit.tenancies || []) : null;

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMsg("");
  };
  const update = (key) => (e) => set(key, e.target.value);

  async function submit(e) {
    e.preventDefault();
    if (!unit) return setMsg("Choose the property and unit.");
    if (!form.title.trim()) return setMsg("Add a short title.");
    if (form.reporter_email.trim() && !/^\S+@\S+\.\S+$/.test(form.reporter_email.trim()))
      return setMsg("Check the reporter's email address.");
    setSaving(true);
    const sb = getBrowserClient();
    const { data: auth } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("maintenance_requests")
      .insert({
        unit_id: unit.id,
        tenancy_id: tenancy?.id || null,
        submitted_by: auth?.user?.id || null,
        source: form.source,
        reporter_name: orNull(form.reporter_name),
        reporter_phone: orNull(form.reporter_phone),
        reporter_email: orNull(form.reporter_email),
        category: form.category,
        title: form.title.trim(),
        description: orNull(form.description),
        urgency: form.urgency,
        permission_to_enter: form.permission_to_enter,
        access_notes: orNull(form.access_notes),
        photos: [],
      })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      return setMsg("We couldn't log this request. Check the fields and try again.");
    }
    if (taskId) {
      const linked = await sb
        .from("turnover_tasks")
        .update({ maintenance_request_id: data.id })
        .eq("id", taskId)
        .select("turnover_id");
      const turnoverId = linked.data?.[0]?.turnover_id;
      if (turnoverId) return router.replace(`/admin/turnovers/${turnoverId}`);
    }
    router.replace(`/admin/maintenance/${data.id}`);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/maintenance">
          ← All maintenance
        </Link>
        <span className="eyebrow">Staff · Maintenance</span>
        <h1 className="admin-title">Log a Request</h1>
        <p className="small">For problems reported by phone, text or email, or found during an inspection.</p>
      </div>

      {state.error ? <div className="warnbox">{state.error}</div> : null}

      <form className="admin-form" onSubmit={submit} noValidate>
        <section className="boxed stack" aria-labelledby="sec-log-where">
          <h2 id="sec-log-where" className="sec-title">
            Where
          </h2>
          <div className="row2">
            <div className="field">
              <label htmlFor="l-prop">Property</label>
              <select
                id="l-prop"
                value={form.property_id}
                onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value, unit_id: "" }))}
                disabled={state.loading}
              >
                <option value="">{state.loading ? "Loading…" : "Choose a property"}</option>
                {state.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyTitle(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-unit">Unit</label>
              <select id="l-unit" value={unit?.id || ""} onChange={update("unit_id")} disabled={!property}>
                <option value="">{property && !units.length ? "No units on this property" : "Choose a unit"}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label || "Main unit"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {unit ? (
            <p className="small">
              {tenancy ? "This will be linked to the unit's current tenancy." : "This unit has no current tenancy."}
            </p>
          ) : null}
        </section>

        <section className="boxed stack" aria-labelledby="sec-log-who">
          <h2 id="sec-log-who" className="sec-title">
            Who Reported It
          </h2>
          <div className="row2">
            <div className="field">
              <label htmlFor="l-source">How it came in</label>
              <select id="l-source" value={form.source} onChange={update("source")}>
                {STAFF_LOG_SOURCES.map((k) => (
                  <option key={k} value={k}>
                    {SOURCES[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-rname">Name (optional)</label>
              <input id="l-rname" value={form.reporter_name} onChange={update("reporter_name")} autoComplete="off" />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="l-rphone">Phone (optional)</label>
              <input id="l-rphone" type="tel" value={form.reporter_phone} onChange={update("reporter_phone")} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="l-remail">Email (optional)</label>
              <input id="l-remail" type="email" value={form.reporter_email} onChange={update("reporter_email")} autoComplete="off" />
            </div>
          </div>
        </section>

        <section className="boxed stack" aria-labelledby="sec-log-what">
          <h2 id="sec-log-what" className="sec-title">
            The Problem
          </h2>
          <div className="row2">
            <div className="field">
              <label htmlFor="l-cat">Category</label>
              <select id="l-cat" value={form.category} onChange={update("category")}>
                {Object.entries(CATEGORIES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-urg">Urgency</label>
              <select id="l-urg" value={form.urgency} onChange={update("urgency")}>
                {Object.entries(URGENCY).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="small">{URGENCY_HELP[form.urgency]}</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="l-title">Short title</label>
            <input id="l-title" value={form.title} onChange={update("title")} maxLength={120} autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="l-desc">Description</label>
            <textarea id="l-desc" value={form.description} onChange={update("description")} />
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={form.permission_to_enter}
              onChange={(e) => set("permission_to_enter", e.target.checked)}
            />
            The tenant says we may enter if they&apos;re not home
          </label>
          <div className="field">
            <label htmlFor="l-access">Access notes</label>
            <textarea id="l-access" value={form.access_notes} onChange={update("access_notes")} rows={2} placeholder="Best times, entry instructions" />
          </div>
        </section>

        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Log request"}
          </button>
          {msg ? (
            <span className="small err" role="alert">
              {msg}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
