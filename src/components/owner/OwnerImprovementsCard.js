"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";

// Owner portal home: inspection reports with improvements to approve.
export default function OwnerImprovementsCard() {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/owner/improvements", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setReports(json.reports || []);
    })();
  }, []);
  if (!reports.length) return null;
  const waiting = reports.filter((r) => r.pending > 0);
  return (
    <section className={`boxed stack${waiting.length ? " attention" : ""}`} aria-labelledby="sec-own-impr">
      <h2 id="sec-own-impr" className="sec-title">
        Inspections and Recommended Improvements
      </h2>
      <ul className="plain-list">
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/owner/improvements/${r.id}`}>
              {r.address}, inspected {shortDate(r.inspected_on)}
            </Link>
            <span className="small">
              {" · "}
              {r.pending ? `${r.pending} of ${r.total} waiting for your answer` : `${r.total} item${r.total === 1 ? "" : "s"} answered`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
