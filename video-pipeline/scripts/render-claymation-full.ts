import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateVeoClip } from "../src/services/ai-clip-fal";
import { synthesizeScenes as cartesiaTts } from "../src/services/tts-cartesia";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

async function genShot(prompt: string, shotIdx: number, publicDir: string): Promise<string> {
  const sub = path.join(publicDir, `shot-${shotIdx}-tmp`);
  await fs.mkdir(sub, { recursive: true });
  const r = await generateVeoClip(prompt, sub, {
    model: "veo3.1-fast",
    duration: "6s",
    aspectRatio: "9:16",
    generateAudio: false,
  });
  const final = path.join(publicDir, `shot-${shotIdx}.mp4`);
  await fs.rename(r.clipPath, final);
  return final;
}

async function main() {
  const timestamp = Date.now();
  const workDir = path.join(ROOT, "out", `claymation-full-${timestamp}`);
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  console.log("[clay] generating 3 Veo shots in parallel (~90s)...");
  const t0 = Date.now();
  const [s1, s2, s3] = await Promise.all([
    genShot(SHOT_1, 0, publicDir),
    genShot(SHOT_2, 1, publicDir),
    genShot(SHOT_3, 2, publicDir),
  ]);
  console.log(`[clay] 3 shots ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("[clay] cartesia VO...");
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
  const voPath = path.join(audioDir, "scene-0", "audio.mp3");

  console.log("[clay] ffmpeg concat + audio mix + end-card overlay...");
  const concatList = path.join(publicDir, "concat.txt");
  await fs.writeFile(
    concatList,
    [s1, s2, s3].map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n") + "\n",
  );
  const concatPath = path.join(publicDir, "concat.mp4");
  await ffmpegSpawn(
    ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatPath],
    "concat",
  );

  // Re-encode with VO. Extend video with 1.5s freeze so VO finishes naturally.
  // Brand mark overlay only on the LAST 2.5s as a safety net in case Veo's
  // hand-painted sign is unreadable. If Veo nailed the sign, this still adds
  // a clean kinetic "Try free today" call to action.
  const finalPath = path.join(ROOT, "out", `linkeditch-clay-${timestamp}.mp4`);
  await ffmpegSpawn(
    [
      "-y",
      "-i", concatPath,
      "-i", voPath,
      "-filter_complex",
      [
        "[0:v]tpad=stop_mode=clone:stop_duration=1.5[v0]",
        "[v0]drawbox=y=ih*0.78:color=black@0.7:width=iw:height=ih*0.22:t=fill:enable='gte(t,16)'[v1]",
        "[v1]drawtext=text='Try LinkedItch free today':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=h*0.83:fontfile='/c/Windows/Fonts/arialbd.ttf':enable='gte(t,16)'[vout]",
      ].join(";"),
      "-map", "[vout]",
      "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      finalPath,
    ],
    "final mix",
  );

  const stat = await fs.stat(finalPath);
  console.log(`\n=== claymation full ===`);
  console.log(`output: ${finalPath}`);
  console.log(`size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`cost: ~$1.52 (3 Veo Fast 6s + Cartesia)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
