import { IMPORT_TEMPLATE_HEADERS } from "@/core/csv";
import { requireUser } from "@/lib/auth";
import { btn, Card, PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

const EXPORTS = [
  ["leads", "Leads (with contact & business)"],
  ["contacts", "Contacts"],
  ["organizations", "Businesses"],
  ["partners", "Referral partners"],
  ["activities", "Activity log"],
  ["drafts", "Drafts"],
  ["dnc", "Do-not-contact list"],
] as const;

export default async function DataPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Import / export" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Import CSV">
          <p className="mb-3 text-sm text-muted">
            One row per person. Recognized columns: <span className="font-mono text-xs">{IMPORT_TEMPLATE_HEADERS.join(", ")}</span>. Duplicates are linked, not re-created.
            Separate multiple products with semicolons.
          </p>
          {/* Plain <a>: these are file downloads, not page navigations. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/data/export/template" className={`${btn.secondary} mb-4`}>
            Download blank template
          </a>
          <ImportForm />
        </Card>
        <Card title="Export CSV">
          <ul className="space-y-2">
            {EXPORTS.map(([k, label]) => (
              <li key={k}>
                { }
                <a href={`/data/export/${k}`} className="text-brand underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
