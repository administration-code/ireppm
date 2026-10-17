Add the **N11 early move-out** screens.

Follow AGENTS.md: plain JS, plain CSS variables (no Tailwind, no UI kits), Canadian English, brand colours. Dates are shown like "November 15, 2026".

Migration `0023_n11_early_end.sql` is in the repo and has been run. These server parts already exist, so **don't rewrite them**:
- `src/app/api/tenant/n11/route.js`
- `src/app/api/docusign/n11/route.js`
- `buildN11` in `src/lib/docusign-templates.js`
- the N11 handling in `src/lib/signatures-server.js`

## Background (Ontario)
- **N9** (tenant's notice) needs at least 60 days, must end on the last day of a rental period, and can't end before a fixed term ends. `n9_prepare` returns the `earliest` allowed date.
- **N11** (Agreement to End the Tenancy) can be any date, but the landlord has to agree. Every tenant signs, then the landlord signs. IRep drafts and sends it but never signs for a landlord.

## 1. Tenant portal: `MovingOut.js` (the "Moving out?" card)

`n9_prepare` now also returns `n11_request`. It's the latest request, or null, shaped as `{id, status, termination_date, decision_note, created_at}` with status 'requested', 'approved', 'declined', 'cancelled' or 'signed'. Tenants can read their own `n11_requests` rows and their own `signature_requests` where kind is 'N9' or 'N11'.

**Choosing a date:**
- Keep the select of valid N9 dates.
- Add a last option, **"An earlier date…"**. When it's chosen, show a date input with min = tomorrow and max = the day before `earliest`.
- If they pick an earlier date, show this box in place of the N9 checkbox and button, styled as a notice and not an error:

  > **That's sooner than an N9 notice allows.** An N9 needs at least 60 days' notice and must end on <earliest, e.g. "December 31, 2026"> or later. To leave on <their date>, the landlord has to agree in writing with an **N11 Agreement to End the Tenancy**. Send IRep a request below. If it's approved, everyone on the lease and then your landlord sign it in DocuSign.

**The N11 request form**, below that box:
- "Why do you need to move out early?" A textarea, optional, max 1000 characters.
- Phone, prefilled from the N9 form.
- A required checkbox: "I understand IRep may decline, and that I must keep paying rent until my tenancy legally ends."
- **Button: "Ask IRep to agree to this date".**
  - It POSTs to `/api/tenant/n11` with `{tenancy_id, termination_date, reason, phone}` and the header `Authorization: Bearer <session access_token>`.
  - Show the returned `error`. If the response has `use_n9: true`, switch back to the N9 form with that date selected, if it's one of the valid dates.
  - On success: "Request sent. IRep will review it and let you know." Then reload.

**States, checked in this order** after the existing N9 states:
1. **Latest N11 signature request is 'sent' or 'delivered':** "Your agreement to end the tenancy on <date> is waiting for signatures. DocuSign emailed it to everyone on the lease. Your landlord signs last."
2. **N11 signature request is 'completed':** "Agreement signed. Your tenancy ends <date>. IRep will be in touch about the move-out inspection and keys."
3. **`n11_request.status` is 'requested':** "You asked to move out on <date>. IRep is reviewing your request." Add a small **"Cancel request"** link that calls `sb.rpc("cancel_n11_request", { p_id })`, then reloads.
4. **`n11_request.status` is 'declined':** show "IRep couldn't agree to <date>." with `decision_note` if there is one. Then show the normal form again so they can give an N9 or ask for a different date.

## 2. Staff: early move-out requests

**Where:** on `/admin/notices`, add a section at the top titled **"Early move-out requests (N11)"**.

**Data:** load `n11_requests` with status 'requested', each with its tenancy, unit, property and tenants (same select style as `NoticesTable`). Also show the last 10 decided requests, collapsed, under "Recent decisions".

**Each open request** is a card showing:
- address and unit
- tenant names
- the date they want
- the earliest N9 date for comparison: `sb.rpc("n9_earliest_date", { p_tenancy_id, p_given_on: created_at date })`
- the reason
- when it was asked

**Buttons on each card:**
- **Approve and send N11:**
  - Confirm first: "This sends the N11 to every tenant on the lease to sign, then to the landlord (<owner name, email>)."
  - Then POST to `/api/docusign/n11` with `{ request_id }` and the staff bearer token, the way `SendButtons.js` calls `/api/docusign/send`.
  - Show the returned `error`. If `consentRequired` is set, show the same consent link the signatures page shows.
- **Decline:**
  - Open a small form with a required note that the tenant will see, e.g. "We can't agree before Dec 31 because…".
  - Then call `sb.rpc("decline_n11_request", { p_id, p_note })`.

**Nav count:** in `loadNavCounts()`, add the count of `n11_requests` where status = 'requested'. Show it on the **Notices** nav item with the note "early move-out".

**Dashboard:** in "Needs attention", add one line per open request: "Early move-out request: <address, unit> for <date>", linking to /admin/notices.

**Signatures page:** N11 signature requests ('N11 - Agreement to End the Tenancy') show up there automatically. Label the kind "N11" like the others, and add 'N11' wherever kinds are listed for filters or labels. Don't add N9 or N11 to the staff "send new" buttons, since tenants start those.


## Landlords always sign
IRep never signs for a landlord. Anywhere a screen says IRep signs "as agent" or "as representative", change it to say the landlord signs. The lease and N-form screens no longer offer an IRep signer, because the server always uses the owner on file or the email typed in.
