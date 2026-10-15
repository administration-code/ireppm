"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import ContactLine from "@/components/admin/ContactLine";
import { orNull, sortTenants, validateTenant } from "@/lib/admin-properties";

const BLANK = { full_name: "", email: "", phone: "" };

export function TenantInputs({ person, onChange, idPrefix }) {
  const update = (key) => (e) => onChange({ ...person, [key]: e.target.value });
  return (
    <div className="row3">
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Full name</label>
        <input id={`${idPrefix}-name`} value={person.full_name} onChange={update("full_name")} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-phone`}>Phone</label>
        <input id={`${idPrefix}-phone`} type="tel" value={person.phone} onChange={update("phone")} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-email`}>Email</label>
        <input id={`${idPrefix}-email`} type="email" value={person.email} onChange={update("email")} autoComplete="off" />
      </div>
    </div>
  );
}

export const tenantRow = (p) => ({ full_name: p.full_name.trim(), email: orNull(p.email), phone: orNull(p.phone) });

export default function TenantsEditor({ tenancyId, tenants, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState(BLANK);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const list = sortTenants(tenants);

  async function run(key, action, okText) {
    setBusy(key);
    setMsg({ kind: "", text: "" });
    try {
      await action();
      await onChanged();
      setMsg({ kind: "ok", text: okText });
    } catch {
      setMsg({ kind: "err", text: "That didn't save. Try again." });
    }
    setBusy("");
  }

  const check = ({ error }) => {
    if (error) throw error;
  };

  function add(e) {
    e.preventDefault();
    const problem = validateTenant(person);
    if (problem) return setMsg({ kind: "err", text: problem });
    return run(
      "add",
      async () => {
        check(
          await getBrowserClient()
            .from("tenancy_tenants")
            .insert({ ...tenantRow(person), tenancy_id: tenancyId, is_primary: list.length === 0 })
        );
        setPerson(BLANK);
        setAdding(false);
      },
      "Tenant added."
    );
  }

  const remove = (t) =>
    run(`rm-${t.id}`, async () => check(await getBrowserClient().from("tenancy_tenants").delete().eq("id", t.id)), `${t.full_name} removed.`);

  const makePrimary = (t) =>
    run(
      `pr-${t.id}`,
      async () => {
        const sb = getBrowserClient();
        check(await sb.from("tenancy_tenants").update({ is_primary: false }).eq("tenancy_id", tenancyId).neq("id", t.id));
        check(await sb.from("tenancy_tenants").update({ is_primary: true }).eq("id", t.id));
      },
      `${t.full_name} is now the primary tenant.`
    );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3 className="eyebrow">Tenants</h3>
      {list.length ? (
        <ul className="tenant-list">
          {list.map((t) => (
            <li key={t.id}>
              <div className="req-who">
                <b>
                  {t.full_name}
                  {t.is_primary ? <span className="pill us-occupied inline-pill">Primary</span> : null}
                  {t.profile_id ? <span className="small"> · has a website account</span> : null}
                </b>
                <ContactLine phone={t.phone} email={t.email} />
              </div>
              <div className="row">
                {!t.is_primary ? (
                  <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => makePrimary(t)}>
                    Make primary<span className="visually-hidden"> {t.full_name}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={Boolean(busy) || list.length === 1}
                  title={list.length === 1 ? "A tenancy needs at least one tenant." : undefined}
                  onClick={() => remove(t)}
                >
                  {busy === `rm-${t.id}` ? "Removing…" : "Remove"}
                  <span className="visually-hidden"> {t.full_name}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">No tenants on this tenancy yet. Add the first one below.</p>
      )}

      {adding || !list.length ? (
        <form className="boxed stack" onSubmit={add} noValidate aria-label="Add tenant">
          <TenantInputs person={person} onChange={setPerson} idPrefix={`add-tenant-${tenancyId}`} />
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={Boolean(busy)}>
              {busy === "add" ? "Adding…" : "Add tenant"}
            </button>
            {list.length ? (
              <button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
            Add another tenant
          </button>
        </div>
      )}
      {msg.text ? (
        <span className={`small ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
