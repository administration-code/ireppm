"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { listingTitle, money } from "@/lib/format";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/admin-listings";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { deleteLeasingRecord } from "@/lib/delete-records";

function sortListings(list) {
  return [...list].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (byStatus) return byStatus;
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });
}

export default function ListingsTable() {
  const [state, setState] = useState({ loading: true, listings: [], error: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("listings")
      .select("id, address, unit, rent, status, updated_at")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          listings: sortListings(data || []),
          error: error ? "We couldn't load the listings. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, listings, error } = state;
  const removeListing = (id) => setState((s) => ({ ...s, listings: s.listings.filter((x) => x.id !== id) }));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <Link className="eyebrow back-link" href="/admin">
            ← Staff dashboard
          </Link>
          <h1 className="admin-title">Listings</h1>
          <p className="small">
            Drafts are hidden from the website. Only listings marked Available appear to renters.
          </p>
        </div>
        <Link className="btn primary" href="/admin/listings/new">
          New listing
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading listings…</p>
      ) : listings.length === 0 && !error ? (
        <div className="empty">
          <p>No listings yet.</p>
          <Link className="btn ghost" href="/admin/listings/new">
            Create the first listing
          </Link>
        </div>
      ) : listings.length ? (
        <div className="list table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col" className="r">
                  Rent
                </th>
                <th scope="col">Status</th>
                <th scope="col" className="r">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="addr">{listingTitle(l)}</td>
                  <td className="r num">{money(l.rent)}</td>
                  <td>
                    <span className={`pill st-${l.status}`}>{STATUS_LABEL[l.status] || l.status}</span>
                  </td>
                  <td className="r">
                    <div className="row-actions">
                      <Link className="btn ghost sm" href={`/admin/listings/${l.id}`}>
                        Edit<span className="visually-hidden"> {listingTitle(l)}</span>
                      </Link>
                      {l.status === "draft" ? (
                        <DeleteRecord
                          summary={`the draft listing for ${listingTitle(l)}`}
                          run={(reason) => deleteLeasingRecord("listing", l.id, reason)}
                          onDeleted={() => removeListing(l.id)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
