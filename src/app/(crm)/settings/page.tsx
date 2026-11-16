import { CHANNEL_LABELS, CHANNELS, humanize } from "@/core/constants";
import { ADDRESS_PLACEHOLDER } from "@/core/compliance";
import type { DncRow, Template } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/crm";
import { formatDate } from "@/lib/format";
import { addDnc, deleteTemplate, removeDnc, saveSettings, saveTemplate } from "@/app/actions/settings";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

const TEMPLATE_TONE = { draft: "muted", submitted: "warn", approved: "ok" } as const;

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const s = await getSettings(supabase);
  const [dncRes, tplRes] = await Promise.all([
    supabase.from("do_not_contact").select("*").order("created_at", { ascending: false }),
    supabase.from("templates").select("*").order("name"),
  ]);
  const dnc = (dncRes.data ?? []) as DncRow[];
  const templates = (tplRes.data ?? []) as Template[];

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
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
