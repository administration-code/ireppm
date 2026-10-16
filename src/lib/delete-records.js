import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { docusignApi } from "@/lib/signatures";

export const DELETED_EVENT = "staff-record-deleted";

const DELETABLE_SIG_STATUSES = ["draft", "error", "voided", "declined"];
export const canDeleteSignature = (row) => DELETABLE_SIG_STATUSES.includes(row?.status);

// kind: showing_request, application, landlord_inquiry, listing or signature_request.
// The database refuses unsafe deletions; its message is shown to staff as-is.
export async function deleteLeasingRecord(kind, id, reason) {
  const cleanReason = String(reason || "").trim() || null;
  const { data, error } = await getBrowserClient().rpc("delete_leasing_record", {
    p_kind: kind,
    p_id: id,
    p_reason: cleanReason,
  });
  if (error) throw new Error(error.message || "That didn't delete. Try again.");
  refreshStaffCounts();
  window.dispatchEvent(new CustomEvent(DELETED_EVENT, { detail: { kind, summary: data, reason: cleanReason } }));
  return data;
}

export async function deleteSignatureRequest(row, reason) {
  if (row.status === "draft" && row.envelope_id) {
    try {
      await docusignApi(`/requests/${row.id}`, {
        body: { action: "void", reason: String(reason || "").trim() || "Deleted by staff" },
      });
    } catch {
      // A draft envelope may not be voidable in DocuSign; deleting our record is what matters.
    }
  }
  return deleteLeasingRecord("signature_request", row.id, reason);
}
