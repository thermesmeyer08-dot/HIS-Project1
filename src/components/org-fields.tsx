import type { Organization } from "@/core/types";
import { Field, Input, Textarea } from "./ui";

export function OrgFields({ o }: { o?: Partial<Organization> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Business name (required)">
        <Input name="name" required defaultValue={o?.name ?? ""} />
      </Field>
      <Field label="Website">
        <Input name="website" defaultValue={o?.website ?? ""} placeholder="acme.com" />
      </Field>
      <Field label="Industry">
        <Input name="industry" defaultValue={o?.industry ?? ""} />
      </Field>
      <Field label="Size estimate" hint="e.g. 10–25 employees">
        <Input name="size_estimate" defaultValue={o?.size_estimate ?? ""} />
      </Field>
      <Field label="City">
        <Input name="city" defaultValue={o?.city ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="County">
          <Input name="county" defaultValue={o?.county ?? ""} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={o?.state ?? "TX"} />
        </Field>
      </div>
      <Field label="Source (required)">
        <Input name="source" required defaultValue={o?.source ?? ""} placeholder="Chamber directory, referral, web search…" />
      </Field>
      <Field label="Source detail">
        <Input name="source_detail" defaultValue={o?.source_detail ?? ""} placeholder="URL or who referred" />
      </Field>
      <Field label="Texas taxpayer ID" hint="From Comptroller data, if known">
        <Input name="tx_taxpayer_id" defaultValue={o?.tx_taxpayer_id ?? ""} />
      </Field>
      <Field label="NAICS code">
        <Input name="naics" defaultValue={o?.naics ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="is_faith_based" defaultChecked={o?.is_faith_based ?? false} /> Faith-based organization
      </label>
      <Field label="Research notes" className="sm:col-span-2">
        <Textarea name="research_summary" rows={3} defaultValue={o?.research_summary ?? ""} />
      </Field>
    </div>
  );
}
