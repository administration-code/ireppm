"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";

// Staff: a partner's estimate after a visit ("Needs an Estimate"). Send it to the landlord, then record
// their answer; approving puts it back on the partner's list and tells them.
export default function EstimateBox({ request: r }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ ok: false, text: "" });
  if (r.vendor_outcome !== "estimate" && !r.vendor_estimate_at) return null;
  const cost = Number(r.estimated_cost) || 0;
  const decided = ["approved", "declined"].includes(r.owner_approval);

  async function go(action) {
    setBusy(action);
    setMsg({ ok: false, text: "" });
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch("/api/admin/maintenance-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ id: r.id, action }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) return setMsg({ ok: false, text: out.error || "That didn't go through. Try again." });
    // Reload so the form below shows the new approval and status.
    window.location.reload();
  }

  return (
    <section className="boxed stack attention" style={{ gap: 8 }} aria-label="Estimate">
      <b>Estimate from {r.partner?.name || "the contractor"} {r.vendor_estimate_at ? `(${shortDate(String(r.vendor_estimate_at).slice(0, 10))})` : ""}</b>
      {r.vendor_estimate_notes ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.vendor_estimate_notes}</p> : null}
      <p className="small" style={{ margin: 0 }}>
        His price: {r.vendor_estimate != null ? `${money(r.vendor_estimate)} before HST` : "—"}. The landlord sees the <b>Estimated cost</b> below
        ({cost ? `${money(cost)}${r.estimate_plus_hst ? " + HST" : ""}` : "not set"}): change it there first if you add anything.
      </p>
      {r.estimate_sent_at ? <p className="small" style={{ margin: 0 }}>Sent to the landlord {shortDate(String(r.estimate_sent_at).slice(0, 10))}.</p> : null}
      {decided ? (
        <p className="small" style={{ margin: 0 }}>
          <b>Landlord {r.owner_approval}</b>
          {r.owner_decision_at ? ` on ${shortDate(String(r.owner_decision_at).slice(0, 10))}` : ""}.
          {r.owner_approval === "declined" ? " Close the request when you're ready." : " It's back on the contractor's list."}
        </p>
      ) : (
        <div className="req-actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className={`btn ${r.estimate_sent_at ? "ghost" : "primary"} sm`} disabled={Boolean(busy) || !cost} onClick={() => go("send")}>
            {busy === "send" ? "Sending…" : r.estimate_sent_at ? "Send Again" : "Send Estimate to Landlord"}
          </button>
          <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => go("approved")}>
            {busy === "approved" ? "Saving…" : "Landlord Approved"}
          </button>
          <button type="button" className="link-btn small" disabled={Boolean(busy)} onClick={() => go("declined")}>
            Landlord Declined
          </button>
        </div>
      )}
      {!r.estimate_sent_at && !decided ? (
        <span className="small">Sends from administration@ to the landlord with the repair, the work needed and the estimate, asking them to reply to approve.</span>
      ) : null}
      {msg.text ? <p className={msg.ok ? "small" : "small err"}>{msg.text}</p> : null}
    </section>
  );
}
