# IRep Property Management — ireppm.ca

The public website for IRep Property Management: home, rental search, listing pages with showing
requests, pricing, about, and renter accounts with a document profile and online applications.

Built with Next.js (App Router) and Supabase (accounts, database, private file storage), hosted on Vercel.

## One-time setup

1. **Database tables.** In Supabase, open **SQL Editor → New query**, paste the contents of
   `supabase/migrations/0001_init.sql`, and click **Run**.
2. **Sign-in links.** In Supabase, open **Authentication → URL Configuration**:
   - Site URL: `https://ireppm.ca` (or the `.vercel.app` address until the domain is connected)
   - Redirect URLs: add `https://ireppm.ca/**` and `https://*.vercel.app/**`
3. **Sign-in emails.** Supabase's built-in email sender only allows a few emails per hour. Before launch,
   set **Authentication → Emails → SMTP Settings** to send through Google Workspace
   (host `smtp.gmail.com`, port 465, an app password for the sending address).
4. **Make yourself staff.** Sign in on the site once, then run in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

## Adding a listing (until the back office is built)

In Supabase, open **Table Editor → listings → Insert row**. Fill in the address, rent, beds, baths,
type and a `slug` (the web address, e.g. `1180-wyandotte-st-e-unit-2`). Set `status` to `available`
to publish it, or `leased` to take it down. Photos: upload to the `listing-photos` storage bucket and
paste each file's public URL into `photos`.

## Where submissions go

- Showing requests → `showing_requests`
- Applications → `applications` (attached files are listed in `documents`; files are in the private
  `applicant-docs` bucket)
- Landlord inquiries → `landlord_inquiries`

## Editing business details

Phone, office address, hours and the package prices live in `src/lib/site.js`.

## Local development

```bash
cp .env.example .env.local   # add the Supabase URL and anon key
npm install
npm run dev
```
