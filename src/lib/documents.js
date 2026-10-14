// Documents a renter keeps in their profile. They attach to every application.
export const INCOME_TYPES = {
  student: {
    label: "Student",
    doc: "Acceptance letter",
    desc: "Your letter of acceptance or enrolment from your school.",
  },
  employed: {
    label: "Employed",
    doc: "Job letter",
    desc: "A letter from your employer with your role, start date and pay.",
  },
  support: {
    label: "Receiving support",
    doc: "Statement of support",
    desc: "A letter from a guardian, or a funding letter from ODSP, Ontario Works or another public program.",
  },
};

export const DOC_TYPES = [
  {
    key: "photo_id",
    name: "Photo ID",
    desc: "Driver's licence, passport or Ontario Photo Card.",
    required: true,
  },
  { key: "income", name: "Proof of income", desc: "", required: true },
  { key: "paystubs", name: "Recent paystubs", desc: "Your two most recent, in one file.", required: false },
  {
    key: "bank_statement",
    name: "Recent bank statement",
    desc: "Proof of funds. You can black out account numbers.",
    required: false,
  },
  {
    key: "credit_report",
    name: "Credit report",
    desc: "Only if you already have a recent one. We can run the check for you instead.",
    required: false,
  },
];

export const CONSENT_TEXT =
  "I authorize IRep Property Management to obtain a consumer credit report about me through its tenant screening provider, for the purpose of evaluating my rental application.";

export const MAX_FILE_MB = 10;
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.webp";
export const DOC_BUCKET = "applicant-docs";
