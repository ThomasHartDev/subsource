// Runway API: brand-character → talking avatar driven by the song audio.
// Fully autonomous (no browser/file-picker): uploads the local image + audio,
// builds a custom avatar from the brand character, then generates an avatar
// video lip-syncing the song. Reads RUNWAY_API_KEY from .env.local.
//
// Run: node scripts/gen-runway.mjs
import RunwayML from "@runwayml/sdk";
import { readFileSync, createReadStream, createWriteStream, existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";

// --- load key from .env.local -------------------------------------------------
const env = Object.fromEntries(
  readFileSync(path.resolve(".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const apiKey = env.RUNWAY_API_KEY;
if (!apiKey) throw new Error("RUNWAY_API_KEY missing from .env.local");

const client = new RunwayML({ apiKey });

const CHAR = path.resolve(process.env.RUNWAY_CHAR || "refs/keyframes/01-intro.png"); // front-facing character
const AUDIO = path.resolve(process.env.RUNWAY_AUDIO || "public/rate-limiting-snippet.mp3"); // ~10s vocal slice
const OUT = path.resolve(process.env.RUNWAY_OUT || "out/runway-avatar.mp4");
const VOICE = process.env.RUNWAY_VOICE || "leo"; // irrelevant when audio is provided, but avatars.create requires it

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, n = 0) =>
      https.get(u, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          if (n > 5) return reject(new Error("redirects"));
          r.resume();
          return get(r.headers.location, n + 1);
        }
        if (r.statusCode !== 200) return reject(new Error("HTTP " + r.statusCode));
        const w = createWriteStream(dest);
        r.pipe(w);
        w.on("finish", () => w.close(() => resolve(dest)));
      }).on("error", reject);
    get(url);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!existsSync(CHAR)) throw new Error("missing character image " + CHAR);
  if (!existsSync(AUDIO)) throw new Error("missing audio " + AUDIO);

  console.log("[1/5] uploading character image…");
  const charUp = await client.uploads.createEphemeral({ file: createReadStream(CHAR) });
  console.log("      ->", charUp.uri);

  console.log("[2/5] uploading song audio…");
  const audioUp = await client.uploads.createEphemeral({ file: createReadStream(AUDIO) });
  console.log("      ->", audioUp.uri);

  console.log("[3/5] creating custom avatar from the brand character…");
  let avatar = await client.avatars.create({
    name: "Rate Limiting Host",
    personality: "A friendly developer explaining computer science concepts through song.",
    referenceImage: charUp.uri,
    voice: { type: "runway-live-preset", presetId: VOICE },
    imageProcessing: "optimize",
  });
  // poll until READY
  for (let i = 0; i < 60 && avatar.status === "PROCESSING"; i++) {
    await sleep(3000);
    avatar = await client.avatars.retrieve(avatar.id);
  }
  if (avatar.status !== "READY") throw new Error("avatar not ready: " + JSON.stringify(avatar).slice(0, 300));
  console.log("      avatar READY:", avatar.id);

  console.log("[4/5] generating avatar video lip-syncing the song…");
  const task = await client.avatarVideos
    .create({
      avatar: { type: "custom", avatarId: avatar.id },
      model: "gwm1_avatars",
      speech: { type: "audio", audio: audioUp.uri },
    })
    .waitForTaskOutput();
  const url = task.output?.[0];
  if (!url) throw new Error("no output: " + JSON.stringify(task).slice(0, 300));
  console.log("      output:", url);

  console.log("[5/5] downloading ->", OUT);
  await download(url, OUT);
  console.log("DONE:", OUT);
})().catch((e) => {
  const msg = String(e?.message || e);
  if (/credit|insufficient|payment|balance/i.test(msg)) {
    console.error("RUNWAY_CREDITS_NEEDED: the API org has no credits yet. Add credits in the dev portal, then re-run.");
  }
  console.error("ERROR:", msg);
  process.exit(1);
});
