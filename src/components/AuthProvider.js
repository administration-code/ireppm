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

  // After sign-in: save the phone number typed in the email form if we don't have one yet,
  // then ask for a mobile number if there still isn't one (Google sign-in doesn't share it).
  const [askPhone, setAskPhone] = useState(false);
  const userId = session?.user?.id || null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const sb = getBrowserClient();
      let pending = null;
      try {
        pending = localStorage.getItem(PENDING_PHONE);
      } catch {}
      if (pending) {
        await sb.from("profiles").update({ phone: pending }).eq("id", userId).is("phone", null);
        try {
          localStorage.removeItem(PENDING_PHONE);
        } catch {}
      }
      // Phone typed at sign-in (kept on the server, so it works even if the email link was opened
      // in another browser) and the name from Google, when the profile doesn't have them yet.
      await sb.rpc("claim_signin_details");
      const { data } = await sb.from("profiles").select("phone").eq("id", userId).maybeSingle();
      if (!cancelled && data && !data.phone) setAskPhone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const openSignIn = useCallback((next, email) => {
    setModal({ next: next || window.location.pathname, email: email || "" });
  }, []);

  // Invitation links (?invite=email) open the sign-in with that email filled in.
  useEffect(() => {
    if (!ready || session) return;
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite && /^\S+@\S+\.\S+$/.test(invite)) setModal({ next: window.location.pathname, email: invite });
  }, [ready, session]);

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
      {modal ? <SignInModal next={modal.next} initialEmail={modal.email} onClose={() => setModal(null)} /> : null}
      {askPhone && !modal ? <PhoneModal userId={userId} onDone={() => setAskPhone(false)} /> : null}
    </AuthContext.Provider>
  );
}

const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

function GoogleButton({ next, onError, phone }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    // Google doesn't share a phone number: keep the one typed above for after the redirect.
    if (String(phone || "").replace(/\D/g, "").length >= 10) {
      try {
        localStorage.setItem(PENDING_PHONE, phone.trim());
      } catch {}
    }
    const sb = getBrowserClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + next },
    });
    if (error) {
      setBusy(false);
      onError("Google sign-in isn't available right now. Use your email instead.");
    }
  }
  return (
    <button type="button" className="btn ghost google-btn" onClick={go} disabled={busy}>
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

function PhoneModal({ userId, onDone }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number, including area code.");
    setBusy(true);
    const { error: err } = await getBrowserClient().from("profiles").update({ phone: phone.trim() }).eq("id", userId);
    setBusy(false);
    if (err) return setError("We couldn't save that. Try again.");
    onDone();
  }

  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="phone-title">
        <button className="x" onClick={onDone}>
          Later
        </button>
        <form className="stack" onSubmit={save}>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="eyebrow">One more thing</span>
            <h3 id="phone-title">What's your mobile number?</h3>
            <p className="small">We text you to confirm showing times. We don't share it.</p>
          </div>
          <div className="field">
            <label htmlFor="ask-phone">Mobile number</label>
            <input id="ask-phone" type="tel" autoComplete="tel" placeholder="519-555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
          </div>
          {error ? <p className="err">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SignInModal({ next, initialEmail = "", onClose }) {
  const [email, setEmail] = useState(initialEmail);
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
    await sb.rpc("remember_signin_phone", { p_email: em, p_phone: phone.trim() });
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
              <h3 id="signin-title">{GOOGLE_ON ? "Sign in to continue" : "Just your email and phone"}</h3>
              <p className="small">
                No password to remember. We use your phone number to confirm showings.
              </p>
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
                autoFocus
                required
              />
            </div>
            {GOOGLE_ON ? (
              <>
                <GoogleButton next={next} onError={setError} phone={phone} />
                <div className="or-rule">
                  <span>or get a sign-in link by email</span>
                </div>
              </>
            ) : null}
            <div className="field">
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
