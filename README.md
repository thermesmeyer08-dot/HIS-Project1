# HIS CRM: Hermesmeyer Insurance Solutions

A private CRM and (soon) AI lead-generation assistant for one independent life insurance agent in Texas.

**The agent never sends anything.** It only drafts. Every outbound message waits in an approval queue; Tim approves, edits or rejects it, then sends it himself.

| Phase | What it adds | Status |
|---|---|---|
| 1. CRM foundation | Database, dashboard, leads, contacts, businesses, referral partners, approval queue, settings, do-not-contact list, CSV import/export | **Built** |
| 2. Inbound capture + call prep | Reads website calculator emails and Calendar bookings, creates leads, drafts "book a call" follow-ups, writes call prep briefs | **Built** |
| 3. Business-owner prospecting | Finds and scores DFW business owners from public sources | Planned |
| 4. Referral-partner prospecting | Same pipeline for CPAs, bankers, attorneys, P&C agents, advisors | Planned |
| 5. Drafting + approval | AI first touches and follow-up sequences, Gmail drafts on approval, printable mailers | Planned |
| 6. Daily digest | Morning summary delivered as a Gmail draft to Tim | Planned |

For Tim's plain-English guide, see [docs/DAILY-USE.md](docs/DAILY-USE.md).

---

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4): the CRM UI, mobile-first.
- **Supabase** (free tier): Postgres + magic-link auth. Every table has row-level security (`owner_id = auth.uid()`).
- **Netlify** (free tier, allows commercial use): hosting. *Vercel's free Hobby plan is for non-commercial use only, which is why we don't use it.*
- **GitHub Actions**: CI now; scheduled agent jobs from Phase 2.
- **Anthropic API** (Phase 2+): `claude-sonnet-5-5` for research/drafting, `claude-haiku-5-5` for classification. Both are settings.

## Project layout

```
src/
  app/                 Next.js routes
    (crm)/             signed-in pages: dashboard, leads, contacts, organizations,
                       partners, queue, settings, data (import/export)
    actions/           server actions (all writes go through these)
    login/ auth/ setup/
  core/                pure logic shared by the app and future jobs (unit-tested)
    dnc.ts             do-not-contact matching + assertContactable()
    dedupe.ts          duplicate person / business detection
    normalize.ts       email, domain, LinkedIn, name normalization
    csv.ts             import parsing/validation, export serialization
    compliance.ts      email footer (booking link, opt-out, address), risky-phrase warnings
    texas.ts           Texas-only rule
  lib/                 Supabase clients, auth guard, data services
  components/          UI
  proxy.ts             session refresh + sign-in gate (Next 16 renamed middleware to "proxy")
  core/parsers/        calculator email + calendar booking parsers
  core/google.ts       Gmail / Calendar / OAuth over fetch (no send function, by design)
  core/ai.ts           Claude calls (call prep with web search, follow-up drafts), cost tracking
jobs/                  scheduled jobs run by GitHub Actions (inbound.ts)
supabase/migrations/   SQL schema
scripts/seed.ts        fake test data
tests/                 Vitest unit tests
docs/DAILY-USE.md      guide for Tim
```

## Compliance safeguards

- **Human in the loop.** No code path sends email. Drafts move `pending_approval → approved → sent`, and "sent" is only set when Tim taps **Mark sent**.
- **Do-not-contact** is enforced in three places: `assertContactable()` before any draft is created, approved or marked sent; a database trigger that rejects drafts for flagged contacts; and adding a DNC entry immediately flags matching contacts and pulls their drafts from the queue. Matching is by email, email domain, business website domain, LinkedIn URL, or name + business.
- **Texas only.** Outreach to a prospect whose state is known and not Texas is blocked. Unknown locations are flagged.
- **Source tracking.** `source` and `consent_note` ("how we got this contact") are required on every contact.
- **Email footer.** Every email draft gets the booking link, signature, an opt-out line and the business postal address (`[ADDRESS NEEDED]` until it's set in Settings). There is never a phone number.
- **Risky language warnings.** Drafts are flagged for guarantee, rate, return or approval promises and for phone numbers.
- **Templates** record their agency-compliance status. Editing an approved template's wording sends it back to draft.
- **No scraping of LinkedIn or Facebook**, ever. LinkedIn URLs are entered by hand.

---

## Local setup

Requirements: Node.js 24+ (LTS) and npm.

```bash
git clone https://github.com/thermesmeyer08-dot/HIS-Project1.git
cd HIS-Project1
npm install
cp .env.example .env.local     # then fill in the values (see Supabase setup)
npm run dev                    # http://localhost:3000
```

Without Supabase values the app shows a setup page.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit tests (parsers, dedupe, DNC, CSV, compliance) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run seed` | Load fake test records (needs `SUPABASE_SECRET_KEY`) |
| `npm run db:link` / `db:push` | Link the Supabase CLI to your project / apply migrations |

## Supabase setup (about 10 minutes)

1. Sign up at [supabase.com](https://supabase.com) (free plan) and click **New project**. Pick a region near Texas (for example *East US* or *Central US*), set a strong database password and save it in a password manager.
2. **Create the tables.** Use one of these:
   - *Easiest:* open **SQL Editor → New query**, paste the whole contents of `supabase/migrations/20261116000000_crm_foundation.sql`, and click **Run**. Then do the same, in order, with `supabase/migrations/20261117000000_grants.sql` and `supabase/migrations/20261118000000_inbound.sql`. Newer Supabase projects don't give the app access to new tables until the grants file is run. If Supabase warns that a query "creates tables without enabling Row Level Security", either choice is fine: the first file enables it at the end.
   - *CLI:* `npx supabase login`, then `npm run db:link` (choose the project), then `npm run db:push`.
3. **Keys.** Go to **Project Settings → API Keys** and copy these into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key → `SUPABASE_SECRET_KEY` (server-side only, never put it in the browser or commit it)
4. **Create Tim's login.** Go to **Authentication → Users → Add user → Create new user**, enter Tim's email and tick **Auto confirm**. Put the same email in `ALLOWED_EMAILS`.
5. **Block other sign-ups.** Under **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up". (The app also refuses any email not in `ALLOWED_EMAILS`.)
6. **Redirect URLs.** Under **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` for now, and your Netlify URL once deployed.
   - Redirect URLs: add `http://localhost:3000/auth/confirm` and `https://YOUR-SITE.netlify.app/auth/confirm`.
7. **Sign-in email template** (recommended, so links work when tapped inside the Gmail app on a phone). Under **Authentication → Emails → Magic Link**, replace `{{ .ConfirmationURL }}` in the link with:
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
   and save. (The app also works with the default template, but then the link must be opened in the same browser that requested it.)
8. Restart `npm run dev`, go to http://localhost:3000, enter Tim's email and click the link in the email.
9. Optional: `npm run seed` loads a handful of obviously fake records so you can click around. Re-running it replaces them.

> Supabase's built-in email sender is rate-limited (a few emails per hour). That's plenty for one user. Sign-in links expire after one hour.
> Free Supabase projects pause after 7 days with no activity. From Phase 2 the daily jobs keep it awake. Until then, open the app at least once a week, or un-pause it from the dashboard.

## Deploying to Netlify

1. Sign up at [netlify.com](https://netlify.com) with GitHub. Choose **Add new site → Import an existing project → GitHub** and pick `HIS-Project1`.
2. Netlify detects Next.js automatically (build command `npm run build`). Leave the defaults.
3. Under **Site configuration → Environment variables**, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAILS`, `NEXT_PUBLIC_SITE_URL` (your `https://….netlify.app` address), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY`. Do **not** add `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY` to Netlify. The web app doesn't need them.
4. Deploy, then add the Netlify URL to Supabase's Site URL and Redirect URLs (Supabase setup, step 6) and to the Google OAuth client's redirect URIs (Google OAuth setup, step 5).
5. On your phone, open the site and use **Share → Add to Home Screen** so it works like an app.

## GitHub Actions

- `.github/workflows/ci.yml` runs lint, typecheck, tests and a build on every push and pull request.
- `.github/workflows/inbound.yml` runs the **inbound job** hourly from about 7am to 9pm Dallas time, and on demand from **Actions → Inbound → Run workflow**. Each run:
  1. reads new website calculator emails (Gmail search set in **Settings → Inbound capture**) and creates or updates the contact and lead
  2. reads booked appointments from Google Calendar (events whose title contains "coverage review" and whose description has a "Booked by" block). It moves the lead to **Meeting booked** and notices cancellations and reschedules.
  3. drafts a "book a call" follow-up email in the **approval queue** for calculator leads who ticked the consent box and haven't booked after `followup_delay_hours`
  4. writes a **call prep brief** on each lead with a meeting in the next few days. With `ANTHROPIC_API_KEY` set, this uses Claude with web research; without it, a template is used.

  AI spend is logged in `job_runs` (shown under **Settings → Recent automatic runs**) and stops at the daily cap.

  **Secrets.** In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` and, when you have it, `ANTHROPIC_API_KEY`.
- **Run it locally:** `npm run job:inbound`. Test without Google by feeding a saved email body or booking description: `npm run job:inbound -- --calculator-file sample.txt --no-delay`, or `--booking-file sample.txt`.
- How the job signs in: it uses the secret key to create a one-time sign-in token for Tim and swaps it for a normal session. Every query therefore goes through the same row-level security as the app. No email is sent, and only the job's own session is signed out at the end.

## Google OAuth setup (about 15 minutes)

The CRM asks Google for exactly three permissions: read Gmail (to find website notifications), create Gmail drafts (Phase 5; **the code has no send function**), and read Calendar.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) **signed in as Tim's business Google Workspace account**. Create a project named `HIS CRM`.
2. **APIs & Services → Library:** search for and **Enable** the **Gmail API** and the **Google Calendar API**.
3. **Google Auth Platform → Get started** (sometimes labelled "OAuth consent screen"):
   - App name: `HIS CRM`. Support email: Tim's email.
   - **Audience: Internal.** Because this is a Workspace account, Internal means only your domain can use the app, no Google verification is needed, and access doesn't expire weekly.
   - Contact email: Tim's email. Agree and **Create**.
4. **Data Access → Add or remove scopes:** add `.../auth/gmail.readonly`, `.../auth/gmail.compose` and `.../auth/calendar.readonly`. Save.
5. **Clients → Create client:**
   - Application type: **Web application**. Name: `HIS CRM web`.
   - **Authorized redirect URIs:** add `http://localhost:3000/api/google/callback`, and later `https://YOUR-SITE.netlify.app/api/google/callback`.
   - Create, then copy the **Client ID** and **Client secret** into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Create an encryption key for the stored Google login and add it to `.env.local` as `TOKEN_ENCRYPTION_KEY`. Generate one with:
   ```bash
   openssl rand -base64 48
   ```
   Keep a copy in your password manager. If it's lost, you just reconnect Google.
7. Restart `npm run dev`, open **Settings → Google → Connect Google**, choose Tim's business account, and allow access. Settings should show **Connected**.

## Environment variables

| Variable | Where | Phase | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Netlify, GitHub secrets | 1 | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Netlify | 1 | Safe for the browser. RLS protects the data. |
| `SUPABASE_SECRET_KEY` | `.env.local`, GitHub secrets | 1 (seed), 2+ (jobs) | Bypasses RLS. Never expose it. |
| `ALLOWED_EMAILS` | `.env.local`, Netlify | 1 | Comma-separated sign-in allow-list |
| `NEXT_PUBLIC_SITE_URL` | `.env.local`, Netlify | 1 | Base URL for sign-in links |
| `ANTHROPIC_API_KEY` | `.env.local` (to test jobs locally), GitHub secrets | 2 | Claude API. Optional: without it, briefs and follow-ups use templates. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `.env.local`, Netlify, GitHub secrets | 2 | Google OAuth client (web application) |
| `TOKEN_ENCRYPTION_KEY` | `.env.local`, Netlify, GitHub secrets | 2 | 32+ characters; encrypts the stored Google refresh token. Must be the same everywhere. |

## Database overview

`organizations`, `contacts`, `referral_partners` (1:1 with contacts), `leads`, `drafts`, `templates`, `activities`, `do_not_contact`, `inbound_events`, `research_cache`, `settings` (one row), `oauth_tokens`, `job_runs` (AI cost log). See the migration for columns and constraints.
