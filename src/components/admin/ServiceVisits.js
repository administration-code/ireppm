"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { PHOTO_BUCKET } from "@/lib/maintenance";
import { shortDate } from "@/lib/rent";
import { money } from "@/lib/format";

const KIND = { lawn: "Lawn", snow: "Snow" };

// Staff: Chuck's lawn and snow visits with photo proof, last 90 days, newest first.
export default function ServiceVisits() {
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      const sb = getBrowserClient();
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const q = (cols) => sb.from("service_visits").select(cols).gte("visited_on", since).order("visited_on", { ascending: false }).limit(300);
      const base = "id, kind, visited_on, photos, note, property_id, property:properties(address, management_package), partner:partners(name)";
      let { data, error: e } = await q(`${base}, charge_amount, request_id`);
      if (e) ({ data, error: e } = await q(base));
      if (e) {
        setError("Couldn't load visits. If migration 0092 hasn't been run yet, run it first.");
        return setRows([]);
      }
      const [{ data: addons }, { data: rate }] = await Promise.all([
        sb.from("property_addons").select("property_id, addon_key, monthly_price").in("addon_key", ["snow_lawn", "snow_lawn_visit"]),
        sb.from("service_rates").select("amount").eq("key", "snow_lawn_visit").maybeSingle(),
      ]);
      const onPlan = new Set((addons || []).filter((a) => a.addon_key === "snow_lawn").map((a) => a.property_id));
      const ownFee = new Map((addons || []).filter((a) => a.addon_key === "snow_lawn_visit" && a.monthly_price != null).map((a) => [a.property_id, Number(a.monthly_price)]));
      const visitFee = Number(rate?.amount ?? 75);
      const paths = (data || []).flatMap((v) => (v.photos || []).map((p) => p.path));
      const urls = {};
      if (paths.length) {
        const { data: signed } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
        for (const s of signed || []) if (s.signedUrl) urls[s.path] = s.signedUrl;
      }
      setRows(
        (data || []).map((v) => ({
          ...v,
          included: onPlan.has(v.property_id) || ["maintenance", "protection"].includes(v.property?.management_package),
          fee: v.charge_amount != null ? Number(v.charge_amount) : ownFee.get(v.property_id) ?? visitFee,
          requested: Boolean(v.request_id),
          urls: (v.photos || []).map((p) => urls[p.path]).filter(Boolean),
        }))
      );
    })();
  }, []);

  const shown = (rows || []).filter((r) => !kind || r.kind === kind);
  const byProperty = {};
  for (const r of shown) byProperty[r.property?.address || "Unknown"] = (byProperty[r.property?.address || "Unknown"] || 0) + 1;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Maintenance</span>
        <h1 className="admin-title">Lawn and Snow Visits</h1>
        <p className="small" style={{ margin: 0 }}>
          What Chuck logged from his phone in the last 90 days, with photos as proof of service. Visits at properties without the lawn and snow plan are billed per visit.
        </p>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      <div className="req-actions">
        {[["", "All"], ["lawn", "Lawn"], ["snow", "Snow"]].map(([k, l]) => (
          <button key={k} type="button" className={`btn ${kind === k ? "primary" : "ghost"} sm`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !shown.length ? (
        <p className="small">No visits logged.</p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            {Object.entries(byProperty)
              .map(([a, n]) => `${a}: ${n}`)
              .join(" · ")}
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Property</th>
                  <th scope="col">Visit</th>
                  <th scope="col">Billing</th>
                  <th scope="col">By</th>
                  <th scope="col">Photos</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>{shortDate(r.visited_on)}</td>
                    <td>
                      {r.property?.address}
                      {r.note ? <span className="small sub-line">{r.note}</span> : null}
                    </td>
                    <td>{KIND[r.kind]}</td>
                    <td className="small">{r.included ? "Included in plan" : <b>Bill landlord {money(r.fee)} + HST{r.requested ? " (landlord asked)" : ""}</b>}</td>
                    <td className="small">{r.partner?.name || ""}</td>
                    <td>
                      {r.urls.length ? (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.urls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">
                              <img src={u} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
                            </a>
                          ))}
                        </span>
                      ) : (
                        <span className="small">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
