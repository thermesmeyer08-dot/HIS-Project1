import Link from "next/link";
import { notFound } from "next/navigation";
import { CHANNEL_LABELS, CHANNELS, LEAD_STAGES, PRODUCT_LABELS, PRODUCTS, STAGE_LABELS } from "@/core/constants";
import type { Activity, Contact, InboundEvent, Lead, Organization } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { changeStage, deleteLead, requestBriefRebuild, updateLead } from "@/app/actions/leads";
import { InboundCard } from "@/components/inbound-card";
import { createDraft } from "@/app/actions/drafts";
import { DraftCard, type DraftWithRefs } from "@/components/draft-card";
import { ActionForm, AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/forms";
import { Timeline } from "@/components/timeline";
import { Badge, Card, Field, Input, PageHeader, ScoreBadge, Select, StageBadge, Textarea, TexasBadge } from "@/components/ui";

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const l = lead as Lead;

  const [contactRes, orgRes, actRes, draftRes, inboundRes] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", l.contact_id).single(),
    l.org_id ? supabase.from("organizations").select("*").eq("id", l.org_id).single() : Promise.resolve({ data: null }),
    supabase.from("activities").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase
      .from("drafts")
      .select("*, contacts(id, first_name, last_name, email, linkedin_url, organizations(name))")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("inbound_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  const c = contactRes.data as Contact;
  const org = orgRes.data as Organization | null;
  const drafts = (draftRes.data ?? []) as DraftWithRefs[];

  return (
    <>
      <PageHeader
        title={fullName(c)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {[c.title, org?.name, org?.city].filter(Boolean).join(" · ")}
            <StageBadge stage={l.stage} />
            <ScoreBadge score={l.score} />
            {c.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
            <TexasBadge state={c.state ?? org?.state} />
          </span>
        }
        actions={
          <form action={changeStage} className="flex items-center gap-2">
            <input type="hidden" name="id" value={l.id} />
            <AutoSubmitSelect name="stage" defaultValue={l.stage} aria-label="Stage">
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {l.call_prep_brief && (
            <Card
              title="Call prep brief"
              actions={
                <form action={requestBriefRebuild}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="text-xs text-brand underline">Rebuild on next run</button>
                </form>
              }
            >
              <div className="whitespace-pre-wrap text-sm">{l.call_prep_brief}</div>
            </Card>
          )}
          <InboundCard events={(inboundRes.data ?? []) as InboundEvent[]} />

          <Card title="Lead details">
            <ActionForm action={updateLead} className="space-y-3">
              <input type="hidden" name="id" value={l.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Stage">
                  <Select name="stage" defaultValue={l.stage} options={LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))} />
                </Field>
                <Field label="Score (0–100)">
                  <Input name="score" type="number" min={0} max={100} defaultValue={l.score ?? ""} />
                </Field>
                <Field label="Niche">
                  <Input name="niche" defaultValue={l.niche} />
                </Field>
              </div>
              <Field label="Score reasoning">
                <Textarea name="score_reasoning" rows={2} defaultValue={l.score_reasoning ?? ""} />
              </Field>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Product interest</legend>
                <div className="flex flex-wrap gap-2">
                  {PRODUCTS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                      <input type="checkbox" name="product_interest" value={p} defaultChecked={l.product_interest.includes(p)} />
                      {PRODUCT_LABELS[p]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Next action" className="sm:col-span-2">
                  <Input name="next_action" defaultValue={l.next_action ?? ""} placeholder="e.g. Call after Thursday lunch" />
                </Field>
                <Field label="Due">
                  <Input name="next_action_date" type="date" defaultValue={l.next_action_date ?? ""} />
                </Field>
              </div>
              <Field label="Your notes">
                <Textarea name="owner_notes" rows={3} defaultValue={l.owner_notes ?? ""} />
              </Field>
              <Field label="Call prep brief" hint="Filled in automatically for booked meetings in Phase 2. You can edit it.">
                <Textarea name="call_prep_brief" rows={3} defaultValue={l.call_prep_brief ?? ""} />
              </Field>
              <SubmitButton>Save lead</SubmitButton>
            </ActionForm>
          </Card>

          <Card title={`Drafts (${drafts.length})`}>
            <div className="space-y-3">
              {drafts.map((d) => (
                <DraftCard key={d.id} d={d} showContact={false} />
              ))}
            </div>
            {c.do_not_contact ? (
              <p className="mt-3 text-sm text-danger">This contact is on the do-not-contact list. No drafts can be created.</p>
            ) : (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand">+ Write a draft by hand</summary>
                <ActionForm action={createDraft} resetOnSuccess className="mt-3 space-y-2">
                  <input type="hidden" name="contact_id" value={c.id} />
                  <input type="hidden" name="lead_id" value={l.id} />
                  <Select name="channel" defaultValue="email" options={CHANNELS.map((ch) => ({ value: ch, label: CHANNEL_LABELS[ch] }))} />
                  <Input name="subject" placeholder="Subject (email only)" />
                  <Textarea name="body" rows={6} placeholder="Message. For email, the booking link, signature and opt-out footer are added automatically." />
                  <SubmitButton variant="secondary">Add to approval queue</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Contact" actions={<Link href={`/contacts/${c.id}`} className="text-sm text-brand hover:underline">Edit</Link>}>
            <dl className="space-y-1 text-sm">
              {c.email && (
                <div>
                  <dt className="sr-only">Email</dt>
                  <dd className="break-all">{c.email}</dd>
                </div>
              )}
              {c.phone && (
                <dd>
                  <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="text-brand underline">
                    {c.phone}
                  </a>
                </dd>
              )}
              {c.linkedin_url && (
                <dd>
                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-brand underline">
                    LinkedIn profile
                  </a>
                </dd>
              )}
              {org?.website && (
                <dd>
                  <a href={org.website.startsWith("http") ? org.website : `https://${org.website}`} target="_blank" rel="noreferrer" className="text-brand underline">
                    {org.website}
                  </a>
                </dd>
              )}
              <dd className="pt-2 text-xs text-muted">Source: {c.source}</dd>
              <dd className="text-xs text-muted">How obtained: {c.consent_note}</dd>
            </dl>
            {org && (
              <Link href={`/organizations/${org.id}`} className="mt-3 block text-sm text-brand hover:underline">
                Business: {org.name} →
              </Link>
            )}
          </Card>
          <Timeline activities={(actRes.data ?? []) as Activity[]} contactId={c.id} leadId={l.id} />
          <ConfirmButton action={deleteLead} fields={{ id: l.id }} confirmText="Delete this lead and its drafts? The contact is kept.">
            Delete lead
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}
