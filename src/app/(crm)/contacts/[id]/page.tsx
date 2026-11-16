import Link from "next/link";
import { notFound } from "next/navigation";
import { PARTNER_STAGES, PROFESSION_LABELS, PROFESSIONS, humanize } from "@/core/constants";
import type { Activity, Contact, Lead, ReferralPartner } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { formatDate, fullName } from "@/lib/format";
import { deleteContact, setDoNotContact, updateContact, updatePartner } from "@/app/actions/contacts";
import { createLeadForContact } from "@/app/actions/leads";
import { ContactFields } from "@/components/contact-fields";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Timeline } from "@/components/timeline";
import { Badge, Card, Field, Input, PageHeader, Select, StageBadge, Textarea, TexasBadge } from "@/components/ui";

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as Contact;

  const [orgs, leads, acts, partner] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase.from("leads").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("activities").select("*").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("referral_partners").select("*").eq("contact_id", id).maybeSingle(),
  ]);
  const p = partner.data as ReferralPartner | null;

  return (
    <>
      <PageHeader
        title={fullName(c)}
        subtitle={
          <span className="flex flex-wrap gap-2">
            <Badge tone="muted">{humanize(c.contact_type)}</Badge>
            {c.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
            {c.contact_type === "prospect" && <TexasBadge state={c.state} />}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {c.do_not_contact && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              Blocked from all outreach. {c.dnc_reason}
            </p>
          )}

          {(c.contact_type === "referral_partner" || p) && (
            <Card title="Referral partner">
              <ActionForm action={updatePartner} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="contact_id" value={c.id} />
                <Field label="Profession">
                  <Select name="profession" defaultValue={p?.profession ?? "other"} options={PROFESSIONS.map((x) => ({ value: x, label: PROFESSION_LABELS[x] }))} />
                </Field>
                <Field label="Relationship">
                  <Select name="relationship_stage" defaultValue={p?.relationship_stage ?? "identified"} options={PARTNER_STAGES.map((x) => ({ value: x, label: humanize(x) }))} />
                </Field>
                <Field label="Referrals they sent you">
                  <Input name="referrals_received" type="number" min={0} defaultValue={p?.referrals_received ?? 0} />
                </Field>
                <Field label="Referrals you sent them">
                  <Input name="referrals_given" type="number" min={0} defaultValue={p?.referrals_given ?? 0} />
                </Field>
                <Field label="Notes" className="sm:col-span-2" hint={p?.last_touch_at ? `Last touch: ${formatDate(p.last_touch_at)}` : "No touches logged yet."}>
                  <Textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} />
                </Field>
                <div>
                  <SubmitButton>Save partner details</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card title="Leads">
            {(leads.data ?? []).length === 0 && <p className="mb-2 text-sm text-muted">No leads for this person.</p>}
            <ul className="mb-3 space-y-2">
              {((leads.data ?? []) as Lead[]).map((l) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className="flex items-center gap-2 text-sm hover:underline">
                    <StageBadge stage={l.stage} /> {l.niche} · opened {formatDate(l.created_at)}
                  </Link>
                </li>
              ))}
            </ul>
            <form action={createLeadForContact}>
              <input type="hidden" name="contact_id" value={c.id} />
              <SubmitButton variant="secondary">+ Open a new lead</SubmitButton>
            </form>
          </Card>

          <Card title="Edit contact">
            <ActionForm action={updateContact} className="space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <ContactFields c={c} orgs={orgs.data ?? []} />
              <SubmitButton>Save contact</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Do not contact">
            <ActionForm action={setDoNotContact} className="space-y-2">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="on" value={c.do_not_contact ? "false" : "true"} />
              {!c.do_not_contact && <Input name="reason" placeholder="Reason (e.g. replied unsubscribe)" />}
              <SubmitButton variant={c.do_not_contact ? "secondary" : "danger"}>
                {c.do_not_contact ? "Remove do-not-contact" : "Mark do-not-contact"}
              </SubmitButton>
            </ActionForm>
          </Card>
          <Timeline activities={(acts.data ?? []) as Activity[]} contactId={c.id} />
          <ConfirmButton action={deleteContact} fields={{ id: c.id }} confirmText="Permanently delete this contact, their leads, drafts and activity? This can't be undone.">
            Delete contact
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}
