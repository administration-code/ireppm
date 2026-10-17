// Landlord guides (public). General information for Ontario residential tenancies, not legal advice.
// Block types: ["p", text] | ["h", text] | ["list", [items]] | ["table", headers, rows] | ["note", text]

export const GUIDES = [
  {
    slug: "notices-who-does-what",
    title: "Notices: who does what, and when you step in",
    summary:
      "Every common Ontario tenancy notice, who prepares and serves it, and the points where we need your decision.",
    updated: "October 2026",
    body: [
      ["p", "Most notices in a tenancy are routine, and IRep handles them from start to finish. A few need your decision first, and a few the law says only you can sign. This guide sets out which is which."],
      ["h", "At a glance"],
      [
        "table",
        ["Notice", "What it's for", "IRep does", "You step in"],
        [
          ["Written notice of entry", "Showings, inspections, non-urgent repairs", "Gives at least 24 hours' written notice, entry between 8 a.m. and 8 p.m.", "Never. Tell us if you want to attend."],
          ["N1: rent increase", "Raising the rent", "Flags when a tenancy is eligible, works out the guideline amount, serves the N1 at least 90 days ahead", "Approve the new rent before we serve it"],
          ["N4: unpaid rent", "Rent is overdue", "Serves the N4 the day after rent is late, follows up, reports missed rent through FrontLobby", "Decide whether to file an L1 with the Landlord and Tenant Board if it isn't paid"],
          ["N5: damage or interference", "Damage, disturbing others, overcrowding", "Documents the problem and serves the N5", "Approve serving it, and decide on an L2 application if it continues"],
          ["N12: you or family moving in", "Ending a tenancy for your own use", "Prepares the form and the compensation payment, and serves it", "You sign it and the declaration. You or your family must genuinely intend to live there for at least a year"],
          ["N13: renovation or demolition", "Major work that needs the unit empty", "Prepares the form once permits are in place", "You decide, and you sign. Compensation and tenants' rights to return depend on the building"],
          ["N9: tenant gives notice", "The tenant is leaving", "Confirms the date, starts the turnover and listing, books the move-out inspection", "Only if you want to change the rent or the unit before re-renting"],
          ["N11: agreement to end", "You and the tenant agree on a move-out date", "Prepares the agreement and gets it signed", "Approve the date and any payment to the tenant"],
        ],
      ],
      ["h", "Unpaid rent, step by step"],
      [
        "list",
        [
          "Rent is due on the first. On the 2nd we contact the tenant, and from the 3rd we can serve an N4.",
          "The N4 gives a termination date at least 14 days later for a monthly tenancy (more if it's mailed). If the tenant pays everything owed before that date, the notice is cancelled.",
          "If it's still unpaid, we ask you whether to file an L1 application with the Landlord and Tenant Board. We prepare the application and the rent ledger.",
          "The Board schedules a hearing. We prepare the evidence, and you may need to attend or have a licensed paralegal or lawyer represent you.",
          "Missed rent is reported to the credit bureaus through FrontLobby, which encourages tenants to catch up.",
        ],
      ],
      ["h", "Ending a tenancy for your own use (N12)"],
      [
        "list",
        [
          "Only you (or a purchaser who has signed an agreement to buy) can give an N12, for yourself, your spouse, a child, a parent, or a caregiver.",
          "The end date must be at least 60 days away and fall on the last day of a rental period or the end of the lease term.",
          "You must give the tenant one month's rent as compensation (or offer another acceptable unit) by the termination date.",
          "If the tenant doesn't leave, the Board needs an application and a signed declaration from the person moving in. Bad-faith N12s carry large fines, so we'll talk it through with you first.",
        ],
      ],
      ["h", "What we need from you, and how fast"],
      [
        "list",
        [
          "Rent increases: your approval about 4 months before the eligible date. We send a reminder.",
          "Unpaid rent: your decision on an L1 within a few days of the N4 deadline passing.",
          "Repairs over $250: your OK before we book anything that isn't an emergency.",
          "Applicants: your approval before we offer the lease. You'll see the screening summary in your owner portal.",
        ],
      ],
      ["note", "This is general information about Ontario's Residential Tenancies Act, not legal advice. Forms and full instructions are on the Landlord and Tenant Board's website."],
    ],
    links: [["Landlord and Tenant Board forms", "https://tribunalsontario.ca/ltb/forms/"]],
  },
  {
    slug: "rent-increase-guideline-2027",
    title: "Ontario's 2027 rent increase guideline: 1.9%",
    summary: "How much you can raise the rent in 2027, which units are exempt, and how the timing works.",
    updated: "October 2026",
    body: [
      ["p", "Ontario's rent increase guideline for 2027 is 1.9%. It's the most that landlords can raise the rent for a sitting tenant in rent-controlled units without the Landlord and Tenant Board's approval. For comparison, the 2026 guideline was 2.1%."],
      ["h", "Does it apply to your unit?"],
      [
        "list",
        [
          "Yes, if the unit was first occupied for residential purposes on or before November 15, 2018.",
          "No, if the unit was first occupied after November 15, 2018: new buildings, additions, and most new basement apartments. The guideline doesn't limit the increase, but the timing and notice rules below still apply.",
          "Between tenants, you can set the rent for a new tenant at any amount.",
        ],
      ],
      ["h", "Timing and notice"],
      [
        "list",
        [
          "At least 12 months must pass since the tenancy started or since the last increase.",
          "The tenant must get written notice on the Board's N1 form at least 90 days before the increase takes effect.",
          "A tenant can dispute an improper increase for up to 12 months after it was first charged.",
        ],
      ],
      ["h", "Example"],
      ["p", "A tenant pays $1,800 a month and moved in on March 1, 2026. From March 1, 2027 the rent can go up by 1.9%, to $1,834.20. The N1 has to be served by late November 2026."],
      ["h", "How IRep handles it"],
      ["p", "Our system flags each tenancy about 4 months before it becomes eligible. We check whether the unit is exempt, work out the amount with you, and serve the N1 on time. You approve the new rent before anything goes to the tenant."],
      ["note", "Above-guideline increases for major capital work need an application to the Board. Ask us if you've done significant work on the building."],
    ],
    links: [["Ontario: residential rent increases", "https://www.ontario.ca/page/residential-rent-increases"]],
  },
  {
    slug: "unpaid-rent-n4",
    title: "Unpaid rent: how an N4 works",
    summary: "What happens when rent is late, how the N4 notice works, and when the Landlord and Tenant Board gets involved.",
    updated: "October 2026",
    body: [
      ["p", "Most late rent is sorted out with a phone call. When it isn't, the N4 (Notice to End your Tenancy Early for Non-payment of Rent) is the formal first step."],
      ["h", "The timeline"],
      [
        "table",
        ["When", "What happens"],
        [
          ["1st", "Rent is due."],
          ["2nd", "We contact the tenant."],
          ["From the 3rd", "We can serve the N4. It sets a termination date at least 14 days later for a monthly tenancy."],
          ["Before the termination date", "If the tenant pays everything owed, the N4 is void and the tenancy carries on."],
          ["After the termination date", "With your OK, we file an L1 application with the Board."],
          ["Hearing", "The Board usually orders the rent paid, often on a payment plan, or ends the tenancy if it isn't."],
        ],
      ],
      ["h", "Good to know"],
      [
        "list",
        [
          "An N4 doesn't make the tenant leave. Only a Board order, enforced by the Sheriff, can do that.",
          "Even after an eviction order, a tenant can usually void it by paying everything owed plus costs before the Sheriff enforces it.",
          "You can't lock a tenant out, cut off utilities or keep their belongings to collect rent.",
          "Missed rent is reported to the credit bureaus through FrontLobby, which motivates many tenants to pay.",
        ],
      ],
      ["note", "General information, not legal advice. Notice periods are longer for weekly tenancies and when a notice is mailed."],
    ],
    links: [["Landlord and Tenant Board: N4 and L1", "https://tribunalsontario.ca/ltb/forms/"]],
  },
  {
    slug: "renting-near-university-of-windsor",
    title: "Renting near the University of Windsor",
    summary: "What landlords near the university should know about room rentals, lease timing and the City's rules.",
    updated: "October 2026",
    body: [
      ["p", "The neighbourhoods around the University of Windsor and St. Clair College's downtown campus have steady demand from students, many renting by the room."],
      ["h", "Leasing by the room"],
      [
        "list",
        [
          "Use a separate Ontario Standard Lease for each room, so one tenant's notice or arrears doesn't affect the others.",
          "Spell out shared spaces, utilities and parking in each lease. All-inclusive rent is common and easier to fill.",
          "First-year international students often have no Canadian credit history. Ask for a guarantor or proof of funds rather than ruling them out.",
          "Showings in an occupied house still need 24 hours' written notice, and in a rooming house only that room's tenant gets the notice.",
        ],
      ],
      ["h", "Timing"],
      [
        "list",
        [
          "Demand peaks before the September and January terms. List 6 to 10 weeks ahead.",
          "After the first lease term, Ontario tenancies carry on month to month. A student can't be required to leave in April just because classes end.",
          "Tenants who want to leave give an N9 with at least 60 days' notice, ending on the last day of a rental period.",
        ],
      ],
      ["h", "The City's rules"],
      [
        "list",
        [
          "Windsor ran a rental licensing pilot in Wards 1 and 2 (around the university) for two years. It was paused in spring 2025.",
          "In July 2026 Council decided not to bring in citywide rental licensing, choosing education and proactive enforcement of property standards instead.",
          "Property standards, zoning and the Fire Code still apply to every rental, including working smoke and carbon monoxide alarms. Rooming houses have extra zoning and fire rules, so check before converting.",
        ],
      ],
      ["note", "Rules change. Check with the City of Windsor before adding units or converting a house to rooms."],
    ],
    links: [["City of Windsor", "https://www.citywindsor.ca/"]],
  },
];

export const guideBySlug = (slug) => GUIDES.find((g) => g.slug === slug) || null;
