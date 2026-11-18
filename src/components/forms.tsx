"use client";

import { useRouter } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btn, cx } from "./ui";

type State = { error?: string; ok?: string } | undefined;

/** Pending flag for ActionForm submits (useFormStatus can't see manual transitions). */
const PendingContext = createContext<boolean | null>(null);

/**
 * Wraps a server action that returns { error?, ok? } and shows the message.
 * If an error comes back with ok set to a path (e.g. a duplicate), a link is shown.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (state: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok && !state.error) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      // Submit manually so React doesn't clear the fields when the action
      // returns an error. The clicked button's name/value is included.
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={isPending}>{children}</PendingContext.Provider>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {state.error}
          {state.ok?.startsWith("/") && (
            <>
              {" "}
              <a className="font-medium underline" href={state.ok}>
                Open existing record
              </a>
            </>
          )}
        </p>
      )}
      {state?.ok && !state.error && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  className,
  formAction,
}: {
  children: ReactNode;
  variant?: keyof typeof btn;
  name?: string;
  value?: string;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const { pending: formPending } = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = ctxPending ?? formPending;
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={cx(btn[variant], className)}>
      {pending ? "Working…" : children}
    </button>
  );
}

/** A plain form posting to a void server action, with a confirm() prompt. */
export function ConfirmButton({
  action,
  fields,
  confirmText,
  children,
  variant = "danger",
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirmText: string;
  children: ReactNode;
  variant?: keyof typeof btn;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant}>{children}</SubmitButton>
    </form>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btn.secondary}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Fallback for older mobile browsers.
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

/** Auto-submitting select, used for filters and quick stage changes. */
export function AutoSubmitSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cx(
        "rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand",
        props.className,
      )}
    />
  );
}

export function BackButton() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className={btn.ghost}>
      ← Back
    </button>
  );
}
