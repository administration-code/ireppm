"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

// Promotional email on or off for the signed-in person's address (email_optouts, migration 0045).
// Emails about their tenancy, application, repairs and payments always go out.
export default function EmailPrefs() {
  const { user } = useAuth();
  const email = String(user?.email || "").toLowerCase();
  const [state, setState] = useState({ loading: true, out: false, busy: false, error: "" });

  useEffect(() => {
    if (!email) return;
    let alive = true;
    getBrowserClient()
      .from("email_optouts")
      .select("email")
      .eq("email", email)
      .maybeSingle()
      .then(({ data, error }) => alive && setState({ loading: false, out: Boolean(data), busy: false, error: error ? "We couldn't load your email preference." : "" }));
    return () => {
      alive = false;
    };
  }, [email]);

  async function toggle(wantPromos) {
    setState((s) => ({ ...s, busy: true, error: "" }));
    const t = getBrowserClient().from("email_optouts");
    const { error } = wantPromos ? await t.delete().eq("email", email) : await t.insert({ email, source: "profile" });
    setState((s) => ({ ...s, busy: false, out: error ? s.out : !wantPromos, error: error ? "That didn't save. Try again." : "" }));
  }

  if (!email || state.loading) return null;
  return (
    <div className="boxed stack" style={{ gap: 8 }}>
      <h3 className="sub-title" style={{ margin: 0 }}>Email Preferences</h3>
      <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" checked={!state.out} disabled={state.busy} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Send me news and offers from IRep Property Management
          <span className="small sub-line">
            Emails about your tenancy, application, repairs and payments always go out, whatever you choose here.
          </span>
        </span>
      </label>
      {state.error ? (
        <div className="warnbox" role="alert">
          {state.error}
        </div>
      ) : null}
    </div>
  );
}
