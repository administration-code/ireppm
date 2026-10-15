// Business details shown across the site. Leave a value as null to hide it.
export const SITE = {
  name: "IRep Property Management",
  shortName: "IRep PM",
  url: "https://ireppm.ca",
  email: "IRepPM@IRepRealty.com",
  phone: "(519) 999-9742",
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
};

// Monthly management packages, from "IRep PM - Fee Structure.pdf".
export const PACKAGES = [
  {
    key: "standard",
    name: "Standard",
    price: "$175",
    unit: "/ month",
    note: "Additional leases at the same property: $25 each.",
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
      "Lawn and snow maintenance (lots under 4,000 sq ft)",
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
      "Major appliance coverage, up to 1 appliance per month",
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
  "Leasing only",
  "Standard",
  "Maintenance",
  "Protection",
  "Commercial or multi-unit",
];
