"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate, tenancyAddress, todayISO } from "@/lib/rent";

// Late rent: FrontLobby reports rent history to the credit bureaus. It has no connection for
// other websites, so copy what it asks for, open it, and log the report here.
export default function FrontLobbyReport({ tenancy, balance, lastPaid, lastReported, onReported }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const people = (tenancy?.tenancy_tenants || []).map((t) => `${t.full_name}${t.email ? ` <${t.email}>` : ""}`).join("; ");
    const text = [
      `Tenant(s): ${people}`,
      `Rental unit: ${tenancyAddress(tenancy)}`,
      `Monthly rent: ${money(tenancy?.rent)}`,
      `Lease start: ${tenancy?.start_date || ""}`,
      `Amount owing: ${money(balance)}`,
      `Last payment: ${lastPaid || "none recorded"}`,
    ].join("\n");
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
    const tab = window.open("https://app.frontlobby.com/login", "_blank");
    if (tab) tab.opener = null;
    const { error } = await getBrowserClient()
      .from("rent_reports")
      .insert({ tenancy_id: tenancy.id, period: `${todayISO().slice(0, 7)}-01`, amount_owing: balance, note: "Started from the Rent page" });
    setBusy(false);
    if (!error) onReported?.(new Date().toISOString());
    setMsg(
      copied
        ? "Details copied. In FrontLobby, open the tenant (or add them), then report the late payment and paste."
        : `Couldn't copy automatically: ${text.replace(/\n/g, " · ")}`
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <button type="button" className="btn ghost sm" onClick={start} disabled={busy}>
        Report to FrontLobby
      </button>
      {lastReported ? <span className="small">Last reported {shortDate(String(lastReported).slice(0, 10))}</span> : null}
      {msg ? <span className="small">{msg}</span> : null}
    </div>
  );
}
