/**
 * render-claymation-remotion.ts  — v5 of the LinkedItch claymation ad.
 *
 * Same upstream as render-claymation-full.ts: 3 parallel Veo 6s shots +
 * Cartesia VO. The final compositor is Remotion instead of ffmpeg, giving
 * us subpixel typography, bezier-eased overlays, and an in-frame brand mark.
 *
 * Cost: ~$1.52 (3 × Veo Fast 6s + Cartesia). Render time: ~3 min.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { parseMedia } from "@remotion/media-parser";
import { generateVeoClip } from "../src/services/ai-clip-fal";
import { synthesizeScenes as cartesiaTts } from "../src/services/tts-cartesia";
import type { LinkeditchAdProps } from "../src/template/LinkeditchAd";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FPS = 30;
const FREEZE_SEC = 1.5;

const FULL_VO =
  "On the job search? Never send another application again. LinkedItch uses your profile to automatically apply to jobs on all job boards. It even generates unique cover letters per application to give you the best chance at a reply. Try for free today.";

const SHOT_1 = `Stop-motion claymation animation, intentionally lo-fi, handcrafted matte finish, no glossy CGI. 9:16 vertical. White seamless paper backdrop with subtle paper texture.

A small sad cover letter character — folded crumpled white paper with two thin black stick arms and big cartoon eyes drawn with marker — shuffles toward a giant pristine red recruiter mailbox. The character looks up, hesitates, folds itself in half and slumps into the slot.

WHIP CUT to overhead view: dozens of identical sad paper cover letters tumble down from above into the same slot, cascading like a waterfall.

Camera: handheld stop-motion shake. Frame rate ~12fps choppy. Mood: deadpan, melancholic.`;

const SHOT_2 = `Stop-motion claymation animation, intentionally lo-fi, handcrafted matte finish. 9:16 vertical. Same white seamless paper backdrop as before.

A ROBOT CHARACTER made of folded silver-grey cardstock with two stick arms and a single round LED-marker eye, holding a tiny notebook. The robot scans a flat job posting card hovering in mid-air, head tilts thoughtfully. Its notebook fills with sketched ink lines — different cover letter snippets appearing rapidly. The robot HAMMERS its tiny pen on the notebook.

Cut to: four miniature fresh cover letter characters — same paper bodies as the sad ones but each with a UNIQUE colored hat (red, blue, green, yellow) and a confident smile — popping into existence with little stop-motion frame-skips.

Camera: locked-off table-top angle with slight zoom-in. ~12fps choppy. Mood: industrious, magical.`;

const SHOT_3 = `Stop-motion claymation animation, intentionally lo-fi, handcrafted matte finish. 9:16 vertical. Same white seamless paper backdrop.

Six unique colorful cover letter characters (red, blue, green, yellow, orange, purple hats) march in a confident line toward a row of red recruiter mailboxes. Each slips into a different mailbox slot.

WHIP CUT: tiny green-checkmark interview-request envelopes fly OUT of the mailboxes back toward the camera, accumulating into a triumphant pile.

The robot character stands smiling proudly next to a hand-painted white sign with chunky black hand-painted lettering reading "LINKEDITCH.COM", slightly crooked, like a yard sign.

Camera: handheld stop-motion shake, slow pull-back to reveal the whole scene. ~12fps choppy. Mood: triumphant, vindicated.`;

async function genShot(
  prompt: string,
  shotIdx: number,
  publicDir: string,
): Promise<string> {
  const sub = path.join(publicDir, `shot-${shotIdx}-tmp`);
  await fs.mkdir(sub, { recursive: true });
  const r = await generateVeoClip(prompt, sub, {
    model: "veo3.1-fast",
    duration: "6s",
    aspectRatio: "9:16",
    generateAudio: false,
  });
  const final = path.join(publicDir, "clips", `shot-${shotIdx}.mp4`);
  await fs.mkdir(path.dirname(final), { recursive: true });
  await fs.rename(r.clipPath, final);
  return final;
}

async function getFrameCount(clipPath: string): Promise<number> {
  const { durationInSeconds } = await parseMedia({
    src: clipPath,
    fields: { durationInSeconds: true },
  });
  return Math.round((durationInSeconds ?? 6) * FPS);
}

async function main() {
  const timestamp = Date.now();
  const workDir = path.join(ROOT, "out", `linkeditch-clay-v5-${timestamp}`);
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  // 1. Generate 3 Veo shots in parallel.
  console.log("[clay-v5] generating 3 Veo shots in parallel (~90s)...");
  const t0 = Date.now();
  const [s1, s2, s3] = await Promise.all([
    genShot(SHOT_1, 0, publicDir),
    genShot(SHOT_2, 1, publicDir),
    genShot(SHOT_3, 2, publicDir),
  ]);
  console.log(`[clay-v5] shots ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 2. Cartesia VO.
  console.log("[clay-v5] cartesia VO...");
  const audioDir = path.join(publicDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const fakeScript = {
    appName: "LinkedItch",
    tagline: "AI applies for you.",
    voiceStyle: "confident-warm" as const,
    scenes: [
      { kind: "hook" as const, headline: "voice", voiceover: FULL_VO, durationSec: 17 },
    ],
  };
  await cartesiaTts(fakeScript, audioDir);
  // cartesiaTts writes to <audioDir>/scene-0/audio.mp3
  const voSrc = path.join(audioDir, "scene-0", "audio.mp3");

  // 3. Measure actual clip durations so we don't hardcode frame counts.
  console.log("[clay-v5] measuring clip durations...");
  const [clip1Frames, clip2Frames, clip3Frames] = await Promise.all([
    getFrameCount(s1),
    getFrameCount(s2),
    getFrameCount(s3),
  ]);
  const freezeFrames = Math.round(FREEZE_SEC * FPS);
  console.log(
    `[clay-v5] frames: ${clip1Frames} / ${clip2Frames} / ${clip3Frames} / freeze ${freezeFrames}`,
  );

  // Public dir paths (relative from publicDir root) for staticFile() in Remotion.
  const inputProps: LinkeditchAdProps = {
    clip1Path: "clips/shot-0.mp4",
    clip2Path: "clips/shot-1.mp4",
    clip3Path: "clips/shot-2.mp4",
    voPath: "audio/scene-0/audio.mp3",
    clip1Frames,
    clip2Frames,
    clip3Frames,
    freezeFrames,
  };

  // 4. Bundle + render via Remotion.
  console.log("[clay-v5] bundling remotion...");
  const bundleLocation = await bundle({
    entryPoint: path.join(ROOT, "src", "index.tsx"),
    publicDir,
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "LinkeditchAd",
    inputProps,
  });

  const finalPath = path.join(ROOT, "out", `linkeditch-clay-v5-${timestamp}.mp4`);
  console.log("[clay-v5] rendering...");
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: finalPath,
    inputProps,
    concurrency: 4,
    crf: 18,
    pixelFormat: "yuv420p",
  });

  const stat = await fs.stat(finalPath);
  console.log(`\n=== linkeditch clay v5 ===`);
  console.log(`output: ${finalPath}`);
  console.log(`size:   ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`cost:   ~$1.52 (3 Veo Fast 6s + Cartesia)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
