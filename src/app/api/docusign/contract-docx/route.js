import { PM_CONTRACT_DOCX_BASE64, PM_CONTRACT_DOCX_NAME } from "@/lib/pm-contract-docx";

export const runtime = "nodejs";

// The blank management contract Word file, readable from the DocuSign web app so staff (or Claude in
// their browser) can upload it into the template editor, which is what turns on document generation.
// It's a blank form with no personal information.
export async function GET() {
  return new Response(Buffer.from(PM_CONTRACT_DOCX_BASE64, "base64"), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${PM_CONTRACT_DOCX_NAME}"`,
      "Access-Control-Allow-Origin": "https://apps.docusign.com",
      "Cache-Control": "no-store",
    },
  });
}
