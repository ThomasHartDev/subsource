// Full deepfake: keep Thomas's real scene + body + movements, change his
// appearance to the girl (videoToVideo / gen4_aleph) AND change his voice to a
// female preset (speechToSpeech), then mux. The "literally the same scene,
// sitting in the car, but it's a girl talking" version.
// Run: node scripts/gen-runway-deepfake.mjs
import RunwayML from "@runwayml/sdk";
import { readFileSync, createReadStream, createWriteStream, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const env = Object.fromEntries(
  readFileSync(path.resolve(".env.local"), "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new RunwayML({ apiKey: env.RUNWAY_API_KEY });

const VIDEO = path.resolve(process.env.RUNWAY_DRIVER || "refs/driving/thomas-talking-15s.mp4");
const AUDIO = path.resolve("refs/driving/thomas-audio-15s.mp3");
const REF = path.resolve(process.env.RUNWAY_CHAR || "refs/avatars/cute-girl.png");
const VOICE = process.env.RUNWAY_VOICE || "Lara"; // female preset
const TMP_VID = path.resolve("out/deepfake-video.mp4");
const TMP_AUD = path.resolve("out/deepfake-voice.mp3");
const OUT = path.resolve(process.env.RUNWAY_OUT || "out/deepfake-girl-final.mp4");

const PROMPT =
  "Replace the man in this video with a young woman who looks like the person in the reference image. Keep the exact same scene, background, car interior, camera framing, lighting, clothing style, body posture, and head and body movements. Only change the person's face, hair and skin to hers. Photorealistic, natural, seamless, consistent identity throughout.";

function dl(url, dest) {
  return new Promise((resolve, reject) => {
    const g = (u, n = 0) => https.get(u, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { if (n > 5) return reject(new Error("redir")); r.resume(); return g(r.headers.location, n + 1); }
      if (r.statusCode !== 200) return reject(new Error("HTTP " + r.statusCode));
      const w = createWriteStream(dest); r.pipe(w); w.on("finish", () => w.close(() => resolve(dest)));
    }).on("error", reject);
    g(url);
  });
}

(async () => {
  for (const f of [VIDEO, AUDIO, REF]) if (!existsSync(f)) throw new Error("missing " + f);

  console.log("[1/6] uploading video, audio, reference image…");
  const [vidUp, audUp, refUp] = await Promise.all([
    client.uploads.createEphemeral({ file: createReadStream(VIDEO) }),
    client.uploads.createEphemeral({ file: createReadStream(AUDIO) }),
    client.uploads.createEphemeral({ file: createReadStream(REF) }),
  ]);

  console.log("[2/6] restyling video (gen4_aleph) + converting voice (speechToSpeech) in parallel…");
  const [vidTask, sttTask] = await Promise.all([
    client.videoToVideo.create({
      model: "gen4_aleph",
      videoUri: vidUp.uri,
      promptText: PROMPT,
      references: [{ type: "image", uri: refUp.uri }],
      contentModeration: { publicFigureThreshold: "low" },
    }).waitForTaskOutput(),
    client.speechToSpeech.create({
      model: "eleven_multilingual_sts_v2",
      media: { type: "audio", uri: audUp.uri },
      voice: { type: "runway-preset", presetId: VOICE },
    }).waitForTaskOutput(),
  ]);

  const vidUrl = vidTask.output?.[0];
  const audUrl = sttTask.output?.[0];
  if (!vidUrl) throw new Error("no video output: " + JSON.stringify(vidTask).slice(0, 300));
  if (!audUrl) throw new Error("no audio output: " + JSON.stringify(sttTask).slice(0, 300));

  console.log("[3/6] downloading restyled video…", vidUrl.slice(0, 80));
  await dl(vidUrl, TMP_VID);
  console.log("[4/6] downloading female voice track…", audUrl.slice(0, 80));
  await dl(audUrl, TMP_AUD);

  console.log("[5/6] muxing female voice onto the restyled video…");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", TMP_VID, "-i", TMP_AUD,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", OUT]);

  console.log("[6/6] DONE:", OUT);
})().catch((e) => {
  const msg = String(e?.message || e);
  if (/credit|insufficient|payment|balance/i.test(msg)) console.error("RUNWAY_CREDITS_NEEDED");
  console.error("ERROR:", msg);
  process.exit(1);
});
