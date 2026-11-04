"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";
import { REPORT_STATUS, saveReport } from "@/lib/inspection-reports";
import { regularUnits } from "@/lib/maintenance-units";
import InspectionReportForm from "@/components/InspectionReportForm";

// Staff: every inspection report, newest first.
export function InspectionReportsList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getBrowserClient()
      .from("inspection_reports")
      .select("id, inspected_on, status, inspected_by, property:properties(address), items:improvement_items(decision, price)")
      .order("inspected_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => {
        setRows(data || []);
        if (e) setError("We couldn't load the reports. Refresh the page to try again.");
      });
  }, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <span className="eyebrow">Staff · Landlords</span>
          <h1 className="admin-title">Inspection Reports</h1>
          <p className="small">
            Property checks, appliances and recommended improvements. Vendors submit them from the Agent Portal; review each one and send the
            improvements to the landlord to approve or decline.
          </p>
        </div>
        <Link className="btn primary sm" href="/admin/inspection-reports/new">
          New report
        </Link>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <div className="empty">
          <p>No inspection reports yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Date</th>
                <th scope="col">By</th>
                <th scope="col">Status</th>
                <th scope="col">Improvements</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const items = r.items || [];
                const count = (d) => items.filter((i) => i.decision === d).length;
                const toPrice = items.filter((i) => i.decision === "approved" && i.price == null).length;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/inspection-reports/${r.id}`}>{r.property?.address || "Property"}</Link>
                    </td>
                    <td>{shortDate(r.inspected_on)}</td>
                    <td>{r.inspected_by || "Staff"}</td>
                    <td>
                      <span className={`pill ${r.status === "submitted" ? "rs-requested" : "rs-confirmed"}`}>{REPORT_STATUS[r.status]}</span>
                    </td>
                    <td className="small">
                      {items.length
                        ? [
                            `${items.length} total`,
                            count("pending") ? `${count("pending")} waiting` : null,
                            count("approved") ? `${count("approved")} approved` : null,
                            count("declined") ? `${count("declined")} declined` : null,
                            toPrice ? `${toPrice} to price` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "None"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Staff: fill in a report themselves.
export function NewInspectionReport() {
  const router = useRouter();
  const [props, setProps] = useState(null);

  useEffect(() => {
    getBrowserClient()
      .from("properties")
      .select("id, address, city, units(id, label)")
      .eq("archived", false)
      .order("address")
      .then(({ data }) =>
        setProps((data || []).map((p) => ({ ...p, units: regularUnits(p.units || []).map((u) => ({ id: u.id, label: u.label })) })))
      );
  }, []);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/admin/inspection-reports">
          ← All inspection reports
        </Link>
        <span className="eyebrow">Staff · Landlords</span>
        <h1 className="admin-title">New Inspection Report</h1>
      </div>
      {!props ? (
        <p className="small">Loading properties…</p>
      ) : (
        <InspectionReportForm
          properties={props}
          submitLabel="Save report"
          onSubmit={async (form) => {
            const sb = getBrowserClient();
            const { data: auth } = await sb.auth.getUser();
            const { data: prof } = auth?.user
              ? await sb.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle()
              : { data: null };
            const id = await saveReport(sb, form, {
              inspectedBy: prof?.full_name || "IRep staff",
              createdBy: auth?.user?.id || null,
            });
            router.push(`/admin/inspection-reports/${id}`);
          }}
        />
      )}
    </div>
  );
}
