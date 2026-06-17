// Generate one character-consistent keyframe per section in the locked
// flat-illustration style (nano_banana_2 = Nano Banana Pro), using the approved
// style test as the character/style reference. Cheap stills; we animate the
// winners next. A unique scene per beat so nothing repeats.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("refs/keyframes");
const REF = path.resolve("refs/style-tests/nano_banana_2.png");

const STYLE =
  "Flat vector cartoon illustration, modern tech-explainer style, bright teal background #27b6cf, SAME young man character and SAME clean art style as the reference image (brown hair, green crewneck, blue jeans, white sneakers), thick clean dark outlines, flat cel shading with soft highlights, vertical 9:16 composition, generous empty space, no text, no words, no watermark";

const SCENES = [
  ["01-intro", "the young man standing centered, friendly relaxed smile, one hand giving a small wave, a softly glowing smartphone in his other hand"],
  ["02-request", "the young man tapping a glowing smartphone, one small glowing envelope-packet flying from the phone across to a tall friendly server cabinet on the right"],
  ["03-bucket", "the young man beside a tall clear glass jar half full of glowing golden coin-tokens on a mint-green platform, three gold tokens dropping in from above"],
  ["04-overload", "a server cabinet glowing hot red and orange with little heat-wave lines rising, a thick flurry of paper envelope-packets crowding against it, the young man to the side looking worried with a hand on his head"],
  ["05-rejected", "the young man holding both hands up in a calm stop gesture beside a closed glowing barrier gate, two envelope-packets bouncing back away from the gate"],
  ["06-why", "the young man calm and content standing beside a healthy softly glowing green server cabinet, steady and balanced posture"],
  ["07-break", "wide establishing shot of a tidy illustrated server room, two rows of friendly server cabinets with tiny glowing status lights receding into soft haze, no people"],
  ["08-youareserver", "the young man pointing at his own chest with a thoughtful gentle smile, a glowing jar of golden energy-tokens visible inside a soft transparent outline of his torso"],
  ["09-burnout", "the young man slumped and tired at a desk late at night under a dim warm lamp, a dark powered-down server cabinet beside him, a small row of grey envelope-packets waiting in a queue"],
  ["10-chorus", "the young man standing tall, calm and balanced, a glass token jar beside him refilling with bright golden tokens, hopeful bright scene"],
  ["11-outro", "the young man resting peacefully sitting by a window at soft golden sunrise, calm and content, a full glass jar of golden tokens nearby"],
  ["12-tail", "the young man giving a warm friendly small wave goodbye, simple clean bright teal scene, centered"],
];

function findImg(obj) {
  let f = null;
  const walk = (v) => {
    if (f) return;
    if (typeof v === "string") { if (/^https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(v)) f = v; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(obj);
  return f;
}
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, n = 0) =>
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (n > 5) return reject(new Error("redirects")); res.resume(); return get(res.headers.location, n + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const w = createWriteStream(dest); res.pipe(w); w.on("finish", () => w.close(() => resolve(dest)));
      }).on("error", reject);
    get(url);
  });
}
async function one([name, scene]) {
  const prompt = `${scene}. ${STYLE}`;
  const { stdout } = await exec("higgsfield", ["generate", "create", "nano_banana_2", "--prompt", prompt, "--image", REF, "--aspect_ratio", "9:16", "--wait", "--wait-timeout", "8m", "--json"], { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOME: "/root" } });
  let parsed = null;
  for (const c of stdout.split(/\n(?=[\[{])/)) { try { parsed = JSON.parse(c.trim()); break; } catch { /* */ } }
  const url = (parsed && findImg(parsed)) || (stdout.match(/https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?/i) || [])[0];
  if (!url) throw new Error(`${name}: no image url\n${stdout.slice(0, 500)}`);
  const dest = path.join(OUT, `${name}.png`);
  await download(url, dest);
  return { name, dest };
}
// concurrency pool of 4
async function pool(items, n, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = { status: "ok", ...(await fn(items[idx])) }; } catch (e) { out[idx] = { status: "err", name: items[idx][0], error: String(e).slice(0, 200) }; } }
  });
  await Promise.all(workers);
  return out;
}
(async () => {
  await mkdir(OUT, { recursive: true });
  const res = await pool(SCENES, 4, one);
  console.log(JSON.stringify(res, null, 2));
})();
