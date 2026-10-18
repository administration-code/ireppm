// What a declined applicant is told (Ontario Consumer Reporting Act, s. 10). When a decision is based
// wholly or partly on a credit report, or on information from someone else (a reference, employer or
// previous landlord), the applicant must be told so when they hear the decision, and may ask within
// 60 days for the source. We name the credit bureau up front so they don't have to ask.

// FrontLobby's Canadian credit reports are Equifax reports.
export const CREDIT_BUREAU = {
  name: "Equifax Canada",
  via: "FrontLobby, our tenant screening provider",
  address: "Equifax Canada Co., National Consumer Relations, Box 190, Montréal, QC H1S 2Z2",
  phone: "1-800-465-7166",
  web: "www.equifax.ca",
};

export const DECLINE_REASONS = {
  credit: "The credit report",
  other: "Information from someone else (a reference, employer or previous landlord)",
  neither: "Neither (e.g. the landlord chose another applicant, or income or documents fell short)",
};

export function declineLines({ name, place, reasons = [] }) {
  const credit = reasons.includes("credit");
  const other = reasons.includes("other");
  const lines = [
    `Hi ${String(name || "").trim().split(/\s+/)[0] || "there"},`,
    `Thank you for applying to rent ${place}. We're sorry to let you know that your application wasn't successful this time.`,
  ];
  if (credit)
    lines.push(
      `Credit report: This decision was based in whole or in part on information in a credit report about you. The report came from ${CREDIT_BUREAU.name}, through ${CREDIT_BUREAU.via}. ${CREDIT_BUREAU.name} didn't make this decision and can't tell you why it was made.`,
      `You have the right to a free copy of your credit file from ${CREDIT_BUREAU.name} and to dispute anything in it that's wrong:\n• ${CREDIT_BUREAU.address}\n• ${CREDIT_BUREAU.phone}\n• ${CREDIT_BUREAU.web}`
    );
  if (other)
    lines.push(
      "Other information: This decision was also based in whole or in part on information from someone other than a credit bureau, such as a reference, employer or previous landlord. If you ask us within 60 days of this email, we'll tell you what that information was and where it came from."
    );
  if (credit || other)
    lines.push("These rights come from Ontario's Consumer Reporting Act. To ask, simply reply to this email.");
  lines.push(
    "Your documents stay in your profile, so you can apply for another of our rentals without uploading them again. We delete them within 90 days if you don't apply again, or sooner if you ask.",
    "We'd be glad to help you find another home. You can see what's available on our website."
  );
  return lines;
}
