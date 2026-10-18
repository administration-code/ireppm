"use client";

import { useAuth } from "@/components/AuthProvider";

export default function OwnerGate({ children, next = "/owner" }) {
  const { user, ready, openSignIn } = useAuth();
  if (!ready) return <p className="small">Loading…</p>;
  if (!user) {
    return (
      <div className="empty">
        <h1>Owner Portal</h1>
        <p>Sign in with the email address we have on file for you to see your properties and monthly statements.</p>
        <button type="button" className="btn primary" onClick={() => openSignIn(next)}>
          Sign in
        </button>
      </div>
    );
  }
  return children;
}
