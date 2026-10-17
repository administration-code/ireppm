"""N11 - Agreement to End the Tenancy (LTB, v. 01/04/2022). Tenants 1-8 sign, then the landlord (IRep as agent)."""
import sys
sys.path.insert(0, ".")
import tplkit
from tplkit import Doc, build

tplkit.DATE_FORMAT = "dd/MM/yyyy"
SRC = sys.argv[1]
OUT = "out/"
MAX_TENANTS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
SUFFIX = sys.argv[3] if len(sys.argv) > 3 else ""
BASE = "out/N4 - Non-Payment of Rent (2026-09).json"

n11 = Doc(1, SRC, "N11 - Agreement to End the Tenancy")

def phone(prefix, page, top):
    return [("text", f"{prefix} Phone Area", page, None, 42, top, 44, 12),
            ("text", f"{prefix} Phone Prefix", page, None, 100, top, 40, 12),
            ("text", f"{prefix} Phone Line", page, None, 152, top, 55, 12)]

# Page 1 data and Tenant 1's block are owned by Tenant 1 (locked); the landlord block by Landlord.
t1 = [("lockedtext", "Tenant Names", 1, "TO_TenameName[0]"),
      ("lockedtext", "Landlord Name", 1, "From_LandlordName[0]"),
      ("lockedtext", "Rental Unit Address", 1, "RentalUnitAddress[0]"),
      ("lockedtext", "Termination Day", 1, None, 393, 196, 24, 12),
      ("lockedtext", "Termination Month", 1, None, 430, 196, 24, 12),
      ("lockedtext", "Termination Year", 1, None, 467, 196, 52, 12),
      ("lockedtext", "Tenant 1 First Name", 2, "RFirstName[0]", None, 0),
      ("lockedtext", "Tenant 1 Last Name", 2, "RLastName[0]", None, 0)] + phone("Tenant 1", 2, 142) + [
      ("sign", "Tenant 1 Signature", 2, "Signature[0]", None, 0),
      ("date", "Tenant 1 Date Signed", 2, "SignDate[0]", None, 0)]
roles = [{"role": "Tenant 1", "type": "signer", "routing": 1, "items": [(n11, x) for x in t1]}]

for i in range(2, MAX_TENANTS + 1):
    top = 454 + (i - 2) * 29
    items = []
    if i == 2:
        items.append(("label", "Additional Tenants Heading", 2, None, 28, 438, 400, 12,
                      "Signatures of the other tenants named above"))
    items += [("label", f"Tenant {i} Row Label", 2, None, 28, top + 4, 52, 11, f"Tenant {i}:"),
              ("lockedtext", f"Tenant {i} Name", 2, None, 82, top + 2, 170, 13),
              ("sign", f"Tenant {i} Signature", 2, None, 262, top + 16, 150, 1),
              ("date", f"Tenant {i} Date Signed", 2, None, 470, top + 2, 110, 13)]
    roles.append({"role": f"Tenant {i}", "type": "signer", "routing": 1, "items": [(n11, x) for x in items]})

ll = [("lockedtext", "Landlord First Name", 2, "RFirstName[1]"),
      ("lockedtext", "Landlord Last Name", 2, "RLastName[1]")] + \
     [("lockedtext", *rest) for (_, *rest) in phone("Landlord", 2, 350)] + [
      ("sign", "Landlord Signature", 2, "Signature[1]"),
      ("date", "Landlord Date Signed", 2, "SignDate[1]")]
roles.append({"role": "Landlord", "type": "signer", "routing": 2, "items": [(n11, x) for x in ll]})
roles.append({"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com", "routing": 3})

build("N11 - Agreement to End the Tenancy (2022-04)" + SUFFIX,
      "LTB N11, requested from the IRep tenant portal. Tenants 1-8 sign, then the landlord (IRep as agent).",
      "N11 - Agreement to End Tenancy - [Address]", BASE, [n11], roles, OUT)
