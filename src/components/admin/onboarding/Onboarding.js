"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate, todayISO } from "@/lib/rent";
import { refreshStaffCounts } from "@/lib/admin-nav";

const longDay = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "");

// Staff: each signed lease or amendment until it's set up. Leases on managed, rent-collecting
// tenancies need PayProp: add the tenants there and send the PayProp letter.
export default function Onboarding() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("open");

  const load = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("lease_onboarding")
      .select("*, request:signature_requests(id, title, completed_at), tenancy:tenancies(id, rent, last_month_deposit, tenancy_tenants(id, full_name, email))")
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(data || []);
  }, [tab]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Tenants</span>
        <h1 className="admin-title">Onboarding</h1>
        <p className="small">
          Every lease or amendment signed in DocuSign lands here. For managed properties, add the tenants in PayProp and send the PayProp
          letter. Leasing-only and maintenance-only tenancies don&apos;t need PayProp.
        </p>
      </div>
      <div className="seg">
        <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>
          Open
        </button>
        <button type="button" aria-pressed={tab === "done"} onClick={() => setTab("done")}>
          Done
        </button>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">{tab === "open" ? "Nothing to set up." : "Nothing finished yet."}</p>
      ) : (
        rows.map((r) => <Item key={r.id} r={r} onChanged={load} />)
      )}
    </div>
  );
}

function Item({ r, onChanged }) {
  const d = r.details || {};
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const place = [d.address, d.unit && !/^whole/i.test(d.unit) ? d.unit : ""].filter(Boolean).join(", ");

  async function save(changes) {
    setBusy(true);
    const next = { ...r, ...changes };
    const finished = r.kind === "lease" && (!next.needs_payprop || (next.payprop_added && next.payprop_letter_sent));
    const { data: u } = await getBrowserClient().auth.getUser();
    const { error } = await getBrowserClient()
      .from("lease_onboarding")
      .update({ ...changes, ...(finished ? { status: "done", done_at: new Date().toISOString(), done_by: u?.user?.id || null } : {}) })
      .eq("id", r.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    refreshStaffCounts();
    onChanged();
  }

  return (
    <section className="boxed stack" style={{ gap: 10 }}>
      <div className="req-top">
        <div>
          <b>{d.title || r.request?.title}</b>
          <span className="sub-line small">
            {r.kind === "amendment" ? "Lease amendment" : "Lease"} signed {shortDate(String(r.request?.completed_at || r.created_at).slice(0, 10))}
            {place ? ` · ${place}` : ""}
          </span>
        </div>
        <span className={`pill ${r.status === "done" ? "ts-active" : "ts-upcoming"}`}>{r.status === "done" ? "Done" : "Signed: onboarding open"}</span>
      </div>

      {r.kind === "lease" ? (
        <>
          <dl className="req-facts">
            <div>
              <dt>Tenants (full legal names)</dt>
              <dd>
                {(d.tenants || []).map((p, i) => (
                  <span key={i} className="sub-line">
                    {p.full_name}
                    {p.email ? ` · ${p.email}` : " · no email"}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Rent</dt>
              <dd className="num">{d.rent ? `${money(d.rent)} / month` : "—"}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>
                {longDay(d.start_date)}
                {d.end_date ? ` to ${longDay(d.end_date)}` : ""}
              </dd>
            </div>
            <div>
              <dt>Last month&apos;s rent</dt>
              <dd className="num">{d.lmr ? money(d.lmr) : "—"}</dd>
            </div>
            {d.prorated_first_month ? (
              <div>
                <dt>First month, prorated</dt>
                <dd className="num">{money(d.prorated_first_month)}</dd>
              </div>
            ) : null}
          </dl>
          {!r.tenancy_id ? (
            <div className="warnbox">
              Not attached to a tenancy yet.{" "}
              {r.unit_id ? <Link href={`/admin/units/${r.unit_id}`}>Start the tenancy on the unit page</Link> : "Open the unit and start the tenancy."}
            </div>
          ) : null}
          {r.needs_payprop ? (
            <div className="stack" style={{ gap: 6 }}>
              <label className="check-line">
                <input type="checkbox" checked={r.payprop_added} disabled={busy || r.status === "done"} onChange={(e) => save({ payprop_added: e.target.checked })} />
                Added in PayProp
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={r.payprop_letter_sent}
                  disabled={busy || r.status === "done"}
                  onChange={(e) => save({ payprop_letter_sent: e.target.checked })}
                />
                PayProp letter sent (<Link href="/admin/payprop-letters">PayProp Letters</Link>)
              </label>
            </div>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Leasing only or maintenance only: no PayProp setup.
            </p>
          )}
        </>
      ) : (
        <AmendmentForm r={r} onSaved={() => save({})} />
      )}

      {r.status === "open" ? (
        <div className="req-actions">
          <button
            type="button"
            className="link-btn small"
            disabled={busy}
            onClick={async () => {
              const { data: u } = await getBrowserClient().auth.getUser();
              await getBrowserClient()
                .from("lease_onboarding")
                .update({ status: "done", done_at: new Date().toISOString(), done_by: u?.user?.id || null })
                .eq("id", r.id);
              refreshStaffCounts();
              onChanged();
            }}
          >
            Mark Done
          </button>
          {r.tenancy_id && r.unit_id ? <Link href={`/admin/units/${r.unit_id}`} className="link-btn small">Open the unit</Link> : null}
          {r.request?.id ? <Link href={`/admin/signatures/${r.request.id}`} className="link-btn small">Open the signed document</Link> : null}
        </div>
      ) : null}
      {msg ? <div className="warnbox">{msg}</div> : null}
    </section>
  );
}

// An amendment's changes, applied on the effective date. If the last month's rent held is now below
// the new rent, a "Request LMR top-up" task is made with an email draft.
function AmendmentForm({ r, onSaved }) {
  const t = r.tenancy;
  const [f, setF] = useState({ effective: todayISO(), rent: "", add: "", remove: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!t) return <div className="warnbox">This amendment isn&apos;t attached to a tenancy. Link it on the signed document first.</div>;

  async function save(e) {
    e.preventDefault();
    if (!f.effective) return setMsg("Add the effective date.");
    if (f.rent && !(Number(f.rent) > 0)) return setMsg("Enter the new rent in dollars, or leave it blank.");
    const add = f.add
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, email] = l.split(/[,;]\s*/);
        return { full_name: name || "", email: email || "" };
      });
    if (!f.rent && !add.length && !f.remove.length) return setMsg("Enter at least one change.");
    setBusy(true);
    const sb = getBrowserClient();
    const { error } = await sb.from("tenancy_changes").insert({
      tenancy_id: t.id,
      signature_request_id: r.signature_request_id,
      effective_date: f.effective,
      new_rent: f.rent ? Number(f.rent) : null,
      add_tenants: add,
      remove_tenant_ids: f.remove,
    });
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }
    if (f.effective <= todayISO()) await sb.rpc("apply_tenancy_changes");
    const lmr = Number(t.last_month_deposit || 0);
    if (f.rent && lmr < Number(f.rent)) {
      const short = Math.round((Number(f.rent) - lmr) * 100) / 100;
      const names = (t.tenancy_tenants || []).map((p) => p.full_name.split(" ")[0]).join(" and ");
      await sb.from("staff_tasks").insert({
        kind: "lmr_topup",
        title: `Request LMR top-up of ${money(short)}: ${r.details?.address || ""}`,
        detail: `Rent goes to ${money(Number(f.rent))} on ${longDay(f.effective)}; last month's rent held is ${money(lmr)}.`,
        tenancy_id: t.id,
        unit_id: r.unit_id,
        property_id: r.property_id,
        signature_request_id: r.signature_request_id,
        link: "/admin/tasks",
        source: "system",
        data: {
          template: "lmr_topup",
          to: (t.tenancy_tenants || []).map((p) => p.email).filter(Boolean),
          subject: "Last month's rent top-up",
          body: `Hi ${names || "there"},\n\nAs your rent changes to ${money(Number(f.rent))} on ${longDay(f.effective)}, the last month's rent deposit we hold also needs to match the new rent. We currently hold ${money(lmr)}, so the top-up is ${money(short)}.\n\nPlease send the ${money(short)} by e-Transfer to payment@ireppm.ca with "LMR top-up" in the message.\n\nThank you,\nIRep Property Management`,
        },
      });
    }
    await sb
      .from("staff_tasks")
      .update({ status: "done", done_at: new Date().toISOString() })
      .eq("signature_request_id", r.signature_request_id)
      .eq("kind", "amendment");
    await sb.from("lease_onboarding").update({ status: "done", done_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(false);
    onSaved();
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="row2">
        <div className="field">
          <label htmlFor={`am-eff-${r.id}`}>Effective date</label>
          <input id={`am-eff-${r.id}`} type="date" value={f.effective} onChange={(e) => setF((s) => ({ ...s, effective: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor={`am-rent-${r.id}`}>New monthly rent (blank if unchanged; now {money(t.rent)})</label>
          <input id={`am-rent-${r.id}`} inputMode="decimal" value={f.rent} onChange={(e) => setF((s) => ({ ...s, rent: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`am-add-${r.id}`}>Tenants added (one per line: full legal name, email)</label>
        <textarea id={`am-add-${r.id}`} rows={2} value={f.add} onChange={(e) => setF((s) => ({ ...s, add: e.target.value }))} />
      </div>
      {(t.tenancy_tenants || []).length > 1 ? (
        <fieldset className="stack" style={{ gap: 4, border: 0, padding: 0 }}>
          <legend className="small">Tenants taken off the lease</legend>
          {t.tenancy_tenants.map((p) => (
            <label key={p.id} className="check-line">
              <input
                type="checkbox"
                checked={f.remove.includes(p.id)}
                onChange={(e) => setF((s) => ({ ...s, remove: e.target.checked ? [...s.remove, p.id] : s.remove.filter((x) => x !== p.id) }))}
              />
              {p.full_name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div>
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Changes apply on the effective date (today&apos;s apply right away). If the last month&apos;s rent held is below the new rent, a top-up
        request is added to Tasks with an email draft.
      </p>
      {msg ? <div className="warnbox">{msg}</div> : null}
    </form>
  );
}
