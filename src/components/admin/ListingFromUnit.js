"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { text } from "@/lib/admin-properties";
import ListingForm from "./ListingForm";

// Only public listing fields are copied over; owner details never leave the property record.
function prefillFrom(unit) {
  const p = unit.property || {};
  return {
    address: text(p.address),
    unit: text(unit.label),
    city: text(p.city) || "Windsor",
    property_type: text(unit.unit_type),
    beds: text(unit.beds),
    baths: text(unit.baths),
    rent: text(unit.market_rent),
  };
}

export default function ListingFromUnit({ unitId }) {
  const [state, setState] = useState({ loading: true, unit: null });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("units")
      .select("id, label, unit_type, beds, baths, market_rent, property:properties(address, city)")
      .eq("id", unitId)
      .maybeSingle()
      .then(({ data }) => alive && setState({ loading: false, unit: data }));
    return () => {
      alive = false;
    };
  }, [unitId]);

  if (state.loading) return <p className="small">Loading unit details…</p>;
  if (!state.unit) return <ListingForm />;
  return <ListingForm prefill={prefillFrom(state.unit)} unitId={state.unit.id} />;
}
