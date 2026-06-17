// Generate the cinematic Higgsfield shots for the rate-limiting video and
// download them into public/higgsfield/. These fill the generative slots that
// Remotion composites around (the "generate the beauty, code the truth" split).
//
// Run: HOME=/root node scripts/gen-higgsfield.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT_DIR = path.resolve("public/higgsfield");

const SHOTS = [
  {
    name: "break",
    prompt:
      "Abstract data center under heavy load. Rows of dark server racks receding into haze, pulsing amber and red status lights, faint heat shimmer rising, volumetric light beams, shallow depth of field, slow cinematic push-in, moody and tense, no text, no people.",
  },
  {
    name: "human",
    prompt:
      "A tired young man alone at a desk late at night, lit only by a warm desk lamp and the cool glow of a laptop, head in hand, running on empty, soft natural window light with city bokeh behind, candid documentary feel, gentle slow drift, melancholy and intimate, no text.",
  },
  {
    name: "tail",
    prompt:
      "Calm pale dawn light spilling through a tall window into a quiet room, dust motes drifting, a single person standing peacefully looking out, soft warm sunrise, hopeful and still, slow gentle camera rise, cinematic, no text.",
  },
];

function findMp4(obj) {
  let found = null;
  const walk = (v) => {
    if (found) return;
    if (typeof v === "string") {
      if (/^https?:\/\/\S+\.mp4(\?\S*)?$/i.test(v)) found = v;
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(obj);
  return found;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirects > 5) return reject(new Error("too many redirects"));
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          const f = createWriteStream(dest);
          res.pipe(f);
          f.on("finish", () => f.close(() => resolve(dest)));
        })
        .on("error", reject);
    };
    get(url);
  });
}

async function genOne(shot) {
  console.log(`[${shot.name}] generating…`);
  const { stdout } = await exec(
    "higgsfield",
    [
      "generate",
      "create",
      "veo3_1",
      "--prompt",
      shot.prompt,
      "--aspect_ratio",
      "9:16",
      "--duration",
      "8",
      "--wait",
      "--wait-timeout",
      "15m",
      "--wait-interval",
      "5s",
      "--json",
    ],
    { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOME: "/root" } },
  );
  // The CLI may print non-JSON progress lines; grab the JSON blob.
  let parsed = null;
  for (const chunk of stdout.split(/\n(?=[\[{])/)) {
    try {
      parsed = JSON.parse(chunk.trim());
      break;
    } catch {
      /* keep scanning */
    }
  }
  if (!parsed) {
    // last resort: regex the URL straight out of stdout
    const m = stdout.match(/https?:\/\/\S+\.mp4(\?\S*)?/i);
    if (!m) throw new Error(`[${shot.name}] no JSON and no mp4 url in output:\n${stdout.slice(0, 800)}`);
    parsed = { url: m[0] };
  }
  const url = findMp4(parsed) || parsed.url;
  if (!url) throw new Error(`[${shot.name}] no mp4 url found in result`);
  const dest = path.join(OUT_DIR, `${shot.name}.mp4`);
  await download(url, dest);
  console.log(`[${shot.name}] downloaded -> ${dest}`);
  return { name: shot.name, url, dest };
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const results = await Promise.allSettled(SHOTS.map(genOne));
  const summary = results.map((r, i) => ({
    shot: SHOTS[i].name,
    status: r.status,
    ...(r.status === "fulfilled" ? { dest: r.value.dest } : { error: String(r.reason).slice(0, 300) }),
  }));
  await writeFile(path.join(OUT_DIR, "_result.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
})();
