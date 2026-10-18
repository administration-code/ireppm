"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { prettyDate } from "@/lib/admin-properties";
import { OPEN_TURNOVER_FILTER, TURNOVER_STATUS, startTurnover } from "@/lib/turnovers";

export default function UnitTurnover({ unitId }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, turnover: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("turnovers")
      .select("id, status, move_out_date, target_ready_date")
      .eq("unit_id", unitId)
      .not("status", "in", OPEN_TURNOVER_FILTER)
      .maybeSingle()
      .then(({ data }) => alive && setState({ loading: false, turnover: data }));
    return () => {
      alive = false;
    };
  }, [unitId]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const { id } = await startTurnover(unitId);
      router.push(`/admin/turnovers/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (state.loading) return null;
  const t = state.turnover;

  return (
    <section className="boxed sec-head" aria-label="Turnover">
      {t ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            <b>Turnover</b> <span className={`pill tv-${t.status}`}>{TURNOVER_STATUS[t.status]}</span>{" "}
            {[t.move_out_date ? `Move-out ${prettyDate(t.move_out_date)}` : "", t.target_ready_date ? `Target ready ${prettyDate(t.target_ready_date)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <Link className="btn ghost sm" href={`/admin/turnovers/${t.id}`}>
            Open Turnover
          </Link>
        </>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            No open turnover. Start one to track getting this unit ready for the next tenant.
          </p>
          <button type="button" className="btn ghost sm" onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start a turnover"}
          </button>
        </>
      )}
      {error ? (
        <span className="small err" role="alert">
          {error}
        </span>
      ) : null}
    </section>
  );
}
