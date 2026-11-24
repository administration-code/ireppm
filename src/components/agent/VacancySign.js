"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";

// A printable "For Rent" sign for a vacancy: the QR code opens the listing, where renters see photos and apply.
// The QR image is drawn by a free QR service from the public listing link (nothing private is sent).
export default function VacancySign() {
  const id = useSearchParams().get("id");
  const [v, setV] = useState(undefined);
  useEffect(() => {
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/agent/vacancies", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      setV((out?.vacancies || []).find((x) => x.id === id) || null);
    })();
  }, [id]);

  if (v === undefined) return <p className="small" style={{ padding: 24 }}>Loading…</p>;
  if (!v)
    return (
      <p style={{ padding: 24 }}>
        That vacancy wasn&apos;t found. <Link href="/agent/vacancies">Back to Vacancies</Link>
      </p>
    );

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&data=${encodeURIComponent(v.link)}`;
  const kind = v.property_type === "Room" ? "Room for Rent" : `${v.beds} Bed, ${v.baths} Bath ${v.property_type}`;
  return (
    <div style={{ padding: 16 }}>
      <style>{`
        @media print { .no-print, header, footer, nav { display: none !important; } body { background: #fff !important; } .sign { border: none !important; } }
        @page { size: letter portrait; margin: 0.5in; }
      `}</style>
      <div className="no-print req-actions" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" style={{ minHeight: 48 }} onClick={() => window.print()}>
          Print
        </button>
        <Link className="btn ghost" style={{ minHeight: 48 }} href="/agent/vacancies">
          Back
        </Link>
        <span className="small">On your phone: tap Print, pick your Wi-Fi printer. Tape it inside a front window, not on the door.</span>
      </div>
      <div
        className="sign"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          border: "2px solid var(--line)",
          borderRadius: 12,
          padding: "32px 24px",
          textAlign: "center",
          background: "#fff",
          color: "#161616",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "4rem", fontWeight: 600, color: "#B41710", lineHeight: 1 }}>For Rent</div>
        <div style={{ fontSize: "1.6rem", fontWeight: 600 }}>{kind}</div>
        <div style={{ fontSize: "2.4rem", fontWeight: 600 }}>${Number(v.rent).toLocaleString("en-CA")}/month</div>
        {v.utilities ? <div style={{ fontSize: "1.1rem" }}>{v.utilities}</div> : null}
        <img src={qr} alt={`QR code for ${v.link}`} width={300} height={300} style={{ margin: "8px auto", width: 300, height: 300 }} />
        <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>Scan to see photos and apply</div>
        <div style={{ fontSize: "1rem", wordBreak: "break-all" }}>{v.link.replace(/^https?:\/\//, "")}</div>
        <div style={{ fontSize: "1rem", marginTop: 8 }}>
          IRep Property Management · {SITE.email}
        </div>
      </div>
    </div>
  );
}
