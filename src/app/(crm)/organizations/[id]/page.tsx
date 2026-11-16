import Link from "next/link";
import { notFound } from "next/navigation";
import type { Contact, Organization } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { deleteOrganization, updateOrganization } from "@/app/actions/organizations";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { OrgFields } from "@/components/org-fields";
import { Badge, ButtonLink, Card, PageHeader, TexasBadge } from "@/components/ui";

export default async function OrganizationPage({ params }: PageProps<"/organizations/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as Organization;
  const { data: contacts } = await supabase.from("contacts").select("*").eq("org_id", id).order("last_name");

  return (
    <>
      <PageHeader
        title={o.name}
        subtitle={
          <span className="flex flex-wrap gap-2">
            {[o.industry, o.city].filter(Boolean).join(" · ")}
            <TexasBadge state={o.state} />
            {o.is_faith_based && <Badge tone="muted">Faith-based</Badge>}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <ActionForm action={updateOrganization} className="space-y-3">
            <input type="hidden" name="id" value={o.id} />
            <OrgFields o={o} />
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card title="People" actions={<ButtonLink href="/contacts/new">+ Add</ButtonLink>}>
            <ul className="space-y-1 text-sm">
              {((contacts ?? []) as Contact[]).map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="text-brand hover:underline">
                    {fullName(c)}
                  </Link>
                  {c.title && <span className="text-muted"> · {c.title}</span>}
                </li>
              ))}
              {(contacts ?? []).length === 0 && <li className="text-muted">No people linked yet.</li>}
            </ul>
          </Card>
          <ConfirmButton action={deleteOrganization} fields={{ id: o.id }} confirmText="Delete this business? People linked to it are kept but unlinked.">
            Delete business
          </ConfirmButton>
        </div>
      </div>
    </>
  );
}
