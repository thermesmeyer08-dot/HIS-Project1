import { CHANNEL_LABELS, CHANNELS, humanize } from "@/core/constants";
import { ADDRESS_PLACEHOLDER } from "@/core/compliance";
import type { DncRow, JobRun, Template } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/crm";
import { isGoogleConfigured } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  addDnc,
  deleteTemplate,
  disconnectGoogle,
  removeDnc,
  saveInboundSettings,
  saveSettings,
  saveTemplate,
} from "@/app/actions/settings";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, btn, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

const GOOGLE_MESSAGES: Record<string, [string, "ok" | "danger"]> = {
  connected: ["Google connected.", "ok"],
  denied: ["Google access was not granted.", "danger"],
  bad_state: ["That Google sign-in expired. Please try again.", "danger"],
  no_refresh: ["Google didn't return a long-term token. Remove the app's access in your Google Account, then connect again.", "danger"],
  not_configured: ["Google isn't set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY (see README).", "danger"],
  error: ["Connecting Google failed. Check the server log.", "danger"],
};

const TEMPLATE_TONE = { draft: "muted", submitted: "warn", approved: "ok" } as const;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const s = await getSettings(supabase);
  const [dncRes, tplRes, tokRes, runsRes] = await Promise.all([
    supabase.from("do_not_contact").select("*").order("created_at", { ascending: false }),
    supabase.from("templates").select("*").order("name"),
    supabase.from("oauth_tokens").select("account_email, scopes, updated_at").eq("provider", "google").maybeSingle(),
    supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);
  const dnc = (dncRes.data ?? []) as DncRow[];
  const templates = (tplRes.data ?? []) as Template[];
  const google = tokRes.data as { account_email: string | null; scopes: string[]; updated_at: string } | null;
  const runs = (runsRes.data ?? []) as JobRun[];
  const gmsg = typeof sp.google === "string" ? GOOGLE_MESSAGES[sp.google] : undefined;
  const monthCost = runs.reduce((n, r) => n + Number(r.est_cost_usd), 0);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Google (Gmail + Calendar)">
          {gmsg && (
            <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${gmsg[1] === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
              {gmsg[0]}
            </p>
          )}
          {google ? (
            <div className="space-y-3 text-sm">
              <p>
                <Badge tone="ok">Connected</Badge> {google.account_email ?? ""} · since {formatDate(google.updated_at)}
              </p>
              <p className="text-xs text-muted">
                Access: read Gmail (website notifications), create Gmail drafts (never send), read Calendar.
              </p>
              <div className="flex gap-2">
                <a href="/api/google/connect" className={btn.secondary}>
                  Reconnect
                </a>
                <form action={disconnectGoogle}>
                  <button className={btn.danger}>Disconnect</button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted">
                Connect your business Google account so the CRM can read website calculator emails and calendar bookings.
              </p>
              {isGoogleConfigured() ? (
                <a href="/api/google/connect" className={btn.primary}>
                  Connect Google
                </a>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Google sign-in isn&apos;t set up yet. Follow “Google OAuth setup” in the README.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card title="Inbound capture">
          <ActionForm action={saveInboundSettings} className="grid gap-3 sm:grid-cols-2">
            <Field label="Gmail search for calculator emails" className="sm:col-span-2" hint="Gmail search syntax. Only matching emails are read.">
              <Input name="inbound_gmail_query" defaultValue={s.inbound_gmail_query} />
            </Field>
            <Field label="Booking event title contains" hint="Calendar events with this text and a “Booked by” block">
              <Input name="booking_title_match" defaultValue={s.booking_title_match} />
            </Field>
            <Field label="Follow-up draft after (hours)" hint="For calculator leads who haven't booked">
              <Input name="followup_delay_hours" type="number" min={0} max={720} defaultValue={s.followup_delay_hours} />
            </Field>
            <Field label="Look back (days)" hint="How far back to read email and calendar">
              <Input name="inbound_lookback_days" type="number" min={1} max={365} defaultValue={s.inbound_lookback_days} />
            </Field>
            <Field label="Prep briefs for meetings within (days)">
              <Input name="brief_days_ahead" type="number" min={0} max={30} defaultValue={s.brief_days_ahead} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary">Save inbound settings</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Recent automatic runs" className="lg:col-span-2">
          {runs.length === 0 ? (
            <p className="text-sm text-muted">No runs yet. The inbound job runs hourly from 7am to 9pm once GitHub Actions is set up.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">AI cost across these runs: ${monthCost.toFixed(2)}</p>
              <ul className="divide-y divide-border text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-32 text-xs text-muted">{formatDateTime(r.started_at)}</span>
                    <span className="font-medium">{r.job}</span>
                    <Badge tone={r.status === "ok" ? "ok" : r.status === "running" ? "warn" : "danger"}>{r.status}</Badge>
                    <span className="text-xs text-muted">
                      {r.items_processed} items · ${Number(r.est_cost_usd).toFixed(3)}
                    </span>
                    {r.error && <span className="w-full break-words text-xs text-danger">{r.error}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Outreach & compliance" className="lg:col-span-2">
          <ActionForm action={saveSettings} className="grid gap-3 sm:grid-cols-2">
            <Field label="Booking link" className="sm:col-span-2" hint="Every draft ends with this link. Your phone number is never included.">
              <Input name="booking_url" defaultValue={s.booking_url} />
            </Field>
            <Field label="Website">
              <Input name="website_url" defaultValue={s.website_url} />
            </Field>
            <Field
              label="Business postal address (email footer)"
              hint={s.footer_address ? "Required by CAN-SPAM in commercial email." : `Not set: email drafts show ${ADDRESS_PLACEHOLDER} until you add one. A PO box is fine.`}
            >
              <Input name="footer_address" defaultValue={s.footer_address ?? ""} placeholder="PO Box 123, Dallas, TX 75201" />
            </Field>
            <Field label="Email signature" className="sm:col-span-2">
              <Textarea name="email_signature" rows={3} defaultValue={s.email_signature} />
            </Field>
            <Field label="Target counties" hint="Comma-separated">
              <Input name="target_counties" defaultValue={s.target_counties.join(", ")} />
            </Field>
            <Field label="Target industries" hint="Comma-separated; blank = any">
              <Input name="target_industries" defaultValue={s.target_industries.join(", ")} />
            </Field>
            <Field label="Follow-up days" hint="Days after the previous step is marked sent">
              <Input name="followup_days" defaultValue={s.followup_days.join(", ")} />
            </Field>
            <Field label="Daily new-prospect cap">
              <Input name="daily_prospect_cap" type="number" min={0} max={200} defaultValue={s.daily_prospect_cap} />
            </Field>
            <Field label="Daily AI spend cap (USD)">
              <Input name="daily_cost_cap_usd" type="number" step="0.5" min={0} defaultValue={s.daily_cost_cap_usd} />
            </Field>
            <Field label="Max web searches per prospect">
              <Input name="max_searches_per_prospect" type="number" min={0} defaultValue={s.max_searches_per_prospect} />
            </Field>
            <Field label="Research & drafting model">
              <Input name="research_model" defaultValue={s.research_model} />
            </Field>
            <Field label="Fast model (classification, parsing)">
              <Input name="fast_model" defaultValue={s.fast_model} />
            </Field>
            <Field label="Edited/rejected examples used as style guidance">
              <Input name="style_example_count" type="number" min={0} defaultValue={s.style_example_count} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Save settings</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title={`Do-not-contact list (${dnc.length})`}>
          <ActionForm action={addDnc} resetOnSuccess className="mb-4 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Select
                name="kind"
                defaultValue="email"
                options={[
                  { value: "email", label: "Email" },
                  { value: "domain", label: "Domain" },
                  { value: "linkedin", label: "LinkedIn URL" },
                  { value: "name_org", label: "Name | Business" },
                ]}
              />
              <Input name="value" placeholder="value" className="col-span-2" required />
            </div>
            <Input name="reason" placeholder="Reason (optional)" />
            <SubmitButton variant="secondary">Add to list</SubmitButton>
            <p className="text-xs text-muted">
              Matching contacts are blocked immediately and their drafts pulled from the queue. Removing an entry does not unblock contacts. Do that on the contact page.
            </p>
          </ActionForm>
          <ul className="divide-y divide-border text-sm">
            {dnc.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <Badge tone="muted">{d.kind === "name_org" ? "name|business" : d.kind}</Badge>
                <span className="min-w-0 flex-1 break-all">{d.value_normalized}</span>
                <form action={removeDnc}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs text-muted underline">remove</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Templates (for agency compliance approval)">
          <p className="mb-3 text-xs text-muted">
            Track which wording has been submitted to Experior compliance and approved. Changing an approved template&apos;s wording sends it back to draft.
          </p>
          <div className="space-y-3">
            {templates.map((t) => (
              <details key={t.id} className="rounded-lg border border-border p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  <Badge tone="muted">{CHANNEL_LABELS[t.channel]}</Badge>
                  <Badge tone={TEMPLATE_TONE[t.compliance_status]}>
                    {humanize(t.compliance_status)}
                    {t.compliance_status === "approved" && t.approved_at ? ` ${formatDate(t.approved_at)}` : ""}
                  </Badge>
                </summary>
                <TemplateForm t={t} />
                <div className="mt-2">
                  <ConfirmButton action={deleteTemplate} fields={{ id: t.id }} confirmText="Delete this template?" variant="ghost">
                    Delete template
                  </ConfirmButton>
                </div>
              </details>
            ))}
            <details className="rounded-lg border border-dashed border-border p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">+ New template</summary>
              <TemplateForm />
            </details>
          </div>
        </Card>
      </div>
    </>
  );
}

function TemplateForm({ t }: { t?: Template }) {
  return (
    <ActionForm action={saveTemplate} className="mt-3 space-y-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-2 gap-2">
        <Input name="name" defaultValue={t?.name ?? ""} placeholder="Template name" required />
        <Select name="channel" defaultValue={t?.channel ?? "email"} options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))} />
      </div>
      <Input name="subject" defaultValue={t?.subject ?? ""} placeholder="Subject (email)" />
      <Textarea name="body" defaultValue={t?.body ?? ""} rows={5} placeholder="Template wording. Use {first_name}, {business} placeholders." required />
      <div className="grid grid-cols-2 gap-2">
        <Select
          name="compliance_status"
          defaultValue={t?.compliance_status ?? "draft"}
          options={[
            { value: "draft", label: "Draft" },
            { value: "submitted", label: "Submitted to compliance" },
            { value: "approved", label: "Approved by compliance" },
          ]}
        />
        <Input name="notes" defaultValue={t?.notes ?? ""} placeholder="Notes (approval #, reviewer…)" />
      </div>
      <SubmitButton variant="secondary">Save template</SubmitButton>
    </ActionForm>
  );
}
