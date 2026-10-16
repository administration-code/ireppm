"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LeaseForm from "@/components/admin/signatures/LeaseForm";
import NFormForm from "@/components/admin/signatures/NFormForm";
import PmContractForm from "@/components/admin/signatures/PmContractForm";
import { loadSignatureContext, placeOf } from "@/lib/signature-context";

const TITLES = {
  lease: "Send a lease",
  pm_contract: "Send the management contract",
  N1: "N1: Notice of rent increase",
  N4: "N4: Non-payment of rent",
  N5: "N5: Interfering, damage or overcrowding",
};

export default function NewSignature({ kind, params }) {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState("");
  const key = JSON.stringify(params);

  useEffect(() => {
    let live = true;
    loadSignatureContext(JSON.parse(key))
      .then((c) => live && setCtx(c))
      .catch(() => live && setError("We couldn't load the record. Refresh to try again."));
    return () => {
      live = false;
    };
  }, [key]);

  const back = ctx?.tenancy
    ? `/admin/units/${ctx.tenancy.unit_id}#tenancy-${ctx.tenancy.id}`
    : ctx?.unit
      ? `/admin/units/${ctx.unit.id}`
      : ctx?.property
        ? `/admin/properties/${ctx.property.id}`
        : "/admin/signatures";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href={back}>
          ← Back
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">{TITLES[kind] || "Send for signature"}</h1>
            {ctx ? <p className="small">{placeOf(ctx) || "No property linked"}</p> : null}
          </div>
        </div>
      </div>
      {!TITLES[kind] ? (
        <div className="warnbox">Unknown document type.</div>
      ) : error ? (
        <div className="warnbox">{error}</div>
      ) : !ctx ? (
        <p className="small">Loading…</p>
      ) : kind === "lease" ? (
        <LeaseForm ctx={ctx} />
      ) : kind === "pm_contract" ? (
        <PmContractForm ctx={ctx} />
      ) : (
        <NFormForm kind={kind} ctx={ctx} />
      )}
    </div>
  );
}
