import { CONTACT_TYPE_LABELS, CONTACT_TYPES, PROFESSION_LABELS, PROFESSIONS } from "@/core/constants";
import type { Contact } from "@/core/types";
import { Field, Input, Select, Textarea } from "./ui";

/** Shared contact inputs for create + edit forms. */
export function ContactFields({
  c,
  orgs,
  defaultType = "prospect",
  showPartnerProfession,
}: {
  c?: Partial<Contact>;
  orgs: { id: string; name: string }[];
  defaultType?: string;
  showPartnerProfession?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="First name">
        <Input name="first_name" defaultValue={c?.first_name ?? ""} autoComplete="off" />
      </Field>
      <Field label="Last name">
        <Input name="last_name" defaultValue={c?.last_name ?? ""} autoComplete="off" />
      </Field>
      <Field label="Title / role">
        <Input name="title" defaultValue={c?.title ?? ""} placeholder="Owner, Partner, CPA…" />
      </Field>
      <Field label="Contact type">
        <Select
          name="contact_type"
          defaultValue={c?.contact_type ?? defaultType}
          options={CONTACT_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_LABELS[t] }))}
        />
      </Field>
      {showPartnerProfession && (
        <Field label="Profession">
          <Select name="profession" defaultValue="cpa" options={PROFESSIONS.map((p) => ({ value: p, label: PROFESSION_LABELS[p] }))} />
        </Field>
      )}
      <Field label="Email" hint="Only a published business email or one they gave you.">
        <Input name="email" type="email" defaultValue={c?.email ?? ""} autoComplete="off" />
      </Field>
      <Field label="Where the email came from" hint="e.g. company website contact page">
        <Input name="email_source" defaultValue={c?.email_source ?? ""} />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" defaultValue={c?.phone ?? ""} autoComplete="off" />
      </Field>
      <Field label="LinkedIn URL" hint="Entered by hand. We never scrape LinkedIn.">
        <Input name="linkedin_url" defaultValue={c?.linkedin_url ?? ""} placeholder="https://www.linkedin.com/in/…" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="City" className="col-span-2">
          <Input name="city" defaultValue={c?.city ?? ""} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={c?.state ?? "TX"} maxLength={20} />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">Business</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Existing business">
            <Select name="org_id" defaultValue={c?.org_id ?? ""} placeholder="— none / add new below —" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
          </Field>
          <div />
          <Field label="…or new business name">
            <Input name="org_name" placeholder="Acme Plumbing LLC" />
          </Field>
          <Field label="Business website">
            <Input name="org_website" placeholder="acmeplumbing.com" />
          </Field>
          <Field label="Industry">
            <Input name="org_industry" />
          </Field>
        </div>
      </fieldset>

      <Field label="Source (required)" hint="Where this contact came from: referral from X, chamber directory, website form…">
        <Input name="source" required defaultValue={c?.source ?? ""} />
      </Field>
      <Field label="How we got this contact (required)" hint="Compliance record: e.g. “Met at Frisco Chamber lunch 11/12, gave card”">
        <Textarea name="consent_note" required rows={2} defaultValue={c?.consent_note ?? ""} />
      </Field>
    </div>
  );
}
