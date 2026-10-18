"use client";

import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { METHOD_LABEL, PAYMENT_KIND_LABEL, cents, monthLabel, shortDate, todayISO } from "@/lib/rent";
import { PAYOUT_METHOD_LABEL, signedMoney } from "@/lib/payouts";
import { CHARGE_TO, STATUS as WORK_STATUS } from "@/lib/maintenance";
import { NOTICE_STATUS, amountLabel, effectiveLabel, noticeName } from "@/lib/notices";
import { letterProperties, letterTotals } from "@/lib/letters";
import { IRepMark } from "@/components/Brand";

const list = (v) => (Array.isArray(v) ? v : []);
const nonZero = (v) => cents(v) !== 0;

function letterDate(letter) {
  const iso = letter.sent_at
    ? new Date(letter.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })
    : todayISO();
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}

function rentMethod(r) {
  if (r.method === "paid_to_owner") return "Paid to you directly";
  return METHOD_LABEL[r.method] || r.method || "—";
}

function rentFor(r) {
  if (r.kind === "rent") return r.rent_period ? monthLabel(r.rent_period) : "Rent";
  return PAYMENT_KIND_LABEL[r.kind] || "Other";
}

function Section({ title, children }) {
  return (
    <section className="letter-section">
      <h3 className="letter-h3">{title}</h3>
      {children}
    </section>
  );
}

function Table({ head, rows, numCols = [] }) {
  return (
    <table className="letter-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} scope="col" className={numCols.includes(i) ? "r" : undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.muted ? "muted-row" : undefined}>
            {r.cells.map((c, i) => (
              <td key={i} className={numCols.includes(i) ? "r num" : undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ s, items, payouts }) {
  const lines = [
    ["Rent due", money(s.rent_expected)],
    ["Rent collected", money(s.rent_collected)],
  ];
  if (nonZero(s.rent_outstanding)) lines.push(["Outstanding", money(s.rent_outstanding)]);
  if (nonZero(s.last_month_forwarded)) lines.push(["Last month's rent forwarded", signedMoney(s.last_month_forwarded)]);
  if (s.fee_billed_separately) {
    lines.push(["Management fee billed separately", "—"]);
  } else {
    lines.push(["Management fee", signedMoney(-Number(s.mgmt_fee || 0))]);
    if (nonZero(s.mgmt_fee_hst)) lines.push(["HST on management fee", signedMoney(-Number(s.mgmt_fee_hst || 0))]);
  }
  for (const item of items) lines.push([item.description || "Adjustment", signedMoney(item.amount)]);
  if (nonZero(s.work_orders)) lines.push(["Work orders charged to you", signedMoney(-Number(s.work_orders || 0))]);

  return (
    <dl className="letter-summary">
      {lines.map(([label, value], i) => (
        <div key={`${label}-${i}`}>
          <dt>{label}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
      <div className="letter-strong">
        <dt>Net to you</dt>
        <dd className="num">{money(s.net_due)}</dd>
      </div>
      {payouts.length ? (
        payouts.map((p, i) => (
          <div key={`${p.paid_on}-${i}`}>
            <dt>
              Paid to you {shortDate(p.paid_on)}
              {p.method ? ` · ${PAYOUT_METHOD_LABEL[p.method] || p.method}` : ""}
            </dt>
            <dd className="num">{money(p.amount)}</dd>
          </div>
        ))
      ) : (
        <div>
          <dt>Paid to you</dt>
          <dd className="num">{money(0)}</dd>
        </div>
      )}
      {nonZero(s.to_pay) ? (
        <div className="letter-strong">
          <dt>{cents(s.to_pay) < 0 ? "Overpaid" : "Balance still to be paid"}</dt>
          <dd className="num">{money(Math.abs(cents(s.to_pay)) / 100)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function PropertyBlock({ p }) {
  const rent = list(p.rent);
  const arrears = list(p.arrears);
  const notices = list(p.notices);
  const newTenancies = list(p.new_tenancies);
  const ended = list(p.ended_tenancies);
  const upcoming = list(p.upcoming_move_outs);
  const work = list(p.work_orders);
  const vacant = list(p.vacant_units);
  const place = [p.address, p.city, p.postal_code].filter(Boolean).join(", ");

  return (
    <section className="letter-property" aria-label={p.address}>
      <h2 className="letter-h2">{place}</h2>

      {p.statement ? (
        <Summary s={p.statement} items={list(p.items)} payouts={list(p.payouts)} />
      ) : (
        <p className="small">No statement for this property this month.</p>
      )}

      {rent.length ? (
        <Section title="Rent Received">
          <Table
            head={["Unit", "Tenant", "Date", "For", "Method", "Amount"]}
            numCols={[5]}
            rows={rent.map((r, i) => ({
              key: i,
              muted: r.counts === false,
              cells: [r.unit, r.tenant, shortDate(r.received_on), rentFor(r), rentMethod(r), money(r.amount)],
            }))}
          />
          {rent.some((r) => r.counts === false) ? (
            <p className="letter-note">Greyed rows are shown for your records and aren&apos;t part of this statement&apos;s totals.</p>
          ) : null}
        </Section>
      ) : null}

      {arrears.length ? (
        <Section title="Arrears">
          <Table
            head={["Unit", "Tenant", "Owing"]}
            numCols={[2]}
            rows={arrears.map((a, i) => ({ key: i, cells: [a.unit, a.tenant, money(a.balance)] }))}
          />
        </Section>
      ) : null}

      {notices.length ? (
        <Section title="Notices Served">
          <Table
            head={["Notice", "Tenant / unit", "Served", "Details", "Status"]}
            rows={notices.map((n, i) => {
              const details = [
                n.amount != null ? `${amountLabel(n.form)} ${money(n.amount)}` : "",
                n.effective_date ? `${effectiveLabel(n.form)} ${shortDate(n.effective_date)}` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return {
                key: i,
                cells: [
                  noticeName(n),
                  [n.tenant, n.unit].filter(Boolean).join(", "),
                  shortDate(n.served_on),
                  details || "—",
                  NOTICE_STATUS[n.status] || n.status,
                ],
              };
            })}
          />
        </Section>
      ) : null}

      {newTenancies.length ? (
        <Section title="New Tenancies">
          <Table
            head={["Unit", "Tenants", "Lease", "Rent"]}
            numCols={[3]}
            rows={newTenancies.map((t, i) => ({
              key: i,
              cells: [
                t.unit,
                list(t.tenants).join(", ") || "—",
                t.end_date ? `${shortDate(t.start_date)} to ${shortDate(t.end_date)}` : `From ${shortDate(t.start_date)}`,
                money(t.rent),
              ],
            }))}
          />
        </Section>
      ) : null}

      {ended.length ? (
        <Section title="Move-Outs">
          <Table
            head={["Unit", "Tenants", "Moved out"]}
            rows={ended.map((t, i) => ({
              key: i,
              cells: [t.unit, list(t.tenants).join(", ") || "—", shortDate(t.move_out_date)],
            }))}
          />
        </Section>
      ) : null}

      {upcoming.length ? (
        <Section title="Upcoming Move-Outs">
          <Table
            head={["Unit", "Moving out"]}
            rows={upcoming.map((t, i) => ({ key: i, cells: [t.unit, shortDate(t.move_out_date)] }))}
          />
        </Section>
      ) : null}

      {work.length ? (
        <Section title="Work Orders">
          <Table
            head={["Unit", "Work", "Status", "Completed", "Charged to you"]}
            numCols={[4]}
            rows={work.map((w, i) => ({
              key: i,
              cells: [
                w.unit || "—",
                w.title,
                WORK_STATUS[w.status] || w.status,
                w.completed_on ? shortDate(w.completed_on) : "—",
                w.charge_to === "owner" && w.cost != null
                  ? money(w.cost)
                  : w.charge_to && w.charge_to !== "owner"
                    ? `${CHARGE_TO[w.charge_to] || w.charge_to} pays`
                    : "—",
              ],
            }))}
          />
        </Section>
      ) : null}

      {vacant.length ? (
        <Section title="Vacant Units">
          <p className="letter-note">{vacant.join(", ")}</p>
        </Section>
      ) : null}
    </section>
  );
}

export default function OwnerLetter({ letter }) {
  const data = letter?.data || {};
  const properties = letterProperties(letter);
  const totals = letterTotals(letter);
  const period = data.period || letter?.period;

  return (
    <article className="receipt letter" aria-label="Monthly property statement">
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

      <div className="letter-meta">
        <p>{letterDate(letter)}</p>
        <p>
          <b>{data.owner?.name || "Owner"}</b>
        </p>
      </div>

      <h1 className="receipt-title">Monthly property statement — {monthLabel(period)}</h1>

      {letter?.staff_note?.trim() ? <p className="letter-staff-note pre-line">{letter.staff_note.trim()}</p> : null}

      {properties.length ? (
        properties.map((p) => <PropertyBlock key={p.property_id} p={p} />)
      ) : (
        <p className="small">No properties on this statement.</p>
      )}

      {properties.length > 1 ? (
        <dl className="letter-summary letter-totals">
          <div className="letter-strong">
            <dt>All properties: net to you</dt>
            <dd className="num">{money(totals.net)}</dd>
          </div>
          <div>
            <dt>Paid to you</dt>
            <dd className="num">{money(totals.paid)}</dd>
          </div>
          <div className="letter-strong">
            <dt>Balance</dt>
            <dd className="num">{signedMoney(totals.balance)}</dd>
          </div>
        </dl>
      ) : null}

      <p className="receipt-note">Questions? Reply to this email or call {SITE.phone}.</p>
    </article>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn primary sm" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
