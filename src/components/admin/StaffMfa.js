"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Two-step sign-in for the staff area. Staff set up an authenticator app (Google Authenticator,
// Microsoft Authenticator, 1Password…) once; after that, each new sign-in asks for its 6-digit code.
// The database (is_staff, migration 0045) enforces the same rule, so this screen is the way in, not the lock.

// The level check reads the current session (no network), so it's quick on every page.
async function currentState() {
  const sb = getBrowserClient();
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel === "aal2") return { step: "ok" };
  const { data: factors, error: listError } = await sb.auth.mfa.listFactors();
  if (listError) throw listError;
  const verified = (factors?.totp || []).find((f) => f.status === "verified");
  return verified ? { step: "challenge", factorId: verified.id } : { step: "enroll" };
}

export default function StaffMfa({ userId, children }) {
  const [state, setState] = useState({ step: "checking" });

  useEffect(() => {
    let alive = true;
    currentState().then(
      (s) => alive && setState(s),
      () => alive && setState({ step: "error" })
    );
    return () => {
      alive = false;
    };
  }, [userId]);

  const passed = () => setState({ step: "ok" });

  if (state.step === "ok") return children;
  if (state.step === "checking") return <p className="small">Checking your access…</p>;
  if (state.step === "error")
    return (
      <div className="empty">
        <h2>We Couldn&apos;t Check Your Sign-In</h2>
        <p>Refresh the page to try again.</p>
      </div>
    );
  if (state.step === "challenge") return <Challenge factorId={state.factorId} onDone={passed} />;
  return <Enroll onDone={passed} />;
}

function CodeForm({ busy, error, onSubmit, label = "Verify" }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="stack"
      style={{ gap: 12, maxWidth: 320 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code.replace(/\s/g, ""));
      }}
    >
      <div className="field">
        <label htmlFor="mfa-code">6-digit code from your authenticator app</label>
        <input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      </div>
      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <button type="submit" className="btn primary" disabled={busy || code.replace(/\s/g, "").length !== 6}>
        {busy ? "Checking…" : label}
      </button>
    </form>
  );
}

async function verify(factorId, code) {
  const { error } = await getBrowserClient().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? "That code didn't match. Wait for a new code and try again." : error.message);
}

function Challenge({ factorId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="boxed stack" style={{ gap: 16, maxWidth: 520 }}>
      <div>
        <h2 className="sub-title">Enter Your Staff Code</h2>
        <p className="small" style={{ margin: "4px 0 0" }}>
          Open your authenticator app and enter the 6-digit code for IRep Property Management.
        </p>
      </div>
      <CodeForm
        busy={busy}
        error={error}
        onSubmit={async (code) => {
          setBusy(true);
          setError("");
          try {
            await verify(factorId, code);
            onDone();
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      />
      <p className="small" style={{ margin: 0 }}>
        Lost your phone? Ask the admin to reset your two-step sign-in, then set it up again on your new phone.
      </p>
    </div>
  );
}

function Enroll({ onDone }) {
  const [factor, setFactor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    const sb = getBrowserClient();
    try {
      // Clear any half-finished setup first, so the new one isn't refused as a duplicate.
      const { data: list } = await sb.auth.mfa.listFactors();
      for (const f of list?.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: err } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `IRep staff ${new Date().toISOString().slice(0, 10)}` });
      if (err) throw err;
      setFactor(data);
    } catch (err) {
      setError(err.message || "We couldn't start the setup. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="boxed stack" style={{ gap: 16, maxWidth: 560 }}>
      <div>
        <h2 className="sub-title">Set Up Two-Step Sign-In</h2>
        <p className="small" style={{ margin: "4px 0 0" }}>
          The staff area holds tenants&apos; and landlords&apos; personal and banking information, so staff accounts need a
          second step: a code from an authenticator app on your phone. It takes about a minute, once.
        </p>
      </div>
      {!factor ? (
        <>
          <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Install an authenticator app if you don&apos;t have one: Google Authenticator, Microsoft Authenticator or 1Password.</li>
            <li>Click Start Setup and scan the code with the app.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          {error ? (
            <div className="warnbox" role="alert">
              {error}
            </div>
          ) : null}
          <button type="button" className="btn primary" style={{ justifySelf: "start" }} onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start Setup"}
          </button>
        </>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            In your authenticator app, add an account and scan this code:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={factor.totp.qr_code}
            alt="QR code for your authenticator app"
            width={200}
            height={200}
            style={{ background: "#fff", padding: 8, border: "1px solid var(--line)" }}
          />
          <p className="small" style={{ margin: 0 }}>
            Can&apos;t scan it?{" "}
            {showSecret ? (
              <>
                Enter this key instead: <code style={{ wordBreak: "break-all" }}>{factor.totp.secret}</code>
              </>
            ) : (
              <button type="button" className="link-btn small" onClick={() => setShowSecret(true)}>
                Show the setup key
              </button>
            )}
          </p>
          <CodeForm
            busy={busy}
            error={error}
            label="Finish Setup"
            onSubmit={async (code) => {
              setBusy(true);
              setError("");
              try {
                await verify(factor.id, code);
                onDone();
              } catch (err) {
                setError(err.message);
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
