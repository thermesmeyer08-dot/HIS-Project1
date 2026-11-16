import type {
  ActivityType,
  Channel,
  ContactType,
  DraftStatus,
  LeadStage,
  PartnerStage,
  Product,
  Profession,
} from "./constants";
import type { DncKind } from "./dnc";

// Hand-written row types. Once the Supabase project exists you can regenerate
// exact types with `npm run db:types`.

export interface Organization {
  id: string;
  name: string;
  name_normalized: string;
  industry: string | null;
  naics: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  website: string | null;
  domain: string | null;
  size_estimate: string | null;
  is_faith_based: boolean;
  source: string;
  source_detail: string | null;
  tx_taxpayer_id: string | null;
  research_summary: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  org_id: string | null;
  first_name: string | null;
  last_name: string | null;
  name_normalized: string;
  title: string | null;
  email: string | null;
  email_source: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  contact_type: ContactType;
  source: string;
  consent_note: string;
  do_not_contact: boolean;
  dnc_reason: string | null;
  created_at: string;
}

export interface ReferralPartner {
  id: string;
  contact_id: string;
  profession: Profession;
  relationship_stage: PartnerStage;
  referrals_given: number;
  referrals_received: number;
  last_touch_at: string | null;
  notes: string | null;
}

export interface Lead {
  id: string;
  contact_id: string;
  org_id: string | null;
  niche: string;
  stage: LeadStage;
  score: number | null;
  score_reasoning: string | null;
  fit_signals: Record<string, unknown> | null;
  product_interest: Product[];
  next_action: string | null;
  next_action_date: string | null;
  owner_notes: string | null;
  call_prep_brief: string | null;
  research_thin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Draft {
  id: string;
  lead_id: string | null;
  contact_id: string;
  template_id: string | null;
  channel: Channel;
  sequence_step: number;
  subject: string | null;
  body: string;
  original_body: string | null;
  edited_body: string | null;
  rejection_reason: string | null;
  status: DraftStatus;
  gmail_draft_id: string | null;
  model: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  contact_id: string | null;
  lead_id: string | null;
  type: ActivityType;
  body: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface DncRow {
  id: string;
  kind: DncKind;
  value_normalized: string;
  reason: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
  compliance_status: "draft" | "submitted" | "approved";
  submitted_at: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Settings {
  id: string;
  daily_prospect_cap: number;
  daily_cost_cap_usd: number;
  max_searches_per_prospect: number;
  research_model: string;
  fast_model: string;
  email_signature: string;
  footer_address: string | null;
  booking_url: string;
  website_url: string;
  target_counties: string[];
  target_industries: string[];
  followup_days: number[];
  style_example_count: number;
}

export type ContactWithOrg = Contact & { organizations: Pick<Organization, "id" | "name" | "website"> | null };
export type LeadWithRefs = Lead & {
  contacts: Pick<Contact, "id" | "first_name" | "last_name" | "email" | "state" | "do_not_contact" | "title"> | null;
  organizations: Pick<Organization, "id" | "name" | "city" | "industry"> | null;
};
