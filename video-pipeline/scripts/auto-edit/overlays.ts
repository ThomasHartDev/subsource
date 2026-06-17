// Analyze the (trimmed-timeline) transcript and decide where an on-screen visual
// would strengthen the video: a number/stat callout, a keyword pop, or a simple
// diagram (steps / compare / flow). Returns cues with start/end in the trimmed
// timeline so they line up with the captions and the cut video.
//
// Uses the `claude` CLI (house rule: never an API key). A deterministic --no-ai
// path returns [] so the pipeline runs offline. Cues are validated with zod so a
// malformed model response can't crash the renderer.
import { spawn } from "node:child_process";
import { z } from "zod";

export const DiagramSchema = z.object({
  style: z.enum(["steps", "compare", "flow"]),
  items: z.array(z.string().max(48)).min(2).max(5),
  title: z.string().max(40).optional(),
});

export const CueSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  kind: z.enum(["stat", "keyword", "diagram", "broll"]),
  // stat
  value: z.string().max(16).optional(),
  label: z.string().max(40).optional(),
  // keyword
  text: z.string().max(40).optional(),
  // diagram
  diagram: DiagramSchema.optional(),
  // broll: a Pexels search query for an example clip; src is filled by the
  // pipeline after the clip is downloaded.
  query: z.string().max(60).optional(),
  src: z.string().optional(),
});
export type Cue = z.infer<typeof CueSchema>;

type CaptionWord = { word: string; start: number; end: number };

function runCapture(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 300)}`));
    });
  });
}

// Build a compact, timestamped transcript for the model to reason over.
function transcriptLines(captions: CaptionWord[]): string {
  return captions
    .map((c) => `${c.start.toFixed(1)} ${c.word}`)
    .join(" ");
}

export async function analyzeOverlays(
  captions: CaptionWord[],
  durationSec: number,
  topic: string,
): Promise<Cue[]> {
  if (captions.length === 0) return [];
  // Roughly one overlay per 7s so the screen never gets busy.
  const maxCues = Math.max(1, Math.min(8, Math.round(durationSec / 7)));
  const prompt = `You are a short-form video editor adding tasteful on-screen graphics to a talking-head clip. Below is the transcript as "time word time word ..." pairs (seconds in the video's timeline).

Pick at most ${maxCues} moments where a SIMPLE visual genuinely helps a viewer. Be conservative — only when it adds real value, never decorative. Prefer:
- "stat": a number/metric the speaker says (followers, %, $, counts). value = the number formatted short ("3M", "20", "50%"), label = 2-4 word context.
- "keyword": a single key term/phrase worth emphasizing (<=3 words).
- "diagram": only when the speaker lists steps, compares two things, or describes a flow. style "steps" (ordered short items), "compare" (exactly 2 items), or "flow" (2-4 items shown A -> B -> C). items are SHORT (<=4 words each).
- "broll": only when the speaker names a CONCRETE, filmable real-world subject that an example stock clip would illustrate (a place, object, activity, scene). query = a 2-4 word stock-footage search ("city skyline night", "typing on laptop", "ocean waves"). label = 1-3 word caption. Skip abstract ideas — no b-roll for feelings, opinions, or numbers.

For each, start/end are seconds in the given timeline; set start when the speaker says it, end 2.5-3.5s later (clamp to <= ${durationSec.toFixed(1)}). Don't overlap cues.

Topic: ${topic || "(infer)"}
Transcript: ${transcriptLines(captions).slice(0, 4000)}

Return ONLY a JSON array (no prose, no code fences) of objects:
{"start":number,"end":number,"kind":"stat|keyword|diagram|broll","value"?:string,"label"?:string,"text"?:string,"diagram"?:{"style":"steps|compare|flow","items":string[],"title"?:string},"query"?:string}
If nothing genuinely warrants a visual, return [].`;

  const raw = await runCapture("claude", ["-p", prompt], 120_000);
  const a = raw.indexOf("[");
  const b = raw.lastIndexOf("]");
  if (a === -1 || b === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(a, b + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cues: Cue[] = [];
  for (const item of parsed) {
    const r = CueSchema.safeParse(item);
    if (!r.success) continue;
    const c = r.data;
    // Clamp to the clip and enforce a sane on-screen duration.
    c.start = Math.max(0, Math.min(c.start, durationSec - 0.5));
    c.end = Math.max(c.start + 1.5, Math.min(c.end, durationSec));
    // Require the payload its kind needs.
    if (c.kind === "stat" && !c.value) continue;
    if (c.kind === "keyword" && !c.text) continue;
    if (c.kind === "diagram" && !c.diagram) continue;
    if (c.kind === "broll" && !c.query) continue;
    cues.push(c);
  }
  // Sort and drop overlaps (keep the earlier one).
  cues.sort((x, y) => x.start - y.start);
  const out: Cue[] = [];
  for (const c of cues) {
    if (out.length && c.start < out[out.length - 1]!.end + 0.2) continue;
    out.push(c);
  }
  return out;
}

// CLI entry: `overlays.ts <captions.json> <out.json> [--topic str] [--duration s] [--no-ai]`
async function main() {
  const argv = process.argv;
  const capPath = argv[2];
  const outPath = argv[3];
  const flag = (n: string) => {
    const i = argv.indexOf(n);
    return i > -1 ? argv[i + 1] : undefined;
  };
  if (!capPath || !outPath) {
    console.error("usage: overlays.ts <captions.json> <out.json> [--topic str] [--duration s] [--no-ai]");
    process.exit(2);
  }
  const fs = await import("node:fs/promises");
  const captions = JSON.parse(await fs.readFile(capPath, "utf8")) as CaptionWord[];
  const duration = Number(flag("--duration") ?? (captions.length ? captions[captions.length - 1]!.end : 0));
  const topic = flag("--topic") ?? "";
  let cues: Cue[] = [];
  if (!argv.includes("--no-ai")) {
    try {
      cues = await analyzeOverlays(captions, duration, topic);
    } catch (e) {
      console.warn(`[overlays] analysis failed (${(e as Error).message}); no overlays`);
    }
  }
  await fs.writeFile(outPath, JSON.stringify(cues, null, 2));
  console.log(`[overlays] ${cues.length} cue(s) -> ${outPath}`);
}

// Run main only when invoked directly (not when imported).
if (process.argv[1] && process.argv[1].endsWith("overlays.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
