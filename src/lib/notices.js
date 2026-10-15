// Ontario Landlord and Tenant Board N-forms we log on a tenancy.
export const NOTICE_FORMS = {
  N1: "Rent increase",
  N2: "Rent increase – exempt unit",
  N3: "Rent increase – care home",
  N4: "Non-payment of rent",
  N5: "Interference/damage",
  N6: "Illegal act/misrepresenting income",
  N7: "Serious problems",
  N8: "Persistent late payment",
  N9: "Tenant's notice to end",
  N10: "Agreement to increase rent above guideline",
  N11: "Agreement to end the tenancy",
  N12: "Landlord's own use",
  N13: "Demolition/repairs/conversion",
  other: "Other",
};

export const SERVICE_METHODS = {
  in_person: "In person",
  mail: "Mail",
  email: "Email",
  mail_slot: "Mail slot",
  courier: "Courier",
  other: "Other",
};

export const NOTICE_STATUS = {
  served: "Served",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
  filed_ltb: "Filed with the LTB",
  order_issued: "LTB order issued",
  void: "Void",
};

export const NOTICE_FIELDS =
  "id, tenancy_id, form, title, served_on, service_method, served_by, effective_date, amount, status, ltb_file_number, notes, created_at";

// "N4 Non-payment of rent", or the title for "Other".
export function noticeName(n) {
  if (!n) return "";
  if (n.form === "other") return n.title || "Other notice";
  const label = NOTICE_FORMS[n.form] || "";
  return `${n.form} ${label}`.trim();
}

export function amountLabel(form) {
  if (form === "N4") return "Arrears owing";
  if (form === "N1" || form === "N2" || form === "N3" || form === "N10") return "New rent";
  return "Amount";
}

export function effectiveLabel(form) {
  if (["N1", "N2", "N3", "N10"].includes(form)) return "Increase takes effect";
  if (["N4", "N5", "N6", "N7", "N8", "N9", "N11", "N12", "N13"].includes(form)) return "Termination date";
  return "Effective date";
}
