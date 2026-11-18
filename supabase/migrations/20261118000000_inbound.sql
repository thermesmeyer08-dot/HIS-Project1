-- Phase 2: inbound capture + call prep.

-- Phone numbers come in from the calculator and booking forms.
alter table contacts add column if not exists phone text;

-- Inbound settings.
alter table settings
  add column if not exists inbound_gmail_query text not null
    default 'from:formresponses@netlify.com subject:"From HIS"',
  add column if not exists booking_title_match text not null default 'coverage review',
  add column if not exists followup_delay_hours int not null default 24 check (followup_delay_hours between 0 and 720),
  add column if not exists inbound_lookback_days int not null default 14 check (inbound_lookback_days between 1 and 365),
  add column if not exists brief_days_ahead int not null default 3 check (brief_days_ahead between 0 and 30);

-- The Google refresh token is encrypted by the app with TOKEN_ENCRYPTION_KEY,
-- which only the server and the scheduled jobs have. Let the signed-in user
-- store and read the ciphertext (RLS keeps it to their own row).
grant select, insert, update, delete on oauth_tokens to authenticated;
alter table oauth_tokens add column if not exists account_email text;

-- Scheduled jobs run as the signed-in user, so job_runs needs the same default.
alter table job_runs alter column owner_id set default auth.uid();
