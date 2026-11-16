import Link from "next/link";
import { CHANNEL_LABELS, CHANNELS, type Channel } from "@/core/constants";
import { requireUser } from "@/lib/auth";
import { DraftCard, type DraftWithRefs } from "@/components/draft-card";
import { cx, Empty, PageHeader } from "@/components/ui";

const TABS = [
  ["pending_approval", "Awaiting approval"],
  ["approved", "Approved, not sent"],
  ["sent", "Sent"],
  ["rejected", "Rejected"],
  ["blocked_dnc", "Blocked"],
] as const;

export default async function QueuePage({ searchParams }: PageProps<"/queue">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const status = TABS.some(([s]) => s === sp.status) ? (sp.status as string) : "pending_approval";
  const channel = (CHANNELS as readonly string[]).includes(sp.channel as string) ? (sp.channel as Channel) : null;

  let q = supabase
    .from("drafts")
    .select("*, contacts(id, first_name, last_name, email, linkedin_url, organizations(name))")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending_approval" })
    .limit(100);
  if (channel) q = q.eq("channel", channel);
  const drafts = ((await q).data ?? []) as DraftWithRefs[];

  const link = (s: string, c: string | null) => `/queue?status=${s}${c ? `&channel=${c}` : ""}`;

  return (
    <>
      <PageHeader title="Approval queue" subtitle="Nothing is ever sent automatically. Approve, then send it yourself." />
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-sm">
        {TABS.map(([s, label]) => (
          <Link key={s} href={link(s, channel)} className={cx("whitespace-nowrap rounded-full border px-3 py-1", s === status ? "border-brand bg-brand-soft font-medium text-brand" : "border-border bg-surface")}>
            {label}
          </Link>
        ))}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 text-xs">
        <Link href={link(status, null)} className={cx("rounded-full border px-2.5 py-1", !channel ? "border-brand text-brand" : "border-border")}>
          All channels
        </Link>
        {CHANNELS.map((c) => (
          <Link key={c} href={link(status, c)} className={cx("whitespace-nowrap rounded-full border px-2.5 py-1", channel === c ? "border-brand text-brand" : "border-border")}>
            {CHANNEL_LABELS[c]}
          </Link>
        ))}
      </div>
      {drafts.length === 0 ? (
        <Empty>{status === "pending_approval" ? "You're all caught up. 🙌" : "Nothing here."}</Empty>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <DraftCard key={d.id} d={d} />
          ))}
        </div>
      )}
    </>
  );
}
