"""N9 - Tenant's Notice to End the Tenancy (LTB, v. 01/04/2022). Tenants 1-8 sign; IRep gets a copy."""
import sys
sys.path.insert(0, ".")
import tplkit
from tplkit import Doc, build

tplkit.DATE_FORMAT = "dd/MM/yyyy"
N9 = sys.argv[1]
OUT = "out/"
MAX_TENANTS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
SUFFIX = sys.argv[3] if len(sys.argv) > 3 else ""
BASE = "out/N4 - Non-Payment of Rent (2026-09).json"

n9 = Doc(1, N9, "N9 - Tenant's Notice to End the Tenancy")

# The form's field names are swapped: TO_TenameName sits under "To: (Landlord's name)".
t1 = [("lockedtext", "Landlord Name", 1, "TO_TenameName[0]"),
      ("lockedtext", "Tenant Names", 1, "From_LandlordName[0]"),
      ("lockedtext", "Rental Unit Address", 1, "RentalUnitAddress[0]"),
      # Termination date goes between the printed slashes: dd / mm / yyyy
      ("lockedtext", "Termination Day", 1, None, 236, 214, 24, 12),
      ("lockedtext", "Termination Month", 1, None, 276, 214, 24, 12),
      ("lockedtext", "Termination Year", 1, None, 316, 214, 48, 12),
      ("lockedcheck", "Signed As Tenant", 3, "SelectSign[0]", "/0"),
      ("lockedtext", "Tenant 1 First Name", 3, "RFirstName[0]"),
      ("lockedtext", "Tenant 1 Last Name", 3, "RLastName[0]"),
      ("text", "Tenant 1 Phone Area", 3, None, 42, 142, 44, 12),
      ("text", "Tenant 1 Phone Prefix", 3, None, 100, 142, 40, 12),
      ("text", "Tenant 1 Phone Line", 3, None, 152, 142, 55, 12),
      ("sign", "Tenant 1 Signature", 3, "Signature[0]"),
      ("date", "Tenant 1 Date Signed", 3, "SignDate[0]")]
roles = [{"role": "Tenant 1", "type": "signer", "routing": 1, "items": [(n9, x) for x in t1]}]

for i in range(2, MAX_TENANTS + 1):
    top = 250 + (i - 2) * 54
    items = []
    if i == 2:
        items.append(("label", "Additional Tenants Heading", 3, None, 28, 232, 400, 12,
                      "Signatures of the other tenants named above"))
    items += [("label", f"Tenant {i} Row Label", 3, None, 28, top, 60, 11, f"Tenant {i}:"),
              ("lockedtext", f"Tenant {i} Name", 3, None, 28, top + 14, 230, 14),
              ("sign", f"Tenant {i} Signature", 3, None, 280, top + 34, 160, 14),
              ("date", f"Tenant {i} Date Signed", 3, None, 470, top + 16, 110, 14)]
    roles.append({"role": f"Tenant {i}", "type": "signer", "routing": 1, "items": [(n9, x) for x in items]})
roles.append({"role": "Administration", "type": "cc", "name": "Rishi Bakshi", "email": "ireppm@ireprealty.com", "routing": 2})

build("N9 - Tenant's Notice to End the Tenancy (2022-04)" + SUFFIX,
      "LTB N9, filled in from the IRep tenant portal. Tenants 1-8 sign; IRep gets a copy.",
      "N9 - Notice to End Tenancy - [Address]", BASE, [n9], roles, OUT)
