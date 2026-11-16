import Link from "next/link";
import { PARTNER_STAGES, PROFESSION_LABELS, PROFESSIONS, humanize, type Profession } from "@/core/constants";
import type { ReferralPartner } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { formatDate, fullName } from "@/lib/format";
import { Badge, btn, ButtonLink, Empty, PageHeader } from "@/components/ui";

type Row = ReferralPartner & {
  contacts: { id: string; first_name: string | null; last_name: string | null; title: string | null; do_not_contact: boolean; organizations: { name: string } | null } | null;
};

export default async function PartnersPage({ searchParams }: PageProps<"/partners">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const profession = typeof sp.profession === "string" ? sp.profession : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";

  let query = supabase
    .from("referral_partners")
    .select("*, contacts(id, first_name, last_name, title, do_not_contact, organizations(name))")
    .order("last_touch_at", { ascending: true, nullsFirst: true });
  if ((PROFESSIONS as readonly string[]).includes(profession)) query = query.eq("profession", profession);
  if ((PARTNER_STAGES as readonly string[]).includes(stage)) query = query.eq("relationship_stage", stage);
  const rows = ((await query).data ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Referral partners"
        subtitle="CPAs, bankers, attorneys, P&C agents and advisors. Sorted by longest since last touch."
        actions={<ButtonLink href="/contacts/new?type=referral_partner" variant="primary">+ Add partner</ButtonLink>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="profession" defaultValue={profession} className="rounded-lg border border-border bg-surface px-3 py-2">
          <option value="">All professions</option>
          {PROFESSIONS.map((p) => (
            <option key={p} value={p}>
              {PROFESSION_LABELS[p]}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage} className="rounded-lg border border-border bg-surface px-3 py-2">
          <option value="">All relationship stages</option>
          {PARTNER_STAGES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <button className={btn.primary}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <Empty>No referral partners yet.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/contacts/${p.contact_id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-brand-soft/50">
                <div className="min-w-0">
                  <div className="font-medium">{fullName(p.contacts)}</div>
                  <div className="text-sm text-muted">{[p.contacts?.title, p.contacts?.organizations?.name].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone="muted">{PROFESSION_LABELS[p.profession as Profession]}</Badge>
                  <Badge tone={p.relationship_stage === "active" ? "ok" : "muted"}>{humanize(p.relationship_stage)}</Badge>
                  <span className="text-muted">
                    ↓{p.referrals_received} ↑{p.referrals_given}
                  </span>
                  <Badge tone={p.last_touch_at ? "muted" : "warn"}>{p.last_touch_at ? `Touched ${formatDate(p.last_touch_at)}` : "Never touched"}</Badge>
                  {p.contacts?.do_not_contact && <Badge tone="danger">DNC</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
