import { NextResponse, type NextRequest } from "next/server";
import { IMPORT_TEMPLATE_HEADERS, toCsv } from "@/core/csv";
import { isAllowedEmail } from "@/lib/env";
import { todayCentral } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const flat = (prefix: string, o: Row | null | undefined): Row =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [`${prefix}_${k}`, v]));

export async function GET(_req: NextRequest, ctx: RouteContext<"/data/export/[kind]">) {
  const { kind } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedEmail(auth.claims.email as string)) return new NextResponse("Unauthorized", { status: 401 });

  let rows: Row[] = [];
  let columns: string[] | undefined;
  switch (kind) {
    case "template":
      columns = IMPORT_TEMPLATE_HEADERS;
      rows = [];
      break;
    case "leads": {
      const { data } = await supabase
        .from("leads")
        .select("*, contacts(first_name, last_name, title, email, linkedin_url, city, state, source, consent_note, do_not_contact), organizations(name, industry, city, website)")
        .order("created_at");
      rows = (data ?? []).map(({ contacts, organizations, fit_signals, ...l }) => ({
        ...l,
        fit_signals,
        ...flat("contact", contacts as Row),
        ...flat("org", organizations as Row),
      }));
      break;
    }
    case "contacts": {
      const { data } = await supabase.from("contacts").select("*, organizations(name)").order("created_at");
      rows = (data ?? []).map(({ organizations, ...c }) => ({ ...c, organization: (organizations as Row | null)?.name ?? "" }));
      break;
    }
    case "organizations":
      rows = (await supabase.from("organizations").select("*").order("name")).data ?? [];
      break;
    case "partners": {
      const { data } = await supabase.from("referral_partners").select("*, contacts(first_name, last_name, title, email, organizations(name))");
      rows = (data ?? []).map(({ contacts, ...p }) => {
        const c = (contacts ?? {}) as Row & { organizations?: Row | null };
        return { ...p, first_name: c.first_name, last_name: c.last_name, title: c.title, email: c.email, organization: c.organizations?.name };
      });
      break;
    }
    case "activities":
      rows = (await supabase.from("activities").select("*").order("occurred_at")).data ?? [];
      break;
    case "drafts":
      rows = (await supabase.from("drafts").select("*").order("created_at")).data ?? [];
      break;
    case "dnc":
      rows = (await supabase.from("do_not_contact").select("*").order("created_at")).data ?? [];
      break;
    default:
      return new NextResponse("Unknown export", { status: 404 });
  }
  const strip = (r: Row) => {
    const rest = { ...r };
    delete rest.owner_id;
    return rest;
  };
  const csv = toCsv(rows.map(strip), columns);
  const name = kind === "template" ? "his-import-template.csv" : `his-${kind}-${todayCentral()}.csv`;
  return new NextResponse(`﻿${csv}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
