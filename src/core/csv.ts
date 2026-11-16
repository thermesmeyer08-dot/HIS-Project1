import Papa from "papaparse";
import { z } from "zod";
import { CONTACT_TYPES, LEAD_STAGES, PRODUCTS, PROFESSIONS } from "./constants";
import { normalizeState } from "./texas";

/** Header aliases so spreadsheets with slightly different column names still import. */
const HEADER_ALIASES: Record<string, string> = {
  first: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  last: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  "e-mail": "email",
  "email address": "email",
  linkedin: "linkedin_url",
  "linkedin url": "linkedin_url",
  company: "organization",
  business: "organization",
  "organization name": "organization",
  org: "organization",
  "company website": "website",
  type: "contact_type",
  "contact type": "contact_type",
  consent: "consent_note",
  "how obtained": "consent_note",
  "next action date": "next_action_date",
  "next action": "next_action",
  products: "product_interest",
  "product interest": "product_interest",
};

function normalizeHeader(h: string): string {
  const k = h.trim().toLowerCase().replace(/_/g, " ");
  return HEADER_ALIASES[k] ?? k.replace(/ /g, "_");
}

const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optStr = z.preprocess(blankToUndef, z.string().trim().optional());

export const importRowSchema = z
  .object({
    first_name: optStr,
    last_name: optStr,
    title: optStr,
    email: z.preprocess(blankToUndef, z.email().optional()),
    linkedin_url: optStr,
    city: optStr,
    state: z.preprocess(blankToUndef, z.string().optional()).transform((s) => normalizeState(s) ?? undefined),
    contact_type: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[ -]/g, "_") || undefined : v),
      z.enum(CONTACT_TYPES).default("prospect"),
    ),
    source: optStr,
    consent_note: optStr,
    organization: optStr,
    industry: optStr,
    website: optStr,
    create_lead: z.preprocess(blankToUndef, z.string().optional()).transform((v) =>
      v === undefined ? undefined : /^(y|yes|true|1)$/i.test(v),
    ),
    stage: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/ /g, "_") || undefined : v),
      z.enum(LEAD_STAGES).optional(),
    ),
    niche: optStr,
    score: z.preprocess(blankToUndef, z.coerce.number().int().min(0).max(100).optional()),
    product_interest: z
      .preprocess(blankToUndef, z.string().optional())
      .transform((v) =>
        (v ?? "")
          .split(/[;,|]/)
          .map((p) => p.trim().toLowerCase().replace(/[ -]/g, "_"))
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(PRODUCTS))),
    next_action: optStr,
    next_action_date: z.preprocess(blankToUndef, z.iso.date().optional()),
    notes: optStr,
    profession: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[ -]/g, "_") || undefined : v),
      z.enum(PROFESSIONS).optional(),
    ),
  })
  .refine((r) => r.first_name || r.last_name || r.email || r.organization, {
    message: "Row needs at least a name, email, or organization",
  });

export type ImportRow = z.infer<typeof importRowSchema>;

export interface ParsedImport {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
}

/**
 * Parse an import CSV. Rows missing source/consent_note get the defaults Tim
 * types on the import form, so every record records how we obtained it.
 */
export function parseImportCsv(
  text: string,
  defaults: { source: string; consent_note: string },
): ParsedImport {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  const rows: ImportRow[] = [];
  const errors: ParsedImport["errors"] = [];
  parsed.errors
    .filter((e) => e.code !== "UndetectableDelimiter") // single-column files are fine
    .forEach((e) => errors.push({ line: (e.row ?? 0) + 2, message: e.message }));

  parsed.data.forEach((raw, i) => {
    const result = importRowSchema.safeParse(raw);
    const line = i + 2; // header is line 1
    if (!result.success) {
      errors.push({
        line,
        message: result.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`).join("; "),
      });
      return;
    }
    const row = result.data;
    row.source ||= defaults.source;
    row.consent_note ||= defaults.consent_note;
    if (!row.source || !row.consent_note) {
      errors.push({ line, message: "Missing source or consent note (fill the defaults on the import form)" });
      return;
    }
    rows.push(row);
  });
  return { rows, errors };
}

export const IMPORT_TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "title",
  "email",
  "linkedin_url",
  "city",
  "state",
  "contact_type",
  "source",
  "consent_note",
  "organization",
  "industry",
  "website",
  "create_lead",
  "stage",
  "niche",
  "score",
  "product_interest",
  "next_action",
  "next_action_date",
  "notes",
  "profession",
];

/** Serialize rows to CSV. Arrays become "a; b", objects become JSON. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const data = rows.map((r) =>
    cols.map((c) => {
      const v = r[c];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join("; ");
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }),
  );
  // Guard against spreadsheet formula injection when Tim opens exports in Excel/Sheets.
  const safe = data.map((row) => row.map((cell) => (/^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell)));
  return Papa.unparse({ fields: cols, data: safe });
}
