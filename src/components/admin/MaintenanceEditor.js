"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { checkDollars, dollarsOrNull, orNull, propertyTitle, sortTenants, text } from "@/lib/admin-properties";
import {
  CATEGORIES,
  CHARGE_TO,
  OWNER_APPROVAL,
  PHOTO_BUCKET,
  SIGNED_PHOTO_SECONDS,
  SOURCES,
  STATUS,
  URGENCY,
  fromLocalInput,
  isVideo,
  needsEntryNotice,
  prettyDateTime,
  toLocalInput,
} from "@/lib/maintenance";
import { MaintenancePills } from "./MaintenanceBadges";
import { partnerName } from "./MaintenanceTable";

const REQUEST_SELECT = `*,
  unit:units(id, label, property:properties(id, address, city, owner:owners(id, name, email, phone))),
  tenancy:tenancies(id, status, tenancy_tenants(full_name, email, phone, is_primary, created_at))`;

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;

function toForm(r) {
  return {
    status: r.status,
    category: r.category,
    urgency: r.urgency,
    partner_id: r.partner_id || "",
    scheduled_for: toLocalInput(r.scheduled_for),
    estimated_cost: text(r.estimated_cost),
    actual_cost: text(r.actual_cost),
    owner_approval: r.owner_approval || "not_needed",
    charge_to: r.charge_to || "owner",
    entry_notice_served_at: toLocalInput(r.entry_notice_served_at),
    tenant_update: text(r.tenant_update),
    staff_notes: text(r.staff_notes),
  };
}

function toRow(f) {
  return {
    status: f.status,
    category: f.category,
    urgency: f.urgency,
    partner_id: f.partner_id || null,
    scheduled_for: fromLocalInput(f.scheduled_for),
    estimated_cost: dollarsOrNull(f.estimated_cost),
    actual_cost: dollarsOrNull(f.actual_cost),
    owner_approval: f.owner_approval,
    charge_to: f.charge_to,
    entry_notice_served_at: fromLocalInput(f.entry_notice_served_at),
    tenant_update: orNull(f.tenant_update),
    staff_notes: orNull(f.staff_notes),
  };
}

function Contact({ person }) {
  return (
    <ul className="plain-list">
      <li>
        <b>{person.full_name || person.name}</b>
      </li>
      {person.phone ? (
        <li>
          <a href={telHref(person.phone)}>{person.phone}</a>
        </li>
      ) : null}
      {person.email ? (
        <li>
          <a href={`mailto:${person.email}`}>{person.email}</a>
        </li>
      ) : null}
    </ul>
  );
}

function Photos({ photos }) {
  const [urls, setUrls] = useState({});
  const paths = (photos || []).map((p) => p.path).filter(Boolean);
  const key = paths.join("|");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    getBrowserClient()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(key.split("|"), SIGNED_PHOTO_SECONDS)
      .then(({ data }) => {
        if (!alive || !data) return;
        setUrls(Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])));
      });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!paths.length) return <p className="small">No photos or videos sent.</p>;
  return (
    <>
      <ul className="photo-grid">
        {photos.map((p) => (
          <li key={p.path} className="maint-photo">
            {urls[p.path] ? (
              isVideo(p.name || p.path) ? (
                <video src={urls[p.path]} controls preload="metadata" />
              ) : (
                <a href={urls[p.path]} target="_blank" rel="noreferrer">
                  <img src={urls[p.path]} alt={p.name || "Photo sent with the request"} />
                </a>
              )
            ) : (
              <span className="small">Loading…</span>
            )}
            <span className="small">{p.name}</span>
          </li>
        ))}
      </ul>
      <p className="small">Photo links expire after 5 minutes. Refresh the page to see them again.</p>
    </>
  );
}

export default function MaintenanceEditor({ id }) {
  const [state, setState] = useState({ loading: true, request: null, partners: [], error: "" });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    Promise.all([
      sb.from("maintenance_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle(),
      sb.from("partners").select("id, name, company, trades, active").order("name"),
    ]).then(([req, partners]) => {
      if (!alive) return;
      setState({
        loading: false,
        request: req.data,
        partners: partners.data || [],
        error: req.error ? "We couldn't load this request. Refresh the page to try again." : "",
      });
      if (req.data) setForm(toForm(req.data));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, request, partners, error } = state;
  if (loading) return <p className="small">Loading request…</p>;
  if (!request || !form) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Request not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/maintenance">
          Back to Maintenance
        </Link>
      </div>
    );
  }

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setMsg({ kind: "", text: "" });
  };

  function applySaved(data) {
    setState((s) => ({ ...s, request: { ...s.request, ...data } }));
    setForm(toForm({ ...request, ...data }));
  }

  async function save(e) {
    e.preventDefault();
    const problem =
      checkDollars(form.estimated_cost, "The estimated cost") || checkDollars(form.actual_cost, "The actual cost");
    if (problem) return setMsg({ kind: "err", text: problem });
    setSaving(true);
    const { data, error: saveError } = await getBrowserClient()
      .from("maintenance_requests")
      .update(toRow(form))
      .eq("id", request.id)
      .select("*")
      .single();
    setSaving(false);
    if (saveError) return setMsg({ kind: "err", text: "We couldn't save this request. Check the fields and try again." });
    applySaved(data);
    refreshStaffCounts();
    setMsg({ kind: "ok", text: "Request saved." });
  }

  async function markNoticeServed() {
    setSaving(true);
    const { data, error: saveError } = await getBrowserClient()
      .from("maintenance_requests")
      .update({ entry_notice_served_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("*")
      .single();
    setSaving(false);
    if (saveError) return setMsg({ kind: "err", text: "We couldn't mark the notice as served. Try again." });
    applySaved(data);
    setMsg({ kind: "ok", text: "Entry notice marked as served." });
  }

  const property = request.unit?.property;
  const owner = property?.owner;
  const tenants = sortTenants(request.tenancy?.tenancy_tenants || []);
  const reporter =
    request.reporter_name || request.reporter_phone || request.reporter_email
      ? { full_name: request.reporter_name || "Reporter", phone: request.reporter_phone, email: request.reporter_email }
      : null;

  const isMatch = (p) => (p.trades || []).includes(form.category);
  const usable = partners.filter((p) => p.active || p.id === form.partner_id);
  const matching = usable.filter(isMatch);
  const others = usable.filter((p) => !isMatch(p));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/maintenance">
          ← All maintenance
        </Link>
        <span className="eyebrow">
          Staff · Maintenance · {property ? propertyTitle(property) : "Unknown property"}
          {request.unit?.label ? `, ${request.unit.label}` : ""}
        </span>
        <h1 className="admin-title">{request.title}</h1>
        <div style={{ marginTop: 10 }}>
          <MaintenancePills request={request} />
        </div>
      </div>

      {needsEntryNotice(request) ? (
        <div className="warnbox entry-notice" role="note">
          <p>
            <b>Entry notice needed.</b> Give the tenant written notice at least 24 hours before entry, for a time between
            8 a.m. and 8 p.m. (RTA s. 27).
          </p>
          {request.entry_notice_served_at ? (
            <p className="small">Notice served {prettyDateTime(request.entry_notice_served_at)}.</p>
          ) : (
            <button type="button" className="btn ghost sm" onClick={markNoticeServed} disabled={saving}>
              Mark Notice Served
            </button>
          )}
        </div>
      ) : null}

      <div className="maint-grid">
        <section className="boxed stack" aria-labelledby="sec-m-report">
          <h2 id="sec-m-report" className="sec-title">
            What Was Reported
          </h2>
          <dl className="maint-facts">
            <div>
              <dt>Reported</dt>
              <dd>
                {prettyDateTime(request.created_at)} · {SOURCES[request.source] || request.source}
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{CATEGORIES[request.category] || request.category}</dd>
            </div>
            <div>
              <dt>Permission to enter</dt>
              <dd>{request.permission_to_enter ? "Yes, may enter if not home" : "No, arrange a time first"}</dd>
            </div>
            {request.access_notes ? (
              <div>
                <dt>Access notes</dt>
                <dd className="pre">{request.access_notes}</dd>
              </div>
            ) : null}
          </dl>
          {request.description ? <p className="pre">{request.description}</p> : <p className="small">No description.</p>}
          <h3 className="sub-title">Photos and Videos</h3>
          <Photos photos={request.photos} />
        </section>

        <section className="boxed stack" aria-labelledby="sec-m-people">
          <h2 id="sec-m-people" className="sec-title">
            Contacts
          </h2>
          <div className="stack">
            <h3 className="sub-title">Tenants</h3>
            {tenants.length ? (
              tenants.map((t, i) => <Contact key={`${t.full_name}-${i}`} person={t} />)
            ) : (
              <p className="small">No tenancy is linked to this request.</p>
            )}
          </div>
          {reporter ? (
            <div className="stack">
              <h3 className="sub-title">Reported By</h3>
              <Contact person={reporter} />
            </div>
          ) : null}
          <div className="stack">
            <h3 className="sub-title">Owner</h3>
            {owner ? <Contact person={owner} /> : <p className="small">No owner set on this property.</p>}
          </div>
          {property ? (
            <Link className="small" href={`/admin/properties/${property.id}`}>
              View property
            </Link>
          ) : null}
        </section>
      </div>

      <form className="admin-form" onSubmit={save} noValidate>
        <section className="boxed stack" aria-labelledby="sec-m-staff">
          <h2 id="sec-m-staff" className="sec-title">
            Staff Handling
          </h2>
          <div className="row3">
            <div className="field">
              <label htmlFor="m-status">Status</label>
              <select id="m-status" value={form.status} onChange={update("status")}>
                {Object.entries(STATUS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-category">Category</label>
              <select id="m-category" value={form.category} onChange={update("category")}>
                {Object.entries(CATEGORIES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-urgency">Urgency</label>
              <select id="m-urgency" value={form.urgency} onChange={update("urgency")}>
                {Object.entries(URGENCY).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label htmlFor="m-partner">Partner</label>
              <select id="m-partner" value={form.partner_id} onChange={update("partner_id")}>
                <option value="">Not assigned</option>
                {matching.length ? (
                  <optgroup label={`Does ${CATEGORIES[form.category] || "this work"}`}>
                    {matching.map((p) => (
                      <option key={p.id} value={p.id}>
                        {partnerName(p)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {others.length ? (
                  <optgroup label="Other partners">
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {partnerName(p)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {partners.length === 0 ? (
                <span className="small">
                  No partners yet. <Link href="/admin/partners/new">Add one</Link>.
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="m-when">Scheduled for</label>
              <input id="m-when" type="datetime-local" value={form.scheduled_for} onChange={update("scheduled_for")} />
            </div>
          </div>

          <div className="row3">
            <div className="field">
              <label htmlFor="m-est">Estimated cost (CAD)</label>
              <input id="m-est" inputMode="decimal" value={form.estimated_cost} onChange={update("estimated_cost")} />
            </div>
            <div className="field">
              <label htmlFor="m-act">Actual cost (CAD)</label>
              <input id="m-act" inputMode="decimal" value={form.actual_cost} onChange={update("actual_cost")} />
            </div>
            <div className="field">
              <label htmlFor="m-charge">Charge to</label>
              <select
                id="m-charge"
                value={form.charge_to}
                onChange={update("charge_to")}
                aria-describedby="m-charge-hint"
              >
                {Object.entries(CHARGE_TO).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="small" id="m-charge-hint">
                Owner: deducted from the landlord&apos;s statement for the month it&apos;s completed. Tenant: added to
                the tenant&apos;s rent ledger.
              </span>
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label htmlFor="m-approval">Owner approval</label>
              <select id="m-approval" value={form.owner_approval} onChange={update("owner_approval")}>
                {Object.entries(OWNER_APPROVAL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              {request.owner_decision_at ? (
                <span className="small">Decision recorded {prettyDateTime(request.owner_decision_at)}</span>
              ) : null}
            </div>
            <div className="owner-aside">
              {owner ? (
                <>
                  <span className="small">Owner</span>
                  <Contact person={owner} />
                </>
              ) : (
                <span className="small">No owner set on this property.</span>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="m-notice">Entry notice served at</label>
            <input
              id="m-notice"
              type="datetime-local"
              value={form.entry_notice_served_at}
              onChange={update("entry_notice_served_at")}
            />
          </div>

          <div className="field">
            <label htmlFor="m-tenant-update">Message to tenant</label>
            <textarea id="m-tenant-update" value={form.tenant_update} onChange={update("tenant_update")} />
            <span className="small">The tenant sees this on their account page.</span>
          </div>
          <div className="field">
            <label htmlFor="m-notes">Staff notes</label>
            <textarea id="m-notes" value={form.staff_notes} onChange={update("staff_notes")} />
            <span className="small">Only staff can see these.</span>
          </div>
        </section>

        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save request"}
          </button>
          {msg.text ? (
            <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
              {msg.text}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
