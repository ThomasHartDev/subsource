import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateVeoClip } from "../src/services/ai-clip-fal";
import { synthesizeScenes as cartesiaTts } from "../src/services/tts-cartesia";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Verbatim from user. Persuasion script, ~17s of audio.
const FULL_VO =
  "On the job search? Never send another application again. LinkedItch uses your profile to automatically apply to jobs on all job boards. It even generates unique cover letters per application to give you the best chance at a reply. Try for free today.";

// Two independent 8s Veo prompts. Pain shot then solution shot. They look like
// different moments in time of the same scene — same character, same desk, same
// lighting — but Veo doesn't chain them through image-to-video, so the cuts
// will read as a deliberate edit rather than a continuous shot.

const SHOT_1_PROMPT = `Tight medium shot, 9:16 vertical. A 30-something software engineer in a wrinkled grey t-shirt sits hunched over a laptop in a dim home office. The screen is covered in 14 stacked browser tabs of job postings. He SLAMS the keyboard with both hands, rips them up through his hair, JOLTS back from the laptop. The camera does a rapid handheld push-in as the monitor flashes "Applications: 47 / Replies: 2" in stark white. He picks up a half-empty coffee mug, drinks bitterly, slumps. Lighting: harsh blue monitor glow against a single warm amber desk lamp pool. Mood: kinetic, frustrated, the third Sunday in a row.`;

const SHOT_2_PROMPT = `Tight medium shot, 9:16 vertical. The same 30-something software engineer in the same grey t-shirt at the same desk. Now he leans BACK in the chair, hands clasped behind his head, watching the laptop. The screen rapidly fills itself: cover letter after cover letter auto-typing at impossible speed, each personalized to a different job listing visible as small thumbnails sliding in from the right edge. The counter ticks up "Sent: 147 / Interview requests: 12". A wry, vindicated smile spreads across his face. The camera SLOW PUSH-IN on his expression. Lighting shifts: warm amber lamp dominant, monitor blue softer. Mood: triumphant, wry, the bot is winning.`;

async function ffmpegSpawn(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${label} exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function main() {
  const timestamp = Date.now();
  const workDir = path.join(ROOT, "out", `linkeditch-final-${timestamp}`);
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  // 1. Generate the two Veo shots in parallel (independent, no image-to-video chain).
  console.log("[final] generating two Veo Fast 8s shots in parallel...");
  const t0 = Date.now();
  const [shot1, shot2] = await Promise.all([
    generateVeoClip(SHOT_1_PROMPT, publicDir, {
      model: "veo3.1-fast",
      duration: "8s",
      aspectRatio: "9:16",
      generateAudio: false,
    }).then(async (r) => {
      // ai-clip-fal.ts writes both shots to "hero.mp4" by default — rename.
      const shot1Path = path.join(publicDir, "shot-0.mp4");
      await fs.rename(r.clipPath, shot1Path);
      return { ...r, clipPath: shot1Path };
    }),
    (async () => {
      // Use a sub-publicDir so the second clip doesn't collide on hero.mp4.
      const sub = path.join(publicDir, "shot2-tmp");
      await fs.mkdir(sub, { recursive: true });
      const r = await generateVeoClip(SHOT_2_PROMPT, sub, {
        model: "veo3.1-fast",
        duration: "8s",
        aspectRatio: "9:16",
        generateAudio: false,
      });
      const shot2Path = path.join(publicDir, "shot-1.mp4");
      await fs.rename(r.clipPath, shot2Path);
      return { ...r, clipPath: shot2Path };
    })(),
  ]);
  console.log(`[final] both shots ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 2. Cartesia VO (one long clip).
  console.log("[final] cartesia VO...");
  const audioDir = path.join(publicDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const fakeScript = {
    appName: "LinkedItch",
    tagline: "AI applies for you.",
    voiceStyle: "confident-warm" as const,
    scenes: [
      {
        kind: "hook" as const,
        headline: "voice",
        voiceover: FULL_VO,
        durationSec: 17,
      },
    ],
  };
  await cartesiaTts(fakeScript, audioDir);
  const voPath = path.join(audioDir, "scene-0", "audio.mp3");

  // 3. Concat list for ffmpeg.
  const listPath = path.join(publicDir, "concat.txt");
  await fs.writeFile(
    listPath,
    `file '${shot1.clipPath.replace(/\\/g, "/")}'\nfile '${shot2.clipPath.replace(/\\/g, "/")}'\n`,
  );

  // 4. Concat the two shots, then mix in VO.
  const concatPath = path.join(publicDir, "concat.mp4");
  console.log("[final] ffmpeg concat...");
  await ffmpegSpawn(
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath],
    "concat",
  );

  // 5. Re-encode with VO mixed in + persistent brand mark + end-card overlay.
  // Brand mark: small "LINKEDITCH.COM" top-right, persistent.
  // End card: bottom 35% black gradient + "Try free at linkeditch.com" appearing in last 3s.
  const finalPath = path.join(ROOT, "out", `linkeditch-final-${timestamp}.mp4`);
  console.log("[final] ffmpeg final mix with overlays...");
  await ffmpegSpawn(
    [
      "-y",
      "-i", concatPath,
      "-i", voPath,
      "-filter_complex",
      [
        // brand mark top-right (persistent)
        `[0:v]drawtext=text='LINKEDITCH.COM':fontcolor=#F59E0B:fontsize=28:x=w-text_w-40:y=120:font=Arial:fontfile='/c/Windows/Fonts/arialbd.ttf'[v1]`,
        // end card bottom rectangle in last 3s
        `[v1]drawbox=y=ih*0.65:color=black@0.65:width=iw:height=ih*0.35:t=fill:enable='gte(t,13)'[v2]`,
        `[v2]drawtext=text='Try LinkedItch free today':fontcolor=white:fontsize=68:x=(w-text_w)/2:y=h*0.72:font=Arial:fontfile='/c/Windows/Fonts/arialbd.ttf':enable='gte(t,13)'[v3]`,
        `[v3]drawtext=text='linkeditch.com':fontcolor=#F59E0B:fontsize=52:x=(w-text_w)/2:y=h*0.82:font=Arial:fontfile='/c/Windows/Fonts/arialbd.ttf':enable='gte(t,13)'[vout]`,
      ].join(";"),
      "-map", "[vout]",
      "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      finalPath,
    ],
    "final mix",
  );

  const stat = await fs.stat(finalPath);
  console.log(`\n=== final ===`);
  console.log(`output: ${finalPath}`);
  console.log(`size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`cost: ~$1.02 (2 Veo Fast + Cartesia)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
