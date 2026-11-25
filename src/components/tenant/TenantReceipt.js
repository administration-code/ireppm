"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { ReceiptArticle } from "@/components/admin/RentReceipt";

// A tenant's own rent receipt, printable or saved as a PDF from the browser.
export default function TenantReceipt({ query }) {
  const [state, setState] = useState({ loading: true, receipt: null, error: "" });
  useEffect(() => {
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return setState({ loading: false, receipt: null, error: "Sign in to see your receipts." });
      const res = await fetch(`/api/tenant/portal?receipt=1&${query}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => ({})) : {};
      setState({ loading: false, receipt: out.receipt || null, error: out.receipt ? "" : out.error || "That receipt isn't available." });
    })();
  }, [query]);
  const { loading, receipt, error } = state;
  return (
    <section className="block">
      <div className="wrap stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print req-actions">
        <Link className="back" href="/account">
          ← My Home
        </Link>
        {receipt?.payments?.length ? (
          <button type="button" className="btn primary sm" onClick={() => window.print()}>
            Print or Save as PDF
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="small">Loading receipt…</p>
      ) : receipt?.payments?.length ? (
        <ReceiptArticle receipt={receipt} />
      ) : (
        <div className="empty">
          <h2>No Receipt to Show</h2>
          <p>{error || "There are no payments in this period."}</p>
        </div>
      )}
      </div>
    </section>
  );
}
