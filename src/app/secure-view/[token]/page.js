import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logView, resolveToken, VIEW_MINUTES, WATERMARK } from "@/lib/sensitive";
import SecureViewGuard from "@/components/SecureViewGuard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Secure Document View", robots: { index: false, follow: false } };

// Landlords' only way to see an applicant's photo ID or other sensitive document: a page that
// expires, shows the file with a watermark and no download button, and logs every view.
export default async function SecureView({ params }) {
  const { token } = await params;
  const sb = getSupabaseAdmin();
  const file = await resolveToken(sb, token);
  if (!file) {
    return (
      <main className="container" style={{ padding: "64px 0" }}>
        <h1 className="admin-title">This Link Has Expired</h1>
        <p>For privacy, secure document links last {VIEW_MINUTES} minutes. Go back to the application in your owner portal and open the document again.</p>
      </main>
    );
  }
  const h = await headers();
  await logView(sb, {
    applicationId: file.applicationId,
    tenancyId: file.tenancyId || null,
    sensitiveId: file.sensitiveId || null,
    docType: file.docType || null,
    viewerId: file.token.viewer_id,
    viewerRole: file.token.viewer_role,
    request: { headers: h },
  });
  const src = `/api/secure-view/${token}`;
  const isPdf = file.mime === "application/pdf";
  const expires = new Date(file.token.expires_at).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
  return (
    <main className="container secure-view" style={{ padding: "32px 0", display: "grid", gap: 16 }}>
      <SecureViewGuard />
      <div>
        <span className="eyebrow">{WATERMARK}</span>
        <h1 className="admin-title">{file.label}</h1>
        <p className="small">
          Shown for reviewing this rental application only. This page expires at {expires}, can&apos;t be downloaded, and each view is recorded.
          Please don&apos;t screenshot, save or share it.
        </p>
      </div>
      <div className="secure-frame">
        {isPdf ? (
          <iframe title={file.label} src={`${src}#toolbar=0&navpanes=0&scrollbar=1`} style={{ width: "100%", height: "80vh", border: 0 }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={file.label} draggable={false} style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
        )}
        <div className="secure-mark" aria-hidden="true">
          {Array.from({ length: 40 }, (_, i) => (
            <span key={i}>{WATERMARK}</span>
          ))}
        </div>
      </div>
    </main>
  );
}
