"use client";

import { useState } from "react";
import { dollars, hrefForPayment, hrefForPayout } from "@/lib/accounting";
import { METHOD_LABEL, shortDate } from "@/lib/rent";

function OpenButton({ getHref, label }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const href = await getHref();
    setBusy(false);
    window.open(href, "_blank", "noopener");
  }
  return (
    <button type="button" className="link-btn" disabled={busy} onClick={open}>
      {label}
    </button>
  );
}

function List({ title, rows, render, open }) {
  return (
    <div className="stack-sm">
      <h3 className="sub-title">{title}</h3>
      {!rows.length ? (
        <p className="small">None.</p>
      ) : (
        <ul className="acct-mini-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {shortDate(r.date)} · {render(r)}
              </span>
              <span className="acct-mini-end">
                <span className="num">{dollars(r.amount)}</span>
                <OpenButton getHref={() => open(r.id)} label="Open" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OutstandingCard({ summary }) {
  const deposits = summary.outstanding_deposits || [];
  const payouts = summary.outstanding_payouts || [];
  return (
    <section className="boxed stack" aria-labelledby="acct-outstanding-title">
      <div>
        <h2 id="acct-outstanding-title" className="sec-title">
          Recorded but Not at the Bank Yet
        </h2>
        <p className="small">These are normal for a day or two at the end of the month.</p>
      </div>
      <div className="row2">
        <List
          title="Payments"
          rows={deposits}
          render={(r) => [r.who || "Unknown sender", METHOD_LABEL[r.method] || r.method].filter(Boolean).join(" · ")}
          open={hrefForPayment}
        />
        <List title="Landlord Payouts" rows={payouts} render={(r) => r.property || "Property"} open={hrefForPayout} />
      </div>
    </section>
  );
}
