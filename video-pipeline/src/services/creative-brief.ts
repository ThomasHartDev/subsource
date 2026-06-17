import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { AppConcept } from "../types";

const SKILL_DIR = path.join(os.homedir(), ".claude", "skills", "make-ad");
const PROMPT_PATH = path.join(SKILL_DIR, "prompts", "veo-brief.md");
const LINT_CHECKLIST_PATH = path.join(SKILL_DIR, "lint-checklist.md");

// Cache the skill files at module load -- they don't change between calls and
// reading from disk on every invocation is wasteful.
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, "utf8");
const LINT_CHECKLIST_MD = readFileSync(LINT_CHECKLIST_PATH, "utf8");

export const ShotSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSec: z.number().min(2).max(10),
  veoPrompt: z.string().min(50), // dense Veo prose required
  voiceover: z.string(), // can be empty for transitions
  onScreenText: z.string().nullable().optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

export const CreativeBriefSchema = z.object({
  tagline: z.string(),
  totalDurationSec: z.number().min(5).max(15),
  shots: z.array(ShotSchema).min(1).max(3),
  endCardText: z.string(),
});
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export interface BriefOptions {
  numShots: 1 | 2;
  targetDurationSec: number; // 5-10
  liveWaitlistCount?: number;
}

type RawLintResponse = {
  pass: boolean;
  hard_failures?: unknown[];
  soft_warnings?: unknown[];
  suggested_rewrite?: string;
};

function buildBriefPrompt(
  concept: AppConcept,
  opts: BriefOptions,
  retryContext: string,
): string {
  const replacements: Record<string, string> = {
    "{{APP_NAME}}": concept.name,
    "{{APP_ONE_LINER}}": concept.oneLiner,
    "{{APP_AUDIENCE}}": concept.audience,
    "{{APP_PAIN}}": concept.pain,
    "{{APP_OUTCOME}}": concept.outcome,
    "{{HUMOR_FLAVOR}}": concept.humor ?? "self-aware",
    "{{TARGET_DURATION_SEC}}": String(opts.targetDurationSec),
    "{{NUM_SHOTS}}": String(opts.numShots),
  };

  let prompt = PROMPT_TEMPLATE;
  for (const [marker, value] of Object.entries(replacements)) {
    prompt = prompt.split(marker).join(value);
  }
  if (retryContext) {
    prompt = `${prompt}\n\n${retryContext}`;
  }
  return prompt;
}

export async function generateBrief(
  concept: AppConcept,
  opts: BriefOptions,
): Promise<CreativeBrief> {
  let retryContext = "";
  let lastError: string | null = null;
  let lastBrief: CreativeBrief | null = null;
  let lastHardFailures: string[] = [];

  // Generation + lint loop. 1 initial attempt + up to 3 retries on either
  // schema-validation failure or lint hard-failure. Mirrors the script.ts
  // pattern so the orchestrator can rely on the same retry semantics.
  for (let attempt = 0; attempt <= 3; attempt++) {
    const prompt = buildBriefPrompt(concept, opts, retryContext);

    let brief: CreativeBrief;
    try {
      const raw = await runClaudeCli(prompt);
      const json = extractJson(raw);
      brief = CreativeBriefSchema.parse(JSON.parse(json));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 3) break;
      retryContext =
        `Previous attempt failed schema validation with: ${lastError}. ` +
        `Generate a new brief that satisfies the CreativeBrief schema exactly. ` +
        `Return ONLY JSON, no markdown fences.`;
      continue;
    }

    lastBrief = brief;

    const lint = await runLintPass(brief);
    lastHardFailures = lint.hardFailures;

    if (lint.pass) {
      return brief;
    }

    if (attempt === 3) break;

    retryContext =
      `Previous attempt failed lint with: ${JSON.stringify(lint.hardFailures)}.` +
      (lint.suggestedRewrite ? ` Suggested rewrite: ${lint.suggestedRewrite}.` : "") +
      ` Generate a new brief that fixes those issues. Return ONLY JSON.`;
  }

  // Three retries exhausted.
  if (!lastBrief) {
    throw new Error(
      `generateBrief: no valid brief produced after 3 retries. Last error: ${lastError ?? "unknown"}`,
    );
  }
  throw new Error(
    `generateBrief: lint failed after 3 retries. Hard failures: ${JSON.stringify(lastHardFailures)}.`,
  );
}

async function runLintPass(brief: CreativeBrief): Promise<{
  pass: boolean;
  hardFailures: string[];
  softWarnings: string[];
  suggestedRewrite?: string;
}> {
  const prompt =
    `You are a pre-publish ad lint pass. Apply the following checklist to the creative brief. ` +
    `The brief is for a Veo-generated video ad, so apply the rules where they're relevant ` +
    `(skip rules that only apply to multi-scene scripted ads). ` +
    `Return ONLY JSON: { pass: bool, hard_failures: string[], soft_warnings: string[], suggested_rewrite?: string }.\n\n` +
    `BRIEF:\n${JSON.stringify(brief, null, 2)}\n\n` +
    `CHECKLIST:\n${LINT_CHECKLIST_MD}`;
  const raw = await runClaudeCli(prompt);
  const jsonText = extractJson(raw);
  const parsed = JSON.parse(jsonText) as RawLintResponse;
  return {
    pass: Boolean(parsed.pass),
    hardFailures: stringifyList(parsed.hard_failures),
    softWarnings: stringifyList(parsed.soft_warnings),
    suggestedRewrite:
      typeof parsed.suggested_rewrite === "string" ? parsed.suggested_rewrite : undefined,
  };
}

function stringifyList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
}

function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["--print", "--model", "sonnet"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`claude cli exit ${code}: ${err}`));
      else resolve(out);
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenced && fenced[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
