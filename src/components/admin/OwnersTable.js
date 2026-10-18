"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { OWNER_FIELDS, OWNER_TYPES, propertyTitle } from "@/lib/admin-properties";

function matches(o, q) {
  if (!q) return true;
  return [o.name, o.email, o.phone, ...(o.properties || []).map((p) => p.address)]
    .filter(Boolean)
    .some((v) => v.toLowerCase().includes(q));
}

export default function OwnersTable() {
  const [state, setState] = useState({ loading: true, owners: [], error: "" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("owners")
      .select(`${OWNER_FIELDS}, properties(id, address, city, archived)`)
      .order("name")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          owners: data || [],
          error: error ? "We couldn't load the owners. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, owners, error } = state;
  const q = query.trim().toLowerCase();
  const shown = owners.filter((o) => matches(o, q));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <h1 className="admin-title">Owners</h1>
          <p className="small">The people and companies who own the properties IRep manages.</p>
        </div>
        <Link className="btn primary" href="/admin/owners/new">
          Add owner
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading owners…</p>
      ) : owners.length === 0 && !error ? (
        <div className="empty">
          <h2>No owners yet</h2>
          <p>Add an owner, then choose them on each of their properties.</p>
          <Link className="btn ghost" href="/admin/owners/new">
            Add the first owner
          </Link>
        </div>
      ) : owners.length ? (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="o-search">Search</label>
              <input
                id="o-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, email, phone or address"
              />
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <p>
                No owners match <b>&ldquo;{query.trim()}&rdquo;</b>.
              </p>
            </div>
          ) : (
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Email</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Properties</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => {
                    const props = (o.properties || []).filter((p) => !p.archived);
                    return (
                      <tr key={o.id}>
                        <td className="addr">{o.name}</td>
                        <td>{OWNER_TYPES[o.entity_type] || <span className="small">Not set</span>}</td>
                        <td>{o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : <span className="small">None</span>}</td>
                        <td className="num">
                          {o.phone ? <a href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}>{o.phone}</a> : <span className="small">None</span>}
                        </td>
                        <td>
                          {props.length ? (
                            <ul className="plain-list">
                              {props.map((p) => (
                                <li key={p.id}>
                                  <Link href={`/admin/properties/${p.id}`}>{propertyTitle(p)}</Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="small">None</span>
                          )}
                        </td>
                        <td className="r">
                          <Link className="btn ghost sm" href={`/admin/owners/${o.id}`}>
                            Edit<span className="visually-hidden"> {o.name}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
