"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { loadTenancyOptions, primaryTenant, shortDate, tenancyAddress } from "@/lib/rent";
import TenancyPicker from "@/components/admin/TenancyPicker";
import CutoverTabs, { looseMatch, parsePasted } from "./CutoverTabs";

const KINDS = {
  tenancy_arrears: "Tenant owes (arrears)",
  tenancy_credit: "Tenant credit (paid ahead)",
  lmr_held: "LMR held by IRep",
  deposit_unforwarded: "Deposit not yet forwarded to landlord",
  partner_owed: "Owed to Chuck or Rishi",
};
const TENANCY_KINDS = ["tenancy_arrears", "tenancy_credit", "lmr_held", "deposit_unforwarded"];

// Staff: balances carried over from the Google Sheets tracker as of the cutover date. Each line makes its
// own entry: arrears become an opening-balance charge, a credit an opening-credit payment (not counted as
// rent collected), money owed to a partner a ledger adjustment. LMR held and deposits not forwarded show
// under Deposits & Leasing.
export default function OpeningBalances() {
  const [asOf, setAsOf] = useState("2027-01-01");
  const [rows, setRows] = useState(null);
  const [tenancies, setTenancies] = useState([]);
  const [partners, setPartners] = useState([]);
  const [f, setF] = useState({ kind: "tenancy_arrears", tenancy_id: "", partner_id: "", amount: "", note: "" });
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    const [o, t, p] = await Promise.all([
      sb
        .from("opening_balances")
        .select("id, as_of, kind, amount, note, tenancy_id, property_id, partner_id, partner:partners(name)")
        .order("created_at", { ascending: false }),
      loadTenancyOptions({ includePast: true }).catch(() => []),
      sb.from("partners").select("id, name").eq("active", true).order("name"),
    ]);
    setRows(o.data || []);
    setTenancies(t);
    setPartners(p.data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(tenancies.map((t) => [t.id, t])), [tenancies]);
  const label = (t) => (t ? `${primaryTenant(t)} · ${tenancyAddress(t)}` : "");

  async function addLine(line) {
    const { error } = await getBrowserClient()
      .from("opening_balances")
      .insert({
        as_of: asOf,
        kind: line.kind,
        tenancy_id: TENANCY_KINDS.includes(line.kind) ? line.tenancy_id : null,
        property_id: TENANCY_KINDS.includes(line.kind) ? byId.get(line.tenancy_id)?.unit?.property?.id || null : null,
        partner_id: line.kind === "partner_owed" ? line.partner_id : null,
        amount: Math.abs(Number(line.amount)),
        note: line.note?.trim() || null,
      });
    return error;
  }

  async function add(e) {
    e.preventDefault();
    if (TENANCY_KINDS.includes(f.kind) && !f.tenancy_id) return setMsg({ kind: "err", text: "Choose the tenancy." });
    if (f.kind === "partner_owed" && !f.partner_id) return setMsg({ kind: "err", text: "Choose Chuck or Rishi." });
    if (!(Number(f.amount) > 0)) return setMsg({ kind: "err", text: "Enter the amount, like 350." });
    setBusy(true);
    const error = await addLine(f);
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: error.message });
    setMsg({ kind: "ok", text: "Added." });
    setF((s) => ({ ...s, amount: "", note: "" }));
    load();
  }

  function readPaste() {
    const lines = parsePasted(paste).map((l) => {
      const hits = tenancies.filter((t) => looseMatch(l.label, `${label(t)} ${(t.tenancy_tenants || []).map((p) => p.full_name).join(" ")}`));
      const current = hits.filter((t) => t.status !== "ended");
      const pick = (current.length === 1 ? current : hits.length === 1 ? hits : [])[0];
      return { ...l, kind: l.amount < 0 ? "tenancy_credit" : "tenancy_arrears", tenancy_id: pick?.id || "", choices: hits.length };
    });
    setPreview(lines);
    setMsg({ kind: "", text: lines.length ? "" : "Nothing to read. Use one line per tenancy: name or address, then the amount." });
  }

  async function savePaste() {
    const ready = preview.filter((l) => l.tenancy_id && Number(l.amount) !== 0);
    if (!ready.length) return setMsg({ kind: "err", text: "Choose a tenancy for each line first." });
    setBusy(true);
    let saved = 0;
    const failed = [];
    for (const l of ready) {
      const error = await addLine({ ...l, note: `From the tracker: ${l.label}` });
      if (error) failed.push(`${l.label}: ${error.message}`);
      else saved += 1;
    }
    setBusy(false);
    setPreview((p) => p.filter((l) => !l.tenancy_id));
    setMsg(failed.length ? { kind: "err", text: `Saved ${saved}. Not saved: ${failed.join("; ")}` } : { kind: "ok", text: `Saved ${saved} opening balances.` });
    load();
  }

  async function remove(r) {
    if (!window.confirm("Delete this opening balance and the ledger entry it made?")) return;
    const { error } = await getBrowserClient().from("opening_balances").delete().eq("id", r.id);
    if (error) return setMsg({ kind: "err", text: error.message });
    load();
  }

  const total = (k) => (rows || []).filter((r) => r.kind === k).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <CutoverTabs
        title="Opening Balances"
        subtitle="Carry the tracker's balances into the portal as of the cutover date. Each line makes its own ledger entry; delete a line to undo it."
      />
      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="ob-asof">As of (cutover date)</label>
        <input id="ob-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </div>

      <section className="boxed stack">
        <h2 className="sub-title">Paste From the Tracker</h2>
        <p className="small" style={{ margin: 0 }}>
          Copy two columns from the tracker&apos;s Rent Roll: the tenant (or address and unit) and the balance. One line each. A positive
          amount is arrears; a negative one (or in brackets) is a credit.
        </p>
        <div className="field">
          <label htmlFor="ob-paste" className="visually-hidden">
            Pasted balances
          </label>
          <textarea id="ob-paste" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Jane Smith\t350.00\n634 Tournier Unit 2\t(120.00)"} />
        </div>
        <div>
          <button type="button" className="btn ghost sm" onClick={readPaste}>
            Read Lines
          </button>
        </div>
        {preview.length ? (
          <div className="stack" style={{ gap: 10 }}>
            {preview.map((l, i) => (
              <div key={i} className="row3" style={{ alignItems: "end" }}>
                <div className="small">
                  <b>{l.label}</b>
                  <br />
                  {money(Math.abs(l.amount))} {l.amount < 0 ? "credit" : "owing"}
                  {!l.tenancy_id ? <span className="sub-line err">{l.choices ? `${l.choices} possible matches: choose one` : "No match: choose the tenancy"}</span> : null}
                </div>
                <TenancyPicker
                  id={`ob-p-${i}`}
                  label="Tenancy"
                  tenancies={tenancies}
                  value={l.tenancy_id}
                  onChange={(v) => setPreview((p) => p.map((x, j) => (j === i ? { ...x, tenancy_id: v?.target ? v.target.value : v } : x)))}
                />
                <button type="button" className="link-btn small" onClick={() => setPreview((p) => p.filter((_, j) => j !== i))}>
                  Skip
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn primary sm" onClick={savePaste} disabled={busy}>
                {busy ? "Saving…" : `Save ${preview.filter((l) => l.tenancy_id).length} Lines`}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <form className="boxed stack" onSubmit={add} noValidate>
        <h2 className="sub-title">Add One Line</h2>
        <div className="row3">
          <div className="field">
            <label htmlFor="ob-kind">What</label>
            <select id="ob-kind" value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value }))}>
              {Object.entries(KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {f.kind === "partner_owed" ? (
            <div className="field">
              <label htmlFor="ob-partner">Who</label>
              <select id="ob-partner" value={f.partner_id} onChange={(e) => setF((s) => ({ ...s, partner_id: e.target.value }))}>
                <option value="">Choose…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <TenancyPicker id="ob-t" label="Tenancy" tenancies={tenancies} value={f.tenancy_id} onChange={(v) => setF((s) => ({ ...s, tenancy_id: v?.target ? v.target.value : v }))} />
          )}
          <div className="field">
            <label htmlFor="ob-amt">Amount ($)</label>
            <input id="ob-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ob-note">Note (optional)</label>
          <input id="ob-note" value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} placeholder="From the tracker, Rent Roll" />
        </div>
        <div>
          <button type="submit" className="btn primary sm" disabled={busy}>
            Add Opening Balance
          </button>
        </div>
      </form>
      {msg.text ? <div className={msg.kind === "err" ? "warnbox" : "okbox"}>{msg.text}</div> : null}

      <section className="stack">
        <h2 className="sec-title">Entered</h2>
        {rows?.length ? (
          <>
            <p className="small" style={{ margin: 0 }}>
              {Object.entries(KINDS)
                .map(([k, v]) => `${v}: ${money(total(k))}`)
                .join(" · ")}
            </p>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">As of</th>
                    <th scope="col">What</th>
                    <th scope="col">For</th>
                    <th scope="col" className="r">Amount</th>
                    <th scope="col">Note</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{shortDate(r.as_of)}</td>
                      <td>{KINDS[r.kind]}</td>
                      <td>{r.partner?.name || label(byId.get(r.tenancy_id)) || "—"}</td>
                      <td className="r num">{money(r.amount)}</td>
                      <td className="small">{r.note || ""}</td>
                      <td className="r">
                        <button type="button" className="link-btn small" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="small">None yet.</p>
        )}
      </section>
    </div>
  );
}
