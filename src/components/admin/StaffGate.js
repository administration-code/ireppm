"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useStaff } from "@/lib/useStaff";

export default function StaffGate({ children }) {
  const { configured, openSignIn } = useAuth();
  const { user, checking, isStaff } = useStaff();

  if (!configured) {
    return (
      <div className="empty">
        <h2>Sign-in isn&apos;t switched on yet</h2>
        <p>The staff area needs Supabase accounts to be connected.</p>
      </div>
    );
  }
  if (checking) {
    return <p className="small">Checking your access…</p>;
  }
  if (!user) {
    return (
      <div className="empty">
        <h2>Sign in to continue</h2>
        <p>The staff area is for IRep staff. Sign in with your staff email address.</p>
        <button className="btn primary" onClick={() => openSignIn()}>
          Sign in
        </button>
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="empty">
        <h2>This area is for IRep staff only.</h2>
        <p>
          You&apos;re signed in as <b>{user.email}</b>. If you work at IRep, ask an admin to give your account staff
          access.
        </p>
        <Link className="btn ghost" href="/">
          Back to home
        </Link>
      </div>
    );
  }
  return children;
}
