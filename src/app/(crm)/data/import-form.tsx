"use client";

import { useActionState } from "react";
import { importCsv, type ImportResult } from "@/app/actions/import";
import { SubmitButton } from "@/components/forms";

export function ImportForm() {
  const [state, action] = useActionState<ImportResult, FormData>(importCsv, undefined);
  const s = state?.summary;
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Default source (for rows without one)</span>
        <input name="default_source" placeholder="e.g. Frisco Chamber member directory" className="w-full rounded-lg border border-border bg-surface px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Default “how we got these contacts”</span>
        <input name="default_consent" placeholder="e.g. Public chamber directory listing, business email published" className="w-full rounded-lg border border-border bg-surface px-3 py-2" />
      </label>
      <SubmitButton>Import</SubmitButton>
      {state?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{state.error}</p>}
      {s && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <p className="font-medium">
            {s.rows} rows: {s.created} new contacts, {s.duplicates} already existed, {s.leadsCreated} leads opened.
          </p>
          {s.dncFlagged > 0 && <p>{s.dncFlagged} matched the do-not-contact list and were blocked.</p>}
          {s.outsideTexas > 0 && <p>{s.outsideTexas} prospects are outside Texas (outreach will be blocked).</p>}
          {s.unknownLocation > 0 && <p>{s.unknownLocation} have no state, so check their location.</p>}
          {s.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-800 dark:text-red-300">{s.errors.length} rows skipped</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {s.errors.map((e, i) => (
                  <li key={i}>
                    {e.line > 0 ? `Line ${e.line}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
