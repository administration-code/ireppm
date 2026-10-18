"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { LETTER_SELECT } from "@/lib/letters";
import OwnerLetter, { PrintButton } from "@/components/OwnerLetter";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OwnerLetterView({ id }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, letter: null, error: "" });

  useEffect(() => {
    let alive = true;
    if (!UUID.test(id)) {
      setState({ loading: false, letter: null, error: "" });
      return undefined;
    }
    // Row-level security only returns sent letters that belong to this landlord.
    getBrowserClient()
      .from("owner_letters")
      .select(LETTER_SELECT)
      .eq("id", id)
      .eq("status", "sent")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, letter: data || null, error: error ? "We couldn't load this statement. Refresh the page to try again." : "" });
      });
    return () => {
      alive = false;
    };
  }, [id, user?.id]);

  const { loading, letter, error } = state;
  if (loading) return <p className="small">Loading your statement…</p>;
  if (!letter) {
    return (
      <div className="empty">
        <h1>{error ? "Something went wrong" : "Statement not found"}</h1>
        <p>{error || "We couldn't find this statement on your account. Make sure you're signed in with the email address we have on file for you."}</p>
        <Link className="btn ghost" href="/owner">
          Back to the Owner Portal
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="receipt-tools no-print req-actions">
        <Link className="back" href="/owner">
          ← Owner portal
        </Link>
        <PrintButton />
      </div>
      <OwnerLetter letter={letter} />
    </div>
  );
}
