import Link from "next/link";
import type { Organization } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { createOrganization } from "@/app/actions/organizations";
import { ActionForm, SubmitButton } from "@/components/forms";
import { OrgFields } from "@/components/org-fields";
import { btn, Card, Empty, PageHeader, TexasBadge } from "@/components/ui";

export default async function OrganizationsPage({ searchParams }: PageProps<"/organizations">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const { data } = await supabase.from("organizations").select("*").order("name").limit(1000);
  let orgs = (data ?? []) as Organization[];
  if (q) orgs = orgs.filter((o) => [o.name, o.city, o.industry, o.website].filter(Boolean).some((s) => s!.toLowerCase().includes(q)));

  return (
    <>
      <PageHeader title="Businesses" subtitle={`${orgs.length} shown`} />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, city, industry…" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2" />
        <button className={btn.primary}>Search</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {orgs.length === 0 ? (
            <Empty>No businesses yet.</Empty>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {orgs.map((o) => (
                <li key={o.id}>
                  <Link href={`/organizations/${o.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-brand-soft/50">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-sm text-muted">{[o.industry, o.city].filter(Boolean).join(" · ")}</span>
                    <span className="ml-auto">
                      <TexasBadge state={o.state} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card title="Add business">
          <ActionForm action={createOrganization} className="space-y-3">
            <OrgFields />
            <SubmitButton>Add business</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
