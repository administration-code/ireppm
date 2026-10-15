"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { PACKAGE_LABEL, PROPERTY_SELECT, propertyTitle } from "@/lib/admin-properties";
import RenewalBadge from "./RenewalBadge";

// Offline units are neither occupied nor available, so they're counted on their own.
function unitCounts(units = []) {
  const c = { occupied: 0, vacant: 0, turnover: 0, offline: 0 };
  for (const u of units) if (u.status in c) c[u.status] += 1;
  return c;
}

function matches(p, q) {
  if (!q) return true;
  return [p.address, p.city, p.postal_code, p.owner?.name, p.owner?.email, p.owner?.phone]
    .filter(Boolean)
    .some((v) => v.toLowerCase().includes(q));
}

const SORTS = {
  address: (a, b) => a.address.localeCompare(b.address, "en-CA", { numeric: true }),
  renewal: (a, b) => {
    if (!a.agreement_renewal && !b.agreement_renewal) return SORTS.address(a, b);
    if (!a.agreement_renewal) return 1;
    if (!b.agreement_renewal) return -1;
    return a.agreement_renewal.localeCompare(b.agreement_renewal) || SORTS.address(a, b);
  },
};

export default function PropertiesTable() {
  const [state, setState] = useState({ loading: true, properties: [], error: "" });
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState("address");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select(`${PROPERTY_SELECT}, units(status)`)
      .order("address")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          properties: data || [],
          error: error ? "We couldn't load the properties. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, properties, error } = state;
  const q = query.trim().toLowerCase();
  const archivedCount = properties.filter((p) => p.archived).length;
  const shown = properties.filter((p) => (showArchived || !p.archived) && matches(p, q)).sort(SORTS[sort]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <Link className="eyebrow back-link" href="/admin">
            ← Staff dashboard
          </Link>
          <h1 className="admin-title">Properties</h1>
          <p className="small">Buildings IRep manages, their units and who lives there. Owner details stay in the staff area.</p>
        </div>
        <Link className="btn primary" href="/admin/properties/new">
          Add property
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading properties…</p>
      ) : properties.length === 0 && !error ? (
        <div className="empty">
          <h2>No properties yet</h2>
          <p>Add the first property you manage. You can add its units and tenants after that.</p>
          <Link className="btn ghost" href="/admin/properties/new">
            Add the first property
          </Link>
        </div>
      ) : properties.length ? (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="p-search">Search</label>
              <input
                id="p-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Address, owner name, email or phone"
              />
            </div>
            <div className="field">
              <label htmlFor="p-sort">Sort by</label>
              <select id="p-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="address">Address</option>
                <option value="renewal">Renewal date (soonest first)</option>
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived{archivedCount ? ` (${archivedCount})` : ""}
            </label>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <p>No properties match {q ? <b>&ldquo;{query.trim()}&rdquo;</b> : "these filters"}.</p>
            </div>
          ) : (
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Address</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Package</th>
                    <th scope="col">Fee</th>
                    <th scope="col" aria-sort={sort === "renewal" ? "ascending" : undefined}>
                      <button type="button" className="th-sort" onClick={() => setSort(sort === "renewal" ? "address" : "renewal")}>
                        Renewal{sort === "renewal" ? " ↑" : ""}
                      </button>
                    </th>
                    <th scope="col">Units</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const c = unitCounts(p.units);
                    return (
                      <tr key={p.id}>
                        <td className="addr">
                          {propertyTitle(p)}
                          {p.archived ? <span className="pill us-offline inline-pill">Archived</span> : null}
                        </td>
                        <td>
                          {p.owner ? (
                            <Link href={`/admin/owners/${p.owner.id}`}>{p.owner.name}</Link>
                          ) : (
                            <span className="small">Not set</span>
                          )}
                        </td>
                        <td>{PACKAGE_LABEL[p.management_package] || <span className="small">Not set</span>}</td>
                        <td className="num">
                          {p.monthly_fee !== null && p.monthly_fee !== undefined ? (
                            <>
                              {money(p.monthly_fee)}
                              <span className="small"> + HST</span>
                            </>
                          ) : (
                            <span className="small">Not set</span>
                          )}
                        </td>
                        <td>
                          <RenewalBadge date={p.agreement_renewal} />
                        </td>
                        <td className="num unit-counts">
                          {p.units?.length ? (
                            <>
                              <span>{c.occupied} occupied</span>
                              <span>{c.vacant} vacant</span>
                              <span>{c.turnover} turnover</span>
                              {c.offline ? <span className="muted">{c.offline} offline</span> : null}
                            </>
                          ) : (
                            <span className="small">No units yet</span>
                          )}
                        </td>
                        <td className="r">
                          <Link className="btn ghost sm" href={`/admin/properties/${p.id}`}>
                            Open<span className="visually-hidden"> {propertyTitle(p)}</span>
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
