# DocuSign templates

Upload files in `templates/` in DocuSign: Templates → ▾ next to New → Upload Template.
Each field has a plain-English label (e.g. "Tenant Names", "Termination Date") that the website fills in.

| File | Template |
|---|---|
| Ontario Standard Lease.json | Standard Form of Lease 2229E + IRep Schedule A (Landlord, Tenant 1–4, Guarantor) |
| Consent to Service by Email (2022-04).json | LTB consent form, one per tenant (sent with every lease) |
| N1 - Notice of Rent Increase (2022-04).json | LTB N1 |
| N4 - Non-Payment of Rent (2026-09).json | LTB N4, 2026/09 version |
| N5 - Interfering, Damage or Overcrowding (2026-09).json | LTB N5, 2026/09 version |
| Certificate of Service (2022-04).json | LTB Certificate of Service (signed by Chuck) |

`build/` holds the scripts that made them from the government PDFs (`python3 build/build_*.py`).
