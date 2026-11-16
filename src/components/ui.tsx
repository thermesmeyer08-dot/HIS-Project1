import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STAGE_LABELS, type LeadStage } from "@/core/constants";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const btnBase =
  "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3.5 text-sm font-medium transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
export const btn = {
  primary: `${btnBase} bg-brand text-white hover:opacity-90 dark:text-[#12161c]`,
  secondary: `${btnBase} border border-border bg-surface hover:bg-brand-soft`,
  danger: `${btnBase} border border-danger/40 text-danger hover:bg-danger/10`,
  ghost: `${btnBase} hover:bg-brand-soft`,
};

export function ButtonLink({ href, variant = "secondary", children }: { href: string; variant?: keyof typeof btn; children: ReactNode }) {
  return (
    <Link href={href} className={btn[variant]}>
      {children}
    </Link>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={cx(inputCls, props.className)} />;
}
export function Select({ options, placeholder, ...props }: ComponentProps<"select"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...props} className={cx(inputCls, props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const STAGE_COLORS: Partial<Record<LeadStage, string>> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  researched: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  drafted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  contacted: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  replied: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  meeting_booked: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  needs_analysis: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  app_submitted: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  placed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  lost: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  nurture: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  return <Badge className={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

export function Badge({ children, className, tone }: { children: ReactNode; className?: string; tone?: "warn" | "danger" | "ok" | "muted" }) {
  const tones = {
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tone && tones[tone], className)}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">{children}</p>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted">—</span>;
  const tone = score >= 70 ? "ok" : score >= 40 ? "warn" : "muted";
  return <Badge tone={tone}>{score}</Badge>;
}

export function TexasBadge({ state }: { state: string | null | undefined }) {
  const s = (state ?? "").trim().toLowerCase();
  if (!s) return <Badge tone="warn">Location unknown</Badge>;
  if (s === "tx" || s === "texas") return null;
  return <Badge tone="danger">Outside TX</Badge>;
}
