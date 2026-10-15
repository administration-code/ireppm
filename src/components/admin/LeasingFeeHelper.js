"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { primaryTenant, shortDate } from "@/lib/rent";
import { leasingFee } from "@/lib/payouts";

export default function LeasingFeeHelper({ propertyId, period, tenancies, rates, onSaved }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function add(tenancy, rateKey) {
    const { fee, total } = leasingFee(tenancy.rent, rates[rateKey], rates.hst);
    setBusy(`${tenancy.id}-${rateKey}`);
    setError("");
    const { data, error: err } = await getBrowserClient()
      .from("statement_items")
      .insert({
        property_id: propertyId,
        period: `${period}-01`,
        kind: "leasing_fee",
        tenancy_id: tenancy.id,
        description: `Leasing fee: ${primaryTenant(tenancy)}, ${tenancy.unit?.label || "unit"} (${money(fee)} + HST)`,
        amount: -total,
      })
      .select("id");
    setBusy("");
    if (err || !data?.length) return setError("The leasing fee didn't save. Try again.");
    onSaved();
  }

  if (!tenancies.length) {
    return <p className="small">No new tenancies this month need a leasing fee.</p>;
  }

  return (
    <div className="stack">
      <ul className="lease-fee-list">
        {tenancies.map((t) => {
          const standard = leasingFee(t.rent, rates.leasing_standard, rates.hst);
          const mls = leasingFee(t.rent, rates.leasing_mls, rates.hst);
          const noRent = !(Number(t.rent) > 0);
          return (
            <li key={t.id}>
              <div>
                <b>{primaryTenant(t)}</b>, {t.unit?.label || "unit"}
                <span className="small sub-line">
                  Starts {shortDate(t.start_date)} · rent {noRent ? "not set" : money(t.rent)}
                </span>
              </div>
              <div className="req-actions">
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={noRent || Boolean(busy)}
                  onClick={() => add(t, "leasing_standard")}
                >
                  {busy === `${t.id}-leasing_standard` ? "Adding…" : `Add standard leasing fee (${money(standard.total)})`}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={noRent || Boolean(busy)}
                  onClick={() => add(t, "leasing_mls")}
                >
                  {busy === `${t.id}-leasing_mls` ? "Adding…" : `Add MLS leasing fee (${money(mls.total)})`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
