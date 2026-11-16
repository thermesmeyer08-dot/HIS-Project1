"use server";

import { revalidatePath } from "next/cache";
import { parseImportCsv } from "@/core/csv";
import { isTexas } from "@/core/texas";
import { requireUser } from "@/lib/auth";
import { fail, findOrCreateOrg, getDncEntries, logActivity, must, upsertContact } from "@/lib/crm";
import { str } from "@/lib/format";

export type ImportResult =
  | {
      error?: string;
      summary?: {
        rows: number;
        created: number;
        duplicates: number;
        leadsCreated: number;
        dncFlagged: number;
        outsideTexas: number;
        unknownLocation: number;
        errors: { line: number; message: string }[];
      };
    }
  | undefined;

export async function importCsv(_: ImportResult, fd: FormData): Promise<ImportResult> {
  try {
    const { supabase } = await requireUser();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
    if (file.size > 4_000_000) return { error: "File is over 4 MB. Split it into smaller files." };
    const { rows, errors } = parseImportCsv(await file.text(), {
      source: str(fd, "default_source") ?? "",
      consent_note: str(fd, "default_consent") ?? "",
    });
    const dnc = await getDncEntries(supabase);
    const s = { rows: rows.length + errors.length, created: 0, duplicates: 0, leadsCreated: 0, dncFlagged: 0, outsideTexas: 0, unknownLocation: 0, errors: [...errors] };

    for (const [i, row] of rows.entries()) {
      try {
        const org = row.organization
          ? await findOrCreateOrg(supabase, {
              name: row.organization,
              website: row.website,
              industry: row.industry,
              city: row.city,
              state: row.state,
              source: row.source!,
            })
          : null;
        const res = await upsertContact(
          supabase,
          {
            first_name: row.first_name,
            last_name: row.last_name,
            title: row.title,
            email: row.email,
            linkedin_url: row.linkedin_url,
            city: row.city,
            state: row.state,
            contact_type: row.contact_type,
            source: row.source!,
            consent_note: row.consent_note!,
            org_id: org?.id ?? null,
          },
          { orgName: row.organization, orgWebsite: row.website, dnc },
        );
        if (res.created) s.created++;
        else s.duplicates++;
        if (res.dncFlagged) s.dncFlagged++;
        const tx = isTexas(row.state);
        if (row.contact_type === "prospect" && tx === false) s.outsideTexas++;
        if (tx === null) s.unknownLocation++;

        if (res.created && row.contact_type === "referral_partner") {
          await supabase.from("referral_partners").insert({ contact_id: res.id, profession: row.profession ?? "other" });
        }
        if (row.create_lead || row.stage || row.score !== undefined || row.product_interest.length) {
          const open = must(
            await supabase.from("leads").select("id").eq("contact_id", res.id).not("stage", "in", "(placed,lost)").limit(1),
          ) as { id: string }[];
          if (!open.length) {
            must(
              await supabase.from("leads").insert({
                contact_id: res.id,
                org_id: org?.id ?? null,
                stage: row.stage ?? "new",
                niche: row.niche ?? "business_owner",
                score: row.score ?? null,
                product_interest: row.product_interest,
                next_action: row.next_action,
                next_action_date: row.next_action_date,
                owner_notes: row.notes,
              }),
            );
            s.leadsCreated++;
          }
        }
        if (res.created) {
          await logActivity(supabase, { contact_id: res.id, type: "import", body: `Imported from ${file.name}. Source: ${row.source}` });
        }
      } catch (e) {
        const who = [row.first_name, row.last_name, row.organization].filter(Boolean).join(" ");
        s.errors.push({ line: 0, message: `${who || `Row ${i + 1}`}: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    revalidatePath("/", "layout");
    return { summary: s };
  } catch (e) {
    return fail(e) as ImportResult;
  }
}
