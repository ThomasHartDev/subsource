import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AdScriptSchema, type AdScript, type AppConcept, type PlatformId } from "../types";

const SKILL_DIR = path.join(os.homedir(), ".claude", "skills", "make-ad");
const PROMPT_PATH = path.join(SKILL_DIR, "prompts", "script-generation.md");
const TEMPLATES_PATH = path.join(SKILL_DIR, "templates.md");
const LINT_CHECKLIST_PATH = path.join(SKILL_DIR, "lint-checklist.md");

// Cache the skill files at module load — they don't change between calls and
// reading from disk on every invocation is wasteful.
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, "utf8");
const TEMPLATES_MD = readFileSync(TEMPLATES_PATH, "utf8");
const LINT_CHECKLIST_MD = readFileSync(LINT_CHECKLIST_PATH, "utf8");

export type GenerateScriptOptions = {
  tier?: "cheap" | "premium";
  targetDurationSec?: number;
  platforms?: PlatformId[];
  liveWaitlistCount?: number;
};

export type LintResult = {
  pass: boolean;
  hardFailures: string[];
  softWarnings: string[];
  retryCount: number;
};

export type GenerateScriptResult = {
  script: AdScript;
  lint: LintResult;
};

// Pulls just the named template's section out of templates.md, from its
// `## Template: <id>` heading up to the next `## Template:` heading or EOF.
function extractTemplateBlock(templatesMd: string, templateId: string): string | null {
  // Match "## Template: <id>" exactly, then capture until the next "## " heading or EOF.
  // JS regex has no \Z, so we use a lookahead that accepts either a sibling/upper-level
  // markdown heading or end-of-string.
  const pattern = new RegExp(
    `^## Template:\\s*${escapeRegex(templateId)}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\r\\n]))`,
    "m",
  );
  const m = templatesMd.match(pattern);
  if (!m) return null;
  // Reassemble the heading + body so the model sees the full block context.
  return `## Template: ${templateId}\n${m[1]?.trimEnd() ?? ""}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildScriptPrompt(
  concept: AppConcept,
  options: Required<Pick<GenerateScriptOptions, "tier" | "targetDurationSec" | "platforms" | "liveWaitlistCount">>,
  templateBlock: string,
  hookTemplateId: string,
  retryContext: string,
): string {
  const replacements: Record<string, string> = {
    "{{APP_NAME}}": concept.name,
    "{{APP_ONE_LINER}}": concept.oneLiner,
    "{{APP_AUDIENCE}}": concept.audience,
    "{{APP_PAIN}}": concept.pain,
    "{{APP_OUTCOME}}": concept.outcome,
    "{{HOOK_TEMPLATE_ID}}": hookTemplateId,
    "{{HOOK_TEMPLATE_SKELETON}}": templateBlock,
    "{{HUMOR_FLAVOR}}": concept.humor ?? "self-aware",
    "{{TARGET_DURATION_SEC}}": String(options.targetDurationSec),
    "{{PLATFORM_LIST}}": options.platforms.join(","),
    "{{TIER}}": options.tier,
    "{{LIVE_WAITLIST_COUNT}}": formatWaitlistCount(options.liveWaitlistCount),
    "{{BRAND_VOICE_NOTES}}": "",
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

function formatWaitlistCount(n: number): string {
  // Match the placeholder default style ("2,368") so the prompt's own number
  // examples stay coherent.
  return n.toLocaleString("en-US");
}

export async function generateScript(
  concept: AppConcept,
  options?: GenerateScriptOptions,
): Promise<GenerateScriptResult> {
  const tier = options?.tier ?? "cheap";
  const targetDurationSec = options?.targetDurationSec ?? concept.targetDurationSec ?? 18;
  const platforms = options?.platforms ?? (["tiktok-feed"] as PlatformId[]);
  const liveWaitlistCount = options?.liveWaitlistCount ?? 2368;
  const hookTemplateId = concept.hookTemplate ?? "fake-satisfying";

  const templateBlock = extractTemplateBlock(TEMPLATES_MD, hookTemplateId);
  if (!templateBlock) {
    throw new Error(
      `Hook template "${hookTemplateId}" not found in ${TEMPLATES_PATH}. ` +
        `Check the template id matches a "## Template: <id>" heading in templates.md.`,
    );
  }

  const resolved = { tier, targetDurationSec, platforms, liveWaitlistCount } as const;

  let retryContext = "";
  let lastHardFailures: string[] = [];
  let lastSoftWarnings: string[] = [];
  let lastScript: AdScript | null = null;

  // Generation + lint loop. 1 initial attempt + up to 3 retries on lint failure.
  for (let attempt = 0; attempt <= 3; attempt++) {
    const prompt = buildScriptPrompt(concept, resolved, templateBlock, hookTemplateId, retryContext);
    const raw = await runClaudeCli(prompt);
    const json = extractJson(raw);
    const script = AdScriptSchema.parse(JSON.parse(json));
    lastScript = script;

    const lint = await runLintPass(script);
    lastHardFailures = lint.hardFailures;
    lastSoftWarnings = lint.softWarnings;

    if (lint.pass) {
      return {
        script,
        lint: {
          pass: true,
          hardFailures: lint.hardFailures,
          softWarnings: lint.softWarnings,
          retryCount: attempt,
        },
      };
    }

    if (attempt === 3) break;

    retryContext =
      `Previous attempt failed lint with: ${JSON.stringify(lint.hardFailures)}.` +
      (lint.suggestedRewrite ? ` Suggested rewrite: ${lint.suggestedRewrite}.` : "") +
      ` Generate a new script that fixes those issues.`;
  }

  // Three retries exhausted.
  if (!lastScript) {
    throw new Error("generateScript: no script produced after retries (this should be unreachable)");
  }
  throw new Error(
    `generateScript: lint failed after 3 retries. Hard failures: ${JSON.stringify(lastHardFailures)}. ` +
      `Soft warnings: ${JSON.stringify(lastSoftWarnings)}.`,
  );
}

type RawLintResponse = {
  pass: boolean;
  hard_failures?: unknown[];
  soft_warnings?: unknown[];
  suggested_rewrite?: string;
};

async function runLintPass(script: AdScript): Promise<{
  pass: boolean;
  hardFailures: string[];
  softWarnings: string[];
  suggestedRewrite?: string;
}> {
  const prompt =
    `You are a pre-publish ad lint pass. Apply the following checklist to the script. ` +
    `Return ONLY JSON: { pass: bool, hard_failures: string[], soft_warnings: string[], suggested_rewrite?: string }.\n\n` +
    `SCRIPT:\n${JSON.stringify(script, null, 2)}\n\n` +
    `CHECKLIST:\n${LINT_CHECKLIST_MD}`;
  const raw = await runClaudeCli(prompt);
  const jsonText = extractJson(raw);
  const parsed = JSON.parse(jsonText) as RawLintResponse;
  return {
    pass: Boolean(parsed.pass),
    hardFailures: stringifyList(parsed.hard_failures),
    softWarnings: stringifyList(parsed.soft_warnings),
    suggestedRewrite: typeof parsed.suggested_rewrite === "string" ? parsed.suggested_rewrite : undefined,
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
