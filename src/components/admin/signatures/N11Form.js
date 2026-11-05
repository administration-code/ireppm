"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TenancyPicker from "@/components/admin/TenancyPicker";
import { loadTenancyOptions } from "@/lib/rent";
import { docusignApi } from "@/lib/signatures";

// Staff start an N11 (the LTB's official Agreement to End the Tenancy) for a tenancy. Every tenant
// signs, then the landlord. Optional written terms go on an extra page the same people sign.
export default function N11Form({ ctx }) {
  const router = useRouter();
  const [tenancies, setTenancies] = useState([]);
  const [f, setF] = useState(() => ({
    tenancy_id: ctx.tenancy?.id || "",
    termination_date: "",
    phone: (ctx.tenancy?.tenancy_tenants || []).find((t) => t.is_primary)?.phone || ctx.tenancy?.tenancy_tenants?.[0]?.phone || "",
    extra_terms: "",
  }));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadTenancyOptions({ includePast: false }).then(setTenancies, () => setTenancies([]));
  }, []);
  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setF((s) => {
      const next = { ...s, [k]: v };
      if (k === "tenancy_id") {
        const people = tenancies.find((t) => t.id === v)?.tenancy_tenants || [];
        next.phone = (people.find((t) => t.is_primary) || people[0])?.phone || "";
      }
      return next;
    });
    setError("");
  };
  const tenancy = tenancies.find((t) => t.id === f.tenancy_id);
  const tenants = tenancy?.tenancy_tenants || [];
  const noEmail = tenancy && !tenants.some((t) => t.email);

  async function go(send) {
    setError("");
    if (!f.tenancy_id) return setError("Choose the tenancy.");
    if (!f.termination_date) return setError("Choose the termination date.");
    if (send && !window.confirm("This emails the N11 to every tenant on the lease to sign, then to the landlord. Send it now?")) return;
    setBusy(send ? "send" : "draft");
    try {
      const res = await docusignApi("/n11", { body: { ...f, send } });
      router.push(`/admin/signatures/${res.id}`);
    } catch (err) {
      setError(err.message);
      setBusy("");
      if (err.id) router.push(`/admin/signatures/${err.id}`);
    }
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => e.preventDefault()}>
      <section className="boxed stack">
        <h2 className="sub-title">Tenancy</h2>
        <TenancyPicker id="n11-t" label="Tenancy" tenancies={tenancies} value={f.tenancy_id} onChange={set("tenancy_id")} />
        {tenancy ? (
          <p className="small" style={{ margin: 0 }}>
            Signs first: {tenants.map((t) => `${t.full_name}${t.email ? "" : " (no email, left off)"}`).join(", ") || "no tenants on file"}. Then the
            landlord on file signs.
          </p>
        ) : null}
        {noEmail ? <div className="warnbox">No tenant on this tenancy has an email. Add one on the tenancy first.</div> : null}
        <div className="row2">
          <div className="field">
            <label htmlFor="n11-date">Termination date</label>
            <input id="n11-date" type="date" value={f.termination_date} onChange={set("termination_date")} />
          </div>
          <div className="field">
            <label htmlFor="n11-phone">Tenant&apos;s phone (printed on the form)</label>
            <input id="n11-phone" value={f.phone} onChange={set("phone")} inputMode="tel" />
          </div>
        </div>
      </section>

      <section className="boxed stack">
        <h2 className="sub-title">Additional Terms (optional)</h2>
        <p className="small" style={{ margin: 0 }}>
          The N11 form itself has no space for conditions. Anything you write here goes on an extra page, on IRep letterhead, that everyone
          signs with the N11: refunds, keys, cleaning, and so on. Leave it blank for the plain N11. Blank lines separate paragraphs; start a
          line with “# ” for a heading.
        </p>
        <div className="field">
          <label htmlFor="n11-terms" className="visually-hidden">
            Additional terms
          </label>
          <textarea
            id="n11-terms"
            rows={10}
            value={f.extra_terms}
            onChange={set("extra_terms")}
            placeholder={"1. The tenant agrees to return all keys on or before the termination date.\n\n2. ..."}
          />
        </div>
      </section>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="button" className="btn primary" onClick={() => go(false)} disabled={Boolean(busy) || noEmail}>
          {busy === "draft" ? "Saving…" : "Save as draft to check in DocuSign"}
        </button>
        <button type="button" className="btn ghost" onClick={() => go(true)} disabled={Boolean(busy) || noEmail}>
          {busy === "send" ? "Sending…" : "Send now"}
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        When everyone has signed, the tenancy is put on notice for the termination date and a turnover is opened, the same as an N11 a tenant
        asks for from their portal.
      </p>
    </form>
  );
}
