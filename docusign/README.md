# DocuSign templates

Upload files in `templates/` in DocuSign: Templates → ▾ next to New → Upload Template.
Each field has a plain-English label (e.g. "Tenant Names", "Termination Date") that the website fills in.

| File | Template |
|---|---|
| Ontario Standard Lease.json | One template: Standard Form of Lease 2229E + IRep Schedule A + Consent to Service by Email (LTB form for Tenant 1 and the landlord, an extra page for Tenants 2–8). 2 landlords, Tenant 1–8, Guarantor |
| Consent to Service by Email (2022-04).json | LTB consent form on its own, for tenants already in place (new leases include it) |
| N1 - Notice of Rent Increase (2022-04).json | LTB N1 |
| N4 - Non-Payment of Rent (2026-09).json | LTB N4, 2026/09 version |
| N5 - Interfering, Damage or Overcrowding (2026-09).json | LTB N5, 2026/09 version |
| N9 - Tenant's Notice to End the Tenancy (2022-04).json | LTB N9, sent from the tenant portal; Tenant 1–8 sign, IRep gets a copy |
| Certificate of Service (2022-04).json | LTB Certificate of Service (signed by Chuck) |

For testing on the developer account, `python3 build/build_lease.py 2 " (test)"` makes a 2-tenant copy.

`build/` holds the scripts that made them from the government PDFs (`python3 build/build_*.py`).
