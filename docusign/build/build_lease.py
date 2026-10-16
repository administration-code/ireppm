import sys
sys.path.insert(0, ".")
import tplkit
from tplkit import Doc, build

tplkit.DATE_FORMAT = "yyyy/MM/dd"   # the Standard Lease asks for yyyy/mm/dd
U = "/root/.claude/uploads/2381269b-ca4b-59d5-8f40-7d48650787bf/"
OUT = "out/"
MAX_TENANTS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
SUFFIX = sys.argv[2] if len(sys.argv) > 2 else ""

osl = Doc(1, U + "d118f8fc-osl.pdf", "Residential Tenancy Agreement (Standard Form of Lease) 2229E")
sch = Doc(2, U + "a46d35bb-Tenant_-_Schedule_A.pdf", "Schedule A - Additional Terms")

def T(label, page, x, top, w, h=12):
    return ("lockedtext", label, page, None, x, top, w, h)

def C(label, page, x, top):
    return ("lockedcheck", label, page, None, x, top, 11, 11)

landlord = []
# --- Page 1: parties and rental unit
landlord += [T("Landlord Legal Name", 1, 150, 317, 440, 22)]
for i, y in enumerate((428, 455, 482, 509), start=1):
    landlord += [T(f"Tenant {i} Last Name", 1, 92, y - 7, 262, 15), T(f"Tenant {i} First Name", 1, 420, y - 7, 170, 15)]
landlord += [T("Unit", 1, 22, 611, 190, 11), T("Street Number", 1, 220, 611, 84, 11), T("Street Name", 1, 310, 611, 280, 11),
             T("City", 1, 22, 639, 282, 11), T("Postal Code", 1, 508, 639, 82, 11),
             T("Parking", 1, 22, 674, 568, 14),
             C("Condo Yes", 1, 21, 716), C("Condo No", 1, 70, 716)]
# --- Page 2: contact, term, rent
landlord += [T("Notice Unit", 2, 22, 76, 82), T("Notice Street Number", 2, 110, 76, 88), T("Notice Street Name", 2, 203, 76, 315),
             T("Notice PO Box", 2, 525, 76, 65), T("Notice City", 2, 22, 104, 245), T("Notice Province", 2, 272, 104, 195),
             T("Notice Postal Code", 2, 470, 104, 120),
             C("Email Notices Yes", 2, 21, 152), C("Email Notices No", 2, 70, 152),
             T("Notice Emails", 2, 22, 184, 568, 22),
             C("Emergency Contact Yes", 2, 21, 223), C("Emergency Contact No", 2, 70, 223),
             T("Emergency Contact", 2, 22, 254, 568, 14),
             T("Start Date", 2, 129, 340, 88),
             C("Fixed Term", 2, 21, 387), T("End Date", 2, 184, 387, 90),
             C("Monthly Tenancy", 2, 21, 412),
             C("Other Term", 2, 21, 435), T("Other Term Details", 2, 238, 434, 346),
             T("Rent Due Day", 2, 151, 523, 104),
             C("Rent Per Month", 2, 39, 544), C("Rent Per Other", 2, 39, 565), T("Rent Other Period", 2, 154, 565, 350),
             T("Base Rent", 2, 361, 608, 148), T("Parking Rent", 2, 361, 626, 148)]
for i, top in enumerate((666, 688, 711), start=1):
    landlord += [T(f"Other Charge {i} Description", 2, 75, top, 277), T(f"Other Charge {i} Amount", 2, 361, top, 148)]
landlord += [T("Total Rent", 2, 361, 728, 148)]
# --- Page 3: payment, partial rent, NSF, services
landlord += [T("Rent Payable To", 3, 22, 86, 568, 14), T("Payment Methods", 3, 22, 128, 568, 14),
             T("Partial Rent Amount", 3, 445, 197, 107), T("Partial Rent Date", 3, 41, 220, 82),
             T("Partial Rent From", 3, 353, 223, 83), T("Partial Rent To", 3, 457, 223, 85),
             T("NSF Charge", 3, 158, 277, 108)]
services = [("Gas", 396), ("Air Conditioning", 418), ("Storage", 440), ("Laundry", 462), ("Guest Parking", 484),
            ("Other Service 1", 505), ("Other Service 2", 526), ("Other Service 3", 548)]
for name, y in services:
    landlord += [C(f"{name} Yes", 3, 342, y - 6), C(f"{name} No", 3, 386, y - 6)]
for name, y in (("Laundry", 462), ("Guest Parking", 484)):
    landlord += [C(f"{name} No Charge", 3, 422, y - 6), C(f"{name} Pay Per Use", 3, 494, y - 6)]
for i, top in enumerate((497, 518, 539), start=1):
    landlord += [T(f"Other Service {i} Name", 3, 69, top, 251)]
landlord += [T("Services Details", 3, 22, 605, 568, 112)]
# --- Page 4: utilities, discounts, rent deposit
for name, y in (("Electricity", 57), ("Heat", 79), ("Water", 101)):
    landlord += [C(f"{name} Landlord", 4, 76, y - 6), C(f"{name} Tenant", 4, 148, y - 6)]
landlord += [T("Utilities Details", 4, 22, 150, 568, 100),
             C("No Rent Discount", 4, 21, 309), C("Rent Discount", 4, 21, 349), T("Rent Discount Details", 4, 22, 380, 568, 65),
             C("No Rent Deposit", 4, 21, 546), C("Rent Deposit", 4, 21, 587), T("Rent Deposit Amount", 4, 207, 587, 95)]
# --- Page 5: key deposit, smoking, insurance
landlord += [C("No Key Deposit", 5, 21, 67), C("Key Deposit", 5, 21, 102), T("Key Deposit Amount", 5, 254, 103, 96),
             T("Key Deposit Details", 5, 22, 157, 568, 62),
             C("No Smoking Rules", 5, 21, 350), C("Smoking Rules", 5, 21, 385), T("Smoking Rules Details", 5, 22, 425, 568, 58),
             C("No Insurance Required", 5, 21, 599), C("Insurance Required", 5, 21, 635)]
# --- Page 6: additional terms
landlord += [C("No Additional Terms", 6, 21, 584), C("Additional Terms Attached", 6, 21, 628)]

def sign_row(doc, page, row_top, who):
    return [(doc, ("lockedtext", f"{who} Signer Name", page, None, 22, row_top + 17, 225, 14)),
            (doc, ("sign", f"{who} Signature", page, None, 258, row_top + 24, 200, 14)),
            (doc, ("date", f"{who} Date Signed", page, None, 472, row_top + 17, 110, 14))]

landlord_items = [(osl, x) for x in landlord] + sign_row(osl, 7, 131, "Landlord")
# Schedule A, page 2: guarantor name blank, landlord signature and date
landlord_items += [(sch, T("Guarantor Name", 2, 167, 395, 87)),
                   (sch, ("sign", "Landlord Schedule A Signature", 2, None, 92, 458, 136, 1)),
                   (sch, ("date", "Landlord Schedule A Date", 2, None, 92, 532, 136, 14))]

roles = [{"role": "Landlord", "type": "signer", "routing": 2, "items": landlord_items}]
for i in range(1, MAX_TENANTS + 1):
    items = sign_row(osl, 7, {1: 217, 2: 257, 3: 296, 4: 336}[i], f"Tenant {i}")
    if i == 1:
        items += [(sch, ("sign", "Tenant 1 Schedule A Signature", 2, None, 240, 458, 136, 1)),
                  (sch, ("date", "Tenant 1 Schedule A Date", 2, None, 240, 532, 136, 14))]
    else:
        top = 560 + (i - 2) * 44
        items += [(sch, ("label", f"Tenant {i} Schedule A Label", 2, None, 92, top + 14, 140, 12, f"Tenant {i}:")),
                  (sch, ("sign", f"Tenant {i} Schedule A Signature", 2, None, 240, top + 26, 136, 1)),
                  (sch, ("date", f"Tenant {i} Schedule A Date", 2, None, 384, top + 14, 136, 14))]
    roles.append({"role": f"Tenant {i}", "type": "signer", "routing": 1, "items": items})
roles.append({"role": "Guarantor", "type": "signer", "routing": 1, "items": [
    (sch, ("sign", "Guarantor Signature", 2, None, 384, 458, 136, 1)),
    (sch, ("date", "Guarantor Date Signed", 2, None, 384, 532, 136, 14))]})
roles.append({"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com", "routing": 3})

build("Ontario Standard Lease" + SUFFIX,
      "Ontario Residential Tenancy Agreement (2229E) and IRep Schedule A. Fields are named so the IRep website can fill them in. "
      "Send the Consent to Service by Email template with it (one per tenant).",
      "Lease - [Address]", U + "f8aa02fb-MainLease.json", [osl, sch], roles, OUT)
