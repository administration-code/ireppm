Build three things: tenants giving notice online (N9), the landlords' year-end rental income report, and the leasing fee split with the shareholder loans.

Follow AGENTS.md:
- plain JS and plain CSS variables (no Tailwind, no UI kits);
- Canadian English;
- brand colours.

Money is shown as $1,234.56, and dates as "Dec 31, 2026".

Migration `0021_n9_year_end_commissions.sql` is in the repo and has been run. The server parts are already in the repo, so **don't rewrite them**:
- `src/app/api/tenant/n9/route.js`
- `buildN9` in `src/lib/docusign-templates.js`
- the N9 handling in `src/lib/signatures-server.js`

## 1. Tenant portal: "Give notice to move out" (N9)

**Where:** in `MyHome.js`, add a card per home titled **"Moving out?"** below "My requests".

**On load:**
- Call `sb.rpc("n9_prepare", { p_tenancy_id })`. It returns:
  - `{ ok, error, earliest, rent_due_day, fixed_term_end, landlord_name, address, tenants: [{full_name, email, phone, is_primary}] }`
- Also read the tenant's own N9 requests:
  - `sb.from("signature_requests").select("id, status, terms, created_at, completed_at").eq("kind", "N9").eq("tenancy_id", id).order("created_at", { ascending: false })`
  - RLS lets a tenant read their own N9 rows.

**States:**
- **N9 waiting** (latest N9 is 'sent' or 'delivered'): "Your notice is waiting for signatures. DocuSign emailed it to: <tenant names>. Moving out <termination_date>." Don't show the form.
- **N9 completed:** "Notice given. Your tenancy ends <termination_date>. IRep will be in touch about the move-out inspection and keys."
- **`ok` false with an error, and no N9:** show the error text in a muted box, with no form.
- **Otherwise, the form:**
  - Short intro: "To end your tenancy you need to give the landlord at least 60 days' written notice (an N9 form). Your move-out date must be the last day of a rental period."
  - If `fixed_term_end` is set: "Your lease runs to <date>, so the earliest date is <date>."
  - **Move-out date:** a select of the next 12 valid dates. The first is `earliest`. After that, the last day of each following rental period: for `rent_due_day` 1 that's the last day of each month; for another due day D, it's day D−1 of each month. Label each like "Wednesday, December 31, 2026".
  - **Phone number:** text, prefilled from the current tenant's row. It's printed on the form.
  - A read-only list "Everyone on the lease will be asked to sign:" with the tenant names. Under it: "If someone's email is wrong, contact IRep before sending."
  - A checkbox, required: "I understand this is a legal notice to end my tenancy and that I must move out by this date."
  - **Button: "Send for signatures".**
    - It POSTs to `/api/tenant/n9` with `{ tenancy_id, termination_date, phone }` and the header `Authorization: Bearer <session access_token>`, the same way `RentReceipt.js` does.
    - Show the returned `error` text if there is one.
    - On success: "Sent. Check your email from DocuSign to sign. Everyone on the lease must sign before the notice counts." Then reload the card.
- **Small print at the bottom:** "Questions? Contact IRep" with the phone and email from `SITE` in `src/lib/site.js`.

## 2. Year-end rental income report for landlords

### Staff: /admin/accounting/landlords?year=YYYY

Add **"Landlord year-end"** to the Accounting group in `NAV_GROUPS`, after "Year end".

**Year picker:** defaults to last year in January to March, and to the current year otherwise.

**Owners table:**
- `sb.rpc("landlord_year_reports", { p_year })` returns `[{owner_id, owner, email, totals}]`.
- Columns: owner, rent (`rent` + `rent_direct`), management fees, management HST, leasing fees, leasing HST, repairs, other expenses, net, paid out.
- Each row links to the report.

### Report: /admin/accounting/landlords/[ownerId]?year=YYYY

It's also viewable by the owner at /owner/year-end?year=YYYY, inside `OwnerGate`. Use one shared component, e.g. `components/LandlordYearReport.js`, and add a link to it from `OwnerHome`.

**Data:** `sb.rpc("landlord_year_report", { p_owner_id, p_year })` returns:
- `owner`, `first_month_in_system`
- `properties[]`, each with:
  - `address`, `city`, `units`, `fee_billed_separately`
  - `months[]`: period, rent, rent_direct, other_income, management_fee, management_hst, leasing_fee, leasing_hst, repairs, other_expense, paid_out
  - `earlier_entries[]`
  - `totals`
- `totals`, `t776[]` ({line, label, amount}), `hst_paid`

**Layout** (printable; use the existing print styles, one landlord per page):
- **Header:** "Rental income summary <year>", the landlord's name, "Prepared by IRep Property Management", and today's date.
- **"Summary for your T776"** table: line, description, amount. Under it, in small text:
  - "Line numbers are a guide to CRA form T776 (Statement of Real Estate Rentals). HST is included in the fee lines. If you're registered for HST, your accountant may claim it back instead. Please confirm with your accountant."
  - "Expenses you paid yourself (mortgage interest, property tax, insurance, utilities you pay) aren't included."
- **Per property:** a table by month with these columns:
  - Rent collected by IRep
  - Rent paid to you directly
  - Management fee
  - HST on management
  - Leasing fee
  - HST on leasing
  - Repairs
  - Other expenses
  - Net
  - Paid to you

  Add a totals row. Leasing fees and their HST are always separate columns.
- **"Before <first month in system>" row:** if `earlier_entries` is not empty, show one row labelled with that, using those amounts.
- **Billed-separately note:** if `fee_billed_separately`, add "Management fees for this property were billed to you separately and aren't shown here."
- **Buttons:**
  - **Print / Save PDF** (`window.print()`).
  - Staff only: **Download CSV** (all the monthly rows).
  - Staff only: **Email to landlord**. It opens a `mailto:` with the owner's email, subject "Your <year> rental income summary", and a short body saying the PDF is attached.

### Staff: adding history from before the system

On the staff report page, add a section **"Add figures from before the website"**.
- Form fields:
  - property (select from that owner's properties)
  - category: Rent collected, Rent paid to you directly, Management fee, HST on management, Leasing fee, HST on leasing, Repairs, Other expense, Paid to you
  - amount
  - note
- It inserts into `landlord_year_entries` with `{property_id, year, category, amount, note}`. The category values are rent, rent_direct, management_fee, management_hst, leasing_fee, leasing_hst, repairs, other_expense, paid_out.
- List the existing entries with a Delete button.
- Explain at the top: "Our system starts in September 2026. Add each property's January–August totals from the income spreadsheet so the year is complete."

### Year end page

On `YearBoard.js` (`/admin/accounting/year`), change the IRep income table columns to:
- Management fees
- HST on management
- Leasing fees
- HST on leasing
- Commissions paid
- Loan repaid

The data comes from the new fields in `fiscal_year_summary` → `irep_income[]`: management_fees, management_hst, leasing_fees, leasing_hst, commissions_paid, loan_repaid.

Under the table, show **"HST collected: management $X, leasing $Y, total $Z"** from `hst_collected`. Update `YearPrint.js` and the CSV the same way.

## 3. Leasing fee split and shareholder loans: /admin/accounting/commissions

Add **"Commissions & loans"** to the Accounting group.

**Rule** (show it at the top in one line): "Each leasing fee, before HST, is split 50/50 between Rishi and Chuck. Half of each share is paid as commission; the other half repays that person's shareholder loan. HST is never split: it's owed to CRA."

**Data:** `sb.rpc("leasing_commissions_summary", { p_year })` returns `{ months[], splits[], loans[] }`.

**Loans:** two cards, Rishi Loan and Chuck Truck.
- Show: amount advanced, repaid so far, remaining, and a progress bar.
- Show the list of repayments (date, amount, month, note).
- Staff can **add** a repayment by inserting into `loan_repayments` `{loan_id, paid_on, amount, note}` (period empty), or **delete** one.

**By month:** a table with columns:
- month
- leasing fees (before HST)
- HST
- Rishi commission
- Chuck commission
- Rishi loan share
- Chuck loan share
- Paid?

For "Paid?": when that month's `*_commission_paid` and `*_loan_repaid` equal the earned amounts, show "Paid <date>". Otherwise show a button **"Record as paid"**:
- It asks for the date paid, a method (e-Transfer, cheque, cash, other) and a note.
- Then it calls `sb.rpc("pay_leasing_split", { p_period, p_paid_on, p_method, p_note })` and shows its error text if any.

**Fees:** an expandable list of `splits` (date month, property, description, fee, HST, and the four shares).

**Commission payments:** a list from `commission_payments` for the year (person, date, month, amount, method, note), with Delete. Add a "Download CSV" for the year.

## Notes
- The tenant N9 is only for tenants whose website account is linked to their tenancy (`tenancy_tenants.profile_id`).
- Don't change how rent, payouts or statements are calculated.
