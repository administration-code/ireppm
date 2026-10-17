import { SITE } from "@/lib/site";

// Default values for the DocuSign forms. Change wording here, not in the components.

export const IREP_SIGNER = {
  name: "Rishi Bakshi",
  firstName: "Rishi",
  lastName: "Bakshi",
  email: "ireppm@ireprealty.com",
  phone: SITE.phone,
};

// Who signs the Certificate of Service by default (the person who delivered the notice).
export const DEFAULT_DELIVERER = { name: "Zan Greksa", email: "chuckfixedmyhouse@gmail.com" };

export const LEASE_DEFAULTS = {
  rentPayableTo: "IRep Property Management, agent for the landlord",
  paymentMethods: "Interac e-Transfer to payment@ireppm.ca",
  nsfCharge: "20.00",
  smokingRules: "See Schedule A.",
  emergencyContact: `${SITE.name} ${SITE.phone}, ${SITE.email}`,
  noticeAddress: {
    unit: SITE.office.unit,
    streetNumber: SITE.office.streetNumber,
    streetName: SITE.office.streetName,
    poBox: "",
    city: SITE.office.city,
    province: SITE.office.province,
    postalCode: SITE.office.postalCode,
  },
  landlordEmail: SITE.email,
};

// IRep's office details (letters, receipts). IRep never signs N-forms or agreements for a landlord.
export const REP = {
  company: SITE.name,
  streetNumber: SITE.office.streetNumber,
  streetName: SITE.office.streetName,
  unit: SITE.office.unit,
  address: `${SITE.office.streetNumber} ${SITE.office.streetName}, Unit ${SITE.office.unit}`,
  city: SITE.office.city,
  province: SITE.office.provinceCode,
  postalCode: SITE.office.postalCode,
  phone: SITE.phone,
  email: SITE.email,
  fax: "",
};
