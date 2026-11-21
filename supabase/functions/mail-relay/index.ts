// IRep mailbox relay. Google Apps Script requests get challenged by Vercel's bot protection,
// so the mailbox scripts post here and this forwards to ireppm.ca unchanged.
// It only forwards to the two feed endpoints, and passes the script's secret header through;
// ireppm.ca checks the secret, so this relay holds no secrets of its own. Deployed with verify_jwt off.
const TARGETS: Record<string, string> = {
  "admin-mail": "https://ireppm.ca/api/admin-mail/intake",
  "interac": "https://ireppm.ca/api/payments/interac",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const which = new URL(req.url).searchParams.get("to") || "admin-mail";
  const target = TARGETS[which];
  if (!target) return new Response("Unknown target", { status: 400 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response("Too large", { status: 413 });
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "IRep-Mail-Relay/1.0" };
  for (const h of ["x-mail-secret", "x-payments-secret"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const res = await fetch(target, { method: "POST", headers, body });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json", "x-upstream-mitigated": res.headers.get("x-vercel-mitigated") || "" },
  });
});
