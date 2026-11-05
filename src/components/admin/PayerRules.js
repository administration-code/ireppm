"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { loadTenancyOptions, primaryTenant, tenancyAddress } from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";
import TenancyPicker from "./TenancyPicker";

const EMPTY = { payer_name: "", action: "tenancy", tenancy_id: "", note: "" };

// Staff: rules for e-Transfer senders who pay for someone else (staff only; never shown to
// landlords or tenants). Applied to new payments as they arrive, before name matching.
export default function PayerRules() {
  const [rules, setRules] = useState(null);
  const [tenancies, setTenancies] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  async function load() {
    const sb = getBrowserClient();
    const [r, t] = await Promise.all([
      sb.from("payer_rules").select("*").order("created_at", { ascending: false }),
      loadTenancyOptions({ includePast: false }),
    ]);
    setRules(r.data || []);
    setTenancies(t || []);
  }
  useEffect(() => {
    load();
  }, []);

  const tenancyLabel = (id) => {
    const t = tenancies.find((x) => x.id === id);
    return t ? `${primaryTenant(t)}, ${tenancyAddress(t)}` : "A tenancy that has ended";
  };

  async function save(e) {
    e.preventDefault();
    if (!form.payer_name.trim()) return setMsg({ kind: "err", text: "Type the sender's name as it shows on their e-Transfers." });
    if (form.action === "tenancy" && !form.tenancy_id) return setMsg({ kind: "err", text: "Choose the tenancy their payments are for." });
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("payer_rules")
      .insert({
        payer_name: form.payer_name.trim(),
        action: form.action,
        tenancy_id: form.action === "tenancy" ? form.tenancy_id : null,
        note: form.note.trim() || null,
      });
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: "That didn't save. Try again." });
    setForm(EMPTY);
    setMsg({ kind: "ok", text: "Rule saved. It applies to e-Transfers that come in from now on." });
    load();
  }

  async function remove(id) {
    await getBrowserClient().from("payer_rules").delete().eq("id", id);
    load();
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead
        title="Sender Rules"
        intro="For people who send rent for someone else. A rule decides where a sender's e-Transfers go, before the usual name matching. Staff only: landlords and tenants never see these."
      />
      <RentNav current="/admin/rent/senders" />

      <section className="boxed stack" aria-labelledby="pr-list">
        <h2 id="pr-list" className="sec-title">
          Rules
        </h2>
        {rules === null ? (
          <p className="small">Loading…</p>
        ) : !rules.length ? (
          <p className="small">No rules yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Sender (as on the e-Transfer)</th>
                  <th scope="col">Their payments</th>
                  <th scope="col">Note</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.payer_name}</b>
                    </td>
                    <td>{r.action === "ignore" ? "Not rent for our properties (kept as “not rent”)" : `Go to ${tenancyLabel(r.tenancy_id)}`}</td>
                    <td className="small">{r.note || "—"}</td>
                    <td className="r">
                      <button type="button" className="btn ghost sm" onClick={() => remove(r.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form className="boxed stack" onSubmit={save} noValidate aria-labelledby="pr-add">
        <h2 id="pr-add" className="sec-title">
          Add a Rule
        </h2>
        <div className="row2">
          <div className="field">
            <label htmlFor="pr-name">Sender&apos;s name, as on their e-Transfers</label>
            <input id="pr-name" value={form.payer_name} onChange={(e) => setForm((f) => ({ ...f, payer_name: e.target.value }))} placeholder="AKASH SUNILKUMAR" />
            <span className="small">Capitals and extra spaces don&apos;t matter.</span>
          </div>
          <div className="field">
            <label htmlFor="pr-action">Their payments</label>
            <select id="pr-action" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}>
              <option value="tenancy">Always go to a specific tenancy</option>
              <option value="ignore">Aren&apos;t rent for any property we manage</option>
            </select>
          </div>
        </div>
        {form.action === "tenancy" ? (
          <TenancyPicker id="pr-t" tenancies={tenancies} value={form.tenancy_id} onChange={(v) => setForm((f) => ({ ...f, tenancy_id: v }))} />
        ) : (
          <p className="small" style={{ margin: 0 }}>
            Their e-Transfers are still recorded, as &ldquo;not rent&rdquo; with your note, so the deposit shows in the books. They never count
            toward a tenant&apos;s rent or a landlord&apos;s statement.
          </p>
        )}
        <div className="field">
          <label htmlFor="pr-note">Note (staff only)</label>
          <input id="pr-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Pays Arinze's rent at 220 Bridge" />
        </div>
        {msg.text ? (
          <div className={msg.kind === "err" ? "warnbox" : "okbox"} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </div>
        ) : null}
        <div className="req-actions">
          <button type="submit" className="btn primary sm" disabled={busy}>
            {busy ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
    </div>
  );
}
