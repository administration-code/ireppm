"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { defaultReportYear } from "@/lib/accounting";
import LandlordYearReport from "@/components/LandlordYearReport";

export default function OwnerYearEnd({ year }) {
  const [state, setState] = useState({ loading: true, ownerId: null });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("my_owner_id")
      .then(({ data }) => alive && setState({ loading: false, ownerId: data || null }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="stack">
      <p className="no-print">
        <Link href="/owner">← Back to your portal</Link>
      </p>
      {state.loading ? <p className="small">Loading…</p> : null}
      {!state.loading && !state.ownerId ? (
        <p className="mutedbox">We couldn&apos;t find a landlord account linked to your sign-in. Please contact IRep.</p>
      ) : null}
      {state.ownerId ? <LandlordYearReport ownerId={state.ownerId} year={year || defaultReportYear()} /> : null}
    </div>
  );
}
