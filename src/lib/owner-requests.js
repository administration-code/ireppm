// What a landlord can ask for from the owner portal. `needsMonth` asks them to pick a month.
export const REQUEST_KINDS = [
  { value: "tenancy_list", label: "Up-to-date list of my tenancies", hint: "Tenants, units, rent and lease dates." },
  { value: "rent_payments", label: "Who has paid rent", hint: "Rent received tenant by tenant for a month.", needsMonth: true },
  { value: "statement", label: "My owner statement", hint: "A statement for a month, or a corrected or re-sent copy.", needsMonth: true },
  { value: "year_end", label: "Year-end summary", hint: "Income and expenses for your accountant." },
  { value: "documents", label: "Copies of leases or documents", hint: "Leases, notices, inspection reports, receipts." },
  { value: "other", label: "Something else", hint: "Tell us what you need." },
];

export const kindLabel = (k) => REQUEST_KINDS.find((x) => x.value === k)?.label || "Request";
export const needsMonth = (k) => Boolean(REQUEST_KINDS.find((x) => x.value === k)?.needsMonth);
