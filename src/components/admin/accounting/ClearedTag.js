"use client";

import { useEffect, useState } from "react";
import { TRUST_PAYMENT_METHODS, TRUST_PAYOUT_METHODS, loadClearing } from "@/lib/accounting";

const EMPTY = { payments: new Map(), payouts: new Map() };

const fmt = (iso) =>
  new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export function useClearing({ paymentIds = [], payoutIds = [] }) {
  const [clearing, setClearing] = useState(EMPTY);
  const key = `${paymentIds.join(",")}|${payoutIds.join(",")}`;
  useEffect(() => {
    let alive = true;
    const [p, o] = key.split("|").map((s) => (s ? s.split(",") : []));
    if (!p.length && !o.length) {
      setClearing(EMPTY);
      return undefined;
    }
    loadClearing({ paymentIds: p, payoutIds: o }).then(
      (c) => alive && setClearing(c),
      () => alive && setClearing(EMPTY)
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return clearing;
}

export default function ClearedTag({ kind, row, clearing }) {
  const map = kind === "payout" ? clearing.payouts : clearing.payments;
  if (map.has(row.id)) {
    const on = map.get(row.id);
    return <span className="pill acct-tag is-cleared no-print">{on ? `Cleared ${fmt(on)}` : "Cleared"}</span>;
  }
  const trust = kind === "payout" ? TRUST_PAYOUT_METHODS : TRUST_PAYMENT_METHODS;
  if (!trust.includes(row.method)) return null;
  if (kind === "payment" && ["split", "ignored"].includes(row.status)) return null;
  return <span className="pill acct-tag is-pending no-print">Not at the bank yet</span>;
}
