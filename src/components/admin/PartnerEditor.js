"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import PartnerForm, { PARTNER_FIELDS } from "./PartnerForm";
import PartnerProperties from "./PartnerProperties";

export default function PartnerEditor({ id }) {
  const [state, setState] = useState({ loading: true, partner: null, error: "" });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("partners")
      .select(PARTNER_FIELDS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, partner: data, error: error ? "We couldn't load this partner. Refresh the page to try again." : "" });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, partner, error } = state;
  if (loading) return <p className="small">Loading partner…</p>;
  if (!partner) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Partner not found"}</h2>
        <p>{error || "They may have been removed."}</p>
        <Link className="btn ghost" href="/admin/partners">
          Back to partners
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/partners">
          ← All partners
        </Link>
        <span className="eyebrow">Staff · Partner</span>
        <h1 className="admin-title">{partner.name}</h1>
      </div>
      <PartnerForm partner={partner} onSaved={(p) => setState((s) => ({ ...s, partner: p }))} />
      <PartnerProperties partnerId={partner.id} />
    </div>
  );
}
