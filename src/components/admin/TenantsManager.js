"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import ContactLine from "@/components/admin/ContactLine";
import TenancyPicker from "@/components/admin/TenancyPicker";
import { TenantInputs, tenantRow } from "@/components/admin/TenantsEditor";
import { TENANCY_STATUS, validateTenant } from "@/lib/admin-properties";
import { CURRENT_STATUSES, loadTenancyOptions, tenancyAddress } from "@/lib/rent";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

// Every tenant in one place: edit details, move between tenancies, unassign (kept on file,
// migration 0047), and send the portal invitation, move-in welcome email or PayProp letter.
const SELECT =
  "id, full_name, email, phone, is_primary, profile_id, portal_invited_at, created_at, tenancy_id, tenancy:tenancies(id, status, start_date, rent, payprop_letter_path, unit:units(id, label, property:properties(id, address, city)))";

const FILTERS = [
  { key: "current", label: "Current", test: (p) => p.tenancy && ["active", "notice"].includes(p.tenancy.status) },
  { key: "upcoming", label: "Moving In", test: (p) => p.tenancy?.status === "upcoming" },
  { key: "past", label: "Past", test: (p) => p.tenancy?.status === "ended" },
  { key: "unassigned", label: "Unassigned", test: (p) => !p.tenancy },
  { key: "all", label: "All", test: () => true },
];

const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");
const searchText = (p) => [p.full_name, p.email, p.phone, tenancyAddress(p.tenancy)].filter(Boolean).join(" ").toLowerCase();

async function loadTenants() {
  const { data, error } = await getBrowserClient().from("tenancy_tenants").select(SELECT).order("full_name");
  if (error) throw new Error("We couldn't load tenants. Refresh the page to try again.");
  return data || [];
}

async function staffApi(url, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "That didn't go through. Try again.");
  return json;
}

function PortalStatus({ p }) {
  if (p.profile_id) return <span className="pill ts-active">Joined</span>;
  if (p.portal_invited_at) return <span className="small">Invited {shortDay(p.portal_invited_at)}</span>;
  return <span className="small">Not invited</span>;
}

export default function TenantsManager() {
  const [rows, setRows] = useState(null);
  const [tenancies, setTenancies] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("current");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [people, options] = await Promise.all([loadTenants(), loadTenancyOptions({ includePast: true })]);
      setRows(people);
      setTenancies(options);
      setError("");
    } catch (err) {
      setError(err.message);
      setRows((r) => r || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load, 120000);

  const active = FILTERS.find((f) => f.key === filter);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (rows || []).filter((p) => active.test(p) && (!q || searchText(p).includes(q))),
    [rows, active, q]
  );

  if (!rows) return <p className="small">Loading tenants…</p>;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error ? <div className="warnbox">{error}</div> : null}

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 260px", margin: 0 }}>
          <label htmlFor="tm-q">Search</label>
          <input id="tm-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, phone or address" />
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add a Tenant"}
        </button>
      </div>

      {adding ? (
        <AddTenant
          tenancies={tenancies}
          onDone={async () => {
            setAdding(false);
            await load();
          }}
        />
      ) : null}

      <div className="chip-row" role="group" aria-label="Filter tenants">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`chip${filter === f.key ? " on" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <span className="chip-count">{rows.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      {!shown.length ? (
        <div className="empty">
          <p>{q ? "No tenants match that search." : "No tenants here."}</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Tenant</th>
                <th scope="col">Contact</th>
                <th scope="col">Home</th>
                <th scope="col">Portal</th>
                <th scope="col" className="r"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td>
                      <b>{p.full_name}</b>
                      {p.is_primary && p.tenancy ? <span className="small sub-line">Primary tenant</span> : null}
                    </td>
                    <td>
                      <ContactLine phone={p.phone} email={p.email} />
                    </td>
                    <td>
                      {p.tenancy ? (
                        <>
                          {tenancyAddress(p.tenancy)}
                          <span className="sub-line">
                            <span className={`pill ts-${p.tenancy.status}`}>{TENANCY_STATUS[p.tenancy.status] || p.tenancy.status}</span>
                          </span>
                        </>
                      ) : (
                        <span className="small">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <PortalStatus p={p} />
                    </td>
                    <td className="r">
                      <button type="button" className="btn ghost sm" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? "" : p.id)}>
                        {open === p.id ? "Close" : "Manage"}
                        <span className="visually-hidden"> {p.full_name}</span>
                      </button>
                    </td>
                  </tr>
                  {open === p.id ? (
                    <tr>
                      <td colSpan={5}>
                        <TenantPanel person={p} all={rows} tenancies={tenancies} onChanged={load} onRemoved={() => setOpen("")} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddTenant({ tenancies, onDone }) {
  const [person, setPerson] = useState({ full_name: "", email: "", phone: "" });
  const [tenancyId, setTenancyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = tenancies.filter((t) => CURRENT_STATUSES.includes(t.status));

  async function save(e) {
    e.preventDefault();
    const problem = validateTenant(person);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const target = tenancies.find((t) => t.id === tenancyId);
    const { error: err } = await getBrowserClient()
      .from("tenancy_tenants")
      .insert({ ...tenantRow(person), tenancy_id: tenancyId || null, is_primary: Boolean(target) && !(target.tenancy_tenants || []).length });
    setBusy(false);
    if (err) return setError(/null value/i.test(err.message) ? "Choose a tenancy (unassigned tenants need the latest database update)." : "That didn't save. Try again.");
    onDone();
  }

  return (
    <form className="boxed stack" style={{ gap: 12 }} onSubmit={save} noValidate>
      <h2 className="sub-title">Add a Tenant</h2>
      <TenantInputs person={person} onChange={setPerson} idPrefix="tm-new" />
      <TenancyPicker id="tm-new-tenancy" tenancies={current} value={tenancyId} onChange={setTenancyId} label="Tenancy (optional: leave blank to keep them unassigned)" />
      {error ? <div className="warnbox" role="alert">{error}</div> : null}
      <div className="row" style={{ gap: 10 }}>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Add Tenant"}
        </button>
      </div>
    </form>
  );
}

function TenantPanel({ person, all, tenancies, onChanged, onRemoved }) {
  const [details, setDetails] = useState({ full_name: person.full_name || "", email: person.email || "", phone: person.phone || "" });
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const sb = getBrowserClient();
  const t = person.tenancy;
  const others = t ? all.filter((x) => x.tenancy_id === t.id && x.id !== person.id) : [];
  const moveOptions = tenancies.filter((x) => x.id !== t?.id && x.status !== "ended");

  async function run(key, action, okText, { reload = true } = {}) {
    setBusy(key);
    setMsg({ kind: "", text: "" });
    try {
      await action();
      if (reload) await onChanged();
      setMsg({ kind: "ok", text: okText });
      setConfirm("");
    } catch (err) {
      setMsg({ kind: "err", text: err.message || "That didn't save. Try again." });
    }
    setBusy("");
  }

  const must = ({ error }) => {
    if (error) throw new Error(/null value/i.test(error.message) ? "Unassigning needs the latest database update. Ask for the SQL to be run." : "That didn't save. Try again.");
  };

  // If the primary tenant leaves a tenancy, the longest-standing remaining tenant becomes primary.
  async function handOverPrimary() {
    if (!person.is_primary || !others.length) return;
    const next = [...others].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    must(await sb.from("tenancy_tenants").update({ is_primary: true }).eq("id", next.id));
  }

  const saveDetails = (e) => {
    e.preventDefault();
    const problem = validateTenant(details);
    if (problem) return setMsg({ kind: "err", text: problem });
    return run("details", async () => must(await sb.from("tenancy_tenants").update(tenantRow(details)).eq("id", person.id)), "Details saved.");
  };

  const makePrimary = () =>
    run("primary", async () => {
      must(await sb.from("tenancy_tenants").update({ is_primary: false }).eq("tenancy_id", t.id));
      must(await sb.from("tenancy_tenants").update({ is_primary: true }).eq("id", person.id));
    }, `${person.full_name} is now the primary tenant.`);

  const move = () => {
    const dest = tenancies.find((x) => x.id === target);
    if (!dest) return setMsg({ kind: "err", text: "Choose the tenancy to assign them to." });
    return run("move", async () => {
      await handOverPrimary();
      must(await sb.from("tenancy_tenants").update({ tenancy_id: dest.id, is_primary: !(dest.tenancy_tenants || []).length }).eq("id", person.id));
      setTarget("");
    }, `${person.full_name} is now on ${tenancyAddress(dest)}.`);
  };

  const unassign = () =>
    run("unassign", async () => {
      await handOverPrimary();
      must(await sb.from("tenancy_tenants").update({ tenancy_id: null, is_primary: false }).eq("id", person.id));
    }, `${person.full_name} is unassigned and kept on file.`);

  const remove = () =>
    run("remove", async () => {
      await handOverPrimary();
      must(await sb.from("tenancy_tenants").delete().eq("id", person.id));
      onRemoved();
    }, `${person.full_name} removed.`);

  const invite = () =>
    run("invite", () => staffApi("/api/admin/tenants", { action: "invite", tenantId: person.id }), `Portal invitation sent to ${person.email}.`);
  const welcome = () =>
    run("welcome", () => staffApi("/api/admin/tenants", { action: "welcome", tenancyId: t.id }), "Move-in welcome email sent to everyone on this tenancy.", { reload: false });
  const letter = () =>
    run("letter", () => staffApi("/api/tenancy/payprop-letter", { tenancy: t.id }), "PayProp letter emailed to everyone on this tenancy.", { reload: false });

  const canInvite = person.email && !person.profile_id && t;

  return (
    <div className="stack" style={{ gap: 18, padding: "8px 0" }}>
      <form className="stack" style={{ gap: 10 }} onSubmit={saveDetails} noValidate>
        <h3 className="eyebrow" style={{ margin: 0 }}>Details</h3>
        <TenantInputs person={details} onChange={setDetails} idPrefix={`tm-${person.id}`} />
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="submit" className="btn primary sm" disabled={busy === "details"}>
            {busy === "details" ? "Saving…" : "Save Details"}
          </button>
          {t && !person.is_primary ? (
            <button type="button" className="btn ghost sm" onClick={makePrimary} disabled={Boolean(busy)}>
              Make Primary Tenant
            </button>
          ) : null}
        </div>
      </form>

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="eyebrow" style={{ margin: 0 }}>Tenancy</h3>
        {t ? (
          <p className="small" style={{ margin: 0 }}>
            On <b>{tenancyAddress(t)}</b> ({TENANCY_STATUS[t.status] || t.status}
            {t.start_date ? `, from ${shortDay(`${t.start_date}T12:00:00`)}` : ""}).{" "}
            {t.unit?.id ? <Link href={`/admin/units/${t.unit.id}`}>Open the unit</Link> : null}
          </p>
        ) : (
          <p className="small" style={{ margin: 0 }}>Not on any tenancy. Assign them below.</p>
        )}
        <TenancyPicker id={`tm-move-${person.id}`} tenancies={moveOptions} value={target} onChange={setTarget} label={t ? "Move to another tenancy" : "Assign to a tenancy"} />
        <p className="small" style={{ margin: 0 }}>
          No tenancy for that unit yet? Start one from the unit in <Link href="/admin/properties">Properties</Link>, then come back.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn primary sm" onClick={move} disabled={!target || Boolean(busy)}>
            {busy === "move" ? "Saving…" : t ? "Move" : "Assign"}
          </button>
          {t ? (
            confirm === "unassign" ? (
              <>
                <span className="small">Take {person.full_name} off this tenancy? Their payments and lease stay with the tenancy.</span>
                <button type="button" className="btn ghost sm" onClick={unassign} disabled={Boolean(busy)}>
                  {busy === "unassign" ? "Saving…" : "Yes, Unassign"}
                </button>
                <button type="button" className="link-btn small" onClick={() => setConfirm("")}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => setConfirm("unassign")} disabled={Boolean(busy)}>
                Unassign
              </button>
            )
          ) : null}
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="eyebrow" style={{ margin: 0 }}>Emails</h3>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn ghost sm" onClick={invite} disabled={!canInvite || Boolean(busy)}>
            {busy === "invite" ? "Sending…" : person.portal_invited_at ? "Send Portal Invitation Again" : "Send Portal Invitation"}
          </button>
          <button type="button" className="btn ghost sm" onClick={welcome} disabled={!t || Boolean(busy)}>
            {busy === "welcome" ? "Sending…" : "Send Move-In Welcome Email"}
          </button>
          <button type="button" className="btn ghost sm" onClick={letter} disabled={!t?.payprop_letter_path || Boolean(busy)}>
            {busy === "letter" ? "Sending…" : "Email PayProp Letter"}
          </button>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {person.profile_id
            ? "They already have an account, so no invitation is needed."
            : !person.email
              ? "Add an email address to send emails."
              : !t
                ? "Assign them to a tenancy first."
                : "The portal invitation suits tenants already living there."}{" "}
          The move-in welcome email (rent, PayProp, insurance due date, emergencies) is for new tenants and goes to everyone on the tenancy.
          {t && !t.payprop_letter_path ? " Upload the PayProp letter on the unit page to email it." : ""}
        </p>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {msg.text ? (
          <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
        <span style={{ marginLeft: "auto" }}>
          {confirm === "remove" ? (
            <>
              <span className="small">Delete {person.full_name} completely? This can&apos;t be undone. </span>
              <button type="button" className="btn ghost sm" onClick={remove} disabled={Boolean(busy)}>
                {busy === "remove" ? "Deleting…" : "Yes, Delete"}
              </button>{" "}
              <button type="button" className="link-btn small" onClick={() => setConfirm("")}>Cancel</button>
            </>
          ) : (
            <button type="button" className="link-btn small" onClick={() => setConfirm("remove")} disabled={Boolean(busy)}>
              Delete this tenant
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
