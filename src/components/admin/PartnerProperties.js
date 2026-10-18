"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { AGENT_ROLES } from "./PropertyAgents";

// On a partner's page: which properties they're assigned to, with "assign to all" per role.
export default function PartnerProperties({ partnerId }) {
  const [props, setProps] = useState(null);
  const [assigned, setAssigned] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const sb = getBrowserClient();
    const [p, a] = await Promise.all([
      sb.from("properties").select("id, address, city").eq("archived", false).order("address"),
      sb.from("property_agents").select("property_id, role").eq("partner_id", partnerId),
    ]);
    setProps(p.data || []);
    setAssigned(a.data || []);
    if (p.error || a.error) setMsg("We couldn't load the assignments. Refresh to try again.");
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const has = (role, id) => assigned.some((a) => a.role === role && a.property_id === id);

  async function toggle(role, id) {
    setBusy(`${role}:${id}`);
    setMsg("");
    const sb = getBrowserClient();
    const { error } = has(role, id)
      ? await sb.from("property_agents").delete().eq("partner_id", partnerId).eq("property_id", id).eq("role", role)
      : await sb.from("property_agents").insert({ partner_id: partnerId, property_id: id, role });
    if (error) setMsg("That didn't save. Try again.");
    await load();
    setBusy("");
  }

  async function assignAll(role) {
    setBusy(role);
    setMsg("");
    const missing = (props || []).filter((p) => !has(role, p.id)).map((p) => ({ partner_id: partnerId, property_id: p.id, role }));
    if (missing.length) {
      const { error } = await getBrowserClient().from("property_agents").insert(missing);
      setMsg(error ? "Some assignments didn't save. Try again." : `Added to ${missing.length} ${missing.length === 1 ? "property" : "properties"}.`);
    } else setMsg("Already assigned to every property.");
    await load();
    setBusy("");
  }

  if (!props) return <p className="small">Loading assignments…</p>;

  return (
    <section className="boxed stack" aria-labelledby="pp-title" style={{ gap: 14 }}>
      <div>
        <h2 id="pp-title" className="sub-title">Assigned Properties</h2>
        <p className="small">Tick the properties this partner covers, or assign them to every property in one click.</p>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {AGENT_ROLES.map(([role, label]) => (
          <button key={role} type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => assignAll(role)}>
            {busy === role ? "Assigning…" : `${label}: assign to all`}
          </button>
        ))}
      </div>
      {msg ? <p className="small" role="status">{msg}</p> : null}
      <div className="list table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              {AGENT_ROLES.map(([role, label]) => (
                <th key={role} scope="col">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.map((p) => (
              <tr key={p.id}>
                <td className="addr">
                  <Link href={`/admin/properties/${p.id}`}>{p.address}</Link>
                </td>
                {AGENT_ROLES.map(([role, label]) => (
                  <td key={role}>
                    <input
                      type="checkbox"
                      aria-label={`${label} at ${p.address}`}
                      checked={has(role, p.id)}
                      disabled={busy === `${role}:${p.id}`}
                      onChange={() => toggle(role, p.id)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
