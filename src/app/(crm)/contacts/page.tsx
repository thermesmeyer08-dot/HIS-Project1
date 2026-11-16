import Link from "next/link";
import { CONTACT_TYPE_LABELS, CONTACT_TYPES, type ContactType } from "@/core/constants";
import type { ContactWithOrg } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { Badge, btn, ButtonLink, Empty, PageHeader, TexasBadge } from "@/components/ui";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const type = one(sp.type);
  const dnc = one(sp.dnc);

  let query = supabase.from("contacts").select("*, organizations(id, name, website)").order("created_at", { ascending: false }).limit(500);
  if ((CONTACT_TYPES as readonly string[]).includes(type)) query = query.eq("contact_type", type);
  if (dnc === "1") query = query.eq("do_not_contact", true);
  const { data } = await query;
  let contacts = (data ?? []) as ContactWithOrg[];
  if (q) {
    contacts = contacts.filter((c) =>
      [fullName(c), c.email, c.organizations?.name, c.city, c.title].filter(Boolean).some((s) => s!.toLowerCase().includes(q)),
    );
  }

  return (
    <>
      <PageHeader title="Contacts" subtitle={`${contacts.length} shown`} actions={<ButtonLink href="/contacts/new" variant="primary">+ Add contact</ButtonLink>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search…" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2" />
        <select name="type" defaultValue={type} className="rounded-lg border border-border bg-surface px-3 py-2">
          <option value="">All types</option>
          {CONTACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="dnc" value="1" defaultChecked={dnc === "1"} /> DNC only
        </label>
        <button className={btn.primary}>Filter</button>
      </form>
      {contacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link href={`/contacts/${c.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-brand-soft/50">
                <span className="font-medium">{fullName(c)}</span>
                <span className="text-sm text-muted">{[c.title, c.organizations?.name, c.city].filter(Boolean).join(" · ")}</span>
                <span className="ml-auto flex gap-1">
                  <Badge tone="muted">{CONTACT_TYPE_LABELS[c.contact_type as ContactType]}</Badge>
                  {c.do_not_contact && <Badge tone="danger">DNC</Badge>}
                  {c.contact_type === "prospect" && <TexasBadge state={c.state} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
