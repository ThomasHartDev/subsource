/**
 * InvoiceFlow explainer ad — the first App Validation Pipeline test app.
 *
 * USP-first brief (make-ad rule 1):
 *   USP      InvoiceFlow generates the invoice the moment your work is done and
 *            chases late payers for you, so you get paid faster without sending a
 *            single awkward reminder.
 *   Outcome  Freelancers and small teams stop losing nights to billing and get
 *            paid faster, on autopilot.
 *   Pain     Manual invoicing plus the dreaded "just checking in" follow-ups.
 *
 * Renders a text-driven explainer (no voiceover) on the AppPitchAd template.
 * Edge-TTS is unreliable from this host and Cartesia is a paid call, so this v1
 * ships silent: a muted-autoplay landing-page hero plays without sound anyway,
 * and on-screen copy carries the whole problem -> solution -> CTA narrative.
 * Marginal cost: $0. Re-run with a TTS pass later for a sound-on social cut.
 *
 * Usage:  pnpm exec tsx scripts/render-invoiceflow.ts [square|vertical|both]
 * Output: out/invoiceflow-<aspect>.mp4  (1080x1080 square, 1080x1920 vertical)
 */
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { getPlatformSpec, type AdScript, type PlatformId } from "../src/types";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FPS = 30;
const MAX_RUNTIME_SEC = 90; // roadmap cap: explainer must stay under 90s

const BRAND_LABEL = "InvoiceFlow";
const CTA_LABEL = "Get Early Access";

// The authored creative. voiceover lines are kept for a future sound-on render;
// timing is driven by durationSec since this cut is silent.
const script: AdScript = {
  appName: "InvoiceFlow",
  tagline: "Invoicing that runs itself",
  voiceStyle: "confident-warm",
  scenes: [
    {
      kind: "hook",
      headline: "Stop chasing payments",
      subline: "Freelancers lose hours every month just asking clients to pay.",
      voiceover:
        "If you freelance, the worst part of the job is asking to get paid.",
      durationSec: 4.5,
    },
    {
      kind: "problem",
      headline: "Billing eats your nights",
      subline: "Build the invoice, send it, then chase three reminders.",
      voiceover:
        "You finish the work, then spend your evening building invoices and chasing late payers.",
      durationSec: 4.5,
    },
    {
      kind: "solution",
      headline: "InvoiceFlow runs your billing",
      subline: "It creates the invoice automatically the moment work is done.",
      voiceover:
        "InvoiceFlow connects to your project tools and generates the invoice the moment your work is done.",
      durationSec: 5,
    },
    {
      kind: "feature",
      headline: "Reminders send themselves",
      subline: "Polite follow-ups go out on a schedule until the client pays.",
      voiceover:
        "It follows up for you with reminders that escalate on their own, so you never send another awkward email.",
      durationSec: 5,
    },
    {
      kind: "feature",
      headline: "See every dollar at a glance",
      subline: "Know what's paid, what's overdue, and what's on the way.",
      voiceover:
        "One dashboard shows what's paid, what's overdue, and what's coming in.",
      durationSec: 4.5,
    },
    {
      kind: "cta",
      headline: "Get paid faster",
      subline: "Join early access and lock in 50% off, for life.",
      voiceover: "Join the early access list and lock in fifty percent off for life.",
      durationSec: 5,
    },
  ],
};

type AspectKey = "square" | "vertical";
const ASPECT_PLATFORM: Record<AspectKey, PlatformId> = {
  square: "meta-feed-square", // 1080x1080, no safe-area letterbox — the landing hero
  vertical: "instagram-reels", // 1080x1920, Reels/Story/TikTok safe areas
};

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(stdout.trim());
}

async function main() {
  const arg = (process.argv[2] as AspectKey | "both") || "both";
  const aspects: AspectKey[] =
    arg === "both" ? ["square", "vertical"] : [arg];

  // Frame plan is identical across aspects — timing comes from durationSec.
  let cursor = 0;
  const timedScenes = script.scenes.map((s) => {
    const durationFrames = Math.round(s.durationSec * FPS);
    const startFrame = cursor;
    cursor += durationFrames;
    return { ...s, audioSrc: "", durationFrames, startFrame };
  });
  const totalFrames = cursor;
  const totalSec = totalFrames / FPS;
  if (totalSec > MAX_RUNTIME_SEC) {
    throw new Error(
      `Script runs ${totalSec.toFixed(1)}s, over the ${MAX_RUNTIME_SEC}s cap. Trim a scene.`,
    );
  }
  const sceneTimestamps = script.scenes.map(() => null);

  console.log(
    `[invoiceflow] ${script.scenes.length} scenes, ${totalSec.toFixed(1)}s @${FPS}fps, silent text cut`,
  );

  const publicDir = path.join(ROOT, "public");
  console.log(`[invoiceflow] bundling Remotion project...`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src/index.tsx"),
    publicDir,
  });

  await fs.mkdir(path.join(ROOT, "out"), { recursive: true });

  for (const aspect of aspects) {
    const spec = getPlatformSpec(ASPECT_PLATFORM[aspect]);
    const inputProps = {
      script,
      scenes: timedScenes,
      fps: FPS,
      platformSpec: spec,
      sceneTimestamps,
      brandLabel: BRAND_LABEL,
      ctaLabel: CTA_LABEL,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "AppPitchAd",
      inputProps: inputProps as unknown as Record<string, unknown>,
    });

    const outFile = path.join(ROOT, "out", `invoiceflow-${aspect}.mp4`);
    console.log(
      `[invoiceflow/${aspect}] rendering ${spec.width}x${spec.height}, ${totalFrames} frames -> ${outFile}`,
    );
    const t0 = Date.now();
    await renderMedia({
      composition: {
        ...composition,
        width: spec.width,
        height: spec.height,
        fps: FPS,
        durationInFrames: totalFrames,
      },
      serveUrl,
      codec: "h264",
      outputLocation: outFile,
      inputProps: inputProps as unknown as Record<string, unknown>,
      // Light DOM template (no R3F) but this box has OOM history — keep modest.
      concurrency: 4,
      onProgress: ({ progress }) => {
        process.stdout.write(`\r[invoiceflow/${aspect}] ${(progress * 100).toFixed(0)}%   `);
      },
    });
    const stat = await fs.stat(outFile);
    const dur = await probeDuration(outFile);
    console.log(
      `\n[invoiceflow/${aspect}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${(stat.size / 1024 / 1024).toFixed(2)} MB, ${dur.toFixed(1)}s`,
    );
  }
  console.log(`[invoiceflow] all renders complete.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
