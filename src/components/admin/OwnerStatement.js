"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { IRepMark } from "@/components/Brand";
import { METHOD_LABEL, PAYMENT_KIND_LABEL, cents, monthLabel, primaryTenant, shortDate } from "@/lib/rent";
import { ITEM_KIND_LABEL, PAYOUT_METHOD_LABEL, nextPeriodStart, signedMoney, toPayLabel } from "@/lib/payouts";
import StatementItemForm from "./StatementItemForm";
import PayoutForm from "./PayoutForm";
import LeasingFeeHelper from "./LeasingFeeHelper";
import ClearedTag, { useClearing } from "./accounting/ClearedTag";
import { lockedMessage } from "@/lib/accounting";

const EMPTY_TOTALS = {
  rent_expected: 0,
  rent_collected: 0,
  last_month_forwarded: 0,
  mgmt_fee: 0,
  mgmt_fee_hst: 0,
  work_orders: 0,
  items_total: 0,
  net_due: 0,
  paid_out: 0,
  to_pay: 0,
  full_by_7th: false,
};

async function loadStatement(propertyId, period) {
  const sb = getBrowserClient();
  const start = `${period}-01`;
  const [property, totals, payments, workOrders, items, payouts, starting, rates] = await Promise.all([
    sb
      .from("properties")
      .select("id, address, city, postal_code, fee_billed_separately, owner:owners(id, name, email, phone, mailing_address)")
      .eq("id", propertyId)
      .maybeSingle(),
    sb.from("owner_statement_totals").select("*").eq("property_id", propertyId).eq("period", start).maybeSingle(),
    sb.from("owner_statement_payments").select("*").eq("property_id", propertyId).eq("period", start),
    sb.from("owner_statement_work_orders").select("*").eq("property_id", propertyId).eq("period", start),
    sb.from("statement_items").select("*").eq("property_id", propertyId).eq("period", start).order("created_at"),
    sb.from("owner_payouts").select("*").eq("property_id", propertyId).eq("period", start).order("paid_on"),
    sb
      .from("tenancies")
      .select("id, rent, start_date, unit:units!inner(id, label, property_id), tenancy_tenants(full_name, is_primary, created_at)")
      .eq("unit.property_id", propertyId)
      .gte("start_date", start)
      .lt("start_date", nextPeriodStart(period)),
    sb.from("service_rates").select("key, amount").in("key", ["leasing_standard", "leasing_mls", "hst"]),
  ]);

  const paymentRows = payments.data || [];
  const tenancyIds = [...new Set(paymentRows.map((p) => p.tenancy_id).filter(Boolean))];
  const names = tenancyIds.length
    ? await sb.from("tenancy_tenants").select("tenancy_id, full_name, is_primary, created_at").in("tenancy_id", tenancyIds)
    : { data: [] };
  const tenantsByTenancy = {};
  for (const t of names.data || []) (tenantsByTenancy[t.tenancy_id] ||= []).push(t);

  const itemRows = items.data || [];
  const billed = new Set(itemRows.filter((i) => i.kind === "leasing_fee" && i.tenancy_id).map((i) => i.tenancy_id));
  const rateMap = Object.fromEntries((rates.data || []).map((r) => [r.key, Number(r.amount)]));

  const failed = [property, totals, payments, workOrders, items, payouts, starting, rates].some((r) => r.error);
  return {
    property: property.data,
    totals: { ...EMPTY_TOTALS, ...(totals.data || {}) },
    payments: paymentRows.map((p) => ({
      ...p,
      tenant: p.tenancy_id ? primaryTenant({ tenancy_tenants: tenantsByTenancy[p.tenancy_id] }) : null,
    })),
    workOrders: workOrders.data || [],
    items: itemRows,
    payouts: payouts.data || [],
    newTenancies: (starting.data || []).filter((t) => !billed.has(t.id)),
    rates: rateMap,
    error: failed ? "Some of this statement couldn't load. Refresh the page to try again." : "",
  };
}

function excludedReason(p) {
  if (p.method === "paid_to_owner" || p.method === "last_month_applied") return METHOD_LABEL[p.method];
  return `${PAYMENT_KIND_LABEL[p.kind] || "Other"}, not forwarded`;
}

function PaymentsTable({ rows, muted }) {
  return (
    <div className="table-scroll">
      <table className={`receipt-table${muted ? " muted-table" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Unit</th>
            <th scope="col">Tenant</th>
            <th scope="col">Date</th>
            <th scope="col">{muted ? "Why it isn't counted" : "Rent month"}</th>
            <th scope="col">Method</th>
            <th scope="col" className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.payment_id || p.id}>
              <td>{p.unit_label || "—"}</td>
              <td>
                {p.tenant || p.payer_name || "—"}
                {p.payer_name && p.tenant && p.payer_name !== p.tenant ? (
                  <span className="small sub-line">Paid by {p.payer_name}</span>
                ) : null}
              </td>
              <td>{shortDate(p.received_on)}</td>
              <td>
                {muted
                  ? excludedReason(p)
                  : p.kind === "last_month_rent"
                    ? "Last month's rent"
                    : monthLabel(p.rent_period)}
              </td>
              <td>{METHOD_LABEL[p.method] || p.method}</td>
              <td className="r num">{money(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete, label }) {
  return (
    <td className="r no-print stmt-actions">
      <button type="button" className="link-btn" onClick={onEdit} aria-label={`Edit ${label}`}>
        Edit
      </button>
      <button type="button" className="link-btn danger" onClick={onDelete} aria-label={`Delete ${label}`}>
        Delete
      </button>
    </td>
  );
}

export default function OwnerStatement({ propertyId, period }) {
  const [state, setState] = useState({ loading: true });
  const [editingItem, setEditingItem] = useState(null);
  const [editingPayout, setEditingPayout] = useState(null);
  const [actionError, setActionError] = useState("");
  const clearing = useClearing({ payoutIds: (state.payouts || []).map((p) => p.id) });

  const reload = useCallback(() => {
    loadStatement(propertyId, period).then(
      (data) => setState({ loading: false, ...data }),
      () => setState({ loading: false, error: "We couldn't load this statement. Refresh the page to try again." })
    );
  }, [propertyId, period]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(table, id, what) {
    if (!window.confirm(`Delete this ${what}? This can't be undone.`)) return;
    setActionError("");
    const { data, error } = await getBrowserClient().from(table).delete().eq("id", id).select("id");
    if (error || !data?.length) return setActionError(lockedMessage(error, `That ${what} couldn't be deleted. Try again.`));
    setEditingItem(null);
    setEditingPayout(null);
    reload();
  }

  if (state.loading) return <p className="small">Loading statement…</p>;
  if (!state.property) {
    return (
      <div className="stack">
        <div className="warnbox">{state.error || "We couldn't find that property."}</div>
        <Link href="/admin/payouts">Back to landlord payouts</Link>
      </div>
    );
  }

  const { property, totals: t, payments, workOrders, items, payouts, newTenancies, rates, error } = state;
  const owner = property.owner;
  const counted = payments.filter((p) => p.counts_toward_statement);
  const notCounted = payments.filter((p) => !p.counts_toward_statement);
  const rentRows = counted.filter((p) => p.kind === "rent");
  const lmrRows = counted.filter((p) => p.kind === "last_month_rent");
  const toPay = toPayLabel(t.to_pay);
  const ratesMissing = !(rates.leasing_standard > 0 && rates.leasing_mls > 0 && rates.hst >= 0);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print">
        <Link href={`/admin/payouts?month=${period}`}>Back to landlord payouts</Link>
        <div className="req-actions">
          <button type="button" className="btn primary sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <Link className="btn ghost sm" href={`/admin/properties/${property.id}`}>
            Open property
          </Link>
        </div>
        {error ? <div className="warnbox">{error}</div> : null}
        {actionError ? (
          <div className="warnbox" role="alert">
            {actionError}
          </div>
        ) : null}
      </div>

      <article className="receipt statement" aria-labelledby="stmt-title">
        <header className="receipt-head">
          <div className="receipt-brand">
            <IRepMark />
            <span className="wm">
              <b>IREP</b>
              <i>PROPERTY MANAGEMENT</i>
            </span>
          </div>
          <address className="receipt-office">
            {SITE.name}
            <br />
            {SITE.address}
            <br />
            {SITE.phone}
            <br />
            {SITE.email}
          </address>
        </header>

        <h1 id="stmt-title" className="receipt-title">
          Owner statement, {monthLabel(`${period}-01`)}
        </h1>
        <div className="stmt-parties">
          <div>
            <span className="small">Property</span>
            <p>
              <b>{property.address}</b>
              <br />
              {[property.city, property.postal_code].filter(Boolean).join(", ")}
            </p>
          </div>
          <div>
            <span className="small">Owner</span>
            <p>
              <b>{owner?.name || "No owner recorded"}</b>
              {owner?.mailing_address ? (
                <>
                  <br />
                  {owner.mailing_address}
                </>
              ) : null}
              {owner?.email ? (
                <>
                  <br />
                  {owner.email}
                </>
              ) : null}
              {owner?.phone ? (
                <>
                  <br />
                  {owner.phone}
                </>
              ) : null}
            </p>
          </div>
        </div>

        <section className="stmt-section" aria-labelledby="stmt-rent">
          <h2 id="stmt-rent">Rent collected</h2>
          {rentRows.length ? <PaymentsTable rows={rentRows} /> : <p className="small">No rent collected for this month.</p>}
          {lmrRows.length ? (
            <>
              <h3>Last month&apos;s rent forwarded</h3>
              <PaymentsTable rows={lmrRows} />
            </>
          ) : null}
          {notCounted.length ? (
            <>
              <h3>Recorded but not counted</h3>
              <PaymentsTable rows={notCounted} muted />
            </>
          ) : null}
        </section>

        <section className="stmt-section" aria-labelledby="stmt-deduct">
          <h2 id="stmt-deduct">Fees, work orders and adjustments</h2>
          <div className="table-scroll">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Details</th>
                  <th scope="col" className="r">Amount</th>
                  <th scope="col" className="no-print">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {property.fee_billed_separately ? (
                  <tr>
                    <td>Management fee</td>
                    <td>Paid separately via owner</td>
                    <td className="r">—</td>
                    <td className="no-print" />
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td>Management fee</td>
                      <td>{cents(t.mgmt_fee) ? "Monthly management fee" : "No rent due, so no fee this month"}</td>
                      <td className="r num">{signedMoney(-Number(t.mgmt_fee || 0))}</td>
                      <td className="no-print" />
                    </tr>
                    <tr>
                      <td>HST on management fee</td>
                      <td />
                      <td className="r num">{signedMoney(-Number(t.mgmt_fee_hst || 0))}</td>
                      <td className="no-print" />
                    </tr>
                  </>
                )}
                {workOrders.map((w) => (
                  <tr key={w.maintenance_request_id}>
                    <td>Work order</td>
                    <td>
                      <Link href={`/admin/maintenance/${w.maintenance_request_id}`}>{w.title || "Maintenance"}</Link>
                      <span className="small sub-line">
                        {[
                          w.unit_label,
                          w.completed_at
                            ? `completed ${shortDate(
                                new Date(w.completed_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })
                              )}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    <td className="r num">{signedMoney(-Number(w.actual_cost || 0))}</td>
                    <td className="no-print" />
                  </tr>
                ))}
                {items.map((i) => (
                  <tr key={i.id} className={editingItem?.id === i.id ? "editing-row" : undefined}>
                    <td>{ITEM_KIND_LABEL[i.kind] || "Other"}</td>
                    <td>{i.description}</td>
                    <td className="r num">{signedMoney(i.amount)}</td>
                    <RowActions
                      label={i.description}
                      onEdit={() => setEditingItem(i)}
                      onDelete={() => remove("statement_items", i.id, "item")}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stmt-section" aria-labelledby="stmt-summary">
          <h2 id="stmt-summary">Summary</h2>
          <table className="receipt-table stmt-summary">
            <tbody>
              <tr>
                <th scope="row">Rent collected</th>
                <td className="r num">{money(t.rent_collected)}</td>
              </tr>
              <tr>
                <th scope="row">Last month&apos;s rent forwarded</th>
                <td className="r num">{money(t.last_month_forwarded)}</td>
              </tr>
              <tr>
                <th scope="row">Management fee and HST</th>
                <td className="r num">
                  {property.fee_billed_separately ? "Paid separately" : signedMoney(-(cents(t.mgmt_fee) + cents(t.mgmt_fee_hst)) / 100)}
                </td>
              </tr>
              <tr>
                <th scope="row">Work orders</th>
                <td className="r num">{signedMoney(-Number(t.work_orders || 0))}</td>
              </tr>
              <tr>
                <th scope="row">Fees, expenses and adjustments</th>
                <td className="r num">{signedMoney(t.items_total)}</td>
              </tr>
              <tr className="stmt-net">
                <th scope="row">Net due to owner</th>
                <td className="r num">{money(t.net_due)}</td>
              </tr>
              {payouts.map((p) => (
                <tr key={p.id} className={editingPayout?.id === p.id ? "editing-row" : undefined}>
                  <th scope="row">
                    Paid {shortDate(p.paid_on)} by {PAYOUT_METHOD_LABEL[p.method] || "other"}{" "}
                    <ClearedTag kind="payout" row={p} clearing={clearing} />
                    {p.reference ? <span className="small sub-line">Ref {p.reference}</span> : null}
                  </th>
                  <td className="r num">
                    {signedMoney(-Number(p.amount))}
                    <span className="no-print stmt-inline-actions">
                      <button type="button" className="link-btn" onClick={() => setEditingPayout(p)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => remove("owner_payouts", p.id, "payout")}
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{cents(t.to_pay) < 0 ? "Overpaid" : "Still to pay"}</th>
                <td className={`r num ${toPay.cls}`}>
                  {cents(t.to_pay) < 0 ? money(Math.abs(cents(t.to_pay)) / 100) : toPay.text}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </article>

      <section className="boxed stack no-print" aria-labelledby="sec-add-item">
        <h2 id="sec-add-item" className="sec-title">
          {editingItem ? "Edit item" : "Add a statement item"}
        </h2>
        <StatementItemForm
          key={editingItem?.id || "new"}
          propertyId={property.id}
          period={period}
          item={editingItem}
          onCancel={editingItem ? () => setEditingItem(null) : null}
          onSaved={() => {
            setEditingItem(null);
            reload();
          }}
        />
      </section>

      <section className="boxed stack no-print" aria-labelledby="sec-leasing">
        <h2 id="sec-leasing" className="sec-title">
          Leasing fees for new tenancies
        </h2>
        {ratesMissing ? (
          <div className="warnbox">
            Set the leasing_standard, leasing_mls and hst rates on the rates page before adding leasing fees.
          </div>
        ) : (
          <LeasingFeeHelper
            propertyId={property.id}
            period={period}
            tenancies={newTenancies}
            rates={rates}
            onSaved={reload}
          />
        )}
      </section>

      <section className="boxed stack no-print" aria-labelledby="sec-payout">
        <h2 id="sec-payout" className="sec-title">
          {editingPayout ? "Edit payout" : "Record a payout"}
        </h2>
        <PayoutForm
          key={editingPayout?.id || `new-${t.to_pay}`}
          propertyId={property.id}
          period={period}
          payout={editingPayout}
          defaultAmount={t.to_pay}
          onCancel={editingPayout ? () => setEditingPayout(null) : null}
          onSaved={() => {
            setEditingPayout(null);
            reload();
          }}
        />
      </section>
    </div>
  );
}
