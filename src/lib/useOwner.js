"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";

// Shared across the header and the owner pages so it's only checked once per user.
const ownerRequests = new Map();

function fetchIsOwner(userId) {
  if (!ownerRequests.has(userId)) {
    const sb = getBrowserClient();
    const request = sb
      ? sb
          .from("my_owned_properties")
          .select("id", { count: "exact", head: true })
          .then(({ count, error }) => !error && (count || 0) > 0, () => false)
      : Promise.resolve(false);
    ownerRequests.set(userId, request);
  }
  return ownerRequests.get(userId);
}

export function useOwner() {
  const { user, ready } = useAuth();
  const userId = user?.id || null;
  const [checked, setChecked] = useState({ userId: null, isOwner: false });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchIsOwner(userId).then((isOwner) => {
      if (alive) setChecked({ userId, isOwner });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const checking = !ready || (Boolean(userId) && checked.userId !== userId);
  const isOwner = Boolean(userId) && checked.userId === userId && checked.isOwner;
  return { user, checking, isOwner };
}
