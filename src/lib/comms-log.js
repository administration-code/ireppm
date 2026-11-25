import "server-only";
import { SITE } from "@/lib/site";
import { matchParty } from "@/lib/comms";

const LABEL_BY_TEMPLATE = {
  payprop_setup: "rent",
  renewal_offer: "lease",
  n4_cover: "notices",
  lmr_topup: "rent",
  missing_details: "lease",
  move_out: "notices",
  old_address_reminder: "rent",
  maintenance_ack: "maintenance",
};

// A template email sent from the portal goes straight onto the Communications timeline.
export async function logSentEmail(sb, draft, to) {
  const outside = to.find((e) => !/@ireppm\.ca$/i.test(e)) || to[0];
  const party = await matchParty(sb, outside);
  let link = {};
  if (draft.tenancy_id && party.tenancy_id !== draft.tenancy_id) {
    const { data } = await sb.from("tenancies").select("id, unit_id, unit:units(property_id)").eq("id", draft.tenancy_id).maybeSingle();
    if (data) link = { party_kind: "tenant", tenancy_id: data.id, unit_id: data.unit_id, property_id: data.unit?.property_id || null };
  } else if (draft.owner_id && party.owner_id !== draft.owner_id) link = { party_kind: "landlord", owner_id: draft.owner_id };
  if (draft.property_id) link.property_id = draft.property_id;
  const now = new Date().toISOString();
  const row = {
    message_id: `portal-${draft.id}`,
    direction: "out",
    draft_id: draft.id,
    from_name: "IRep Property Management",
    from_email: SITE.email,
    to_emails: to,
    subject: draft.subject,
    snippet: String(draft.body || "").slice(0, 1500),
    body: String(draft.body || "").slice(0, 8000),
    received_at: now,
    status: "handled",
    via_portal: true,
    ...party,
    ...link,
    category: LABEL_BY_TEMPLATE[draft.template_key] || (party.party_kind === "landlord" ? "landlord" : "general"),
    label_source: "rule",
  };
  const { error } = await sb.from("inbound_emails").insert(row);
  // Before migration 0096 there's no via_portal column.
  if (error && /via_portal/.test(error.message || "")) {
    delete row.via_portal;
    await sb.from("inbound_emails").insert(row);
  }
}
