"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { thisMonth } from "@/lib/rent";
import CutoverTabs from "./CutoverTabs";

// Every tab of the Google Sheets tracker, and where it lives in the portal.
const TABS = [
  ["Landlords", "Owners: contact details, entity type, portal access, statements and year-end.", [["Owners", "/admin/owners"], ["Portal Invitations", "/admin/invites"]], "covered"],
  ["Properties", "Properties: address, units, management fee, scheduled fee changes, add-ons, agreement dates.", [["Properties", "/admin/properties"]], "covered"],
  ["Leases", "Each unit's tenancies (dates, rent, deposits) and the signed leases in DocuSign.", [["Signatures", "/admin/signatures"], ["Properties → unit", "/admin/properties"]], "covered"],
  ["Tenants", "Manage Tenants: contact details, portal invitations, welcome and PayProp letters.", [["Manage Tenants", "/admin/tenants"]], "covered"],
  ["Rent Roll", "Rent: monthly charges, payments applied oldest month first, arrears, credits, and how each payment was matched.", [["Rent", "/admin/rent"], ["Matched By", "/admin/rent/audit"]], "covered"],
  ["Owner Remittances", "Landlord Payouts and monthly statement letters (rent, fees, work orders, expenses, holds).", [["Landlord Payouts", "/admin/payouts"], ["Landlord Letters", "/admin/letters"]], "covered"],
  ["Deposits & Leasing", "LMR and key deposits per tenancy, held or forwarded, leasing fees, HST and Chuck's share.", [["Deposits & Leasing", "/admin/accounting/deposits"]], "covered"],
  ["Maintenance & Expenses", "Maintenance requests, work orders and invoices, additional and monthly expenses, bank reconciliation.", [["Maintenance", "/admin/maintenance"], ["Work Orders", "/admin/work-orders"], ["Additional Expenses", "/admin/expenses"]], "covered"],
  ["Rent Increases & Notices", "N1 rent increases and other N-forms in Signatures; notices served per tenancy; increase reminders on the Dashboard.", [["Notices", "/admin/notices"], ["Signatures", "/admin/signatures"], ["Dashboard", "/admin"]], "covered"],
  ["PayProp Draw", "Paid by the 7th and the monthly $100 draw (PayProp payments only).", [["Paid by 7th & Draw", "/admin/rent/draw"], ["PayProp Batch", "/admin/rent/payprop"]], "covered"],
  ["Chuck/Rishi Payables", "Leasing-fee commissions and loan repayments, partner pay (work orders, lawn and snow, HST), dividends.", [["Commissions & Loans", "/admin/accounting/commissions"], ["Dividends & T5", "/admin/accounting/dividends"]], "covered"],
];

async function dataChecks() {
  const sb = getBrowserClient();
  const period = `${thisMonth()}-01`;
  await sb.rpc("generate_rent_charges", { p_month: period });
  const head = { count: "exact", head: true };
  const [noEmail, noOwner, unmatched, noLmr, opening, current, charged, pending] = await Promise.all([
    sb.from("tenancy_tenants").select("id, tenancy:tenancies!inner(status)", head).is("email", null).in("tenancy.status", ["active", "notice", "upcoming"]),
    sb.from("properties").select("id", head).is("owner_id", null).eq("archived", false),
    sb.from("payments").select("id", head).eq("status", "unmatched"),
    sb.from("tenancies").select("id", head).in("status", ["active", "notice", "upcoming"]).eq("collects_rent", true).is("last_month_deposit", null),
    sb.from("opening_balances").select("id", head),
    sb.from("tenancies").select("id, unit:units!inner(management_type)", head).in("status", ["active", "notice"]).eq("collects_rent", true).eq("unit.management_type", "managed"),
    sb.from("rent_charges").select("id", head).eq("period", period).eq("kind", "rent"),
    sb.from("etransfer_pending").select("id", head).eq("status", "open"),
  ]);
  return [
    ["Tenants on current tenancies with no email", noEmail.count, "/admin/tenants", 0],
    ["Properties with no landlord linked", noOwner.count, "/admin/properties", 0],
    ["Payments still to match", unmatched.count, "/admin/rent/match", 0],
    ["Pending e-Transfers (old address)", pending.count, "/admin/rent/match", 0],
    ["Rent-collecting tenancies with no LMR amount recorded", noLmr.count, "/admin/accounting/deposits", 0],
    ["Rent charges this month vs active rent-collecting tenancies", `${charged.count ?? "?"} of ${current.count ?? "?"}`, "/admin/rent", null],
    ["Opening balances entered", opening.count, "/admin/cutover", null],
  ];
}

// Staff: where each tracker tab lives now, plus live checks that the portal data is ready.
export default function TrackerParity() {
  const [checks, setChecks] = useState(null);
  useEffect(() => {
    dataChecks().then(setChecks, () => setChecks([]));
  }, []);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <CutoverTabs title="Tracker Parity" subtitle="Every tab of the Google Sheets tracker and where it lives in the portal, with checks that the data is ready for the cutover." />
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Tracker tab</th>
              <th scope="col">In the portal</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {TABS.map(([tab, what, links, status]) => (
              <tr key={tab}>
                <td>
                  <b>{tab}</b>
                </td>
                <td>
                  {what}
                  <span className="sub-line small">
                    {links.map(([label, href], i) => (
                      <span key={href + label}>
                        {i ? " · " : ""}
                        <Link href={href}>{label}</Link>
                      </span>
                    ))}
                  </span>
                </td>
                <td>{status === "covered" ? <span className="pill ts-active">Covered</span> : <span className="pill ts-notice">Gap</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="boxed stack">
        <h2 className="sub-title">Data Checks</h2>
        {checks === null ? (
          <p className="small">Checking…</p>
        ) : (
          <ul className="plain-list stack" style={{ gap: 6 }}>
            {checks.map(([label, value, href, goal]) => (
              <li key={label}>
                {goal !== null && Number(value) > goal ? "⚠ " : "✓ "}
                <Link href={href}>{label}</Link>: <b>{value ?? "?"}</b>
              </li>
            ))}
          </ul>
        )}
        <p className="small" style={{ margin: 0 }}>
          Not moved over: the tracker&apos;s formulas and history before the portal started (October 2026). Keep a read-only copy of the
          sheet for those.
        </p>
      </section>
    </div>
  );
}
