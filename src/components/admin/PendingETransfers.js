"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate, todayISO } from "@/lib/rent";
import TenancyPicker from "@/components/admin/TenancyPicker";

// e-Transfers sent to the old address (ireppm@ireprealty.com). They aren't deposited automatically:
// accept each one in online banking, then mark it deposited here so it's recorded as a payment.
export default function PendingETransfers({ tenancies = [], onRecorded }) {
  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("etransfer_pending")
      .select("id, reference, amount, payer_name, memo, sent_to, received_at, tenancy_id")
      .eq("status", "open")
      .order("received_at", { ascending: false });
    setRows(data || []);
    setPick(Object.fromEntries((data || []).map((r) => [r.id, r.tenancy_id || ""])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!rows.length) return null;

  async function deposited(r) {
    const tenancyId = pick[r.id];
    if (!tenancyId) return setMsg("Choose the tenancy first.");
    setBusy(r.id);
    const sb = getBrowserClient();
    const { data: pay, error } = await sb
      .from("payments")
      .insert({
        tenancy_id: tenancyId,
        received_on: todayISO(),
        amount: r.amount,
        method: "etransfer",
        kind: "rent",
        payer_name: r.payer_name,
        memo: [r.memo, "Accepted by hand (sent to the old address)"].filter(Boolean).join(" · "),
        reference: r.reference,
        source: "manual",
        sent_to: r.sent_to,
      })
      .select("id")
      .single();
    if (error) {
      setBusy("");
      return setMsg(/duplicate|unique/i.test(error.message) ? "A payment with this reference is already recorded." : error.message);
    }
    const { data: u } = await sb.auth.getUser();
    await sb
      .from("etransfer_pending")
      .update({ status: "deposited", payment_id: pay.id, tenancy_id: tenancyId, resolved_by: u?.user?.id || null, resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy("");
    setMsg(`Recorded ${money(r.amount)} from ${r.payer_name || "the sender"}.`);
    load();
    onRecorded?.();
  }

  async function dismiss(r) {
    if (!window.confirm("Dismiss this pending e-Transfer? Do this if it was declined, cancelled or already recorded.")) return;
    const { data: u } = await getBrowserClient().auth.getUser();
    await getBrowserClient()
      .from("etransfer_pending")
      .update({ status: "dismissed", resolved_by: u?.user?.id || null, resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    load();
  }

  async function saveTenancy(r, id) {
    setPick((p) => ({ ...p, [r.id]: id }));
    await getBrowserClient().from("etransfer_pending").update({ tenancy_id: id || null }).eq("id", r.id);
  }

  return (
    <section className="boxed stack attention" aria-labelledby="sec-pending-et">
      <h2 id="sec-pending-et" className="sec-title">
        Waiting to Be Accepted ({rows.length})
      </h2>
      <p className="small" style={{ margin: 0 }}>
        Sent to the old address, so not deposited automatically. Accept each one in online banking, then click Deposited to record it. Once a
        tenancy is chosen, the tenant gets an email asking them to use the new address (at most once every 25 days).
      </p>
      {rows.map((r) => (
        <div key={r.id} className="req stack" style={{ gap: 8 }}>
          <div className="req-top">
            <b>
              {money(r.amount)} from {r.payer_name || "unknown sender"}
            </b>
            <span className="small">
              {shortDate(String(r.received_at).slice(0, 10))} · {r.sent_to || "old address"}
            </span>
          </div>
          {r.memo ? <p className="req-note">{r.memo}</p> : null}
          <TenancyPicker id={`pe-${r.id}`} label="Tenancy" tenancies={tenancies} value={pick[r.id] || ""} onChange={(v) => saveTenancy(r, v?.target ? v.target.value : v)} />
          <div className="req-actions">
            <button type="button" className="btn primary sm" disabled={busy === r.id} onClick={() => deposited(r)}>
              {busy === r.id ? "Saving…" : "Deposited: Record Payment"}
            </button>
            <button type="button" className="link-btn small" onClick={() => dismiss(r)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
      {msg ? <div className="okbox">{msg}</div> : null}
    </section>
  );
}
