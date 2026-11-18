-- Explicit table privileges.
-- Newer Supabase projects don't automatically expose new tables to the Data API
-- roles, so grant exactly what each role needs. Row-level security still limits
-- the signed-in user to their own rows (owner_id = auth.uid()).

-- Anonymous visitors: nothing.
revoke all on all tables in schema public from anon;

-- Signed-in user (Tim): read/write the CRM tables. RLS applies.
grant select, insert, update, delete on
  organizations, contacts, referral_partners, leads, templates, drafts,
  activities, do_not_contact, inbound_events, research_cache, settings, job_runs
to authenticated;

-- The browser-facing role never touches stored Google tokens.
revoke all on oauth_tokens from authenticated;

-- Server-side scripts and scheduled jobs (secret key). Bypasses RLS.
grant select, insert, update, delete on all tables in schema public to service_role;
