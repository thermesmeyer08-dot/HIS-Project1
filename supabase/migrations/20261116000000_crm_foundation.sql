-- Hermesmeyer Insurance Solutions CRM: Phase 1 foundation schema.
-- Single-user app. Every table carries owner_id and is protected by RLS
-- (owner_id = auth.uid()). Background jobs use the secret (service-role) key
-- and must set owner_id explicitly.


-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type contact_type as enum ('prospect', 'referral_partner', 'client');

create type lead_stage as enum (
  'new', 'researched', 'drafted', 'contacted', 'replied', 'meeting_booked',
  'needs_analysis', 'app_submitted', 'placed', 'lost', 'nurture'
);

create type channel as enum ('email', 'linkedin', 'facebook', 'mailer', 'call_script');

create type draft_status as enum ('pending_approval', 'approved', 'rejected', 'sent', 'blocked_dnc');

create type partner_profession as enum (
  'cpa', 'banker', 'attorney', 'pc_agent', 'financial_advisor', 'other'
);

create type partner_stage as enum ('identified', 'contacted', 'met', 'active', 'dormant');

create type activity_type as enum (
  'note', 'email_sent', 'linkedin_sent', 'facebook_sent', 'mailer_sent', 'call',
  'reply', 'meeting', 'stage_change', 'inbound', 'dnc', 'import'
);

create type dnc_kind as enum ('email', 'domain', 'linkedin', 'name_org');

create type compliance_status as enum ('draft', 'submitted', 'approved');

create type inbound_kind as enum ('calculator', 'booking');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  name_normalized text not null,
  industry text,
  naics text,
  city text,
  county text,
  state text,
  website text,
  domain text,
  size_estimate text,
  is_faith_based boolean not null default false,
  source text not null,
  source_detail text,
  tx_taxpayer_id text,
  tx_filing_info jsonb,
  research_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_owner_domain on organizations (owner_id, domain);
create index organizations_owner_name on organizations (owner_id, name_normalized);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  org_id uuid references organizations (id) on delete set null,
  first_name text,
  last_name text,
  name_normalized text not null default '',
  title text,
  email text,
  email_source text,
  linkedin_url text,
  city text,
  state text,
  contact_type contact_type not null default 'prospect',
  source text not null,
  consent_note text not null,
  do_not_contact boolean not null default false,
  dnc_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner_email on contacts (owner_id, lower(email));
create index contacts_owner_linkedin on contacts (owner_id, linkedin_url);
create index contacts_owner_name on contacts (owner_id, name_normalized);
create index contacts_org on contacts (org_id);

-- ---------------------------------------------------------------------------
-- referral_partners (1:1 extension of contacts)
-- ---------------------------------------------------------------------------
create table referral_partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null unique references contacts (id) on delete cascade,
  profession partner_profession not null default 'other',
  relationship_stage partner_stage not null default 'identified',
  referrals_given int not null default 0,
  referrals_received int not null default 0,
  last_touch_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- leads / opportunities
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  org_id uuid references organizations (id) on delete set null,
  niche text not null default 'business_owner',
  stage lead_stage not null default 'new',
  score int check (score between 0 and 100),
  score_reasoning text,
  fit_signals jsonb,
  product_interest text[] not null default '{}'
    check (product_interest <@ array['key_person', 'buy_sell', 'exec_bonus', 'personal', 'other']),
  next_action text,
  next_action_date date,
  owner_notes text,
  call_prep_brief text,
  research_thin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_stage on leads (owner_id, stage);
create index leads_owner_next on leads (owner_id, next_action_date);
create index leads_contact on leads (contact_id);

-- ---------------------------------------------------------------------------
-- templates (for agency compliance approval)
-- ---------------------------------------------------------------------------
create table templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  channel channel not null,
  subject text,
  body text not null,
  compliance_status compliance_status not null default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- drafts (approval queue)
-- ---------------------------------------------------------------------------
create table drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  template_id uuid references templates (id) on delete set null,
  channel channel not null,
  sequence_step int not null default 0,
  subject text,
  body text not null,
  original_body text,      -- what the AI wrote, before Tim's edits
  edited_body text,        -- set when Tim edits before approving
  rejection_reason text,
  status draft_status not null default 'pending_approval',
  gmail_draft_id text,
  model text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drafts_owner_status on drafts (owner_id, status);
create index drafts_lead on drafts (lead_id);

-- Backstop: never queue or approve a draft for a do-not-contact contact.
create or replace function enforce_draft_dnc() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending_approval', 'approved', 'sent')
     and exists (select 1 from contacts c where c.id = new.contact_id and c.do_not_contact) then
    raise exception 'Contact % is on the do-not-contact list; draft blocked', new.contact_id
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger drafts_enforce_dnc
  before insert or update of status, contact_id on drafts
  for each row execute function enforce_draft_dnc();

-- ---------------------------------------------------------------------------
-- activities (timeline)
-- ---------------------------------------------------------------------------
create table activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid references contacts (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  type activity_type not null,
  body text,
  metadata jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index activities_contact on activities (contact_id, occurred_at desc);
create index activities_lead on activities (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- do_not_contact list
-- ---------------------------------------------------------------------------
create table do_not_contact (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind dnc_kind not null,
  value_normalized text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, value_normalized)
);

-- ---------------------------------------------------------------------------
-- inbound_events (Phase 2 fills these)
-- ---------------------------------------------------------------------------
create table inbound_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind inbound_kind not null,
  gmail_message_id text,
  calendar_event_id text,
  raw_excerpt text,
  parsed jsonb,
  contact_id uuid references contacts (id) on delete set null,
  lead_id uuid references leads (id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, gmail_message_id),
  unique (owner_id, calendar_event_id)
);

-- ---------------------------------------------------------------------------
-- research_cache (Phase 3+)
-- ---------------------------------------------------------------------------
create table research_cache (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cache_key text not null,
  payload jsonb not null,
  sources text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (owner_id, cache_key)
);

-- ---------------------------------------------------------------------------
-- settings (one row per owner)
-- ---------------------------------------------------------------------------
create table settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  daily_prospect_cap int not null default 15 check (daily_prospect_cap between 0 and 200),
  daily_cost_cap_usd numeric(8, 2) not null default 3.00,
  max_searches_per_prospect int not null default 5,
  research_model text not null default 'claude-sonnet-5-5',
  fast_model text not null default 'claude-haiku-5-5',
  email_signature text not null default E'Tim Hermesmeyer\nHermesmeyer Insurance Solutions\nhermesmeyerinsurance.com',
  footer_address text,     -- CAN-SPAM postal address; drafts show [ADDRESS NEEDED] until set
  booking_url text not null default 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3a6lHBneXhyCXJfz2M_B3V5hWt02HZBUbUtzwON_wwI8kH8FVd3PzeahOb6odqteLP_URC385U',
  website_url text not null default 'https://hermesmeyerinsurance.com',
  target_counties text[] not null default array[
    'Dallas', 'Tarrant', 'Collin', 'Denton', 'Rockwall', 'Ellis', 'Johnson', 'Kaufman', 'Parker'
  ],
  target_industries text[] not null default '{}',
  followup_days int[] not null default array[4, 10, 21],
  style_example_count int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- oauth_tokens (Phase 2: Google refresh token, encrypted by the app)
-- ---------------------------------------------------------------------------
create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

-- ---------------------------------------------------------------------------
-- job_runs (cost + audit log for scheduled jobs)
-- ---------------------------------------------------------------------------
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job text not null,
  status text not null default 'running',
  items_processed int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_searches int not null default 0,
  est_cost_usd numeric(10, 4) not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at triggers + row-level security on every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'contacts', 'referral_partners', 'leads', 'templates',
    'drafts', 'settings', 'oauth_tokens'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on %I for each row execute function set_updated_at()',
      t, t);
  end loop;

  foreach t in array array[
    'organizations', 'contacts', 'referral_partners', 'leads', 'templates', 'drafts',
    'activities', 'do_not_contact', 'inbound_events', 'research_cache', 'settings',
    'oauth_tokens', 'job_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

-- The web app never reads the encrypted Google token directly.
revoke select on oauth_tokens from authenticated;
