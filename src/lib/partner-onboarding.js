// Chuck's onboarding checklist (Rishi ticks these off in the staff portal) and the areas his adoption is tracked on.
// Keys are stored in partner_onboarding_checks, so don't rename them.
export const ONBOARDING_PARTNER_ID = "bee3f28a-a809-4a19-86d2-a0647e3fb576";

// Grouped by priority for IRep (High first). Minutes are rough, with Chuck doing each step on his own phone.
export const CHECKLIST = [
  {
    day: "High: Must Do (about 2 hrs 50 min)",
    note: "Without these, notices, billing and leasing stall or wait on Rosie.",
    items: [
      ["signin", "Signs in at ireppm.ca/agent with chuck@ireppm.ca on his phone", 15],
      ["signin_email", "Finds the sign-in email in his Gmail", 5],
      ["home_screen", "IRep added to his phone's home screen", 5],
      ["notifications", "Turns on Phone Notifications in the Agent Portal and gets the test notification", 10],
      ["help", "Knows the Help: What Do I Do? button: taps a topic and asks a question", 5],
      ["serve_notice", "Marks a notice delivered in Notices to Serve (date and method, Other with details)", 20],
      ["sign_cert", "Signs the Certificate of Service that arrives", 10],
      ["unsigned_certs", "Signs the 7 certificates waiting since Nov 17–20", 20],
      ["open_n4s", "Answers about the 150 Curry and 1746 Buckingham N4s", 10],
      ["job_done", "Marks a job done: date, what he did, his price (taps Before HST or Includes HST; the portal does the math), after photos", 20],
      ["already_done", "Logs work he already finished (goes to IRep for review)", 10],
      ["vacancy", "Puts a vacancy up, adds photos, copies the Facebook text", 20],
      ["apply_link", "Replies to a Facebook enquiry with the apply link instead of collecting documents", 10],
      ["showed_it", "Taps I Showed It after each showing he set up himself", 2],
      ["book_landlord", "Uses Email the Landlord to Book It on an approved inspection job", 5],
      ["joel", "Joel Propheth's $350: was the Oct 8 $250 his, and where's the $100?", 10],
    ],
  },
  {
    day: "Medium: Should Do (about 1 hr 10 min)",
    note: "Makes his day easier and saves back-and-forth.",
    items: [
      ["portal_tour", "Can say what each part of the Agent Portal is for", 10],
      ["practice", "Tries things at 1 Practice St (TEST): a request, Job Done, cash, a vacancy (staff clear it after)", 15],
      ["maint_log", "Logs a maintenance request with photos", 15],
      ["alerts", "Opens a new-request alert email and its photo links", 10],
      ["showings", "Answers (or practises) a showing request", 10],
      ["pay_page", "Finds this month and the yearly statement on Your Pay, and sees his leasing fee share (added automatically, half to the truck loan)", 10],
    ],
  },
  {
    day: "Low: If There's Time (about 50 min)",
    note: "Mostly self-explanatory; fine to skip and let him find it.",
    items: [
      ["cash_log", "Logs a cash payment with Log Cash", 5],
      ["cash_deposit", "Ticks cash off as deposited, with the date", 5],
      ["deposit_photo", "Takes a photo of every deposit slip", 2],
      ["properties", "Checks his properties list (anything wrong goes to Rosie)", 5],
      ["inspection", "Does an inspection: taps each part, adds photos, prices each repair, sends it to the landlord (Start From Last Time fills in the rest)", 15],
      ["visits", "Logs a lawn or snow visit with a photo (Lawn and Snow)", 5],
      ["qr_sign", "Prints a QR For Rent sign for a vacancy", 5],
      ["weekly", "Knows the Monday morning summary lists his week", 2],
    ],
  },
  {
    day: "His Business (separate session, 1 to 3 hrs)",
    note: "Chuck Fixed My House: bank accounts, invoices, HST, receipts, and his own Claude helper. Rishi plans this on its own.",
    items: [["business", "Chuck Fixed My House set-up reviewed (emails, invoices, HST, receipts, bank)", 60]],
  },
];

export const AREAS = [
  ["signin", "Signing in"],
  ["cash", "Logging cash and deposits"],
  ["jobs", "Maintenance and Job Done"],
  ["notices", "Notices to Serve and certificates"],
  ["vacancies", "Vacancies and photos"],
  ["photos", "Photos on every job"],
];
export const RATINGS = { not_yet: "Not yet", learning: "Learning", own: "On his own" };
