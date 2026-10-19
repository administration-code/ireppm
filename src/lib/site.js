// Business details shown across the site. Leave a value as null to hide it.
export const SITE = {
  name: "IRep Property Management",
  shortName: "IRep PM",
  url: "https://ireppm.ca",
  email: "administration@ireppm.ca",
  phone: "519-590-7200",
  // Emergencies (flooding, no heat, sewer backup…) go straight to Chuck, day or night.
  emergency: { name: "Chuck", phone: "519-999-9742" },
  address: "6-2557 Dougall Ave, Suite 223, Windsor, ON N8X 1T5",
  facebook: "https://www.facebook.com/IRepPM",
  hours: null, // e.g. "Mon–Fri, 9 am – 5 pm"
  primaryCity: "Windsor",
  towns: [
    "Windsor",
    "LaSalle",
    "Tecumseh",
    "Lakeshore",
    "Amherstburg",
    "Essex",
    "Kingsville",
    "Leamington",
  ],
  // The office address split up for LTB forms and the Standard Lease.
  office: {
    unit: "6, Suite 223",
    streetNumber: "2557",
    streetName: "Dougall Ave",
    city: "Windsor",
    province: "Ontario",
    provinceCode: "ON",
    postalCode: "N8X 1T5",
  },
};

// Ontario rent increase guideline (%). Units first occupied after November 15, 2018 are exempt.
export const RENT_GUIDELINE = { year: 2026, percent: 2.1 };

// Monthly management packages, from "IRep PM - Fee Structure.pdf".
export const PACKAGES = [
  {
    key: "standard",
    name: "Standard",
    price: "$175",
    unit: "/ month",
    note: "Additional units at the same property: $25 each.",
    items: [
      "Rent collection",
      "Full tenant management",
      "Property inspection twice a year, scheduled in advance",
    ],
  },
  {
    key: "maintenance",
    name: "Maintenance",
    price: "$275",
    unit: "/ month",
    note: "Our most complete hands-off option for houses.",
    featured: true,
    items: [
      "Everything in Standard",
      "Lawn and snow maintenance (lots up to 4,500 sq ft)",
      "Annual gutter cleaning",
      "Yard storm clean-up",
      "Unclogging drains and toilets",
    ],
  },
  {
    key: "protection",
    name: "Protection",
    price: "$325",
    unit: "/ month",
    note: "For landlords who want extra cover.",
    items: [
      "Everything in Maintenance",
      "Free surveillance installation (hardware remains IRep's)",
      "Major appliance coverage (fridge, stove, washer, dryer)",
    ],
  },
  {
    key: "commercial",
    name: "Commercial & multi-unit",
    price: "7–12%",
    unit: "of rent",
    note: "Quoted per property.",
    items: ["Short-term rentals", "Office and retail", "Industrial", "Multi-unit residential"],
    quote: true,
  },
];

export const COMPARISON = [
  ["Rent collection", 1, 1, 1],
  ["Full tenant management", 1, 1, 1],
  ["Inspections twice a year", 1, 1, 1],
  ["Lawn and snow", 0, 1, 1],
  ["Gutter cleaning, yearly", 0, 1, 1],
  ["Storm clean-up", 0, 1, 1],
  ["Drains and toilets unclogged", 0, 1, 1],
  ["Surveillance installation", 0, 0, 1],
  ["Major appliance coverage", 0, 0, 1],
];

export const INQUIRY_INTERESTS = [
  "Free rent estimate",
  "Leasing only",
  "Standard",
  "Maintenance",
  "Protection",
  "Commercial or multi-unit",
];

// What we promise landlords (confirmed by IRep). Shown on the home, landlords and pricing pages.
export const LANDLORD_PROMISES = [
  ["Every applicant screened", "ID, income and a credit check before you see an applicant, and you make the final call."],
  ["Showings answered within 24 hours", "Every showing request gets an answer within a day, and current tenants get proper written notice."],
  ["Paid by the 7th, or sooner", "All rent in early? Paid out the next business day. Otherwise everything received is paid out on the 7th, with a statement showing every dollar."],
  ["T776-ready year end", "Monthly statements all year, then a year-end summary laid out for your rental income tax return."],
];

export const LANDLORD_PROTECTIONS = [
  "Ontario Standard Lease, signed electronically",
  "Tenant insurance required within a week of move-in",
  "Missed rent reported to the credit bureaus through FrontLobby",
  "Inspections twice a year, scheduled in advance",
  "Repairs over $250 need your OK first (emergencies excepted)",
  "Rent increase reviews and N1 notices on time",
];

// Fee calculator rates (keep in sync with Add-ons & rates in the staff area).
export const CALC = {
  packages: [
    { key: "standard", name: "Standard", base: 175 },
    { key: "maintenance", name: "Maintenance", base: 275 },
    { key: "protection", name: "Protection", base: 325 },
  ],
  perUnit: 25,
  hst: 13,
  leasingMonths: 0.5,
  addons: [
    { key: "snow_lawn", name: "Lawn & snow (lots up to 4,500 sq ft)", amount: 50, includedIn: ["maintenance", "protection"] },
    { key: "plumbing", name: "Plumbing coverage", amount: 40, includedIn: [] },
    { key: "appliance", name: "Appliance coverage", amount: 50, includedIn: ["protection"] },
    { key: "surveillance", name: "Surveillance ($100 one-time install)", amount: 15, includedIn: ["protection"] },
  ],
};
