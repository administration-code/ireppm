"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import { prettyDate } from "@/lib/admin-properties";
import { IRepMark } from "@/components/Brand";
import { INSPECTION_KIND, INSPECTION_SELECT, OVERALL_CONDITION, ROOM_CONDITION, allPhotoPaths, signPhotos } from "@/lib/inspections";
import { tenantNames, unitAddress } from "@/lib/turnovers";

export default function InspectionReport({ id }) {
  const [state, setState] = useState({ loading: true, inspection: null, urls: {}, error: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await getBrowserClient().from("inspections").select(INSPECTION_SELECT).eq("id", id).maybeSingle();
      const urls = data ? await signPhotos(allPhotoPaths(data.rooms)) : {};
      if (alive) setState({ loading: false, inspection: data, urls, error: error ? "We couldn't load this inspection." : "" });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const { loading, inspection: i, urls, error } = state;
  if (loading) return <p className="small">Loading inspection…</p>;
  if (!i) {
    return (
      <div className="empty">
        <h2>{error ? "Something went wrong" : "Inspection not found"}</h2>
        <p>{error || "It may have been removed."}</p>
        <Link className="btn ghost" href="/admin/properties">
          Back to properties
        </Link>
      </div>
    );
  }

  const yesNo = i.tenant_present === null ? "Not recorded" : i.tenant_present ? "Yes" : "No";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print">
        <Link className="back" href={`/admin/inspections/${i.id}`}>
          ← Back to the inspection
        </Link>
        <div className="req-actions">
          <button type="button" className="btn primary sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <span className="small">Photo links expire after 5 minutes. Refresh this page before printing if photos don&apos;t show.</span>
        </div>
      </div>

      <article className="receipt insp-report" aria-label="Inspection report">
        <header className="receipt-head">
          <div className="receipt-brand">
            <IRepMark />
            <span className="wm">
              <b>IREP</b>
              <i>PROPERTY MANAGEMENT</i>
            </span>
          </div>
          <address className="receipt-office">
            {SITE.name}
            <br />
            {SITE.address}
            <br />
            {SITE.phone}
            <br />
            {SITE.email}
          </address>
        </header>

        <h1 className="receipt-title">{INSPECTION_KIND[i.kind] || i.kind} inspection</h1>
        <dl className="kv receipt-facts">
          <dt>Rental unit</dt>
          <dd>{unitAddress(i.unit) || "—"}</dd>
          <dt>Tenants</dt>
          <dd>{tenantNames(i.tenancy) || "—"}</dd>
          <dt>Date</dt>
          <dd>{prettyDate(i.inspected_on)}</dd>
          <dt>Inspected by</dt>
          <dd>{i.inspected_by || "—"}</dd>
          <dt>Tenant present</dt>
          <dd>{yesNo}</dd>
          <dt>Overall condition</dt>
          <dd>{OVERALL_CONDITION[i.overall_condition] || "Not set"}</dd>
          <dt>Keys returned</dt>
          <dd className="num">{i.keys_returned ?? "—"}</dd>
        </dl>
        {i.notes ? <p className="pre-line insp-notes">{i.notes}</p> : null}

        {(i.rooms || []).length ? (
          (i.rooms || []).map((room, n) => (
            <section key={`${room.room}-${n}`} className="insp-room">
              <div className="insp-room-head">
                <h2 className="letter-h2">{room.room}</h2>
                <span>{ROOM_CONDITION[room.condition] || "Condition not recorded"}</span>
              </div>
              {room.notes ? <p className="pre-line">{room.notes}</p> : null}
              {room.photos?.length ? (
                <ul className="insp-print-photos">
                  {room.photos.map((p) =>
                    urls[p.path] ? (
                      <li key={p.path}>
                        <img src={urls[p.path]} alt={`${room.room}: ${p.name}`} />
                      </li>
                    ) : null
                  )}
                </ul>
              ) : null}
            </section>
          ))
        ) : (
          <p className="small">No rooms were recorded.</p>
        )}
      </article>
    </div>
  );
}
