import Link from "next/link";
import { CHANNEL_LABELS } from "@/core/constants";
import { complianceWarnings } from "@/core/compliance";
import type { Draft } from "@/core/types";
import { approveDraft, deleteDraft, markSent, rejectDraft } from "@/app/actions/drafts";
import { formatDateTime } from "@/lib/format";
import { ActionForm, ConfirmButton, CopyButton, SubmitButton } from "./forms";
import { Badge, Card, Input, Textarea } from "./ui";

export type DraftWithRefs = Draft & {
  contacts: { id: string; first_name: string | null; last_name: string | null; email: string | null; linkedin_url: string | null; organizations: { name: string } | null } | null;
};

const STATUS_TONE = { pending_approval: "warn", approved: "ok", rejected: "muted", sent: "ok", blocked_dnc: "danger" } as const;
const STATUS_LABEL = { pending_approval: "Awaiting approval", approved: "Approved", rejected: "Rejected", sent: "Sent", blocked_dnc: "Blocked (DNC)" };

export function DraftCard({ d, showContact = true }: { d: DraftWithRefs; showContact?: boolean }) {
  const c = d.contacts;
  const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(no name)" : "";
  const warnings = complianceWarnings(`${d.subject ?? ""}\n${d.body}`);
  const editable = d.status === "pending_approval";
  const full = d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="muted">{CHANNEL_LABELS[d.channel]}</Badge>
        {d.sequence_step > 0 && <Badge tone="muted">Follow-up {d.sequence_step}</Badge>}
        <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
        {showContact && c && (
          <Link href={d.lead_id ? `/leads/${d.lead_id}` : `/contacts/${c.id}`} className="font-medium text-brand hover:underline">
            {name}
            {c.organizations?.name ? ` · ${c.organizations.name}` : ""}
          </Link>
        )}
        <span className="ml-auto text-xs text-muted">{formatDateTime(d.created_at)}</span>
      </div>
      {d.channel === "email" && c?.email && <p className="mb-2 text-xs text-muted">To: {c.email}</p>}
      {d.channel === "linkedin" && (
        <p className={`mb-2 text-xs ${d.body.length > 300 ? "font-semibold text-danger" : "text-muted"}`}>
          {d.body.length}/300 characters{c?.linkedin_url ? " · " : ""}
          {c?.linkedin_url && (
            <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline">
              Open profile
            </a>
          )}
        </p>
      )}
      {warnings.length > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Check before approving: {warnings.join(", ")}.
        </p>
      )}

      {editable ? (
        <ActionForm action={approveDraft} className="space-y-2">
          <input type="hidden" name="id" value={d.id} />
          {d.channel === "email" && <Input name="subject" defaultValue={d.subject ?? ""} placeholder="Subject" aria-label="Subject" />}
          <Textarea name="body" defaultValue={d.body} rows={Math.min(16, Math.max(5, d.body.split("\n").length + 1))} aria-label="Message" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Approve</SubmitButton>
            <SubmitButton variant="secondary" name="intent" value="save">
              Save edits
            </SubmitButton>
            <CopyButton text={full} />
          </div>
        </ActionForm>
      ) : (
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-sans text-sm">{full}</pre>
      )}

      {editable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Reject…</summary>
          <ActionForm action={rejectDraft} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="id" value={d.id} />
            <Input name="rejection_reason" placeholder="Why? (helps future drafts)" />
            <SubmitButton variant="danger">Reject</SubmitButton>
          </ActionForm>
        </details>
      )}

      {d.status === "approved" && (
        <ActionForm action={markSent} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={d.id} />
          <CopyButton text={full} />
          <SubmitButton>Mark sent</SubmitButton>
        </ActionForm>
      )}
      {d.rejection_reason && <p className="mt-2 text-xs text-muted">Rejected: {d.rejection_reason}</p>}
      {(d.status === "rejected" || d.status === "blocked_dnc") && (
        <div className="mt-3">
          <ConfirmButton action={deleteDraft} fields={{ id: d.id }} confirmText="Delete this draft?" variant="ghost">
            Delete
          </ConfirmButton>
        </div>
      )}
    </Card>
  );
}
