"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { OWNER_FIELDS, propertyTitle } from "@/lib/admin-properties";
import OwnerForm from "./OwnerForm";

export default function OwnerEditor({ id }) {
  const [state, setState] = useState({ loading: true, owner: null, error: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("owners")
      .select(`${OWNER_FIELDS}, profile_id, properties(id, address, city, archived)`)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, owner: data, error: error ? "We couldn't load this owner. Refresh the page to try again." : "" });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, owner, error } = state;
  if (loading) return <p className="small">Loading owner…</p>;
  if (!owner) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Owner not found"}</h2>
        <p>{error || "They may have been removed."}</p>
        <Link className="btn ghost" href="/admin/owners">
          Back to Owners
        </Link>
      </div>
    );
  }

  const properties = owner.properties || [];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/owners">
          ← All owners
        </Link>
        <span className="eyebrow">Staff · Owner</span>
        <h1 className="admin-title">{owner.name}</h1>
        <p className="small" style={{ marginTop: 8 }}>
          {owner.profile_id ? (
            <span className="pill cs-full inline-pill">Portal: linked</span>
          ) : (
            <span className="pill opt inline-pill">Portal: not signed in yet</span>
          )}
        </p>
      </div>

      <OwnerForm owner={owner} onSaved={(o) => setState((s) => ({ ...s, owner: { ...s.owner, ...o } }))} />

      <section className="boxed stack" aria-labelledby="sec-owner-props">
        <h2 id="sec-owner-props" className="sec-title">
          Properties
        </h2>
        {properties.length ? (
          <ul className="plain-list">
            {properties.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/properties/${p.id}`}>{propertyTitle(p)}</Link>
                {p.archived ? <span className="pill us-offline inline-pill">Archived</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No properties yet. Choose this owner on a property&apos;s form to link it.</p>
        )}
      </section>
    </div>
  );
}
