import Link from "next/link";
import { CLOSED_STAGES, LEAD_STAGES, STAGE_LABELS, type LeadStage } from "@/core/constants";
import type { Activity, LeadWithRefs } from "@/core/types";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, fullName, isoDaysAgo, todayCentral } from "@/lib/format";
import { completeTask } from "@/app/actions/leads";
import { SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, Empty, PageHeader, StageBadge } from "@/components/ui";

export default async function Dashboard() {
  const { supabase } = await requireUser();
  const today = todayCentral();

  const [stagesRes, tasksRes, pendingRes, approvedRes, activityRes, newWeekRes] = await Promise.all([
    supabase.from("leads").select("stage"),
    supabase
      .from("leads")
      .select("*, contacts(id, first_name, last_name, email, state, do_not_contact, title), organizations(id, name, city, industry)")
      .not("next_action_date", "is", null)
      .lte("next_action_date", today)
      .not("stage", "in", `(${CLOSED_STAGES.join(",")})`)
      .order("next_action_date")
      .limit(25),
    supabase.from("drafts").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("drafts").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("activities").select("*").order("occurred_at", { ascending: false }).limit(8),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", isoDaysAgo(7)),
  ]);

  const counts = new Map<LeadStage, number>();
  (stagesRes.data ?? []).forEach((r: { stage: LeadStage }) => counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1));
  const tasks = (tasksRes.data ?? []) as LeadWithRefs[];
  const activities = (activityRes.data ?? []) as Activity[];
  const pending = pendingRes.count ?? 0;
  const approved = approvedRes.count ?? 0;
  const openTotal = LEAD_STAGES.filter((s) => !CLOSED_STAGES.includes(s)).reduce((n, s) => n + (counts.get(s) ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Good day, Tim"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })}
        actions={
          <>
            <ButtonLink href="/contacts/new" variant="primary">
              + Add contact
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat href="/queue" label="Awaiting approval" value={pending} highlight={pending > 0} />
        <Stat href="/queue?status=approved" label="Approved, not sent" value={approved} />
        <Stat href="/leads" label="Open leads" value={openTotal} />
        <Stat href="/leads?sort=new" label="New this week" value={newWeekRes.count ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={`Today's tasks (${tasks.length})`} className="lg:col-span-3">
          {tasks.length === 0 ? (
            <Empty>Nothing due. Set a “next action” on a lead to see it here.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((l) => (
                <li key={l.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${l.id}`} className="font-medium text-brand hover:underline">
                      {fullName(l.contacts)}
                      {l.organizations?.name ? ` · ${l.organizations.name}` : ""}
                    </Link>
                    <div className="text-sm">{l.next_action ?? "Follow up"}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <StageBadge stage={l.stage} />
                      {l.next_action_date! < today ? <Badge tone="danger">Overdue · {formatDate(l.next_action_date)}</Badge> : <Badge tone="warn">Today</Badge>}
                    </div>
                  </div>
                  <form action={completeTask}>
                    <input type="hidden" name="id" value={l.id} />
                    <SubmitButton variant="secondary">Done</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pipeline" className="lg:col-span-2">
          <ul className="space-y-1.5">
            {LEAD_STAGES.map((s) => {
              const n = counts.get(s) ?? 0;
              const max = Math.max(1, ...counts.values());
              return (
                <li key={s}>
                  <Link href={`/leads?stage=${s}`} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-brand-soft">
                    <span className="w-32 shrink-0">{STAGE_LABELS[s]}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Recent activity" className="lg:col-span-5">
          {activities.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 py-2">
                  <span className="w-28 shrink-0 text-xs text-muted">{formatDateTime(a.occurred_at)}</span>
                  <Link href={a.lead_id ? `/leads/${a.lead_id}` : `/contacts/${a.contact_id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {a.body}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ href, label, value, highlight }: { href: string; label: string; value: number; highlight?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border bg-surface p-4 shadow-sm hover:border-brand ${highlight ? "border-accent" : "border-border"}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </Link>
  );
}
