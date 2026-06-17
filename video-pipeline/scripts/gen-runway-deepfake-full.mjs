// Full-length deepfake: restyle every 5s chunk of Thomas's video into the girl
// (gen4_aleph, same reference + locked seed for identity consistency), convert
// the full audio to a female voice in parallel, concat the chunks, mux the voice.
// Run: node scripts/gen-runway-deepfake-full.mjs
import RunwayML from "@runwayml/sdk";
import { readFileSync, writeFileSync, createReadStream, createWriteStream, existsSync, readdirSync } from "node:fs";
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

const CHUNK_DIR = path.resolve("out/chunks");
const REF = path.resolve("refs/avatars/cute-girl.png");
const AUDIO = path.resolve("refs/driving/thomas-audio-full.mp3");
const VOICE = process.env.RUNWAY_VOICE || "Lara";
const SEED = 42;
const CONCAT_VID = path.resolve("out/deepfake-full-video.mp4");
const VOICE_MP3 = path.resolve("out/deepfake-full-voice.mp3");
const OUT = path.resolve("out/deepfake-girl-full.mp4");

const PROMPT =
  "Replace the man in this video with a young woman who looks like the person in the reference image. Keep the exact same scene, background, car interior, camera framing, lighting, clothing, body posture, and head and body movements. Only change the person's face, hair and skin to hers. Photorealistic, natural, seamless, consistent identity.";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function restyle(chunkFile, refUri, idx) {
  const restyled = path.join(CHUNK_DIR, `restyled_${String(idx).padStart(2, "0")}.mp4`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const up = await client.uploads.createEphemeral({ file: createReadStream(chunkFile) });
      const task = await client.videoToVideo.create({
        model: "gen4_aleph",
        videoUri: up.uri,
        promptText: PROMPT,
        references: [{ type: "image", uri: refUri }],
        seed: SEED,
        contentModeration: { publicFigureThreshold: "low" },
      }).waitForTaskOutput();
      const url = task.output?.[0];
      if (!url) throw new Error("no output");
      await dl(url, restyled);
      console.log(`   chunk ${idx} done -> ${path.basename(restyled)}`);
      return restyled;
    } catch (e) {
      console.error(`   chunk ${idx} attempt ${attempt + 1} failed: ${String(e.message || e).slice(0, 160)}`);
      if (attempt === 0) await sleep(4000);
    }
  }
  throw new Error(`chunk ${idx} failed after retry`);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

(async () => {
  const chunks = readdirSync(CHUNK_DIR).filter((f) => /^chunk_\d+\.mp4$/.test(f)).sort()
    .map((f) => path.join(CHUNK_DIR, f));
  if (!chunks.length) throw new Error("no chunks in " + CHUNK_DIR);
  console.log(`[1/5] ${chunks.length} chunks; uploading reference + restyling (seed ${SEED})…`);
  const refUp = await client.uploads.createEphemeral({ file: createReadStream(REF) });

  // restyle all chunks (concurrency 3) AND convert voice, in parallel
  const [restyled] = await Promise.all([
    pool(chunks, 3, (c, idx) => restyle(c, refUp.uri, idx)),
    (async () => {
      console.log("[2/5] converting full audio to female voice…");
      const audUp = await client.uploads.createEphemeral({ file: createReadStream(AUDIO) });
      const t = await client.speechToSpeech.create({
        model: "eleven_multilingual_sts_v2",
        media: { type: "audio", uri: audUp.uri },
        voice: { type: "runway-preset", presetId: VOICE },
      }).waitForTaskOutput();
      const url = t.output?.[0];
      if (!url) throw new Error("no voice output");
      await dl(url, VOICE_MP3);
      console.log("   voice done ->", path.basename(VOICE_MP3));
    })(),
  ]);

  console.log("[3/5] concatenating restyled chunks…");
  const list = restyled.map((p) => `file '${p}'`).join("\n");
  const listPath = path.join(CHUNK_DIR, "concat.txt");
  writeFileSync(listPath, list);
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-an", CONCAT_VID]);

  console.log("[4/5] muxing female voice onto the full video…");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", CONCAT_VID, "-i", VOICE_MP3,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", OUT]);

  console.log("[5/5] DONE:", OUT);
})().catch((e) => {
  const msg = String(e?.message || e);
  if (/credit|insufficient|payment|balance/i.test(msg)) console.error("RUNWAY_CREDITS_NEEDED");
  console.error("ERROR:", msg);
  process.exit(1);
});
