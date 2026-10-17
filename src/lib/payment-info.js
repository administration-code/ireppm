// How tenants pay rent. Used on the tenant portal, the welcome email and the resources page.
export const PAYMENT_INFO = {
  preferred: "PayProp",
  preferredSteps: [
    "Watch for your PayProp welcome letter. It comes from PayProp, not from us, and has your unique Bill Payment Reference ID.",
    "Pay through your online or mobile banking as a bill payment, using that reference ID as the account number (the letter shows which payee to add). You can also pay at your bank branch or sign up for pre-authorized debit.",
    "Your payments are matched to your lease automatically, and you get a receipt every time.",
  ],
  draw: "Pay your rent in full through PayProp on or before the 7th of the month and you're entered into that month's draw for a $100 Visa or Mastercard gift card.",
  fallback: "Interac e-Transfer to payment@ireppm.ca, on request",
  fallbackNote:
    "If you can't use PayProp, ask us and we'll set you up for e-Transfer instead. Put your unit address in the message so we can match it.",
  etransferEmail: "payment@ireppm.ca",
};
