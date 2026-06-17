import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateVeoClip } from "../src/services/ai-clip-fal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Heavy stylistic anchors to push Veo away from photorealism into supplement-ad territory.
const PROMPT = `Stop-motion claymation animation, intentionally lo-fi, handcrafted matte finish, no glossy CGI surfaces. 9:16 vertical. White seamless paper backdrop with subtle paper texture and soft cast shadows.

A small sad cover letter character — made of folded crumpled white paper with two thin black stick arms and big cartoon eyes drawn with marker — shuffles forward across the white floor toward a giant pristine red recruiter mailbox sitting ominously in frame. The character looks up at the mailbox. Hesitates. Then folds itself in half and slumps into the mailbox slot.

Cut to overhead: dozens of IDENTICAL sad paper cover letter characters tumble down from above into the same mailbox slot, cascading like a sad waterfall. The mailbox does not get fuller. They just keep falling in.

Camera: handheld stop-motion shake. Color palette: clean white background, single saturated red mailbox, neutral paper-tan characters. Mood: deadpan, melancholic, absurd. Frame rate intentionally choppy at ~12fps to feel handcrafted, not smooth.`;

async function main() {
  const timestamp = Date.now();
  const workDir = path.join(ROOT, "out", `claymation-test-${timestamp}`);
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  console.log("[claymation] Veo Fast 8s test...");
  const t0 = Date.now();
  const clip = await generateVeoClip(PROMPT, publicDir, {
    model: "veo3.1-fast",
    duration: "8s",
    aspectRatio: "9:16",
    generateAudio: false,
  });
  console.log(`[claymation] done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${clip.clipPath}`);

  // Move the raw output to a top-level out/ path for easy access
  const finalPath = path.join(ROOT, "out", `claymation-test-${timestamp}.mp4`);
  await fs.copyFile(clip.clipPath, finalPath);
  console.log(`\noutput: ${finalPath}`);
  console.log(`cost: ~$0.50`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
