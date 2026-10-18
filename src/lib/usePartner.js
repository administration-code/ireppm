"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";

// Is the signed-in person a partner (showing agent or contractor) with a portal? Checked once per user.
const partnerRequests = new Map();

function fetchIsPartner(userId) {
  if (!partnerRequests.has(userId)) {
    const sb = getBrowserClient();
    partnerRequests.set(
      userId,
      sb ? sb.rpc("agent_portal").then(({ data, error }) => !error && Boolean(data), () => false) : Promise.resolve(false)
    );
  }
  return partnerRequests.get(userId);
}

export function usePartner() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [checked, setChecked] = useState({ userId: null, isPartner: false });
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    fetchIsPartner(userId).then((isPartner) => alive && setChecked({ userId, isPartner }));
    return () => {
      alive = false;
    };
  }, [userId]);
  return { isPartner: Boolean(userId) && checked.userId === userId && checked.isPartner };
}
