import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CALL_PREP_SYSTEM, FOLLOWUP_SYSTEM } from "./prompts";

/**
 * Claude calls for the scheduled jobs. Model names come from Settings.
 * Every call returns its usage so the job can log cost and enforce the daily cap.
 */

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  cost_usd: number;
}

// USD per million tokens [input, output]. Unknown models fall back to Sonnet pricing.
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
const WEB_SEARCH_USD = 10 / 1000;

export function estimateCost(model: string, input: number, output: number, searches = 0): number {
  const [i, o] = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return (input * i + output * o) / 1e6 + searches * WEB_SEARCH_USD;
}

export const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, web_searches: 0, cost_usd: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    web_searches: a.web_searches + b.web_searches,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function claude(): Anthropic {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  return client;
}

// Models that support server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);

/**
 * Call prep brief with web research. Runs the server-side web search tool,
 * resending on pause_turn, and returns Markdown.
 */
export async function generateCallPrepBrief(opts: {
  model: string;
  maxSearches: number;
  facts: string; // everything we know, as plain text
}): Promise<{ text: string; usage: Usage }> {
  const usage = emptyUsage();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Prepare the call prep brief for this upcoming meeting.\n\n<known_information>\n${opts.facts}\n</known_information>`,
    },
  ];

  for (let turn = 0; turn < 4; turn++) {
    const res = await claude().beta.messages.create({
      model: opts.model,
      max_tokens: 6000,
      system: CALL_PREP_SYSTEM,
      messages,
      output_config: { effort: "medium" },
      tools:
        opts.maxSearches > 0
          ? [
              {
                type: "web_search_20260209",
                name: "web_search",
                max_uses: opts.maxSearches,
                blocked_domains: ["linkedin.com", "facebook.com"],
                user_location: { type: "approximate", city: "Dallas", region: "Texas", country: "US", timezone: "America/Chicago" },
              },
            ]
          : undefined,
      ...(FALLBACK_MODELS.has(opts.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.web_searches += searches;
    usage.cost_usd += estimateCost(opts.model, res.usage.input_tokens, res.usage.output_tokens, searches);

    if (res.stop_reason === "refusal") throw new Error("The model declined to write this brief.");
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new Error(`Empty brief (stop_reason: ${res.stop_reason}).`);
    return { text, usage };
  }
  throw new Error("Brief research did not finish in time.");
}

const FollowUp = z.object({
  subject: z.string().describe("Short, plain subject line"),
  body: z.string().describe("Email body without greeting signature, link, or footer"),
});

/** Follow-up email for a calculator lead who hasn't booked. */
export async function generateFollowUp(opts: { model: string; facts: string; styleExamples?: string }): Promise<{
  subject: string;
  body: string;
  usage: Usage;
}> {
  const res = await claude().messages.parse({
    model: opts.model,
    max_tokens: 2000,
    system: FOLLOWUP_SYSTEM + (opts.styleExamples ? `\n\nRecent edits Tim made to drafts (match his style):\n${opts.styleExamples}` : ""),
    messages: [{ role: "user", content: `<submitted_information>\n${opts.facts}\n</submitted_information>` }],
    output_config: { effort: "low", format: zodOutputFormat(FollowUp) },
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("No follow-up draft returned.");
  return {
    ...res.parsed_output,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      web_searches: 0,
      cost_usd: estimateCost(opts.model, res.usage.input_tokens, res.usage.output_tokens),
    },
  };
}
