export const LEAD_STAGES = [
  "new",
  "researched",
  "drafted",
  "contacted",
  "replied",
  "meeting_booked",
  "needs_analysis",
  "app_submitted",
  "placed",
  "lost",
  "nurture",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const CLOSED_STAGES: LeadStage[] = ["placed", "lost"];

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  researched: "Researched",
  drafted: "Drafted",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  needs_analysis: "Needs analysis",
  app_submitted: "App submitted",
  placed: "Placed",
  lost: "Lost",
  nurture: "Nurture",
};

export const PRODUCTS = ["key_person", "buy_sell", "exec_bonus", "personal", "other"] as const;
export type Product = (typeof PRODUCTS)[number];
export const PRODUCT_LABELS: Record<Product, string> = {
  key_person: "Key person",
  buy_sell: "Buy-sell",
  exec_bonus: "Exec bonus (162)",
  personal: "Personal coverage",
  other: "Other",
};

export const CONTACT_TYPES = ["prospect", "referral_partner", "client"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  prospect: "Prospect",
  referral_partner: "Referral partner",
  client: "Client",
};

export const CHANNELS = ["email", "linkedin", "facebook", "mailer", "call_script"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  mailer: "Mailer",
  call_script: "Call script",
};

export const DRAFT_STATUSES = ["pending_approval", "approved", "rejected", "sent", "blocked_dnc"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const PROFESSIONS = ["cpa", "banker", "attorney", "pc_agent", "financial_advisor", "other"] as const;
export type Profession = (typeof PROFESSIONS)[number];
export const PROFESSION_LABELS: Record<Profession, string> = {
  cpa: "CPA",
  banker: "Business banker",
  attorney: "Attorney",
  pc_agent: "P&C agent",
  financial_advisor: "Financial advisor",
  other: "Other",
};

export const PARTNER_STAGES = ["identified", "contacted", "met", "active", "dormant"] as const;
export type PartnerStage = (typeof PARTNER_STAGES)[number];

export const ACTIVITY_TYPES = [
  "note",
  "email_sent",
  "linkedin_sent",
  "facebook_sent",
  "mailer_sent",
  "call",
  "reply",
  "meeting",
  "stage_change",
  "inbound",
  "dnc",
  "import",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Activity types Tim can log by hand from a lead or contact page. */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = [
  "note",
  "call",
  "meeting",
  "reply",
  "email_sent",
  "linkedin_sent",
  "facebook_sent",
  "mailer_sent",
];

export const SENT_ACTIVITY_FOR_CHANNEL: Record<Channel, ActivityType> = {
  email: "email_sent",
  linkedin: "linkedin_sent",
  facebook: "facebook_sent",
  mailer: "mailer_sent",
  call_script: "call",
};

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
