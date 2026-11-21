-- 0076: email templates with merge fields, and drafts staff review before sending (Project 3a).
-- Emails go from administration@ireppm.ca with a copy to administration@, only when staff click Send.
-- Run AFTER 0075. Safe to re-run (templates already edited are kept).

create table if not exists public.email_templates (
  key text primary key,
  name text not null,
  audience text not null default 'tenant' check (audience in ('tenant', 'landlord', 'any')),
  subject text not null,
  body text not null,
  sort_order integer not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
drop policy if exists "email_templates: staff all" on public.email_templates;
create policy "email_templates: staff all" on public.email_templates for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.email_templates from anon;

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  template_key text references public.email_templates (key) on delete set null,
  to_emails text[] not null default '{}',
  subject text not null default '',
  body text not null default '',
  tenancy_id uuid references public.tenancies (id) on delete set null,
  owner_id uuid references public.owners (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  task_id uuid references public.staff_tasks (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  source text not null default 'staff' check (source in ('staff', 'ai')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid
);
create index if not exists email_drafts_status_idx on public.email_drafts (status, created_at desc);
alter table public.email_drafts enable row level security;
drop policy if exists "email_drafts: staff all" on public.email_drafts;
create policy "email_drafts: staff all" on public.email_drafts for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.email_drafts from anon;

-- A sent email can't be changed.
create or replace function public.email_drafts_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'sent' and (new.subject is distinct from old.subject or new.body is distinct from old.body
     or new.to_emails is distinct from old.to_emails or new.status is distinct from old.status) then
    raise exception 'This email has been sent and can''t be changed.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists email_drafts_rules on public.email_drafts;
create trigger email_drafts_rules before update on public.email_drafts for each row execute function public.email_drafts_rules();

insert into public.email_templates (key, name, audience, subject, body, sort_order) values
('payprop_setup', 'PayProp payment setup', 'tenant', 'Setting up your rent payments: {{address}}',
'Hi {{tenant_first_names}},

Welcome to {{address}}{{unit_suffix}}. We collect rent through PayProp. Your PayProp welcome letter (attached or in your account) has your sign-up details and payment reference.

Rent: {{rent}} a month, due on the 1st.
{{first_month_line}}

If you can''t use PayProp, reply to this email and we''ll set you up for e-Transfer to {{payment_email}}.

Thank you,
IRep Property Management', 10),
('renewal_offer', 'Lease renewal offer', 'tenant', 'Your lease at {{address}}',
'Hi {{tenant_first_names}},

Your lease at {{address}}{{unit_suffix}} ends on {{end_date}}. We''d be happy to have you stay.

{{custom}}

Please let us know by replying to this email, or choose your option in your tenant account.

Thank you,
IRep Property Management', 20),
('n4_cover', 'N4 cover note', 'tenant', 'Notice regarding rent owing: {{address}}',
'Hi {{tenant_first_names}},

Our records show {{balance}} in rent owing for {{address}}{{unit_suffix}}. Attached is a Notice to End your Tenancy Early for Non-payment of Rent (Form N4).

If you pay the full amount owing by the termination date on the notice, the notice becomes void and your tenancy continues. You can pay by e-Transfer to {{payment_email}}.

If you''re having trouble paying, reply to this email so we can discuss it.

Thank you,
IRep Property Management', 30),
('lmr_topup', 'LMR top-up request', 'tenant', 'Last month''s rent top-up: {{address}}',
'Hi {{tenant_first_names}},

As your rent changes to {{rent}}, the last month''s rent deposit we hold needs to match the new rent. We currently hold {{lmr}}, so the top-up is {{amount}}.

Please send {{amount}} by e-Transfer to {{payment_email}} with "LMR top-up" in the message.

Thank you,
IRep Property Management', 40),
('missing_details', 'Missing ID or details request', 'any', 'A few details we still need',
'Hi {{first_names}},

To finish setting up your file for {{address}}, we still need the following:

{{custom}}

You can reply to this email with the details or upload them in your account.

Thank you,
IRep Property Management', 50),
('move_out', 'Move-out instructions', 'tenant', 'Moving out of {{address}} on {{date}}',
'Hi {{tenant_first_names}},

Here''s what to know before you move out of {{address}}{{unit_suffix}} on {{date}}:

- Leave the unit clean and empty, including the fridge, stove and any storage.
- Return all keys, fobs and remotes on move-out day. We''ll confirm how.
- We''ll book a move-out inspection and let you know the time.
- Cancel or transfer your utilities and tenant insurance as of your move-out date.
- Send us your forwarding address by replying to this email.

Thank you,
IRep Property Management', 60),
('old_address_reminder', 'Old e-Transfer address reminder', 'tenant', 'Please update our e-Transfer address: {{payment_email}}',
'Hi {{tenant_first_names}},

Thank you for your rent payment for {{address}}{{unit_suffix}}. It was sent to our old e-Transfer address (ireppm@ireprealty.com), which we''re phasing out.

For future payments, please send your e-Transfers to {{payment_email}}. Payments sent there are deposited automatically, so they''re recorded faster. If you''ve saved us as a contact in your banking app, please update the email there.

Thank you,
IRep Property Management', 70),
('maintenance_ack', 'Maintenance acknowledgement', 'tenant', 'We received your request: {{address}}',
'Hi {{tenant_first_names}},

Thanks for letting us know. We''ve received your maintenance request for {{address}}{{unit_suffix}}:

{{custom}}

We''ll be in touch to arrange a time. For an emergency (flooding, no heat, no power, a sewer backup), call Chuck at {{emergency_phone}}. If you smell gas or anyone is in danger, call 911 first.

Thank you,
IRep Property Management', 80)
on conflict (key) do nothing;
