"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";

// Who handles showings, maintenance and lawn/snow at this property (from the Partners list).
const ROLES = [
  ["showings", "Showing agent", "Gets showing requests by email (and text) to approve, decline or suggest a time."],
  ["maintenance", "Maintenance contractor", "Default contractor for repairs here."],
  ["lawn_snow", "Lawn & snow", "Who does lawn and snow at this property."],
];

export default function PropertyAgents({ propertyId }) {
  const [partners, setPartners] = useState(null);
  const [assigned, setAssigned] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    const sb = getBrowserClient();
    Promise.all([
      sb.from("partners").select("id, name, company, email, phone").eq("active", true).order("name"),
      sb.from("property_agents").select("partner_id, role").eq("property_id", propertyId),
    ]).then(([p, a]) => {
      if (!alive) return;
      setPartners(p.data || []);
      setAssigned(a.data || []);
    });
    return () => {
      alive = false;
    };
  }, [propertyId]);

  async function add(role, partnerId) {
    if (!partnerId) return;
    setBusy(role);
    setMsg("");
    const { error } = await getBrowserClient().from("property_agents").insert({ property_id: propertyId, partner_id: partnerId, role });
    setBusy("");
    if (error) return setMsg("That didn't save. Try again.");
    setAssigned((a) => [...a, { partner_id: partnerId, role }]);
  }

  async function remove(role, partnerId) {
    setBusy(role);
    await getBrowserClient().from("property_agents").delete().eq("property_id", propertyId).eq("partner_id", partnerId).eq("role", role);
    setBusy("");
    setAssigned((a) => a.filter((x) => !(x.role === role && x.partner_id === partnerId)));
  }

  const nameOf = (id) => {
    const p = (partners || []).find((x) => x.id === id);
    return p ? `${p.name}${p.company ? ` (${p.company})` : ""}` : "Removed partner";
  };

  return (
    <section className="boxed stack" aria-labelledby="sec-agents">
      <h2 id="sec-agents" className="sec-title">
        Assigned agents
      </h2>
      {partners === null ? (
        <p className="small">Loading…</p>
      ) : !partners.length ? (
        <p className="small">
          No partners yet. <Link href="/admin/partners">Add your contractors and showing agents</Link> first.
        </p>
      ) : (
        ROLES.map(([role, label, help]) => {
          const mine = assigned.filter((a) => a.role === role);
          const free = partners.filter((p) => !mine.some((m) => m.partner_id === p.id));
          return (
            <div key={role} className="stack" style={{ gap: 6 }}>
              <div className="field" style={{ maxWidth: 420 }}>
                <label htmlFor={`ag-${role}`}>{label}</label>
                <select id={`ag-${role}`} value="" disabled={busy === role} onChange={(e) => add(role, e.target.value)}>
                  <option value="">{mine.length ? "Add another…" : "Choose…"}</option>
                  {free.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.company ? ` (${p.company})` : ""}
                    </option>
                  ))}
                </select>
                <span className="small">{help}</span>
              </div>
              {mine.length ? (
                <ul className="feature-list" aria-label={label}>
                  {mine.map((m) => (
                    <li key={m.partner_id}>
                      <span>{nameOf(m.partner_id)}</span>
                      <button type="button" onClick={() => remove(role, m.partner_id)}>
                        Remove<span className="visually-hidden"> {nameOf(m.partner_id)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : role === "showings" ? (
                <p className="small">None assigned: showing requests go to the default showings contact.</p>
              ) : null}
            </div>
          );
        })
      )}
      {msg ? <p className="err">{msg}</p> : null}
      <p className="small">Agents sign in at ireppm.ca/agent with the email on their partner record to see their showings and jobs.</p>
    </section>
  );
}
