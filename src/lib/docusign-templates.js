import { IREP_SIGNER, LEASE_DEFAULTS, REP } from "@/lib/lease-defaults";

// DocuSign templates: names, roles, field labels (tabLabel) and the builders that turn a
// staff form into an envelope definition. Pure functions; the server calls them.

export const TEMPLATES = {
  lease: { names: ["Ontario Standard Lease", "Ontario Standard Lease (test)"], env: "DOCUSIGN_TEMPLATE_LEASE" },
  consent: { names: ["Consent to Service by Email (2022-04)"], env: "DOCUSIGN_TEMPLATE_CONSENT" },
  pm_contract: { names: ["IRep Property Management Contract"], env: "DOCUSIGN_TEMPLATE_PM_CONTRACT" },
  N1: { names: ["N1 - Notice of Rent Increase (2022-04)"], env: "DOCUSIGN_TEMPLATE_N1" },
  N4: { names: ["N4 - Non-Payment of Rent (2026-09)"], env: "DOCUSIGN_TEMPLATE_N4" },
  N5: { names: ["N5 - Interfering, Damage or Overcrowding (2026-09)"], env: "DOCUSIGN_TEMPLATE_N5" },
  N11: {
    names: ["N11 - Agreement to End the Tenancy (2022-04)", "N11 - Agreement to End the Tenancy (2022-04) (test)"],
    env: "DOCUSIGN_TEMPLATE_N11",
  },
  N9: {
    names: ["N9 - Tenant's Notice to End the Tenancy (2022-04)", "N9 - Tenant's Notice to End the Tenancy (2022-04) (test)"],
    env: "DOCUSIGN_TEMPLATE_N9",
  },
  certificate_of_service: {
    names: ["Certificate of Service (2022-04)", "Certificate of Service"],
    env: "DOCUSIGN_TEMPLATE_CERT_OF_SERVICE",
  },
};

// Templates each kind of request needs. A stand-alone consent form is kind 'other'.
// The lease template includes the Consent to Service by Email pages for every tenant.
export const KIND_TEMPLATES = {
  lease: ["lease"],
  consent: ["consent"],
  pm_contract: ["pm_contract"],
  N1: ["N1"],
  N4: ["N4"],
  N5: ["N5"],
  N9: ["N9"],
  N11: ["N11"],
  certificate_of_service: ["certificate_of_service"],
};

export const MAX_TENANTS = 8;
export const MAX_OWNERS = 6;

// ---------------------------------------------------------------------------
// Expected roles and labels (checked on /admin/signatures/templates).
// ---------------------------------------------------------------------------
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const yesNo = (name) => [`${name} Yes`, `${name} No`];

const LEASE_TEXT = [
  "Landlord Legal Name",
  "Landlord 2 Legal Name",
  ...range(MAX_TENANTS).flatMap((n) => [`Tenant ${n} Last Name`, `Tenant ${n} First Name`]),
  "Unit",
  "Street Number",
  "Street Name",
  "City",
  "Postal Code",
  "Parking",
  "Notice Unit",
  "Notice Street Number",
  "Notice Street Name",
  "Notice PO Box",
  "Notice City",
  "Notice Province",
  "Notice Postal Code",
  "Notice Emails",
  "Emergency Contact",
  "Start Date",
  "End Date",
  "Other Term Details",
  "Rent Due Day",
  "Rent Other Period",
  "Base Rent",
  "Parking Rent",
  ...range(3).flatMap((n) => [`Other Charge ${n} Description`, `Other Charge ${n} Amount`]),
  "Total Rent",
  "Rent Payable To",
  "Payment Methods",
  "Partial Rent Amount",
  "Partial Rent Date",
  "Partial Rent From",
  "Partial Rent To",
  "NSF Charge",
  ...range(3).map((n) => `Other Service ${n} Name`),
  "Services Details",
  "Utilities Details",
  "Rent Discount Details",
  "Rent Deposit Amount",
  "Key Deposit Amount",
  "Key Deposit Details",
  "Smoking Rules Details",
  "Landlord Signer Name",
  "Guarantor Name",
];

const LEASE_CHECKS = [
  ...yesNo("Condo"),
  ...yesNo("Email Notices"),
  ...yesNo("Emergency Contact"),
  "Fixed Term",
  "Monthly Tenancy",
  "Other Term",
  "Rent Per Month",
  "Rent Per Other",
  ...["Gas", "Air Conditioning", "Storage", "Laundry", "Guest Parking"].flatMap(yesNo),
  ...range(3).flatMap((n) => yesNo(`Other Service ${n}`)),
  "Laundry No Charge",
  "Laundry Pay Per Use",
  "Guest Parking No Charge",
  "Guest Parking Pay Per Use",
  "Electricity Landlord",
  "Electricity Tenant",
  "Heat Landlord",
  "Heat Tenant",
  "Water Landlord",
  "Water Tenant",
  "No Rent Discount",
  "Rent Discount",
  "No Rent Deposit",
  "Rent Deposit",
  "No Key Deposit",
  "Key Deposit",
  "No Smoking Rules",
  "Smoking Rules",
  "No Insurance Required",
  "Insurance Required",
  "No Additional Terms",
  "Additional Terms Attached",
];

const CONSENT_CHECKS = [
  "Consent Rent Increase",
  "Consent Notice Of Entry",
  "Consent LTB Documents",
  "Consent Tenancy Communication",
];

// Consent to Service by Email pages inside the lease template (page 1: LTB form for tenant 1
// and the landlord; page 2: tenants 2-8). Box labels start with "Consent" so the server can read them.
const LEASE_CONSENT_LANDLORD = [
  "Consent Landlord Name",
  "Consent Landlord Email",
  "Consent Rental Unit Address",
  "Consent Landlord First Name",
  "Consent Landlord Last Name",
];
function lockConsentBoxes(t) {
  if (t.checkboxTabs) t.checkboxTabs = t.checkboxTabs.map((c) => (/^consent/i.test(c.tabLabel) ? { ...c, locked: "true" } : c));
  return t;
}
function leaseConsentChecks(n) {
  return CONSENT_CHECKS.map((c) => `${c} (Tenant ${n})`);
}

const N_UNIT = ["Unit Street Number", "Unit Street Name", "Unit Number", "Unit City", "Unit Province", "Unit Postal Code"];
const N_SIGNER = [
  "Signer First Name",
  "Signer Last Name",
  "Signer Phone",
  "Rep First Name",
  "Rep Last Name",
  "Rep LSO Number",
  "Rep Company",
  "Rep Street Number",
  "Rep Street Name",
  "Rep Unit",
  "Rep City",
  "Rep Province",
  "Rep Postal Code",
  "Rep Email",
  "Rep Phone",
];
const SIGNED_AS = ["Signed As Landlord", "Signed As Representative"];

export const EXPECTED = {
  N11: {
    roles: [...range(MAX_TENANTS).map((n) => `Tenant ${n}`), "Landlord"],
    labels: {
      "Tenant 1": [
        "Tenant Names",
        "Landlord Name",
        "Rental Unit Address",
        "Termination Day",
        "Termination Month",
        "Termination Year",
        "Tenant 1 First Name",
        "Tenant 1 Last Name",
        "Tenant 1 Phone Area",
        "Tenant 1 Phone Prefix",
        "Tenant 1 Phone Line",
      ],
      ...Object.fromEntries(range(MAX_TENANTS).slice(1).map((n) => [`Tenant ${n}`, [`Tenant ${n} Name`]])),
      Landlord: ["Landlord First Name", "Landlord Last Name", "Landlord Phone Area", "Landlord Phone Prefix", "Landlord Phone Line"],
    },
  },
  N9: {
    roles: range(MAX_TENANTS).map((n) => `Tenant ${n}`),
    labels: {
      "Tenant 1": [
        "Landlord Name",
        "Tenant Names",
        "Rental Unit Address",
        "Termination Day",
        "Termination Month",
        "Termination Year",
        "Signed As Tenant",
        "Tenant 1 First Name",
        "Tenant 1 Last Name",
        "Tenant 1 Phone Area",
        "Tenant 1 Phone Prefix",
        "Tenant 1 Phone Line",
      ],
      ...Object.fromEntries(range(MAX_TENANTS).slice(1).map((n) => [`Tenant ${n}`, [`Tenant ${n} Name`]])),
    },
  },
  lease: {
    roles: ["Landlord", ...range(MAX_TENANTS).map((n) => `Tenant ${n}`), "Guarantor"],
    labels: {
      Landlord: [...LEASE_TEXT, ...LEASE_CHECKS, ...LEASE_CONSENT_LANDLORD],
      ...Object.fromEntries(
        range(MAX_TENANTS).map((n) => [
          `Tenant ${n}`,
          [`Tenant ${n} Signer Name`, `Tenant ${n} Consent Name`, `Tenant ${n} Consent Email`, ...leaseConsentChecks(n)],
        ])
      ),
    },
  },
  consent: {
    roles: ["Tenant", "Landlord"],
    labels: {
      Tenant: ["Tenant Name", "Tenant Email", "Tenant First Name", "Tenant Last Name", ...CONSENT_CHECKS],
      Landlord: ["Landlord Name", "Landlord Email", "Rental Unit Address", "Landlord First Name", "Landlord Last Name"],
    },
  },
  pm_contract: {
    roles: ["Landlord (Authorized Signatory)", ...range(MAX_OWNERS - 1).map((n) => `Landlord (Owner ${n + 1})`)],
    labels: {},
  },
  N1: {
    roles: ["Landlord"],
    labels: {
      Landlord: [
        "Tenant Names and Address",
        "Landlord Name and Address",
        "Rental Unit Address",
        "Increase Date",
        "New Rent",
        "Increase Amount",
        "Increase Percent",
        "Signer Name",
        "Signer Phone",
        "Rep Name",
        "Rep LSO Number",
        "Rep Company",
        "Rep Address",
        "Rep Phone",
        "Rep City",
        "Rep Province",
        "Rep Postal Code",
        "Rep Fax",
        "New Rent Per Month",
        "Increase Per Month",
        "At Or Below Guideline",
        "Above Guideline",
        "Above Guideline Approved",
        "Above Guideline Applied For",
        ...SIGNED_AS,
      ],
    },
  },
  N4: {
    roles: ["Landlord"],
    labels: {
      Landlord: [
        "Amount Owing",
        "Termination Date",
        "Tenant Names",
        "Landlord Name",
        ...N_UNIT,
        ...range(3).flatMap((n) => ["From", "To", "Charged", "Paid", "Owing"].map((c) => `Period ${n} ${c}`)),
        "Total Rent Owing",
        ...N_SIGNER,
        ...SIGNED_AS,
      ],
    },
  },
  N5: {
    roles: ["Landlord"],
    labels: {
      Landlord: [
        "Tenant Names",
        "Landlord Name",
        ...N_UNIT,
        "Termination Date",
        "Repair Cost",
        "Replace Cost",
        "Reason 3 Max Occupants",
        ...range(3).flatMap((n) => [`Event ${n} Date Time`, `Event ${n} Details`]),
        ...range(3).flatMap((n) => [`Reason ${n}`, `Reason ${n} First Notice`, `Reason ${n} Second Notice`]),
        ...N_SIGNER,
        ...SIGNED_AS,
      ],
    },
  },
  certificate_of_service: {
    roles: ["Delivery By"],
    labels: {
      "Delivery By": [
        "File Number",
        "Unit Number",
        "Street Address",
        "City",
        "Postal Code",
        "Served By Name",
        "Date Served",
        "Notice Form Number",
        "Other Document Name",
        "Served To Names",
        "Fax Number",
        "Mail Address",
        "Other Method Details",
        "Signer First Name",
        "Signer Last Name",
        "Signer Phone",
        "Notice of Termination",
        "Other Document",
        "Served To Tenant",
        "Served To Landlord",
        "Served To Other",
        "More Than One Tenant",
        "Method Handed To Person",
        "Method Authorized Employee",
        "Method Adult In Unit",
        "Method Mailbox",
        "Method Under Door Or Mail Slot",
        "Method Courier",
        "Method Fax",
        "Method Mail",
        "Method Other",
        "Signed As Landlord",
        "Signed As Tenant",
        "Signed As Representative",
        "Signed As Other",
      ],
    },
  },
};

// Certificate of Service methods: the checkbox it ticks and the notices.service_method it records.
export const CERT_METHODS = {
  handed: { label: "Handed to the tenant", tab: "Method Handed To Person", notice: "in_person" },
  adult: { label: "Handed to an adult in the unit", tab: "Method Adult In Unit", notice: "in_person" },
  mail_slot: { label: "Under the door or through the mail slot", tab: "Method Under Door Or Mail Slot", notice: "mail_slot" },
  mailbox: { label: "In the tenant's mailbox", tab: "Method Mailbox", notice: "mail_slot" },
  mail: { label: "By mail", tab: "Method Mail", notice: "mail" },
  courier: { label: "By courier", tab: "Method Courier", notice: "courier" },
  other: { label: "Other", tab: "Method Other", notice: "other" },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}
export const dmy = (iso) => {
  const p = parts(iso);
  return p ? `${p.d}/${p.m}/${p.y}` : "";
};
export const ymd = (iso) => {
  const p = parts(iso);
  return p ? `${p.y}/${p.m}/${p.d}` : "";
};

export const amount = (v) => {
  const n = Number(v);
  if (str(v) === "" || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const cents = (v) => Math.round(Number(v || 0) * 100) / 100;

export function splitName(full) {
  const words = str(full).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: words[0] || "", last: "" };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

export function splitStreet(address) {
  const m = /^\s*(\d+[A-Za-z]?(?:-\d+)?)\s+(.+)$/.exec(str(address));
  return m ? { number: m[1], name: m[2].trim() } : { number: "", name: str(address) };
}

// "Whole house" isn't a unit number on the forms.
export const unitNumber = (label) => (/whole|entire|house/i.test(str(label)) ? "" : str(label));

export function joinNames(names) {
  const list = names.map(str).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const ORDINAL = ["", "First", "Second", "Third"];
export function dueDayText(day) {
  const n = Number(day) || 1;
  if (ORDINAL[n]) return ORDINAL[n];
  const s = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${s}`;
}

// Everything IRep fills in is locked, so neither the landlord nor the tenant can change it.
function tabs(text = {}, checks = []) {
  const textTabs = Object.entries(text)
    .filter(([, v]) => str(v) !== "")
    .map(([tabLabel, value]) => ({ tabLabel, value: String(value), locked: "true" }));
  const checkboxTabs = [...new Set(checks.filter(Boolean))].map((tabLabel) => ({ tabLabel, selected: "true", locked: "true" }));
  const out = {};
  if (textTabs.length) out.textTabs = textTabs;
  if (checkboxTabs.length) out.checkboxTabs = checkboxTabs;
  return out;
}

// What we store in signature_requests.prefill: {role: {tabLabel: value | true}}.
function prefillOf(role, text = {}, checks = [], into = {}) {
  const entry = { ...(into[role] || {}) };
  for (const [k, v] of Object.entries(text)) if (str(v) !== "") entry[k] = String(v);
  for (const c of checks) if (c) entry[c] = true;
  into[role] = entry;
  return into;
}

// The landlord always signs. IRep drafts and sends, but never signs for a landlord.
// Staff can type a different owner contact (e.g. a co-owner); otherwise the property's owner.
export function signerOf(f, owner) {
  const name = str(f?.name) || str(owner?.name);
  const email = (str(f?.email) || str(owner?.email)).toLowerCase();
  return { name, email, phone: str(f?.phone) || str(owner?.phone), isIrep: false };
}

// Prorated first month: rent × days remaining ÷ days in month.
export function partialRent(total, startISO) {
  const p = parts(startISO);
  if (!p || p.d === "01") return null;
  const y = Number(p.y);
  const m = Number(p.m);
  const day = Number(p.d);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const remaining = daysInMonth - day + 1;
  return {
    amount: cents((Number(total) * remaining) / daysInMonth),
    from: startISO,
    to: `${p.y}-${p.m}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

export function leaseTotal(f) {
  const others = (f.other_charges || []).reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
  return cents((Number(f.base_rent) || 0) + (Number(f.parking_rent) || 0) + others);
}

// ---------------------------------------------------------------------------
// Builders. Each returns { definition, prefill, recipients, terms }.
// `definition` is the envelope body without status/emailSubject.
// ---------------------------------------------------------------------------

function consentTabs({ tenantName, tenantEmail, landlordName, unitAddress, signerName }) {
  const t = splitName(tenantName);
  const s = splitName(signerName);
  return {
    tenantText: {
      "Tenant Name": tenantName,
      "Tenant Email": tenantEmail,
      "Tenant First Name": t.first,
      "Tenant Last Name": t.last,
    },
    tenantChecks: CONSENT_CHECKS,
    landlordText: {
      "Landlord Name": `${str(landlordName) || "The landlord"} c/o ${REP.company}`,
      "Landlord Email": LEASE_DEFAULTS.landlordEmail,
      "Rental Unit Address": unitAddress,
      "Landlord First Name": s.first,
      "Landlord Last Name": s.last,
    },
  };
}

// The "Administration" copy is in every template. Giving it the same recipientId in each
// part of a lease envelope makes DocuSign count it once, not once per document.
function adminCopy() {
  return { recipientId: "30", roleName: "Administration", routingOrder: "3", name: IREP_SIGNER.name, email: IREP_SIGNER.email };
}

export function buildLease(f, ids, owner) {
  const tenants = (f.tenants || []).slice(0, MAX_TENANTS).map((t) => ({
    full_name: str(t.full_name),
    email: str(t.email).toLowerCase(),
    phone: str(t.phone),
  }));
  const signer = signerOf(f.signer, owner);
  const landlordName = str(f.landlord_name);
  const total = leaseTotal(f);
  const partial = partialRent(total, f.start_date);
  const monthly = f.term === "monthly";
  const unitAddress = [
    [unitNumber(f.unit_label), [f.street_number, f.street_name].map(str).filter(Boolean).join(" ")].filter(Boolean).join("-"),
    str(f.city),
    "ON",
    str(f.postal_code),
  ]
    .filter(Boolean)
    .join(", ");

  const text = {
    "Landlord Legal Name": landlordName,
    "Landlord 2 Legal Name": f.landlord2_name,
    Unit: unitNumber(f.unit_label),
    "Street Number": f.street_number,
    "Street Name": f.street_name,
    City: f.city,
    "Postal Code": f.postal_code,
    Parking: f.parking,
    "Notice Unit": LEASE_DEFAULTS.noticeAddress.unit,
    "Notice Street Number": LEASE_DEFAULTS.noticeAddress.streetNumber,
    "Notice Street Name": LEASE_DEFAULTS.noticeAddress.streetName,
    "Notice PO Box": LEASE_DEFAULTS.noticeAddress.poBox,
    "Notice City": LEASE_DEFAULTS.noticeAddress.city,
    "Notice Province": LEASE_DEFAULTS.noticeAddress.province,
    "Notice Postal Code": LEASE_DEFAULTS.noticeAddress.postalCode,
    "Notice Emails": `Landlord's Representative: ${LEASE_DEFAULTS.landlordEmail}; Tenant(s): ${tenants.map((t) => t.email).filter(Boolean).join(", ")}`,
    "Emergency Contact": LEASE_DEFAULTS.emergencyContact,
    "Start Date": ymd(f.start_date),
    "End Date": monthly ? "" : ymd(f.end_date),
    "Other Term Details": f.other_term_details,
    "Rent Due Day": f.rent_due_text || dueDayText(f.rent_due_day),
    "Base Rent": amount(f.base_rent),
    "Parking Rent": amount(f.parking_rent),
    "Total Rent": amount(total),
    "Rent Payable To": f.rent_payable_to || LEASE_DEFAULTS.rentPayableTo,
    "Payment Methods": f.payment_methods || LEASE_DEFAULTS.paymentMethods,
    "NSF Charge": LEASE_DEFAULTS.nsfCharge,
    "Services Details": f.services_details,
    "Utilities Details": f.utilities_details,
    "Rent Deposit Amount": Number(f.rent_deposit) > 0 ? amount(f.rent_deposit) : "",
    "Key Deposit Amount": Number(f.key_deposit) > 0 ? amount(f.key_deposit) : "",
    "Key Deposit Details": Number(f.key_deposit) > 0 ? f.key_deposit_details : "",
    "Smoking Rules Details": LEASE_DEFAULTS.smokingRules,
    "Landlord Signer Name": signer.name,
    "Guarantor Name": f.guarantor_name,
  };
  tenants.forEach((t, i) => {
    const n = splitName(t.full_name);
    text[`Tenant ${i + 1} Last Name`] = n.last;
    text[`Tenant ${i + 1} First Name`] = n.first;
  });
  (f.other_charges || []).slice(0, 3).forEach((c, i) => {
    if (!str(c?.description) && !str(c?.amount)) return;
    text[`Other Charge ${i + 1} Description`] = c.description;
    text[`Other Charge ${i + 1} Amount`] = amount(c.amount);
  });
  if (partial) {
    text["Partial Rent Amount"] = amount(partial.amount);
    text["Partial Rent Date"] = ymd(partial.from);
    text["Partial Rent From"] = ymd(partial.from);
    text["Partial Rent To"] = ymd(partial.to);
  }

  const svc = f.services || {};
  const util = f.utilities || {};
  const checks = [
    f.condo ? "Condo Yes" : "Condo No",
    "Email Notices Yes",
    "Emergency Contact Yes",
    monthly ? "Monthly Tenancy" : str(f.other_term_details) && !f.end_date ? "Other Term" : "Fixed Term",
    "Rent Per Month",
    svc.gas ? "Gas Yes" : "Gas No",
    svc.ac ? "Air Conditioning Yes" : "Air Conditioning No",
    svc.storage ? "Storage Yes" : "Storage No",
    svc.laundry ? "Laundry Yes" : "Laundry No",
    svc.guest_parking ? "Guest Parking Yes" : "Guest Parking No",
    svc.laundry ? (f.laundry_charge === "per_use" ? "Laundry Pay Per Use" : "Laundry No Charge") : "",
    svc.guest_parking ? (f.guest_parking_charge === "per_use" ? "Guest Parking Pay Per Use" : "Guest Parking No Charge") : "",
    util.electricity === "landlord" ? "Electricity Landlord" : "Electricity Tenant",
    util.heat === "landlord" ? "Heat Landlord" : "Heat Tenant",
    util.water === "landlord" ? "Water Landlord" : "Water Tenant",
    "No Rent Discount",
    Number(f.rent_deposit) > 0 ? "Rent Deposit" : "No Rent Deposit",
    Number(f.key_deposit) > 0 ? "Key Deposit" : "No Key Deposit",
    "Smoking Rules",
    "Insurance Required",
    "Additional Terms Attached",
  ];
  (f.other_services || []).slice(0, 3).forEach((s, i) => {
    if (!str(s?.name)) return;
    text[`Other Service ${i + 1} Name`] = s.name;
    checks.push(s.included ? `Other Service ${i + 1} Yes` : `Other Service ${i + 1} No`);
  });

  // Consent to Service by Email, landlord part (locked on the form).
  const cs = splitName(signer.name);
  Object.assign(text, {
    "Consent Landlord Name": `${landlordName || "The landlord"} c/o ${REP.company}`,
    "Consent Landlord Email": LEASE_DEFAULTS.landlordEmail,
    "Consent Rental Unit Address": unitAddress,
    "Consent Landlord First Name": cs.first,
    "Consent Landlord Last Name": cs.last,
  });

  const prefill = prefillOf("Landlord", text, checks);
  const leaseSigners = [
    { recipientId: "1", roleName: "Landlord", routingOrder: "2", name: signer.name, email: signer.email, tabs: tabs(text, checks) },
  ];
  const recipients = [{ role: "Landlord", name: signer.name, email: signer.email, routing_order: 2, status: "created" }];

  tenants.forEach((t, i) => {
    const role = `Tenant ${i + 1}`;
    const n = i + 1;
    const tn = splitName(t.full_name);
    const ttext = {
      [`Tenant ${n} Signer Name`]: t.full_name,
      [`Tenant ${n} Consent Name`]: t.full_name,
      [`Tenant ${n} Consent Email`]: t.email,
      ...(n === 1 ? { "Tenant 1 Consent First Name": tn.first, "Tenant 1 Consent Last Name": tn.last } : {}),
    };
    // Every consent box is ticked and locked: consent to email service is part of every IRep lease.
    const tchecks = leaseConsentChecks(n);
    prefillOf(role, ttext, tchecks, prefill);
    leaseSigners.push({
      recipientId: String(11 + i),
      roleName: role,
      routingOrder: "1",
      name: t.full_name,
      email: t.email,
      tabs: lockConsentBoxes(tabs(ttext, tchecks)),
    });
    recipients.push({ role, name: t.full_name, email: t.email, routing_order: 1, status: "created" });
  });

  if (str(f.guarantor_name) && str(f.guarantor_email)) {
    leaseSigners.push({
      recipientId: "20",
      roleName: "Guarantor",
      routingOrder: "1",
      name: str(f.guarantor_name),
      email: str(f.guarantor_email).toLowerCase(),
    });
    recipients.push({ role: "Guarantor", name: str(f.guarantor_name), email: str(f.guarantor_email), routing_order: 1, status: "created" });
  }

  // One envelope from the one lease template (lease, Schedule A and the consent pages).
  // Roles left out of templateRoles (unused tenants, guarantor) are dropped.
  const definition = {
    templateId: ids.lease,
    templateRoles: leaseSigners.map(({ recipientId, ...role }) => role),
  };

  const terms = {
    unit_id: f.unit_id,
    start_date: f.start_date,
    end_date: monthly ? "" : str(f.end_date),
    rent: total,
    rent_due_day: Number(f.rent_due_day) || 1,
    last_month_deposit: Number(f.rent_deposit) > 0 ? cents(f.rent_deposit) : "",
    key_deposit: Number(f.key_deposit) > 0 ? cents(f.key_deposit) : "",
    email_service_consent: "",
    tenants: tenants.map((t, i) => ({ ...t, is_primary: i === 0 })),
  };

  return { definition, prefill, recipients, terms };
}

export function buildConsent(f, ids, owner) {
  const signer = signerOf(f.signer, owner);
  const c = consentTabs({
    tenantName: str(f.tenant_name),
    tenantEmail: str(f.tenant_email).toLowerCase(),
    landlordName: f.landlord_name,
    unitAddress: f.unit_address,
    signerName: signer.name,
  });
  const prefill = prefillOf("Tenant", c.tenantText, c.tenantChecks);
  prefillOf("Landlord", c.landlordText, [], prefill);
  return {
    definition: {
      templateId: ids.consent,
      templateRoles: [
        {
          roleName: "Tenant",
          routingOrder: "1",
          name: str(f.tenant_name),
          email: str(f.tenant_email).toLowerCase(),
          tabs: tabs(c.tenantText, c.tenantChecks),
        },
        { roleName: "Landlord", routingOrder: "2", name: signer.name, email: signer.email, tabs: tabs(c.landlordText) },
      ],
    },
    prefill,
    recipients: [
      { role: "Tenant", name: str(f.tenant_name), email: str(f.tenant_email), routing_order: 1, status: "created" },
      { role: "Landlord", name: signer.name, email: signer.email, routing_order: 2, status: "created" },
    ],
    terms: { type: "consent", tenant_id: f.tenant_id || null, tenant_name: str(f.tenant_name) },
  };
}

// Offsets were calibrated against a generated contract (Oct 2026); anchors are case-sensitive so the
// lowercase "where the Landlord is a corporation" in sections 1.9 and 1.10 isn't matched.
// Fields the saved DocuSign template doesn't have, added to a management contract draft when it's
// made. They're anchored to the contract's own words or to hidden "/pm.../" markers in the Word file,
// so they land in place whatever the page layout. Offsets are in points from the anchor.
const PM_ANCHORS = {
  landlordInitials: { text: "Landlord initials", x: 54, y: 12 },
  managerInitials: { text: "Manager initials", x: 54, y: 14 },
  // Owners 2-6 initial in the empty footer space either side of "Landlord initials / Manager initials".
  coOwnerInitialsX: [-47, -92, -137, 253, 298],
  corporation: { text: "Where the Landlord is a corporation", x: -22, y: -3 }, // signature page, under the signatures
  multipleOwners: { text: "Where the Property has more than one owner", x: -22, y: -3 },
  // Schedule A, Part 2: the box beside each optional service, by add-on key.
  services: [
    ["snow_lawn", "Service Lawn Snow Monthly", "Lawn maintenance & snow removal — monthly"],
    ["snow_lawn_visit", "Service Lawn Snow Per Visit", "Lawn maintenance & snow removal — per"],
    ["surveillance", "Service Security Package", "Security package — 1–2"],
    ["surveillance_install", "Service Security Install", "Security package — one-time"],
    ["appliance", "Service Appliance Coverage", "Appliance coverage — fridge"],
    ["plumbing", "Service Plumbing Package", "Plumbing package — basic"],
    ["cleaning", "Service Common Space Cleaning", "Common space cleaning — shared"],
  ],
  serviceBox: { x: -24, y: 0 },
};
// Phone cells carry hidden anchors in the contract's Word file ("/pmo1t/" ... "/pmo6t/" in the owner
// rows, "/pmst/" in the Authorized Signatory section).
// DocuSign puts a hidden marker's anchor about 8pt above the line it sits on (calibrated Oct 2026).
// Anchor offsets (points below the hidden marker): values sit on the label's baseline, clear of the cell's lines.
const PM_PHONE = { x: 0, y: 6 };
const PM_INLINE = new Set(["pmfeff", "pmfdisca", "pmfdiscm", "pmfresp"]); // markers inside a sentence, not alone in a cell
// "IRep Phone" stays in the list so a refresh removes the field from drafts made before the phone was printed.
export const PM_TAB_LABELS = /^(Landlord|Manager|Owner \d) Initials|^Landlord Is Corporation$|^Multiple Owners$|^Service |^Owner (\d )?Phone|^IRep Phone$|^Contract |^Engagement /;

// Schedule A monthly rates as printed in the contract (Part 2).
export const PM_ADDON_RATES = { snow_lawn: 50, surveillance: 15, appliance: 50, plumbing: 40, cleaning: 150 };
const PM_ADDON_MARKER = { snow_lawn: "pmfsnow", surveillance: "pmfsec", appliance: "pmfapp", plumbing: "pmfplumb", cleaning: "pmfclean" };
const cad = (n) => `$${Number(n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDay = (iso) => {
  const d = iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
};

// Fees for the contract's Schedule A, from the number of Leases, the selected add-ons and any first-year discount.
export function pmContractFees({ leases = 1, addons = [], monthlyDiscount = 0, customFee = null } = {}) {
  const n = Math.max(1, Math.round(Number(leases) || 1));
  const management = customFee != null && Number(customFee) > 0 ? Number(customFee) : 175 + 25 * (n - 1);
  const additionalLeases = Math.max(management - 175, 0);
  const services = Object.fromEntries(Object.keys(PM_ADDON_RATES).filter((k) => addons.includes(k)).map((k) => [k, PM_ADDON_RATES[k]]));
  const optional = Object.values(services).reduce((a, b) => a + b, 0);
  const discount = Math.max(0, Math.min(Number(monthlyDiscount) || 0, management));
  const subtotal = Math.round((management + optional - discount) * 100) / 100;
  const hst = Math.round(subtotal * 0.13 * 100) / 100;
  return { leases: n, management, additionalLeases, services, optional, discount, annualDiscount: discount * 12, subtotal, hst, total: Math.round((subtotal + hst) * 100) / 100 };
}

// The values printed into the contract, keyed by the hidden anchor in the Word file.
export function pmContractValues(c = {}) {
  const fees = pmContractFees({ leases: c.leases, addons: c.addons || [], monthlyDiscount: c.monthly_discount, customFee: c.custom_fee });
  const v = {
    pmfeff: longDay(c.effective_date),
    pmfms: c.engagement === "resign" ? longDay(c.managed_since) : "",
    pmfcorp: str(c.corporation_name),
    pmfcorpno: str(c.corporation_number),
    pmfnotice: str(c.notice_address),
    pmfaddr: str(c.property_address),
    pmfcity: str(c.city_postal),
    pmfstart: longDay(c.commencement_date),
    pmleases: String(fees.leases),
    pmfdisca: fees.discount ? cad(fees.annualDiscount) : "Not applicable",
    pmfdiscm: fees.discount ? cad(fees.discount) : "Not applicable",
    pmfresp: str(c.response_time) || "48 hours",
    pmfaddl: cad(fees.additionalLeases),
    pmfmgmt: cad(fees.management),
    pmfopt: cad(fees.optional),
    pmftmgmt: cad(fees.management),
    pmftopt: cad(fees.optional),
    pmftdisc: fees.discount ? `−${cad(fees.discount)}` : cad(0),
    pmftsub: cad(fees.subtotal),
    pmfthst: cad(fees.hst),
    pmfttot: cad(fees.total),
  };
  for (const [k, marker] of Object.entries(PM_ADDON_MARKER)) v[marker] = fees.services[k] ? cad(fees.services[k]) : "";
  return { values: v, fees };
}
const CORPORATE = /\b(inc|incorporated|ltd|limited|corp|corporation|llc|ulc|co)\.?$/i;
export const looksCorporate = (name) => CORPORATE.test(str(name).replace(/[.,\s]+$/, ""));

export function buildPmContract(f, ids) {
  const owners = (f.owners || []).filter((o) => str(o.name) && str(o.email)).slice(0, MAX_OWNERS);
  const roleFor = (i) => (i === 0 ? "Landlord (Authorized Signatory)" : `Landlord (Owner ${i + 1})`);
  const corporation = f.corporation === undefined ? looksCorporate(owners[0]?.name) : Boolean(f.corporation);
  return {
    definition: {
      templateId: ids.pm_contract,
      templateRoles: owners.map((o, i) => ({ roleName: roleFor(i), name: str(o.name), email: str(o.email).toLowerCase() })),
    },
    prefill: {},
    recipients: owners.map((o, i) => ({ role: roleFor(i), name: str(o.name), email: str(o.email), status: "created" })),
    terms: { agreement_start: str(f.agreement_start), agreement_renewal: str(f.agreement_renewal), corporation, contract: f.contract || null },
    extraTabs: pmContractTabs(owners, { corporation, addons: f.addons || [], contract: f.contract || null }),
  };
}

// { roleName: tabs } for the fields the template is missing.
export function pmContractTabs(owners, { corporation, addons = [], contract = null }) {
  const anchor = (a, dx = a.x, dy = a.y) => ({
    anchorString: a.text, anchorXOffset: String(dx), anchorYOffset: String(dy), anchorUnits: "pixels",
    anchorIgnoreIfNotPresent: "true", anchorCaseSensitive: "true", anchorMatchWholeWord: "false",
  });
  const initials = (label, where) => ({ ...where, tabLabel: `${label} Initials`, name: "InitialHere", optional: "false", scaleValue: "1" });
  const phoneText = (label, value, text) => ({
    ...anchor({ text, ...PM_PHONE }), documentId: "1", tabLabel: label, value: str(value), width: "84", height: "14", required: "false", locked: "false",
    font: "helvetica", fontSize: "size9", fontColor: "black",
  });
  const check = (label, where, on, locked = true) => ({ ...where, tabLabel: label, name: label, selected: on ? "true" : "false", locked: locked ? "true" : "false", required: "false" });

  const lead = owners[0] || {};
  const out = {
    "Landlord (Authorized Signatory)": {
      initialHereTabs: [initials("Landlord", anchor(PM_ANCHORS.landlordInitials))],
      checkboxTabs: [
        check("Landlord Is Corporation", anchor(PM_ANCHORS.corporation), corporation),
        check("Multiple Owners", anchor(PM_ANCHORS.multipleOwners), owners.length > 1),
        // Optional services: ticked from the property's add-ons; the landlord can change them before signing.
        ...PM_ANCHORS.services.map(([key, label, text]) =>
          check(label, anchor({ text, ...PM_ANCHORS.serviceBox }), addons.includes(key), false)
        ),
      ],
      textTabs: str(lead.phone) ? ["/pmo1t/", "/pmst/"].map((text, i) => phoneText(`Owner Phone ${i + 1}`, lead.phone, text)) : [],
    },
    Manager: {
      // IRep's phone is printed in the contract itself (page 2), so no field is added for it.
      initialHereTabs: [initials("Manager", anchor(PM_ANCHORS.managerInitials))],
    },
  };
  // The contract's own details (dates, addresses, fees), printed in place as locked fields.
  if (contract) {
    const { values } = pmContractValues({ ...contract, addons });
    const lead = out["Landlord (Authorized Signatory)"];
    const wide = { pmfnotice: 330, pmfaddr: 330, pmfcity: 330, pmfcorp: 135, pmfcorpno: 125, pmfeff: 120, pmfstart: 200, pmfms: 200 };
    for (const [marker, value] of Object.entries(values)) {
      if (!value) continue;
      lead.textTabs.push({
        ...anchor({ text: `/${marker}/`, x: 0, y: PM_INLINE.has(marker) ? -2 : 6 }), documentId: "1", tabLabel: `Contract ${marker}`, value, locked: "true", required: "false",
        width: String(wide[marker] || 95), height: "14", font: "calibri", fontSize: "size10", fontColor: "black",
      });
    }
  }
  if (contract) {
    out["Landlord (Authorized Signatory)"].checkboxTabs.push(
      check("Engagement New", anchor({ text: "/pmeng1/", x: -14, y: 2 }), contract.engagement !== "resign"),
      check("Engagement Re-signing", anchor({ text: "/pmeng2/", x: -14, y: 2 }), contract.engagement === "resign")
    );
  }
  owners.slice(1).forEach((o, i) => {
    const n = i + 2;
    out[`Landlord (Owner ${n})`] = {
      initialHereTabs: [initials(`Owner ${n}`, anchor(PM_ANCHORS.landlordInitials, PM_ANCHORS.coOwnerInitialsX[i], PM_ANCHORS.landlordInitials.y))],
      textTabs: str(o.phone) ? [phoneText(`Owner ${n} Phone`, o.phone, `/pmo${n}t/`)] : [],
    };
  });
  return out;
}

// N-forms are always signed by the landlord (never IRep as representative).
function nFormSigner(f, owner) {
  const s = signerOf(f.signer, owner);
  return { rep: false, name: s.name, email: s.email, phone: s.phone, ...splitName(s.name) };
}

function nUnitText(f) {
  return {
    "Unit Street Number": f.street_number,
    "Unit Street Name": f.street_name,
    "Unit Number": unitNumber(f.unit_label),
    "Unit City": f.city,
    "Unit Province": "ON",
    "Unit Postal Code": f.postal_code,
  };
}

function nSignerText(s) {
  const text = { "Signer First Name": s.first, "Signer Last Name": s.last, "Signer Phone": s.phone };
  if (s.rep) {
    Object.assign(text, {
      "Rep First Name": s.first,
      "Rep Last Name": s.last,
      "Rep Company": REP.company,
      "Rep Street Number": REP.streetNumber,
      "Rep Street Name": REP.streetName,
      "Rep Unit": REP.unit,
      "Rep City": REP.city,
      "Rep Province": REP.province,
      "Rep Postal Code": REP.postalCode,
      "Rep Email": REP.email,
      "Rep Phone": REP.phone,
    });
  }
  return text;
}

function nFormResult(kind, f, s, text, checks, termsExtra) {
  checks.push(s.rep ? "Signed As Representative" : "Signed As Landlord");
  return {
    definition: {
      templateId: f.__templateId,
      templateRoles: [{ roleName: "Landlord", name: s.name, email: s.email.toLowerCase(), tabs: tabs(text, checks) }],
    },
    prefill: prefillOf("Landlord", text, checks),
    recipients: [{ role: "Landlord", name: s.name, email: s.email, status: "created" }],
    terms: { notes: str(f.notes), ...termsExtra },
  };
}

export function buildNForm(kind, f, ids, owner) {
  const s = nFormSigner(f, owner);
  const g = { ...f, __templateId: ids[kind] };
  const tenantNames = str(f.tenant_names);
  const landlordName = str(f.landlord_name);

  if (kind === "N1") {
    const current = Number(f.current_rent) || 0;
    const next = Number(f.new_rent) || 0;
    const increase = cents(next - current);
    const pct = current ? Math.round((increase / current) * 10000) / 100 : 0;
    const text = {
      "Tenant Names and Address": [tenantNames, f.unit_address].filter(Boolean).join("\n"),
      "Landlord Name and Address": [landlordName, f.landlord_address || `c/o ${REP.company}, ${REP.address}, ${REP.city}, ${REP.province} ${REP.postalCode}`]
        .filter(Boolean)
        .join("\n"),
      "Rental Unit Address": f.unit_address,
      "Increase Date": dmy(f.increase_date),
      "New Rent": amount(next),
      "Increase Amount": amount(increase),
      "Increase Percent": pct ? String(pct) : "",
      "Signer Name": s.name,
      "Signer Phone": s.phone,
    };
    if (s.rep) {
      Object.assign(text, {
        "Rep Name": s.name,
        "Rep Company": REP.company,
        "Rep Address": REP.address,
        "Rep Phone": REP.phone,
        "Rep City": REP.city,
        "Rep Province": REP.province,
        "Rep Postal Code": REP.postalCode,
        "Rep Fax": REP.fax,
      });
    }
    const checks = ["New Rent Per Month", "Increase Per Month"];
    if (f.guideline === "above_approved") checks.push("Above Guideline", "Above Guideline Approved");
    else if (f.guideline === "above_applied") checks.push("Above Guideline", "Above Guideline Applied For");
    else checks.push("At Or Below Guideline");
    return nFormResult(kind, g, s, text, checks, { effective_date: str(f.increase_date), amount: next || "" });
  }

  if (kind === "N4") {
    const text = {
      "Amount Owing": amount(f.amount_owing),
      "Termination Date": dmy(f.termination_date),
      "Tenant Names": tenantNames,
      "Landlord Name": landlordName,
      ...nUnitText(f),
      ...nSignerText(s),
    };
    let total = 0;
    (f.periods || []).slice(0, 3).forEach((p, i) => {
      const n = i + 1;
      text[`Period ${n} From`] = dmy(p.from);
      text[`Period ${n} To`] = dmy(p.to);
      text[`Period ${n} Charged`] = amount(p.charged);
      text[`Period ${n} Paid`] = amount(p.paid);
      text[`Period ${n} Owing`] = amount(p.owing);
      total += Number(p.owing) || 0;
    });
    if (total) text["Total Rent Owing"] = amount(total);
    return nFormResult(kind, g, s, text, [], {
      effective_date: str(f.termination_date),
      amount: str(f.amount_owing) ? cents(f.amount_owing) : "",
    });
  }

  // N5
  const text = {
    "Tenant Names": tenantNames,
    "Landlord Name": landlordName,
    ...nUnitText(f),
    ...nSignerText(s),
    "Termination Date": dmy(f.termination_date),
    "Repair Cost": amount(f.repair_cost),
    "Replace Cost": amount(f.replace_cost),
    "Reason 3 Max Occupants": f.max_occupants,
  };
  (f.events || []).slice(0, 3).forEach((e, i) => {
    text[`Event ${i + 1} Date Time`] = e.when;
    text[`Event ${i + 1} Details`] = e.details;
  });
  const second = f.notice_number === "second";
  const checks = [];
  for (const r of f.reasons || []) {
    if (![1, 2, 3].includes(Number(r))) continue;
    checks.push(`Reason ${r}`, `Reason ${r} ${second ? "Second" : "First"} Notice`);
  }
  return nFormResult(kind, g, s, text, checks, { effective_date: str(f.termination_date), amount: "" });
}

export function buildCertificate(f, ids) {
  const deliverer = { name: str(f.deliverer_name), email: str(f.deliverer_email).toLowerCase(), phone: str(f.deliverer_phone) };
  const d = splitName(deliverer.name);
  const method = CERT_METHODS[f.method] || CERT_METHODS.handed;
  const isN1 = f.notice_form === "N1";
  const names = (f.served_to || []).map(str).filter(Boolean);
  const text = {
    "File Number": f.file_number,
    "Unit Number": unitNumber(f.unit_label),
    "Street Address": f.street_address,
    City: f.city,
    "Postal Code": f.postal_code,
    "Served By Name": str(f.served_by_name) || deliverer.name,
    "Date Served": dmy(f.date_served),
    "Notice Form Number": isN1 ? "" : f.notice_form,
    "Other Document Name": isN1 ? "N1 Notice of Rent Increase" : "",
    "Served To Names": joinNames(names),
    "Other Method Details": f.method === "other" ? f.method_details : "",
    "Signer First Name": d.first,
    "Signer Last Name": d.last,
    "Signer Phone": deliverer.phone,
  };
  const checks = [
    isN1 ? "Other Document" : "Notice of Termination",
    "Served To Tenant",
    names.length > 1 ? "More Than One Tenant" : "",
    method.tab,
    // The person who delivered it signs as "Other": IRep is never the landlord's representative.
    "Signed As Other",
  ];
  return {
    definition: {
      templateId: ids.certificate_of_service,
      templateRoles: [{ roleName: "Delivery By", name: deliverer.name, email: deliverer.email, tabs: tabs(text, checks) }],
    },
    prefill: prefillOf("Delivery By", text, checks),
    recipients: [{ role: "Delivery By", name: deliverer.name, email: deliverer.email, status: "created" }],
    terms: { served_on: str(f.date_served), method: f.method, notice_form: f.notice_form },
  };
}

// N9: tenant's notice to end the tenancy, from the tenant portal. `prep` is what the
// n9_prepare database function returns; every tenant on the tenancy signs.
export function buildN9(prep, terminationISO, ids, phone = "") {
  const tenants = (prep.tenants || []).filter((t) => str(t.full_name) && str(t.email)).slice(0, MAX_TENANTS);
  const [y, m, d] = String(terminationISO).split("-");
  const first = splitName(tenants[0]?.full_name);
  const digits = String(phone || tenants[0]?.phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const text = {
    "Landlord Name": prep.landlord_name,
    "Tenant Names": joinNames(tenants.map((t) => t.full_name)),
    "Rental Unit Address": prep.address,
    "Termination Day": d,
    "Termination Month": m,
    "Termination Year": y,
    "Tenant 1 First Name": first.first,
    "Tenant 1 Last Name": first.last,
    "Tenant 1 Phone Area": digits.length === 10 ? digits.slice(0, 3) : "",
    "Tenant 1 Phone Prefix": digits.length === 10 ? digits.slice(3, 6) : "",
    "Tenant 1 Phone Line": digits.length === 10 ? digits.slice(6) : "",
  };
  const prefill = prefillOf("Tenant 1", text, ["Signed As Tenant"]);
  const templateRoles = tenants.map((t, i) => {
    const role = `Tenant ${i + 1}`;
    const roleText = i === 0 ? text : { [`Tenant ${i + 1} Name`]: t.full_name };
    if (i > 0) prefillOf(role, roleText, [], prefill);
    return {
      roleName: role,
      routingOrder: "1",
      name: t.full_name,
      email: str(t.email).toLowerCase(),
      tabs: tabs(roleText, i === 0 ? ["Signed As Tenant"] : []),
    };
  });
  return {
    definition: { templateId: ids.N9, templateRoles },
    prefill,
    recipients: tenants.map((t, i) => ({ role: `Tenant ${i + 1}`, name: t.full_name, email: t.email, routing_order: 1, status: "created" })),
    terms: {
      type: "N9",
      termination_date: terminationISO,
      tenants: tenants.map((t) => t.full_name),
    },
  };
}

function phoneParts(phone) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)] : ["", "", ""];
}

// N11: agreement to end the tenancy early. Every tenant signs first, then the landlord.
// `prep` is what n9_prepare returns; `request` is the n11_requests row.
export function buildN11(prep, request, ids, owner) {
  const tenants = (prep.tenants || []).filter((t) => str(t.full_name) && str(t.email)).slice(0, MAX_TENANTS);
  const [y, m, d] = String(request.termination_date).split("-");
  const first = splitName(tenants[0]?.full_name);
  const [ta, tp, tl] = phoneParts(request.phone || tenants[0]?.phone);
  const landlord = signerOf(null, owner);
  const ln = splitName(landlord.name);
  const [la, lp, ll] = phoneParts(landlord.phone);
  const text = {
    "Tenant Names": joinNames(tenants.map((t) => t.full_name)),
    "Landlord Name": prep.landlord_name,
    "Rental Unit Address": prep.address,
    "Termination Day": d,
    "Termination Month": m,
    "Termination Year": y,
    "Tenant 1 First Name": first.first,
    "Tenant 1 Last Name": first.last,
    "Tenant 1 Phone Area": ta,
    "Tenant 1 Phone Prefix": tp,
    "Tenant 1 Phone Line": tl,
  };
  const landlordText = {
    "Landlord First Name": ln.first,
    "Landlord Last Name": ln.last,
    "Landlord Phone Area": la,
    "Landlord Phone Prefix": lp,
    "Landlord Phone Line": ll,
  };
  const prefill = prefillOf("Tenant 1", text);
  prefillOf("Landlord", landlordText, [], prefill);
  const templateRoles = tenants.map((t, i) => {
    const roleText = i === 0 ? text : { [`Tenant ${i + 1} Name`]: t.full_name };
    if (i > 0) prefillOf(`Tenant ${i + 1}`, roleText, [], prefill);
    return { roleName: `Tenant ${i + 1}`, routingOrder: "1", name: t.full_name, email: str(t.email).toLowerCase(), tabs: tabs(roleText) };
  });
  templateRoles.push({ roleName: "Landlord", routingOrder: "2", name: landlord.name, email: landlord.email, tabs: tabs(landlordText) });
  return {
    definition: { templateId: ids.N11, templateRoles },
    prefill,
    recipients: [
      ...tenants.map((t, i) => ({ role: `Tenant ${i + 1}`, name: t.full_name, email: t.email, routing_order: 1, status: "created" })),
      { role: "Landlord", name: landlord.name, email: landlord.email, routing_order: 2, status: "created" },
    ],
    terms: {
      type: "N11",
      n11_request_id: request.id,
      termination_date: request.termination_date,
      tenants: tenants.map((t) => t.full_name),
    },
  };
}

// The lease fields that depend on the property and landlord, for moving a draft lease to another unit.
export function leaseMoveValues({ unitLabel, address, city, postalCode, landlordName, landlord2Name = "", signerName }) {
  const street = splitStreet(address);
  const unit = unitNumber(unitLabel);
  const unitAddress = [[unit, [street.number, street.name].filter(Boolean).join(" ")].filter(Boolean).join("-"), str(city), "ON", str(postalCode)]
    .filter(Boolean)
    .join(", ");
  const cs = splitName(signerName);
  return {
    "Landlord Legal Name": str(landlordName),
    "Landlord 2 Legal Name": str(landlord2Name),
    Unit: unit,
    "Street Number": street.number,
    "Street Name": street.name,
    City: str(city),
    "Postal Code": str(postalCode),
    "Landlord Signer Name": str(signerName),
    "Consent Landlord Name": `${str(landlordName) || "The landlord"} c/o ${REP.company}`,
    "Consent Rental Unit Address": unitAddress,
    "Consent Landlord First Name": cs.first,
    "Consent Landlord Last Name": cs.last,
  };
}
