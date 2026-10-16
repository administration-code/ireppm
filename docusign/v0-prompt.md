Add DocuSign e-signatures to the staff back office: leases (with email-service consent), property management contracts, N1, N4 and N5 notices, and the Certificate of Service.

The database is ready: migration `0015_docusign.sql` is in the repo and has been run.

Follow AGENTS.md:
- Plain JS and plain CSS variables. No Tailwind, no UI kits.
- Canadian English and the brand colours.
- No pets field anywhere.
- Signed documents are private. Never make the `signed-documents` bucket public. Never show one tenant's or owner's documents to anyone except staff.

## Database (already exists; see supabase/migrations/0015_docusign.sql)

**`signature_requests`**: one row per envelope. Staff-only RLS. Columns:
- kind: 'lease', 'pm_contract', 'N1', 'N4', 'N5', 'certificate_of_service' or 'other' (use 'other' for a stand-alone consent form)
- title, template_id, envelope_id
- status: 'draft', 'sent', 'delivered', 'completed', 'declined', 'voided' or 'error'
- application_id, tenancy_id, unit_id, property_id, owner_id
- related_request_id: a Certificate of Service points to its N-form
- recipients, prefill and terms (all jsonb)
- email_subject, sent_by, sent_at, completed_at, status_changed_at, void_reason, error
- signed_file_path, certificate_file_path, applied_at, notice_id

**`signature_events`**: log of DocuSign Connect messages. `dedupe_key` is unique, so insert with on-conflict-do-nothing.

**`tenancies.email_service_ok`** (boolean, generated): true only when `email_service_consent` starts with "Yes".

**`notices.signature_request_id`**: links a notice to its signature request.

**`signed-documents`**: private bucket, PDF only, 50 MB limit.

**`apply_signed_document(p_request_id)`**: service role only. Safe to call twice.
- Lease with no tenancy_id: creates an 'upcoming' tenancy and its tenancy_tenants from `terms`.
- pm_contract: sets properties.agreement_start and agreement_renewal from `terms`.

**`record_notice_service(p_request_id, p_served_on, p_method, p_served_by)`**: staff only.
- Creates the `notices` row from a completed N1, N4 or N5.
- Refuses method 'email' unless the tenancy's email_service_ok is true.
- Methods: in_person, mail, email, mail_slot, courier, other.

**Shape of `terms` by kind:**
- lease: `{unit_id, start_date, end_date (blank = month-to-month), rent, rent_due_day, last_month_deposit, key_deposit, email_service_consent, tenants: [{full_name, email, phone, is_primary}]}`
- pm_contract: `{agreement_start, agreement_renewal}`
- N1, N4, N5: `{effective_date, amount, notes}`. For N1, amount is the new rent; for N4, it is the arrears.

## DocuSign connection (server only)

Create `src/lib/docusign.js` with `import "server-only"`.
- Use the JWT grant with plain `fetch`. Do not use the docusign-esign SDK.
- Sign the JWT with `jose` (SignJWT, RS256).
- Load the key with `crypto.createPrivateKey(process.env.DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, "\n"))`. The key is PKCS#1, which createPrivateKey accepts.
- Claims: iss = integration key, sub = user ID, aud = OAuth host (no https), scope "signature impersonation".
- POST it to `https://{DOCUSIGN_OAUTH_HOST}/oauth/token`.
- Cache the access token in memory until 5 minutes before it expires.
- API base: `{DOCUSIGN_BASE_URL}/v2.1/accounts/{DOCUSIGN_ACCOUNT_ID}`.

**Environment variables.** Add them to .env.example with comments and no values. They are already set in Vercel unless noted.
- DOCUSIGN_INTEGRATION_KEY
- DOCUSIGN_USER_ID
- DOCUSIGN_ACCOUNT_ID
- DOCUSIGN_PRIVATE_KEY
- DOCUSIGN_OAUTH_HOST
- DOCUSIGN_BASE_URL
- DOCUSIGN_CONNECT_HMAC_KEY: added later.
- Optional template ID overrides: DOCUSIGN_TEMPLATE_LEASE, DOCUSIGN_TEMPLATE_CONSENT, DOCUSIGN_TEMPLATE_PM_CONTRACT, DOCUSIGN_TEMPLATE_N1, DOCUSIGN_TEMPLATE_N4, DOCUSIGN_TEMPLATE_N5, DOCUSIGN_TEMPLATE_CERT_OF_SERVICE.

**Finding templates by name.** If an override isn't set, look the template up by exact name with `GET /templates?search_text=<name>` and cache the ID in memory for an hour. Try the names in this order:
- lease: "Ontario Standard Lease", then "Ontario Standard Lease (test)"
- consent: "Consent to Service by Email (2022-04)"
- pm_contract: "IRep Property Management Contract"
- N1: "N1 - Notice of Rent Increase (2022-04)"
- N4: "N4 - Non-Payment of Rent (2026-09)"
- N5: "N5 - Interfering, Damage or Overcrowding (2026-09)"
- certificate_of_service: "Certificate of Service (2022-04)", then "Certificate of Service"

If the core variables are missing, DocuSign buttons show "DocuSign isn't connected yet". If a template can't be found, that kind's button shows "Template not set up yet". Nothing should crash.

## Templates: roles and field labels (exact; `src/lib/docusign-templates.js`)

Fields are prefilled by **tabLabel** via `templateRoles[].tabs` (`textTabs: [{tabLabel, value}]`, `checkboxTabs: [{tabLabel, selected: "true"}]`). Store everything sent in `prefill`.

**Roles we don't use must be left out of templateRoles**, so DocuSign drops them along with their fields.

**Signer defaults:**
- "IRep signer" means Rishi Bakshi, ireppm@ireprealty.com, with a "Have the owner sign instead" option that uses the property's owner (owners.name, owners.email).
- Rep details come from SITE in src/lib/site.js: company "IRep Property Management", address "6-2557 Dougall Ave, Suite 223, Windsor, ON N8X 1T5", phone "519-590-7200", email "administration@ireppm.ca".

**Date format:** the N-forms and the Certificate of Service use dd/mm/yyyy. The Standard Lease uses yyyy/mm/dd.

### 1. lease: "Ontario Standard Lease" (Standard Form of Lease 2229E plus IRep Schedule A)

Roles:
- "Landlord": IRep signer, routing order 2.
- "Tenant 1" to "Tenant 8": routing order 1. **The lease supports up to 8 tenants.**
- "Guarantor": optional, routing order 1. Signs Schedule A only.
- CC "Administration": fixed in the template; don't send it.

Every data field is a locked Landlord field, prefilled by the website. Staff change values in the review screen.

Text fields (all owned by Landlord):

| Fields | Value |
|---|---|
| "Landlord Legal Name", "Landlord 2 Legal Name" | The owner's legal name; use the second line for a co-owner, if any. |
| "Tenant 1 Last Name", "Tenant 1 First Name" … "Tenant 8 Last Name", "Tenant 8 First Name" | Each tenant's name. |
| "Unit", "Street Number", "Street Name", "City", "Postal Code" | The rental unit. Province is printed on the form. |
| "Parking" | Parking spaces and description. |
| "Notice Unit", "Notice Street Number", "Notice Street Name", "Notice PO Box", "Notice City", "Notice Province", "Notice Postal Code" | IRep's office: 2557 / Dougall Ave / unit "6, Suite 223" / Windsor / Ontario / N8X 1T5. |
| "Notice Emails" | e.g. "Landlord: administration@ireppm.ca; Tenant(s): a@x.ca, b@y.ca". |
| "Emergency Contact" | e.g. "IRep Property Management 519-590-7200, administration@ireppm.ca". |
| "Start Date", "End Date", "Other Term Details" | Dates in yyyy/mm/dd. |
| "Rent Due Day" | Default "First". |
| "Rent Other Period" | Only when rent isn't monthly. |
| "Base Rent", "Parking Rent" | Amounts. |
| "Other Charge 1 Description", "Other Charge 1 Amount" … "Other Charge 3 Description", "Other Charge 3 Amount" | Up to 3 other charges. |
| "Total Rent" | Base + parking + other charges. |
| "Rent Payable To" | Default "IRep Property Management, agent for the landlord". |
| "Payment Methods" | Default "Interac e-Transfer to payment@ireppm.ca". |
| "Partial Rent Amount", "Partial Rent Date", "Partial Rent From", "Partial Rent To" | Only when the start date isn't the 1st. Auto-calculate prorated rent: rent × days remaining ÷ days in month, rounded to cents. |
| "NSF Charge" | Default "20.00". |
| "Other Service 1 Name" … "Other Service 3 Name" | Extra services, if any. |
| "Services Details", "Utilities Details", "Rent Discount Details" | Free text. |
| "Rent Deposit Amount" | Last month's rent deposit. |
| "Key Deposit Amount", "Key Deposit Details" | Key deposit, if any. |
| "Smoking Rules Details" | Default "See Schedule A." |
| "Landlord Signer Name" | e.g. "Rishi Bakshi, IRep Property Management (agent for <owner>)". |
| "Guarantor Name" | Guarantor's name, if any. |

Checkboxes (Landlord):

| Group | Checkboxes | Default |
|---|---|---|
| Condo | "Condo Yes", "Condo No" | "Condo No" |
| Email notices | "Email Notices Yes", "Email Notices No" | Yes |
| Emergency contact | "Emergency Contact Yes", "Emergency Contact No" | Yes |
| Term | "Fixed Term", "Monthly Tenancy", "Other Term" | — |
| Rent period | "Rent Per Month", "Rent Per Other" | "Rent Per Month" |
| Services | "Gas Yes"/"Gas No", "Air Conditioning Yes"/"No", "Storage Yes"/"No", "Laundry Yes"/"No", "Guest Parking Yes"/"No", "Other Service 1 Yes"/"No" … "Other Service 3 Yes"/"No" | — |
| Laundry and guest parking charges | "Laundry No Charge", "Laundry Pay Per Use", "Guest Parking No Charge", "Guest Parking Pay Per Use" | — |
| Utilities | "Electricity Landlord"/"Electricity Tenant", "Heat Landlord"/"Heat Tenant", "Water Landlord"/"Water Tenant" | — |
| Rent discount | "No Rent Discount", "Rent Discount" | "No Rent Discount" |
| Rent deposit | "No Rent Deposit", "Rent Deposit" | — |
| Key deposit | "No Key Deposit", "Key Deposit" | — |
| Smoking | "No Smoking Rules", "Smoking Rules" | "Smoking Rules" (Schedule A covers smoking) |
| Insurance | "No Insurance Required", "Insurance Required" | "Insurance Required" (Schedule A requires it) |
| Additional terms | "No Additional Terms", "Additional Terms Attached" | "Additional Terms Attached" (Schedule A) |

Fields owned by the Tenant roles:
- Each Tenant N: "Tenant N Signer Name", set to the full name.
- Tenants 2–8 also have "Tenant N Schedule A Label", and tenants 5–8 have "Tenant N Row Label". These are preset in the template; leave them alone.

### 2. Consent to Service by Email (LTB form), one copy per tenant

Roles: "Tenant", "Landlord" (IRep signer), and CC "Administration" (fixed).

Tenant fields:
- "Tenant Name", "Tenant Email", "Tenant First Name", "Tenant Last Name"
- Checkboxes, prefilled checked: "Consent Rent Increase", "Consent Notice Of Entry", "Consent LTB Documents", "Consent Tenancy Communication". The tenant can untick any of them.

Landlord fields:
- "Landlord Name": the owner's legal name, then "c/o IRep Property Management".
- "Landlord Email": administration@ireppm.ca.
- "Rental Unit Address".
- "Landlord First Name", "Landlord Last Name": the IRep signer.

### 3. N1: "N1 - Notice of Rent Increase (2022-04)"

Role: "Landlord" (IRep signer). CC "Administration" is fixed.

Text fields:
- "Tenant Names and Address"
- "Landlord Name and Address"
- "Rental Unit Address"
- "Increase Date"
- "New Rent"
- "Increase Amount"
- "Increase Percent"
- "Signer Name", "Signer Phone"
- "Rep Name", "Rep LSO Number" (leave blank), "Rep Company", "Rep Address", "Rep Phone", "Rep City", "Rep Province", "Rep Postal Code", "Rep Fax"

Checkboxes:
- "New Rent Per Month", "Increase Per Month": both checked.
- "At Or Below Guideline", "Above Guideline", "Above Guideline Approved", "Above Guideline Applied For"
- "Signed As Landlord", "Signed As Representative"

### 4. N4: "N4 - Non-Payment of Rent (2026-09)"

Role: "Landlord". CC "Administration" and CC "Property Manager" are fixed.

Text fields:
- "Amount Owing", "Termination Date"
- "Tenant Names", "Landlord Name"
- "Unit Street Number", "Unit Street Name", "Unit Number", "Unit City", "Unit Province", "Unit Postal Code"
- Rent table rows 1–3: "Period N From", "Period N To", "Period N Charged", "Period N Paid", "Period N Owing" (N = 1–3), and "Total Rent Owing"
- "Signer First Name", "Signer Last Name", "Signer Phone"
- "Rep First Name", "Rep Last Name", "Rep LSO Number", "Rep Company", "Rep Street Number", "Rep Street Name", "Rep Unit", "Rep City", "Rep Province", "Rep Postal Code", "Rep Email", "Rep Phone"

Checkboxes: "Signed As Landlord", "Signed As Representative".

Build the rent table from rent_charges and payments. Use up to the 3 most recent periods with an amount owing, and put any older balance into row 1.

### 5. N5: "N5 - Interfering, Damage or Overcrowding (2026-09)"

Role: "Landlord". CC "Administration" is fixed.

Fields:
- The same tenant, landlord, unit, signer and Rep fields as N4.
- "Termination Date"
- "Repair Cost", "Replace Cost", "Reason 3 Max Occupants"
- Three events: "Event N Date Time" and "Event N Details" (N = 1–3)

Checkboxes:
- "Reason 1", "Reason 1 First Notice", "Reason 1 Second Notice"
- "Reason 2", "Reason 2 First Notice", "Reason 2 Second Notice"
- "Reason 3", "Reason 3 First Notice", "Reason 3 Second Notice"
- "Signed As Landlord", "Signed As Representative"

### 6. Certificate of Service: "Certificate of Service (2022-04)"

Role: "Delivery By", default Zan Greksa (chuckfixedmyhouse@gmail.com). Staff can change the name and email. CC "Administration" is fixed.

Text fields:
- "File Number"
- "Unit Number", "Street Address", "City", "Postal Code"
- "Served By Name", "Date Served"
- "Notice Form Number" (e.g. "N4"), "Other Document Name"
- "Served To Names"
- "Fax Number", "Mail Address", "Other Method Details"
- "Signer First Name", "Signer Last Name", "Signer Phone"

Checkboxes:
- "Notice of Termination", "Other Document"
- "Served To Tenant", "Served To Landlord", "Served To Other", "More Than One Tenant"
- Service method: "Method Handed To Person", "Method Authorized Employee", "Method Adult In Unit", "Method Mailbox", "Method Under Door Or Mail Slot", "Method Courier", "Method Fax", "Method Mail", "Method Other"
- "Signed As Landlord", "Signed As Tenant", "Signed As Representative", "Signed As Other"

### 7. pm_contract: "IRep Property Management Contract" (existing template)

Signer roles:
- "Landlord (Authorized Signatory)"
- "Landlord (Owner 2)" … "Landlord (Owner 6)"

Fixed roles (don't send them): signer "Manager" and CC "Administration".

Its fields don't have usable labels yet, so **send roles only**, with no prefill. Staff fill the rest in the review screen.

Put the field defaults (rent payable to, payment methods, NSF charge, smoking text, notice address, emergency contact) in `src/lib/lease-defaults.js` so they're easy to change.

## Review before send (default)

Every send form has two buttons:
- **Review in DocuSign** (primary): creates the envelope with status "created", then opens the sender view (`POST /envelopes/{id}/views/sender`, returnUrl `/admin/signatures/{id}`) in a new tab.
- **Send now**: status "sent".

Save the `signature_requests` row before redirecting. If DocuSign returns an error, save status 'error' with the message and show it.

## Flows

### 1. Send lease (one envelope = lease + one consent form per tenant)

**Where:** an approved application in /admin/requests, or the unit page when the unit is vacant or in turnover.

**Form** (prefilled from the application, listing, unit, property and owner):
- Unit, start date, and either an end date (fixed term) or month-to-month.
- Rent, parking and up to 3 other charges. The total is calculated.
- Rent due day.
- Last month's rent deposit (default = total rent) and key deposit (with an optional description).
- Tenants, 1 to 8: full name, email, phone. Every tenant needs an email.
- Optional co-owner name for "Landlord 2 Legal Name".
- Optional guarantor: name and email.
- Utilities (landlord or tenant, for electricity, heat and water) and services included (yes or no).
- Parking description, condo yes or no.
- Landlord signer (IRep by default).

**Build the envelope with compositeTemplates:**
- First: `{serverTemplates: [{sequence: 1, templateId: LEASE}], inlineTemplates: [{sequence: 2, recipients: {signers: [...]}}]}`. Signers:
  - Landlord: recipientId "1".
  - Tenants: recipientIds "11"–"18".
  - Guarantor: recipientId "20".
  - Each signer has its roleName and tabs.
- Then, for each tenant: `{serverTemplates: [{sequence: 1, templateId: CONSENT}], inlineTemplates: [{sequence: 2, recipients: {signers: [...]}}]}` with two signers:
  - roleName "Tenant": same recipientId, name and email as that tenant on the lease (so it's the same person signing both).
  - roleName "Landlord": recipientId "1".
  - Fill in the consent fields.

Save `terms` (lease shape). Set application_id, unit_id, property_id and owner_id.

### 2. Send the consent form on its own

Add a button on the tenancy page for each current tenant, shown when `email_service_ok` is false. It sends the Consent template alone. kind 'other', title "Consent to Service by Email: <name>".

When it completes, if that tenant ticked any consent box, update `tenancies.email_service_consent` to "Yes: consent signed in DocuSign (<Mon D, YYYY>)".

### 3. Send management contract

On the property page:
- Owner signers, 1 to 6, prefilled from the property's owner; staff can add co-owners.
- Agreement start date and renewal date. Defaults: today, and one year after.

Save `terms` `{agreement_start, agreement_renewal}`.

### 4. Prepare N1, N4 or N5

From the tenancy page. For N4, also from the arrears list on the /admin dashboard, prefilled with the balance.

Form fields:
- Termination or increase date, amounts, and reasons and events (N5).
- The signing party: "Representative" by default (IRep as agent), or "Landlord".

When "Representative" is chosen, fill the Rep fields from SITE and leave "Rep LSO Number" blank.

Warnings:
- **N4:** the termination date must be **at least 7 days** after service. The 2026 form changed this from 14 days. Add 5 days if it will be mailed.
- **N5:** at least **20 days** for a first N5 in 6 months; **14 days** for a second, and only if at least 7 days have passed since the first. Show radio buttons for first or second notice and set the matching reason checkboxes.
- **N1**, warn if any of these is true:
  - the increase date is less than 90 days from today;
  - the increase date is less than 12 months after the tenancy start or the last N1's effective date;
  - the increase is above the guideline. The 2026 guideline is 2.1%; keep it in src/lib/site.js. Add a note that units first occupied after November 15, 2018 are exempt from the guideline.

The landlord (or IRep as representative) signs in DocuSign. Tenants don't sign N-forms.

### 5. Serve a signed N-form

When an N-form is completed, its page shows a **Serve this notice** panel.

**Email it to the tenants:**
- Only for **N1**, and only when `tenancies.email_service_ok` is true.
- For N4 and N5 the option is disabled, with the text "Serve N4/N5 by hand, mail slot or mail. The LTB consent form does not list notices to end a tenancy."
- For N1 without consent: "No written consent to email service on file (<email_service_consent text>)."
- When it's allowed: email the signed PDF to every tenant email on the tenancy using the site's existing email sending. Subject: "<Form> notice for <address, unit>". The body includes IRep's name and phone (LTB rule). Then call `record_notice_service(id, today, 'email', staff name)`.

**Hand delivery, mail slot or mail:**
- Download the signed PDF using a 10-minute signed URL.
- A **Send Certificate of Service** button creates a certificate_of_service envelope prefilled with:
  - unit address;
  - "Served By Name";
  - "Date Served";
  - "Notice of Termination" checked and "Notice Form Number" = N4 or N5 (for an N1: "Other Document" with "Other Document Name" = "N1 Notice of Rent Increase");
  - "Served To Tenant" and "Served To Names";
  - "More Than One Tenant" when there's more than one;
  - the method checkbox that matches the staff's choice;
  - "Signed As Representative" checked.
  Set related_request_id to the N-form.
- A form for date served, method and served by calls `record_notice_service`.

Once served, show the linked notice. It also appears on the dashboard, the tenancy, and the landlord's monthly letter.

## Status updates: DocuSign Connect webhook

**Route:** `POST /api/docusign/connect`, runtime nodejs.

1. **Verify.** Compute HMAC-SHA256 of the raw body with DOCUSIGN_CONNECT_HMAC_KEY and base64-encode it. Compare it with the `X-DocuSign-Signature-1` header (also accept -2) using `timingSafeEqual`. Return 401 if it doesn't match.
2. **Read** the JSON (SIM format): `event`, `generatedDateTime`, `data.envelopeId`, `data.recipientId`.
3. **Log and refresh.**
   - Find the signature_request by envelope_id.
   - Insert a signature_events row with dedupe_key `envelopeId|event|recipientId|generatedDateTime`.
   - Update status and status_changed_at.
   - Refresh `recipients` from `GET /envelopes/{id}/recipients`.
4. **On envelope-completed:**
   - Download `/documents/combined` and `/documents/certificate`.
   - Upload them to `signed-documents` at `{kind}/{request id}/signed.pdf` and `certificate.pdf`.
   - Set the file paths and completed_at.
   - For a **lease**: read `GET /envelopes/{id}/recipients?include_tabs=true`. Each Tenant's consent checkboxes are the ones labelled "Consent …".
     - If any tenant ticked any box, set `terms.email_service_consent` to "Yes: consent signed with lease in DocuSign (<Mon D, YYYY>)".
     - If none did, set it to "No: tenant declined email service (<date>)".
   - Then call `rpc('apply_signed_document', { p_request_id })` with the service-role client.
   - Send the staff alert "Signed: <title>".
   - For a stand-alone consent: update the tenancy as described in flow 2.
5. **On declined or voided:** send a staff alert with the reason.
6. Always return 200 once verified, even for unknown envelopes.

**Refresh status** button on each request: pulls the envelope from the API and runs the same steps. This is the fallback if Connect is late.

**Consent pages:**
- `GET /api/docusign/consent` (staff only): shows the one-time consent link `https://{OAuth host}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id={key}&redirect_uri=https://ireppm.ca/api/docusign/callback`.
- `/api/docusign/callback`: shows "DocuSign access granted. You can close this tab."

## Staff pages

**`/admin/signatures`** (add "Signatures" to the admin nav):
- Table: title, kind, who it's out to, status chip, sent date, completed date.
- Filters: Awaiting signature (draft, sent, delivered), Completed, Declined/Voided, Errors; and kind.
- Nav badge: the awaiting count.

**`/admin/signatures/[id]`:**
- Details, and recipients with each person's status and signed time.
- Event history.
- Buttons:
  - Open in DocuSign: the sender view while it's a draft, otherwise the console view.
  - Send reminder: `PUT /envelopes/{id}/recipients?resend_envelope=true`.
  - Void: asks for a reason.
  - Refresh status.
  - View signed PDF and View certificate: 10-minute signed URLs.
- Links to whatever it created: the tenancy, property or notice.

**`/admin/signatures/templates`:** for each template, call `GET /templates/{id}/recipients?include_tabs=true` and list roles and tab labels. Flag any label in docusign-templates.js that the template doesn't have.

**Elsewhere:**
- On tenancy, property and application pages: a "Documents" list of that record's signature requests.
- On the /admin dashboard: a "Waiting for signatures" card showing the count and the 5 oldest.

## Don't

- Don't make the bucket public, and don't link signed PDFs with permanent URLs.
- Don't send N4 or N5 by email.
- Don't send N1 by email without email_service_ok.
- Don't create tenancies when a lease is sent. The database does that when it's completed.
- Don't put DocuSign secrets in client code.
