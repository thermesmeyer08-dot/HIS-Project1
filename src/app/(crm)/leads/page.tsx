import Link from "next/link";
import { CLOSED_STAGES, LEAD_STAGES, PRODUCT_LABELS, PRODUCTS, STAGE_LABELS, type LeadStage, type Product } from "@/core/constants";
import type { LeadWithRefs } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { addDays, formatDate, fullName, todayCentral } from "@/lib/format";
import { Badge, btn, ButtonLink, Empty, PageHeader, ScoreBadge, StageBadge, TexasBadge } from "@/components/ui";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const f = {
    q: one(sp.q).trim(),
    stage: one(sp.stage),
    product: one(sp.product),
    niche: one(sp.niche),
    min: one(sp.min),
    due: one(sp.due),
    show: one(sp.show) || "open",
    sort: one(sp.sort) || "next",
  };
  const today = todayCentral();

  let query = supabase
    .from("leads")
    .select("*, contacts(id, first_name, last_name, email, state, do_not_contact, title), organizations(id, name, city, industry)")
    .limit(500);
  if (f.stage && (LEAD_STAGES as readonly string[]).includes(f.stage)) query = query.eq("stage", f.stage);
  else if (f.show === "open") query = query.not("stage", "in", `(${CLOSED_STAGES.join(",")})`);
  if (f.product && (PRODUCTS as readonly string[]).includes(f.product)) query = query.contains("product_interest", [f.product]);
  if (f.niche) query = query.eq("niche", f.niche);
  if (f.min && !Number.isNaN(Number(f.min))) query = query.gte("score", Number(f.min));
  if (f.due === "overdue") query = query.lt("next_action_date", today);
  if (f.due === "today") query = query.lte("next_action_date", today);
  if (f.due === "week") query = query.lte("next_action_date", addDays(today, 7));
  if (f.sort === "score") query = query.order("score", { ascending: false, nullsFirst: false });
  else if (f.sort === "new") query = query.order("created_at", { ascending: false });
  else query = query.order("next_action_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });

  const { data, error } = await query;
  let leads = (data ?? []) as LeadWithRefs[];
  if (f.q) {
    const q = f.q.toLowerCase();
    leads = leads.filter((l) =>
      [fullName(l.contacts), l.contacts?.email, l.organizations?.name, l.organizations?.city, l.organizations?.industry]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    );
  }
  const niches = Array.from(new Set(((await supabase.from("leads").select("niche")).data ?? []).map((r: { niche: string }) => r.niche))).sort();

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} shown`}
        actions={
          <>
            <ButtonLink href="/data">Import / export</ButtonLink>
            <ButtonLink href="/leads/new" variant="primary">
              + New lead
            </ButtonLink>
          </>
        }
      />
      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <input name="q" defaultValue={f.q} placeholder="Search name, business, city…" className="col-span-2 rounded-lg border border-border bg-surface px-3 py-2" />
        <Sel name="stage" value={f.stage} placeholder="Any stage" options={LEAD_STAGES.map((s) => [s, STAGE_LABELS[s as LeadStage]])} />
        <Sel name="product" value={f.product} placeholder="Any product" options={PRODUCTS.map((p) => [p, PRODUCT_LABELS[p as Product]])} />
        <Sel name="niche" value={f.niche} placeholder="Any niche" options={niches.map((n) => [n, n])} />
        <Sel name="due" value={f.due} placeholder="Any due date" options={[["overdue", "Overdue"], ["today", "Due today"], ["week", "Due this week"]]} />
        <Sel name="sort" value={f.sort} options={[["next", "Sort: next action"], ["score", "Sort: score"], ["new", "Sort: newest"]]} />
        <input name="min" defaultValue={f.min} inputMode="numeric" placeholder="Min score" className="rounded-lg border border-border bg-surface px-3 py-2" />
        <Sel name="show" value={f.show} options={[["open", "Open only"], ["all", "Incl. placed/lost"]]} />
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <button className={`${btn.primary} flex-1`}>Filter</button>
          <Link href="/leads" className={btn.ghost}>
            Clear
          </Link>
        </div>
      </form>

      {error && <p className="mb-3 text-sm text-danger">{error.message}</p>}
      {leads.length === 0 ? (
        <Empty>No leads match. Add one, or import a CSV.</Empty>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="space-y-2 md:hidden">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="block rounded-xl border border-border bg-surface p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{fullName(l.contacts)}</span>
                    <ScoreBadge score={l.score} />
                  </div>
                  <div className="text-sm text-muted">{[l.organizations?.name, l.organizations?.city].filter(Boolean).join(" · ")}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StageBadge stage={l.stage} />
                    {l.contacts?.do_not_contact && <Badge tone="danger">DNC</Badge>}
                    <TexasBadge state={l.contacts?.state} />
                    {l.next_action_date && <Badge tone={l.next_action_date < today ? "danger" : "muted"}>{formatDate(l.next_action_date)}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Interest</th>
                  <th className="px-3 py-2">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-brand-soft/50">
                    <td className="px-3 py-2">
                      <Link href={`/leads/${l.id}`} className="font-medium text-brand hover:underline">
                        {fullName(l.contacts)}
                      </Link>
                      <div className="flex gap-1">
                        {l.contacts?.do_not_contact && <Badge tone="danger">DNC</Badge>}
                        <TexasBadge state={l.contacts?.state} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {l.organizations?.name}
                      <div className="text-xs text-muted">{[l.organizations?.industry, l.organizations?.city].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StageBadge stage={l.stage} />
                    </td>
                    <td className="px-3 py-2">
                      <ScoreBadge score={l.score} />
                    </td>
                    <td className="px-3 py-2 text-xs">{l.product_interest.map((p) => PRODUCT_LABELS[p]).join(", ")}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-56 truncate">{l.next_action}</div>
                      {l.next_action_date && (
                        <div className={`text-xs ${l.next_action_date < today ? "font-medium text-danger" : "text-muted"}`}>{formatDate(l.next_action_date)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Sel({ name, value, options, placeholder }: { name: string; value: string; options: (readonly [string, string] | string[])[]; placeholder?: string }) {
  return (
    <select name={name} defaultValue={value} className="rounded-lg border border-border bg-surface px-3 py-2">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
