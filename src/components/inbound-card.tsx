import type { InboundEvent } from "@/core/types";
import { formatDateTime } from "@/lib/format";
import { Badge, Card } from "./ui";

const money = (n: unknown) => (typeof n === "number" ? `$${n.toLocaleString("en-US")}` : null);

/** What the person submitted through the website calculator or booking page. */
export function InboundCard({ events }: { events: InboundEvent[] }) {
  if (!events.length) return null;
  return (
    <Card title="What they submitted">
      <ul className="space-y-4">
        {events.map((e) => {
          const p = (e.parsed ?? {}) as Record<string, unknown>;
          const answers = (p.answers as { question: string; answer: string }[] | undefined) ?? [];
          const rows: [string, string | null][] =
            e.kind === "calculator"
              ? [
                  ["For", (p.path as string) ?? null],
                  ["Calculator estimate", money(p.estimate) ?? (p.estimate_text as string) ?? null],
                  ["Term", (p.term as string) ?? null],
                  ["Breakdown", (p.details as string) ?? null],
                  ["Consent box", p.consent ? "Checked" : "Not checked"],
                ]
              : [
                  ["Meeting", p.start ? formatDateTime(p.start as string) : null],
                  ...answers.map((a) => [a.question, a.answer] as [string, string]),
                  ["Status", p.cancelled ? "Cancelled" : "Booked"],
                ];
          return (
            <li key={e.id}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <Badge tone="muted">{e.kind === "calculator" ? "Website calculator" : "Booking"}</Badge>
                {formatDateTime(e.created_at)}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
