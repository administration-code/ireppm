"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { TENANCY_FIELDS, TENANT_FIELDS, UNIT_FIELDS, UNIT_STATUS, bedsBaths, currentTenancy, isMaintenanceOnly, prettyDate, sortTenants, unitPill } from "@/lib/admin-properties";
import CurrentTenancy from "./CurrentTenancy";
import RentLedger from "./RentLedger";
import RecordSignatures from "./signatures/RecordSignatures";

// Past tenancies load their ledger only when opened, to keep the unit page quick.
function PastLedger({ tenancy }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="stack" style={{ marginTop: 12 }}>
      {isMaintenanceOnly(tenancy) ? null : <RentLedger tenancy={tenancy} />}
      <NoticesPanel tenancyId={tenancy.id} />
      <InspectionsList unitId={tenancy.unit_id} tenancyId={tenancy.id} title="Inspections for This Tenancy" />
    </div>
  ) : (
    <button type="button" className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
      Show rent ledger, notices and inspections
    </button>
  );
}
import StartTenancyForm from "./StartTenancyForm";
import NoticesPanel from "./NoticesPanel";
import UnitTurnover from "./UnitTurnover";
import InspectionsList from "./InspectionsList";

async function loadUnit(id) {
  const sb = getBrowserClient();
  const [u, t] = await Promise.all([
    sb.from("units").select(`${UNIT_FIELDS}, property:properties(id, address, city)`).eq("id", id).maybeSingle(),
    sb
      .from("tenancies")
      .select(`${TENANCY_FIELDS}, tenancy_tenants(${TENANT_FIELDS})`)
      .eq("unit_id", id)
      .order("start_date", { ascending: false }),
  ]);
  return {
    unit: u.data,
    tenancies: t.data || [],
    error: u.error || t.error ? "We couldn't load this unit. Refresh the page to try again." : "",
  };
}

export default function UnitTenancy({ id }) {
  const [state, setState] = useState({ loading: true, unit: null, tenancies: [], error: "" });
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    const data = await loadUnit(id);
    setState({ loading: false, ...data });
  }, [id]);

  useEffect(() => {
    let alive = true;
    loadUnit(id).then((data) => alive && setState({ loading: false, ...data }));
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, unit, tenancies, error } = state;
  if (loading) return <p className="small">Loading unit…</p>;
  if (!unit) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Unit not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/properties">
          Back to Properties
        </Link>
      </div>
    );
  }

  const current = currentTenancy(tenancies);
  // The next tenancy, signed while the current tenant is still there (moving out before it starts).
  const next = current && current.status !== "upcoming" ? tenancies.find((t) => t.status === "upcoming") || null : null;
  const canStartNext = current && current.status !== "upcoming" && !next && Boolean(current.move_out_date);
  const past = tenancies.filter((t) => t.status === "ended");

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href={`/admin/properties/${unit.property_id}`}>
          ← {unit.property?.address || "Property"}
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">Staff · Unit</span>
            <h1 className="admin-title">
              {unit.label}
              {unit.property ? `, ${unit.property.address}` : ""}
            </h1>
            <p className="small">
              {[unit.unit_type, bedsBaths(unit), unit.market_rent ? `Market rent ${money(unit.market_rent)}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="req-actions" style={{ gap: 6 }}>
            {isMaintenanceOnly(current) ? <span className="pill maint-only">Maintenance Only</span> : null}
            {(() => { const p = unitPill(unit, current); return <span className={`pill ${p.cls}`}>{p.text}</span>; })()}
          </span>
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <UnitTurnover unitId={unit.id} />

      {current ? (
        <>
          <CurrentTenancy key={`${current.id}-${current.status}`} tenancy={current} onChanged={reload} />
          {isMaintenanceOnly(current) ? (
            <section className="boxed stack" aria-label="Rent">
              <h2 className="sec-title">Rent Ledger</h2>
              <p className="small" style={{ margin: 0 }}>
                Rent not collected by IRep. The landlord collects the rent for this tenancy, so there are no rent charges, arrears or PayProp
                payments here. Repairs and work orders still go on the landlord&apos;s statement. Use Start Collecting Rent above if IRep takes over
                rent collection.
              </p>
            </section>
          ) : (
            <RentLedger tenancy={current} />
          )}
          <NoticesPanel tenancyId={current.id} />
          <RecordSignatures type="tenancy" id={current.id} />
          {next ? (
            <CurrentTenancy key={`${next.id}-${next.status}`} tenancy={next} onChanged={reload} heading="Next Tenancy" />
          ) : starting ? (
            <StartTenancyForm
              unit={unit}
              after={current.move_out_date}
              onCancel={() => setStarting(false)}
              onCreated={async () => {
                await reload();
                setStarting(false);
              }}
            />
          ) : canStartNext ? (
            <div className="boxed stack" style={{ gap: 8 }}>
              <h2 className="sec-title">Next Tenancy</h2>
              <p className="small" style={{ margin: 0 }}>
                The current tenant moves out on {prettyDate(current.move_out_date)}. You can set up the next tenancy now, starting after that
                date.
              </p>
              <div className="req-actions">
                <button type="button" className="btn primary sm" onClick={() => setStarting(true)}>
                  Start Next Tenancy
                </button>
                <Link className="btn ghost sm" href={`/admin/signatures/new?kind=lease&unit=${unit.id}`}>
                  Send a Lease for Signature
                </Link>
              </div>
            </div>
          ) : (
            <p className="small">To set up the next tenancy, record the current tenant&apos;s notice (their move-out date) first.</p>
          )}
        </>
      ) : starting ? (
        <StartTenancyForm
          unit={unit}
          onCancel={() => setStarting(false)}
          onCreated={async () => {
            await reload();
            setStarting(false);
          }}
        />
      ) : (
        <div className="empty">
          <h2>No Current Tenancy</h2>
          <p>
            Start a tenancy when a renter signs the lease. You&apos;ll add the dates, rent and at least one tenant. If the landlord collects the
            rent and IRep only handles repairs, tick Maintenance only.
          </p>
          <div className="req-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="btn primary" onClick={() => setStarting(true)}>
              Start tenancy
            </button>
            <Link className="btn ghost" href={`/admin/signatures/new?kind=lease&unit=${unit.id}`}>
              Send a Lease for Signature
            </Link>
          </div>
        </div>
      )}

      <InspectionsList
        unitId={unit.id}
        title="Inspections for This Unit"
        newHref={current ? `/admin/inspections/new?tenancy=${current.id}` : `/admin/inspections/new?unit=${unit.id}`}
      />

      <section className="stack" aria-labelledby="sec-past">
        <h2 id="sec-past" className="sec-title">
          Past Tenancies
        </h2>
        {past.length ? (
          <ul className="req-list">
            {past.map((t) => (
              <li key={t.id} id={`tenancy-${t.id}`} className="req">
                <div className="req-top">
                  <b>{sortTenants(t.tenancy_tenants || []).map((p) => p.full_name).join(", ") || "No tenants recorded"}</b>
                  <span className="req-actions" style={{ gap: 6 }}>
                    {isMaintenanceOnly(t) ? <span className="pill maint-only">Maintenance Only</span> : null}
                    <span className="pill ts-ended">Ended</span>
                  </span>
                </div>
                <dl className="req-facts">
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {prettyDate(t.start_date)} to {prettyDate(t.move_out_date || t.end_date)}
                    </dd>
                  </div>
                  <div>
                    <dt>Rent</dt>
                    <dd className="num">{isMaintenanceOnly(t) ? "Not collected by IRep" : `${money(t.rent)} / month`}</dd>
                  </div>
                  {t.payprop_reference ? (
                    <div>
                      <dt>PayProp reference</dt>
                      <dd>{t.payprop_reference}</dd>
                    </div>
                  ) : null}
                </dl>
                <PastLedger tenancy={t} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No past tenancies for this unit yet.</p>
        )}
      </section>
    </div>
  );
}
