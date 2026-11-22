// Chuck's onboarding checklist (Rishi ticks these off in the staff portal) and the areas his adoption is tracked on.
// Keys are stored in partner_onboarding_checks, so don't rename them.
export const ONBOARDING_PARTNER_ID = "bee3f28a-a809-4a19-86d2-a0647e3fb576";

export const CHECKLIST = [
  {
    day: "Tuesday: Sign-in and the Portal",
    items: [
      ["signin", "Signs in at ireppm.ca/agent with chuck@ireppm.ca on his phone"],
      ["signin_email", "Finds the sign-in email in his Gmail"],
      ["home_screen", "IRep added to his phone's home screen"],
      ["notifications", "Turns on Phone Notifications in the Agent Portal and gets the test notification"],
      ["portal_tour", "Can say what each part of the Agent Portal is for"],
      ["properties", "Checks his properties list (anything wrong goes to Rosie)"],
    ],
  },
  {
    day: "Wednesday: Cash, Jobs and Photos",
    items: [
      ["cash_log", "Logs a cash payment with Log Cash"],
      ["cash_deposit", "Ticks cash off as deposited, with the date"],
      ["deposit_photo", "Takes a photo of every deposit slip"],
      ["maint_log", "Logs a maintenance request with photos"],
      ["job_done", "Marks a job done: date, what he did, price before HST, after photos"],
      ["already_done", "Logs work he already finished (goes to IRep for review)"],
      ["alerts", "Opens a new-request alert email and its photo links"],
      ["showings", "Answers (or practises) a showing request"],
      ["inspection", "Knows the inspection report form"],
      ["vacancy", "Puts a vacancy up, adds photos, copies the Facebook text"],
      ["apply_link", "Replies to a Facebook enquiry with the apply link instead of collecting documents"],
    ],
  },
  {
    day: "Thursday: Serving, Pay and His Business",
    items: [
      ["serve_notice", "Marks a notice delivered in Notices to Serve (date and method, Other with details)"],
      ["sign_cert", "Signs the Certificate of Service that arrives"],
      ["unsigned_certs", "Signs the 7 certificates waiting since Nov 17–20"],
      ["open_n4s", "Answers about the 150 Curry and 1746 Buckingham N4s"],
      ["pay_page", "Finds this month and the yearly statement on Your Pay"],
      ["business", "Chuck Fixed My House set-up reviewed (emails, invoices, HST, receipts, bank)"],
      ["joel", "Joel Propheth's $350: was the Oct 8 $250 his, and where's the $100?"],
    ],
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
