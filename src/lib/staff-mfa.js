// Two-step sign-in for staff (Supabase MFA, migration 0045). Once a staff member has set up an
// authenticator app, staff tools only work with a session where they entered its code (aal2).
// `user` comes from auth.getUser(token), which lists the account's factors; the token's own
// claims say which level this session reached.
export function sessionLevel(token) {
  try {
    const part = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8")).aal || "aal1";
  } catch {
    return "aal1";
  }
}

export function mfaSatisfied(user, token) {
  const enrolled = (user?.factors || []).some((f) => f.status === "verified");
  return !enrolled || sessionLevel(token) === "aal2";
}
