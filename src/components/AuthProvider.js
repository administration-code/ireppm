"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBrowserClient, supabaseConfigured } from "@/lib/supabase";
import { SITE } from "@/lib/site";

const AuthContext = createContext({
  user: null,
  ready: false,
  configured: false,
  openSignIn: () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PENDING_PHONE = "irep_pending_phone";

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Returning renters who signed in again: save the phone number they typed, if we don't have one.
  useEffect(() => {
    if (!session) return;
    let phone = null;
    try {
      phone = localStorage.getItem(PENDING_PHONE);
    } catch {}
    if (!phone) return;
    const sb = getBrowserClient();
    sb.from("profiles")
      .update({ phone })
      .eq("id", session.user.id)
      .is("phone", null)
      .then(() => {
        try {
          localStorage.removeItem(PENDING_PHONE);
        } catch {}
      });
  }, [session]);

  const openSignIn = useCallback((next) => {
    setModal({ next: next || window.location.pathname });
  }, []);

  const signOut = useCallback(async () => {
    const sb = getBrowserClient();
    if (sb) await sb.auth.signOut();
    window.location.href = "/";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user: session?.user || null, ready, configured: supabaseConfigured, openSignIn, signOut }}
    >
      {children}
      {modal ? <SignInModal next={modal.next} onClose={() => setModal(null)} /> : null}
    </AuthContext.Provider>
  );
}

function SignInModal({ next, onClose }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const em = email.trim();
    const digits = phone.replace(/\D/g, "");
    if (!/^\S+@\S+\.\S+$/.test(em)) return setError("Enter an email address like name@example.com.");
    if (digits.length < 10) return setError("Enter a 10-digit phone number, including area code.");
    const sb = getBrowserClient();
    setBusy(true);
    try {
      localStorage.setItem(PENDING_PHONE, phone.trim());
    } catch {}
    const { error: err } = await sb.auth.signInWithOtp({
      email: em,
      options: { emailRedirectTo: window.location.origin + next, data: { phone: phone.trim() } },
    });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429
          ? "Too many sign-in emails were sent. Wait a few minutes and try again."
          : "We couldn't send the sign-in email. Check the address and try again."
      );
      return;
    }
    setSentTo(em);
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="x" onClick={onClose}>
          Close
        </button>
        {!supabaseConfigured ? (
          <div className="stack">
            <span className="eyebrow">Accounts</span>
            <h3 id="signin-title">Online accounts are coming soon</h3>
            <p>
              To book a showing or apply right now, email us at <b>{SITE.email}</b> with the address you're
              interested in.
            </p>
          </div>
        ) : sentTo ? (
          <div className="stack">
            <span className="eyebrow">Check your email</span>
            <h3 id="signin-title">We sent you a sign-in link</h3>
            <p>
              Open the email we sent to <b>{sentTo}</b> and tap the link. It brings you straight back here,
              signed in. Open it on this device.
            </p>
            <p className="small">No email after a minute? Check your spam folder.</p>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div style={{ display: "grid", gap: 6 }}>
              <span className="eyebrow">Sign in or create an account</span>
              <h3 id="signin-title">Just your email and phone</h3>
              <p className="small">
                We'll email you a sign-in link, so there's no password to remember. We use your phone number to
                confirm showings.
              </p>
            </div>
            <div className="field">
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="signin-phone">Mobile number</label>
              <input
                id="signin-phone"
                type="tel"
                autoComplete="tel"
                placeholder="519-555-0123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {error ? <p className="err">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
