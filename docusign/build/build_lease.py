"""Ontario Standard Lease (2229E, version printed with 2 landlords and 8 tenants) + IRep Schedule A."""
import sys
sys.path.insert(0, ".")
import tplkit
from tplkit import Doc, build

tplkit.DATE_FORMAT = "yyyy/MM/dd"   # the Standard Lease asks for yyyy/mm/dd
U = "/root/.claude/uploads/2381269b-ca4b-59d5-8f40-7d48650787bf/"
OUT = "out/"
MAX_TENANTS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
SUFFIX = sys.argv[2] if len(sys.argv) > 2 else ""

osl = Doc(1, U + "7aecbb2e-osl.pdf", "Residential Tenancy Agreement (Standard Form of Lease) 2229E")
sch = Doc(2, U + "a46d35bb-Tenant_-_Schedule_A.pdf", "Schedule A - Additional Terms")
con = Doc(3, "consent_multi.pdf", "Consent to Service by Email (LTB form + additional tenants)")
con.date_format = "dd/MM/yyyy"     # the LTB consent form asks for dd/mm/yyyy
CONSENT = [("Rent Increase", "Doc1[0]"), ("Notice Of Entry", "Doc2[0]"), ("LTB Documents", "Doc3[0]"), ("Tenancy Communication", "Doc4[0]")]
CONSENT_X = (308, 360, 412, 464)

def consent_items(i):
    """Tenant i's consent fields: the LTB form for tenant 1, the extra page for tenants 2-8."""
    if i == 1:
        items = [("text", "Tenant 1 Consent Name", 1, "NameTenant[0]"), ("text", "Tenant 1 Consent Email", 1, "EmailTenant[0]")]
        items += [("check", f"Consent {lab} (Tenant 1)", 1, fld, "/1") for lab, fld in CONSENT]
        items += [("text", "Tenant 1 Consent First Name", 1, "FirstName[0]", None, 0),
                  ("text", "Tenant 1 Consent Last Name", 1, "LastName[0]", None, 0),
                  ("sign", "Tenant 1 Consent Signature", 1, "Signature[0]", None, 0),
                  ("date", "Tenant 1 Consent Date", 1, "DateSigned[0]", None, 0)]
        return [(con, x) for x in items]
    top = 150 + (i - 2) * 82
    items = [("text", f"Tenant {i} Consent Name", 2, None, 68, top + 14, 220, 11),
             ("text", f"Tenant {i} Consent Email", 2, None, 68, top + 34, 220, 11)]
    items += [("check", f"Consent {lab} (Tenant {i})", 2, None, x, top + 19, 11, 11) for (lab, _), x in zip(CONSENT, CONSENT_X)]
    items += [("sign", f"Tenant {i} Consent Signature", 2, None, 82, top + 62, 200, 1),
              ("date", f"Tenant {i} Consent Date", 2, None, 472, top + 58, 104, 12)]
    return [(con, x) for x in items]

def T(label, page, x, top, w, h=12):
    return ("lockedtext", label, page, None, x, top, w, h)

def C(label, page, x, top):
    return ("lockedcheck", label, page, None, x, top, 11, 11)

L = []
# --- Page 1: parties, start of rental unit
L += [T("Landlord Legal Name", 1, 150, 317, 440, 20), T("Landlord 2 Legal Name", 1, 150, 344, 440, 20)]
for i, y in enumerate((456, 483, 510, 537, 564, 591, 618, 645), start=1):
    L += [T(f"Tenant {i} Last Name", 1, 92, y - 7, 262, 15), T(f"Tenant {i} First Name", 1, 420, y - 7, 170, 15)]
L += [T("Unit", 1, 22, 749, 190, 11), T("Street Number", 1, 220, 749, 84, 11), T("Street Name", 1, 310, 749, 280, 11)]
# --- Page 2: rest of rental unit, contact, term, rent
L += [T("City", 2, 22, 37, 282, 11), T("Postal Code", 2, 508, 37, 82, 11),
      T("Parking", 2, 22, 74, 568, 14),
      C("Condo Yes", 2, 21, 116), C("Condo No", 2, 70, 116),
      T("Notice Unit", 2, 22, 212, 82, 11), T("Notice Street Number", 2, 110, 212, 88, 11),
      T("Notice Street Name", 2, 203, 212, 315, 11), T("Notice PO Box", 2, 525, 212, 65, 11),
      T("Notice City", 2, 22, 239, 245, 11), T("Notice Province", 2, 272, 239, 195, 11),
      T("Notice Postal Code", 2, 470, 239, 120, 11),
      C("Email Notices Yes", 2, 21, 288), C("Email Notices No", 2, 70, 288),
      T("Notice Emails", 2, 22, 319, 568, 16),
      C("Emergency Contact Yes", 2, 21, 358), C("Emergency Contact No", 2, 70, 358),
      T("Emergency Contact", 2, 22, 389, 568, 14),
      T("Start Date", 2, 129, 475, 88),
      C("Fixed Term", 2, 21, 522), T("End Date", 2, 184, 521, 90),
      C("Monthly Tenancy", 2, 21, 547),
      C("Other Term", 2, 21, 569), T("Other Term Details", 2, 238, 569, 346),
      T("Rent Due Day", 2, 151, 657, 104),
      C("Rent Per Month", 2, 39, 679), C("Rent Per Other", 2, 39, 700), T("Rent Other Period", 2, 154, 700, 350),
      T("Base Rent", 2, 361, 743, 148)]
# --- Page 3: parking rent, other charges, payment, partial rent, NSF, services
L += [T("Parking Rent", 3, 361, 25, 148)]
for i, top in enumerate((65, 87, 110), start=1):
    L += [T(f"Other Charge {i} Description", 3, 75, top, 277), T(f"Other Charge {i} Amount", 3, 361, top, 148)]
L += [T("Total Rent", 3, 361, 127, 148),
      T("Rent Payable To", 3, 22, 224, 568, 14), T("Payment Methods", 3, 22, 268, 568, 14),
      T("Partial Rent Amount", 3, 445, 337, 107), T("Partial Rent Date", 3, 41, 359, 82),
      T("Partial Rent From", 3, 353, 361, 83), T("Partial Rent To", 3, 457, 361, 85),
      T("NSF Charge", 3, 158, 417, 108)]
services = [("Gas", 536), ("Air Conditioning", 558), ("Storage", 580), ("Laundry", 601), ("Guest Parking", 622),
            ("Other Service 1", 643), ("Other Service 2", 664), ("Other Service 3", 686)]
for name, y in services:
    L += [C(f"{name} Yes", 3, 342, y - 6), C(f"{name} No", 3, 386, y - 6)]
for name, y in (("Laundry", 601), ("Guest Parking", 622)):
    L += [C(f"{name} No Charge", 3, 422, y - 6), C(f"{name} Pay Per Use", 3, 494, y - 6)]
for i, top in enumerate((635, 657, 679), start=1):
    L += [T(f"Other Service {i} Name", 3, 69, top, 251)]
# --- Page 4: services details (continued area), utilities, discounts, rent deposit
L += [T("Services Details", 4, 22, 10, 568, 108)]
for name, y in (("Electricity", 163), ("Heat", 185), ("Water", 207)):
    L += [C(f"{name} Landlord", 4, 76, y - 6), C(f"{name} Tenant", 4, 148, y - 6)]
L += [T("Utilities Details", 4, 22, 252, 568, 110),
      C("No Rent Discount", 4, 21, 415), C("Rent Discount", 4, 21, 455), T("Rent Discount Details", 4, 22, 487, 568, 65),
      C("No Rent Deposit", 4, 21, 653), C("Rent Deposit", 4, 21, 693), T("Rent Deposit Amount", 4, 207, 693, 95)]
# --- Page 5: key deposit, smoking, insurance
L += [C("No Key Deposit", 5, 21, 134), C("Key Deposit", 5, 21, 170), T("Key Deposit Amount", 5, 254, 171, 96),
      T("Key Deposit Details", 5, 22, 227, 568, 62),
      C("No Smoking Rules", 5, 21, 418), C("Smoking Rules", 5, 21, 454), T("Smoking Rules Details", 5, 22, 492, 568, 60),
      C("No Insurance Required", 5, 21, 666), C("Insurance Required", 5, 21, 703)]
# --- Page 6: additional terms
L += [C("No Additional Terms", 6, 21, 667), C("Additional Terms Attached", 6, 21, 711)]

def sign_row(doc, page, row_top, who, label=None):
    items = []
    if label:
        items.append((doc, ("label", f"{who} Row Label", page, None, 22, row_top + 1, 120, 11, label)))
    items += [(doc, ("lockedtext", f"{who} Signer Name", page, None, 22, row_top + 17, 225, 14)),
              (doc, ("sign", f"{who} Signature", page, None, 258, row_top + 24, 200, 14)),
              (doc, ("date", f"{who} Date Signed", page, None, 472, row_top + 17, 110, 14))]
    return items

landlord_items = [(osl, x) for x in L] + sign_row(osl, 7, 234, "Landlord")
landlord_items += [(sch, T("Guarantor Name", 2, 167, 395, 87)),
                   (sch, ("sign", "Landlord Schedule A Signature", 2, None, 92, 458, 136, 1)),
                   (sch, ("date", "Landlord Schedule A Date", 2, None, 92, 532, 136, 14))]
landlord_items += [(con, x) for x in [
    ("lockedtext", "Consent Landlord Name", 1, "NameLandlord[0]"),
    ("lockedtext", "Consent Landlord Email", 1, "EmailLandlord[0]"),
    ("lockedtext", "Consent Rental Unit Address", 1, "AddressRentalUnit[0]"),
    ("lockedtext", "Consent Landlord First Name", 1, "FirstName[0]", None, 1),
    ("lockedtext", "Consent Landlord Last Name", 1, "LastName[0]", None, 1),
    ("sign", "Landlord Consent Signature", 1, "Signature[0]", None, 1),
    ("date", "Landlord Consent Date", 1, "DateSigned[0]", None, 1)]]

roles = [{"role": "Landlord", "type": "signer", "routing": 2, "items": landlord_items}]
tenant_rows = {1: 320, 2: 360, 3: 400, 4: 440, 5: 570, 6: 610, 7: 650, 8: 690}
for i in range(1, MAX_TENANTS + 1):
    label = f"Tenant {i}:" if i >= 5 else None   # rows 5-8 sit below the form's printed table
    items = sign_row(osl, 7, tenant_rows[i], f"Tenant {i}", label)
    if i == 1:
        items += [(sch, ("sign", "Tenant 1 Schedule A Signature", 2, None, 240, 458, 136, 1)),
                  (sch, ("date", "Tenant 1 Schedule A Date", 2, None, 240, 532, 136, 14))]
    else:
        k = i - 2                                  # 7 more tenants: 2 per row on Schedule A, page 2
        top = 562 + (k // 2) * 42
        x = 92 if k % 2 == 0 else 320
        items += [(sch, ("label", f"Tenant {i} Schedule A Label", 2, None, x, top, 60, 11, f"Tenant {i}:")),
                  (sch, ("sign", f"Tenant {i} Schedule A Signature", 2, None, x, top + 26, 136, 1)),
                  (sch, ("date", f"Tenant {i} Schedule A Date", 2, None, x + 140, top + 14, 80, 14))]
    items += consent_items(i)
    roles.append({"role": f"Tenant {i}", "type": "signer", "routing": 1, "items": items})
roles.append({"role": "Guarantor", "type": "signer", "routing": 1, "items": [
    (sch, ("sign", "Guarantor Signature", 2, None, 384, 458, 136, 1)),
    (sch, ("date", "Guarantor Date Signed", 2, None, 384, 532, 136, 14))]})
roles.append({"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com", "routing": 3})

build("Ontario Standard Lease" + SUFFIX,
      "Ontario Residential Tenancy Agreement (2229E) and IRep Schedule A. Fields are named so the IRep website can fill them in. "
      "Includes the Consent to Service by Email (LTB form for tenant 1, extra page for tenants 2-8).",
      "Lease - [Address]", U + "f8aa02fb-MainLease.json", [osl, sch, con], roles, OUT)
