-- Listings no longer carry a pets field: "no pets" lease clauses are void under
-- Ontario's Residential Tenancies Act, so the site doesn't advertise pet rules.
alter table public.listings drop column if exists pets;
