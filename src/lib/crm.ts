import "server-only";

// Shared CRM logic lives in src/core so the scheduled jobs can use it too.
export * from "@/core/crm";
