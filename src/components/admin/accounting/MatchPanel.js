"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import {
  addDays,
  dayGap,
  describePayment,
  dollars,
  loadTenancies,
  staffMessage,
  TRUST_PAYMENT_METHODS,
  TRUST_PAYOUT_METHODS,
} from "@/lib/accounting";
import { cents, METHOD_LABEL, shortDate } from "@/lib/rent";

const NEAR_DAYS = 10;
const WIDE_DAYS = 45;

async function loadCandidates(line, wide) {
  const sb = getBrowserClient();
  const days = wide ? WIDE_DAYS : NEAR_DAYS;
  const from = addDays(line.posted_on, -days);
  const to = addDays(line.posted_on, days);
  const target = Math.abs(Number(line.amount));

  if (Number(line.amount) > 0) {
    const { data, error } = await sb
      .from("payments")
      .select("id, received_on, amount, payer_name, method, tenancy_id, status")
      .gte("received_on", from)
      .lte("received_on", to)
      .in("method", TRUST_PAYMENT_METHODS)
      .neq("status", "ignored")
      .gt("amount", 0)
      .lte("amount", target + 0.005)
      .order("received_on");
    if (error) throw new Error("We couldn't load rent payments. Try again.");
    const rows = data || [];
    const { data: taken } = rows.length
      ? await sb.from("bank_transaction_links").select("payment_id").in("payment_id", rows.map((p) => p.id))
      : { data: [] };
    const used = new Set((taken || []).map((t) => t.payment_id));
    const tenancies = await loadTenancies(rows.map((p) => p.tenancy_id));
    return rows
      .filter((p) => !used.has(p.id))
      .map((p) => ({
        key: `payment:${p.id}`,
        kind: "payment",
        id: p.id,
        date: p.received_on,
        amount: Number(p.amount),
        title: describePayment(p, tenancies.get(p.tenancy_id)),
        meta: `Rent payment · ${METHOD_LABEL[p.method] || p.method}`,
      }));
  }

  const [payouts, works] = await Promise.all([
    sb
      .from("owner_payouts")
      .select("id, paid_on, amount, method, property:properties(address)")
      .gte("paid_on", from)
      .lte("paid_on", to)
      .in("method", TRUST_PAYOUT_METHODS)
      .lte("amount", target + 0.005)
      .order("paid_on"),
    sb
      .from("maintenance_requests")
      .select("id, title, actual_cost, completed_at, updated_at, property:properties(address)")
      .eq("status", "completed")
      .not("actual_cost", "is", null)
      .gt("actual_cost", 0)
      .lte("actual_cost", target + 0.005)
      .gte("updated_at", `${addDays(line.posted_on, -Math.max(days, 30))}T00:00:00Z`)
      .lte("updated_at", `${addDays(line.posted_on, days)}T23:59:59Z`),
  ]);
  if (payouts.error) throw new Error("We couldn't load landlord payouts. Try again.");
  const payoutRows = payouts.data || [];
  const workRows = works.data || [];
  const [takenPayouts, takenWorks] = await Promise.all([
    payoutRows.length
      ? sb.from("bank_transaction_links").select("owner_payout_id").in("owner_payout_id", payoutRows.map((p) => p.id))
      : { data: [] },
    workRows.length
      ? sb.from("bank_transaction_links").select("maintenance_request_id").in("maintenance_request_id", workRows.map((w) => w.id))
      : { data: [] },
  ]);
  const usedPayouts = new Set((takenPayouts.data || []).map((t) => t.owner_payout_id));
  const usedWorks = new Set((takenWorks.data || []).map((t) => t.maintenance_request_id));
  return [
    ...payoutRows
      .filter((p) => !usedPayouts.has(p.id))
      .map((p) => ({
        key: `payout:${p.id}`,
        kind: "payout",
        id: p.id,
        date: p.paid_on,
        amount: Number(p.amount),
        title: p.property?.address || "Property",
        meta: `Landlord payout · ${METHOD_LABEL[p.method] || p.method}`,
      })),
    ...workRows
      .filter((w) => !usedWorks.has(w.id))
      .map((w) => ({
        key: `work:${w.id}`,
        kind: "work",
        id: w.id,
        date: (w.completed_at || w.updated_at || "").slice(0, 10),
        amount: Number(w.actual_cost),
        title: w.title || "Work order",
        meta: `Work order${w.property?.address ? ` · ${w.property.address}` : ""}`,
      })),
  ];
}

function rank(line, list) {
  const target = cents(Math.abs(Number(line.amount)));
  return [...list].sort((a, b) => {
    const exactA = cents(a.amount) === target ? 0 : 1;
    const exactB = cents(b.amount) === target ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    return dayGap(a.date || line.posted_on, line.posted_on) - dayGap(b.date || line.posted_on, line.posted_on);
  });
}

export default function MatchPanel({ line, onClose, onMatched }) {
  const id = useId();
  const dialogRef = useRef(null);
  const [wide, setWide] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isIn = Number(line.amount) > 0;
  const target = cents(Math.abs(Number(line.amount)));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let live = true;
    setCandidates(null);
    loadCandidates(line, wide).then(
      (list) => live && setCandidates(rank(line, list)),
      (err) => live && (setError(err.message), setCandidates([]))
    );
    return () => {
      live = false;
    };
  }, [line, wide]);

  const chosen = (candidates || []).filter((c) => picked.has(c.key));
  const total = chosen.reduce((s, c) => s + cents(c.amount), 0);
  const balanced = chosen.length > 0 && total === target;

  function toggle(c) {
    setError("");
    setPicked((cur) => {
      const next = new Set(isIn ? cur : []);
      if (cur.has(c.key)) next.delete(c.key);
      else next.add(c.key);
      return next;
    });
  }

  async function save() {
    if (!balanced) {
      return setError(
        isIn
          ? `The payments you picked add up to ${dollars(total / 100)}. They need to add up to ${dollars(target / 100)}.`
          : `That's ${dollars(total / 100)}. It needs to be ${dollars(target / 100)}.`
      );
    }
    setBusy(true);
    setError("");
    const rows = chosen.map((c) => ({
      bank_transaction_id: line.id,
      amount: c.amount,
      payment_id: c.kind === "payment" ? c.id : null,
      owner_payout_id: c.kind === "payout" ? c.id : null,
      maintenance_request_id: c.kind === "work" ? c.id : null,
    }));
    const { error: err } = await getBrowserClient().from("bank_transaction_links").insert(rows);
    setBusy(false);
    if (err) {
      if (/duplicate|unique/i.test(err.message || "")) return setError("One of those is already matched to another bank line. Refresh and try again.");
      return setError(staffMessage(err));
    }
    onMatched();
  }

  return (
    <dialog
      ref={dialogRef}
      className="acct-dialog"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
    >
      <div className="stack">
        <div>
          <h2 id={`${id}-title`} className="sec-title">
            Match this bank line
          </h2>
          <p className="acct-dialog-line">
            <span>{shortDate(line.posted_on)}</span>
            <span>{line.description}</span>
            <strong className={`num${isIn ? "" : " acct-out"}`}>{dollars(line.amount)}</strong>
          </p>
          <p className="small">
            {isIn
              ? "Pick the rent payment it was for. A PayProp or batch deposit can cover several payments: pick them all."
              : "Pick the landlord payout or work order it paid for."}
          </p>
        </div>

        <label className="acct-check">
          <input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} />
          <span>Look further back and ahead ({WIDE_DAYS} days instead of {NEAR_DAYS})</span>
        </label>

        {candidates === null ? (
          <p className="small">Looking for matches…</p>
        ) : !candidates.length ? (
          <div className="warnbox">
            Nothing recorded fits this amount{wide ? "" : " within a week"}.{" "}
            {isIn
              ? "Record the payment on the Rent page first, or categorise this line if it isn't rent."
              : "Record the payout first, or categorise this line (contractor, bank fee, IRep fees…)."}
          </div>
        ) : (
          <ul className="acct-candidates">
            {candidates.map((c) => {
              const on = picked.has(c.key);
              const exact = cents(c.amount) === target;
              return (
                <li key={c.key}>
                  <label className={`acct-candidate${on ? " on" : ""}`}>
                    <input type={isIn ? "checkbox" : "radio"} name={`${id}-pick`} checked={on} onChange={() => toggle(c)} />
                    <span className="acct-candidate-body">
                      <span className="acct-candidate-title">{c.title}</span>
                      <span className="small">
                        {c.meta} · {c.date ? shortDate(c.date) : "no date"}
                        {exact ? " · exact amount" : ""}
                      </span>
                    </span>
                    <span className="num">{dollars(c.amount)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {isIn && chosen.length > 1 ? (
          <p className={`acct-diff${balanced ? " ok" : " bad"}`}>
            Picked {dollars(total / 100)} of {dollars(target / 100)}
          </p>
        ) : null}

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <div className="acct-inline-actions">
          <button type="button" className="btn primary" disabled={busy || !chosen.length} onClick={save}>
            {busy ? "Matching…" : "Match"}
          </button>
          <button type="button" className="btn ghost" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
