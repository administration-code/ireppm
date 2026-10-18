# Project notes for AI assistants (v0, Claude, etc.)

IRep Property Management's public website (ireppm.ca). Residential property management and
leasing in Windsor and Essex County, Ontario. Windsor is the main market.

## Keep these rules
- **No pets field anywhere.** "No pets" lease clauses are void under Ontario's Residential
  Tenancies Act, so listings never mention pet rules.
- **Brand:** IRep Red `#B41710`, Ink `#161616`, Ivory `#F7F4EE`, Charcoal `#1B1B1B`.
  Display font Cormorant Garamond, body font Libre Franklin. Colours are CSS variables in
  `src/app/globals.css`; reuse them instead of new colours. Don't add Tailwind or a UI kit
  without asking — the site uses plain CSS.
- **Logo:** the IRep house mark in `src/components/Brand.js`, with "PROPERTY MANAGEMENT" under IREP.
- **Canadian English** (neighbourhood, colour, centre). Prices in CAD.
- **Title Case** for headings, menu and tab labels, buttons and footer links ("Tenants and Applicants",
  "Add Property"). Keep short words (a, and, of, the, to, for, in, on, or, by, with) lowercase unless first
  or last. Sentences, help text and form choices stay in sentence case.
- **Business details and package prices** live in `src/lib/site.js` — edit there, not in pages.
- **Renter documents are sensitive** (photo ID, income letters, credit reports). They stay in
  the private `applicant-docs` storage bucket. Never make that bucket public or show other
  renters' files.

## How it fits together
- Next.js App Router (JavaScript, no TypeScript) in `src/app`, components in `src/components`.
- Supabase (via the Vercel integration) for sign-in, the database and file storage. Env vars:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Database changes go in a new numbered file in `supabase/migrations/`; never edit old ones
  that have already been run.
- Only listings with `status = 'available'` show on the site. Drafts stay hidden.
- Access rules (row-level security): renters see only their own rows; staff/admin see all.
