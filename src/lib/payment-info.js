// How tenants pay rent. Used on the tenant portal, the welcome email and the resources page.
export const PAYMENT_INFO = {
  preferred: "PayProp",
  preferredSteps: [
    "Watch for an email invitation from PayProp after you sign your lease.",
    "Create your PayProp account and set up your rent payment (pre-authorized debit is easiest).",
    "Your payments are matched to your lease automatically, and you get a receipt every time.",
  ],
  fallback: "Interac e-Transfer to payment@ireppm.ca, on request",
  fallbackNote:
    "If you can't use PayProp, ask us and we'll set you up for e-Transfer instead. Put your unit address in the message so we can match it.",
  etransferEmail: "payment@ireppm.ca",
};
