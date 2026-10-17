"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";
import { letterProperties, letterTotals } from "@/lib/letters";
import { SITE } from "@/lib/site";

async function loadPortal() {
  const sb = getBrowserClient();
  const [props, letters] = await Promise.all([
    sb.from("my_owned_properties").select("id, address, city, postal_code, agreement_renewal, units, occupied").order("address"),
    sb
      .from("owner_letters")
      .select("id, period, sent_at, data")
      .eq("status", "sent")
      .order("period", { ascending: false }),
  ]);
  if (props.error || letters.error) throw props.error || letters.error;
  return { properties: props.data || [], letters: letters.data || [] };
}

export default function OwnerHome() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, properties: [], letters: [], error: "" });

  useEffect(() => {
    let alive = true;
    loadPortal().then(
      (d) => alive && setState({ loading: false, ...d, error: "" }),
      () => alive && setState({ loading: false, properties: [], letters: [], error: "We couldn't load your portal. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const { loading, properties, letters, error } = state;
  if (loading) return <p className="small">Loading your properties…</p>;
  if (error) return <div className="warnbox">{error}</div>;

  if (!properties.length) {
    return (
      <div className="empty">
        <h1>Owner portal</h1>
        <p>
          This page is for landlords we manage properties for. Sign in with the email address we have on file for you, or contact us at{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Owner portal</span>
        <h1 className="admin-title">Your properties</h1>
        <p className="small">Signed in as {user?.email}.</p>
      </div>

      <section className="boxed stack" aria-labelledby="sec-own-props">
        <h2 id="sec-own-props" className="sec-title">
          Properties we manage for you
        </h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col" className="r">
                  Units occupied
                </th>
                <th scope="col">Agreement renewal</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td className="addr">
                    {p.address}
                    <span className="sub-line small">{[p.city, p.postal_code].filter(Boolean).join(" ")}</span>
                  </td>
                  <td className="r num">
                    {p.occupied ?? 0} of {p.units ?? 0}
                  </td>
                  <td>{p.agreement_renewal ? shortDate(p.agreement_renewal) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="sec-own-letters">
        <h2 id="sec-own-letters" className="sec-title">
          Monthly statements
        </h2>
        {!letters.length ? (
          <p className="small">Your first monthly statement will appear here once we send it.</p>
        ) : (
          <ul className="letter-list">
            {letters.map((l) => {
              const t = letterTotals(l);
              return (
                <li key={l.id}>
                  <Link href={`/owner/letters/${l.id}`}>{monthLabel(l.period)} statement</Link>
                  <span className="small">
                    {letterProperties(l).length} {letterProperties(l).length === 1 ? "property" : "properties"} · Net to you {money(t.net)}
                    {l.sent_at
                      ? ` · Sent ${shortDate(new Date(l.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }))}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="sec-own-year">
        <h2 id="sec-own-year" className="sec-title">
          Year-end summary
        </h2>
        <p className="small">Your rental income and expenses for the year, ready for your accountant and your T776.</p>
        <div>
          <Link href="/owner/year-end" className="btn ghost">
            Year-end summary
          </Link>
        </div>
      </section>
    </div>
  );
}
