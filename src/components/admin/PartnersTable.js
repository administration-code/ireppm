"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/maintenance";
import { PARTNER_FIELDS } from "./PartnerForm";

export default function PartnersTable() {
  const [state, setState] = useState({ loading: true, partners: [], error: "" });
  const [trade, setTrade] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("partners")
      .select(PARTNER_FIELDS)
      .order("active", { ascending: false })
      .order("name")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          partners: data || [],
          error: error ? "We couldn't load the partners. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, partners, error } = state;
  const shown = partners.filter((p) => !trade || (p.trades || []).includes(trade));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <Link className="eyebrow back-link" href="/admin">
            ← Requests inbox
          </Link>
          <h1 className="admin-title">Partners</h1>
          <p className="small">Trades and contractors we send maintenance jobs to.</p>
        </div>
        <Link className="btn primary" href="/admin/partners/new">
          Add partner
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading partners…</p>
      ) : partners.length === 0 && !error ? (
        <div className="empty">
          <h2>No partners yet</h2>
          <p>Add the plumbers, electricians and other trades you work with, then assign them to requests.</p>
          <Link className="btn ghost" href="/admin/partners/new">
            Add the first partner
          </Link>
        </div>
      ) : partners.length ? (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="pt-trade">Trade</label>
              <select id="pt-trade" value={trade} onChange={(e) => setTrade(e.target.value)}>
                <option value="">All trades</option>
                {Object.entries(CATEGORIES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <p>No partners do this trade yet.</p>
            </div>
          ) : (
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Trades</th>
                    <th scope="col">Email</th>
                    <th scope="col">Phone</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td className="addr">
                        {p.name}
                        {p.company ? <span className="small sub-line">{p.company}</span> : null}
                        {!p.active ? <span className="pill us-offline inline-pill">Inactive</span> : null}
                      </td>
                      <td>
                        {(p.trades || []).length ? (
                          (p.trades || []).map((t) => CATEGORIES[t] || t).join(", ")
                        ) : (
                          <span className="small">None</span>
                        )}
                      </td>
                      <td>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="small">None</span>}</td>
                      <td className="num">
                        {p.phone ? <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a> : <span className="small">None</span>}
                      </td>
                      <td className="r">
                        <Link className="btn ghost sm" href={`/admin/partners/${p.id}`}>
                          Edit<span className="visually-hidden"> {p.name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
