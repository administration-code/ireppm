"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { OPEN_TURNOVER_FILTER, TURNOVER_STATUS } from "@/lib/turnovers";

export default function PropertyTurnovers({ unitIds }) {
  const [rows, setRows] = useState([]);
  const key = unitIds.join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    getBrowserClient()
      .from("turnovers")
      .select("id, status, unit:units(label)")
      .in("unit_id", key.split(","))
      .not("status", "in", OPEN_TURNOVER_FILTER)
      .then(({ data }) => alive && setRows(data || []));
    return () => {
      alive = false;
    };
  }, [key]);

  if (!rows.length) return null;

  return (
    <section className="boxed" aria-label="Open turnovers">
      <p className="small" style={{ margin: 0 }}>
        <b>Turnovers:</b>{" "}
        {rows.map((t, n) => (
          <span key={t.id}>
            {n ? " · " : ""}
            <Link href={`/admin/turnovers/${t.id}`}>{t.unit?.label || "Unit"}</Link>{" "}
            <span className={`pill tv-${t.status}`}>{TURNOVER_STATUS[t.status]}</span>
          </span>
        ))}
      </p>
    </section>
  );
}
