// How a payment was tied to a tenancy (payments.match_method).
export const MATCH_METHOD = {
  auto_name: "Auto: name match",
  sender_rule: "Auto: sender rule",
  staff_match: "Staff matched",
  manual_entry: "Entered by staff",
  import: "Imported",
  payprop_batch: "PayProp batch",
  split: "Split",
  opening_balance: "Opening balance",
  system: "System",
};
export const matchLabel = (m) => MATCH_METHOD[m] || "Before audit";
