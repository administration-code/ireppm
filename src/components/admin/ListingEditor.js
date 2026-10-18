"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { LISTING_FIELDS } from "@/lib/admin-listings";
import ListingForm from "./ListingForm";

export default function ListingEditor({ id, saved }) {
  const [state, setState] = useState({ loading: true, listing: null });

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("listings")
      .select(LISTING_FIELDS)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setState({ loading: false, listing: data || null });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.loading) return <p className="small">Loading listing…</p>;
  if (!state.listing) {
    return (
      <div className="empty">
        <h2>Listing Not Found</h2>
        <p>It may have been deleted, or the link is wrong.</p>
        <Link className="btn ghost" href="/admin/listings">
          Back to All Listings
        </Link>
      </div>
    );
  }
  return <ListingForm key={state.listing.id} listing={state.listing} saved={saved} />;
}
