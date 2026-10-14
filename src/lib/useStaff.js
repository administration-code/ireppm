"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";

// Shared across the header and the admin pages so the role is only fetched once per user.
const roleRequests = new Map();

function fetchRole(userId) {
  if (!roleRequests.has(userId)) {
    const sb = getBrowserClient();
    const request = sb
      ? sb
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data }) => data?.role || null, () => null)
      : Promise.resolve(null);
    roleRequests.set(userId, request);
  }
  return roleRequests.get(userId);
}

export function useStaff() {
  const { user, ready } = useAuth();
  const userId = user?.id || null;
  const [checked, setChecked] = useState({ userId: null, isStaff: false });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchRole(userId).then((role) => {
      if (alive) setChecked({ userId, isStaff: role === "staff" || role === "admin" });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const checking = !ready || (Boolean(userId) && checked.userId !== userId);
  const isStaff = Boolean(userId) && checked.userId === userId && checked.isStaff;
  return { user, checking, isStaff };
}
