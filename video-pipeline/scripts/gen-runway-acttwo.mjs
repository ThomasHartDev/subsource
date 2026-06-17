// Runway act_two (character performance): drive the brand character with
// Thomas's real talking video. Output looks like the character but moves and
// lip-syncs like him. The true "film yourself -> avatar" test.
// Run: node scripts/gen-runway-acttwo.mjs
import RunwayML from "@runwayml/sdk";
import { readFileSync, createReadStream, createWriteStream, existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";

const env = Object.fromEntries(
  readFileSync(path.resolve(".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new RunwayML({ apiKey: env.RUNWAY_API_KEY });

const CHAR = path.resolve(process.env.RUNWAY_CHAR || "refs/keyframes/01-intro.png"); // character whose skin we wear
const DRIVER = path.resolve(process.env.RUNWAY_DRIVER || "refs/driving/thomas-talking-15s.mp4"); // Thomas performing
const OUT = path.resolve(process.env.RUNWAY_OUT || "out/runway-act-two.mp4");
const BODY_CONTROL = process.env.RUNWAY_BODYCONTROL === "true"; // default false (headshot = face only)

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, n = 0) => https.get(u, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { if (n > 5) return reject(new Error("redirects")); r.resume(); return get(r.headers.location, n + 1); }
      if (r.statusCode !== 200) return reject(new Error("HTTP " + r.statusCode));
      const w = createWriteStream(dest); r.pipe(w); w.on("finish", () => w.close(() => resolve(dest)));
    }).on("error", reject);
    get(url);
  });
}

(async () => {
  if (!existsSync(CHAR)) throw new Error("missing " + CHAR);
  if (!existsSync(DRIVER)) throw new Error("missing " + DRIVER);

  console.log("[1/4] uploading brand character image…");
  const charUp = await client.uploads.createEphemeral({ file: createReadStream(CHAR) });
  console.log("      ->", charUp.uri);

  console.log("[2/4] uploading Thomas's driving performance…");
  const drvUp = await client.uploads.createEphemeral({ file: createReadStream(DRIVER) });
  console.log("      ->", drvUp.uri);

  console.log("[3/4] act_two: mapping the performance onto the character…");
  const task = await client.characterPerformance
    .create({
      model: "act_two",
      character: { type: "image", uri: charUp.uri },
      reference: { type: "video", uri: drvUp.uri },
      bodyControl: BODY_CONTROL,
      expressionIntensity: 3,
      ratio: "720:1280",
    })
    .waitForTaskOutput();
  const url = task.output?.[0];
  if (!url) throw new Error("no output: " + JSON.stringify(task).slice(0, 300));
  console.log("      output:", url);

  console.log("[4/4] downloading ->", OUT);
  await download(url, OUT);
  console.log("DONE:", OUT);
})().catch((e) => {
  const msg = String(e?.message || e);
  if (/credit|insufficient|payment|balance/i.test(msg)) console.error("RUNWAY_CREDITS_NEEDED");
  console.error("ERROR:", msg);
  process.exit(1);
});
