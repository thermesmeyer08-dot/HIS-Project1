import { humanize, MANUAL_ACTIVITY_TYPES } from "@/core/constants";
import type { Activity } from "@/core/types";
import { addActivity } from "@/app/actions/leads";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "./forms";
import { Card, Empty, Select, Textarea } from "./ui";

const ICON: Record<string, string> = {
  note: "✎", email_sent: "✉", linkedin_sent: "in", facebook_sent: "f", mailer_sent: "✉", call: "☎",
  reply: "↩", meeting: "◷", stage_change: "→", inbound: "★", dnc: "⛔", import: "⇅",
};

export function Timeline({ activities, contactId, leadId }: { activities: Activity[]; contactId: string; leadId?: string }) {
  return (
    <Card title="Activity">
      <ActionForm action={addActivity} resetOnSuccess className="mb-4 space-y-2">
        <input type="hidden" name="contact_id" value={contactId} />
        {leadId && <input type="hidden" name="lead_id" value={leadId} />}
        <div className="grid grid-cols-2 gap-2">
          <Select name="type" defaultValue="note" options={MANUAL_ACTIVITY_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
          <input type="datetime-local" name="occurred_at" aria-label="When (optional)" className="rounded-lg border border-border bg-surface px-3 py-2" />
        </div>
        <Textarea name="body" rows={2} placeholder="What happened? (call notes, reply summary, meeting outcome…)" aria-label="Note" />
        <SubmitButton variant="secondary">Log activity</SubmitButton>
      </ActionForm>
      {activities.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">
                {ICON[a.type] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">
                  {humanize(a.type)} · {formatDateTime(a.occurred_at)}
                </div>
                {a.body && <p className="whitespace-pre-wrap break-words text-sm">{a.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
