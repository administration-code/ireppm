// What Chuck can do in the Agent Portal, as short "how do I" answers. Used by the Help page buttons (shown as-is)
// and given to the helper AI so its answers match the portal.
export const HELP_TOPICS = [
  {
    key: "cash_in",
    q: "A tenant gave me cash",
    steps: ["Tap Log Cash.", "Pick the tenant. The rent fills in.", "Check the amount and tap Save."],
    href: "/agent/cash",
    go: "Log Cash",
  },
  {
    key: "cash_bank",
    q: "I deposited cash at the bank",
    steps: ["Tap Log Cash.", "Under Cash You're Holding, tick what you deposited.", "Pick the date and tap I Deposited. Keep a photo of the slip."],
    href: "/agent/cash",
    go: "Log Cash",
  },
  {
    key: "job_done",
    q: "I finished a job",
    steps: ["Find the job under Open Jobs and tap Job Done.", "Say what you did and your price before HST. Add after photos.", "Tap Send to IRep."],
    href: "/agent#jobs",
    go: "Open Jobs",
  },
  {
    key: "inspection",
    q: "I'm doing an inspection",
    steps: [
      "Tap Inspection report and pick the property. Tap an answer for each part and add photos under it.",
      "Tap Next: Quote the Repairs. Put your price before HST on each item; the total with HST adds up at the bottom.",
      "Tap Inspection Complete: Send to Landlord. It goes straight to them. It saves as you go, or tap Save and Finish Later.",
      "Approved items show up under Open Jobs. Email the landlord to book it. It's billed on a separate invoice, not taken off rent.",
    ],
    href: "/agent/inspection",
    go: "Inspection Report",
  },
  {
    key: "found",
    q: "I found something that needs fixing",
    steps: ["Tap Log a request.", "Pick the property and unit, say what's wrong, add photos.", "Tap Send. If you already fixed it, tick This work is already done."],
    href: "/agent#log",
    go: "Log a Request",
  },
  {
    key: "notice",
    q: "I delivered a notice (N4, N5)",
    steps: ["Tap Notices to Serve. Print it: Open the Signed N4, then Share → Print. Hand it over, or slide it under the door or mail slot. Don't tape it to the door.", "Tap I Delivered It, pick the date and how.", "Tap Sign Now under Certificates to Sign."],
    href: "/agent/notices",
    go: "Notices to Serve",
  },
  {
    key: "vacancy",
    q: "A unit is for rent (Facebook post)",
    steps: ["Tap Vacancies, pick the unit, fill in rent and date, tap Put It Up.", "Add photos, then tap Copy Facebook Text and post it.", "When someone messages you, tap Copy Apply Link and send it to them."],
    href: "/agent/vacancies",
    go: "Vacancies",
  },
  {
    key: "showing",
    q: "Someone wants to see a unit",
    steps: ["Showing requests are under Showings with an email to you.", "Tap the button to approve, decline or pick another time.", "Only go in at the confirmed time."],
    href: "/agent#showings",
    go: "Showings",
  },
  {
    key: "pay",
    q: "What am I getting paid?",
    steps: ["Tap Your pay and tax statement.", "Tap a month to see what it was for.", "The yearly statement at the bottom is for your accountant."],
    href: "/agent/pay",
    go: "Your Pay",
  },
  {
    key: "alerts",
    q: "Get job alerts on my phone",
    steps: ["iPhone: add IRep to your home screen first and open it from there.", "Under Phone Notifications, tap Turn On, then Allow.", "A test notification should pop up."],
    href: "/agent#push",
    go: "Phone Notifications",
  },
  {
    key: "practice",
    q: "I want to practise without messing anything up",
    steps: ["Use 1 Practice St (TEST). It's not a real property.", "Log a request, mark it done, log cash for Practice Tenant, or put the Lower unit up.", "Rishi or Rosie clears it after."],
    href: "/agent",
    go: "Agent Portal",
  },
];

export const HELPER_PROMPT = `You help Chuck (Zan Greksa), IRep Property Management's maintenance lead in Windsor, Ontario, use the IRep Agent Portal on his phone.
Answer in plain, simple words, like a friendly coworker. At most 4 short numbered steps. No jargon, no long explanations.
Only explain how to do things in the Agent Portal, from this list:
${HELP_TOPICS.map((t) => `- ${t.q}: ${t.steps.join(" ")}`).join("\n")}
Other facts:
- Sign in at ireppm.ca/agent with chuck@ireppm.ca; the sign-in link comes to his Gmail. Don't use Continue with Google.
- Prices are always before HST. If a supplier's total includes HST, divide by 1.13.
- Log cash the same day, deposit within 3 days, photo of every slip. Tenant cash never goes into his own bank account.
- Deliver notices within 2 days. Ways to serve: hand to the tenant or an adult in the unit, under the door or mail slot, in their mailbox, or by mail (adds 5 days). Never tape it to the door.
- To print a notice from his phone: Open the Signed N4, then Share, then Print, and pick his Wi-Fi printer.
- Emergencies (flooding, no heat, fire, gas): deal with safety first, call 911 if anyone is in danger, then tell IRep.
- Don't enter a unit unless the job says he may, or the tenant agreed a time.
If the question is about money owed to him, a landlord or tenant problem, legal questions, or anything not in the list, say: "Ask Rosie: email administration@ireppm.ca or call the office at 519-590-7200." Never make up a feature or a button.`;
