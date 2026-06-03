// Animate each approved keyframe into a motion clip (Veo 3.1 image-to-video),
// named by section so the composition maps 1:1. Subtle, looping-friendly motion
// that keeps the locked art style. Output: public/scenes/<section>.mp4
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("public/scenes");
const KF = path.resolve("refs/keyframes");

const KEEP = "Keep the flat 2D cartoon illustration art style, character design, colors and composition EXACTLY the same as the input image. Gentle subtle looping motion only. No new objects, no text, no words, no style change, no camera cuts.";

// [section, keyframe-file, motion]
const SCENES = [
  ["intro", "01-intro.png", "the young man gives a small friendly wave and a gentle nod, soft idle breathing, the phone screen glows softly, very slow subtle push-in"],
  ["request", "02-request.png", "the glowing envelope-packet glides smoothly from the phone across to the server cabinet, the phone screen pulses once"],
  ["bucket", "03-bucket.png", "golden coin-tokens drop one by one into the glass jar and settle, soft shimmer on the tokens, the young man watches"],
  ["overload", "04-overload.png", "heat-wave lines rise off the red-hot server, the red glow pulses, the crowd of envelope-packets jitters and presses in, the man reacts"],
  ["rejected", "05-rejected.png", "the envelope-packets bounce back off the closed barrier, the man holds his calm stop gesture, the gate pulses red"],
  ["why", "06-why.png", "the green server glows with a slow steady pulse, the man breathes calmly, soft ambient shimmer"],
  ["break", "07-break.png", "slow cinematic push down the aisle of server cabinets, tiny status lights blink gently, soft haze drifts"],
  ["youAreServer", "08-youareserver.png", "the glowing energy-tokens inside the man's torso shimmer and pulse softly, he breathes, a gentle warm glow"],
  ["burnout", "09-burnout.png", "the dim lamp flickers faintly, the man stays slumped and still, the dark server sits cold, the queued envelopes wait, melancholy stillness"],
  ["chorus", "10-chorus.png", "golden tokens steadily refill the jar beside the man, he stands tall and calm, bright hopeful shimmer"],
  ["outro", "11-outro.png", "soft golden sunrise light shifts gently through the window, the man rests peacefully, the full jar glows warmly"],
  ["tail", "12-tail.png", "the young man gives a warm friendly goodbye wave, gentle idle motion, soft shimmer, very slow push-out"],
];

function findMp4(obj) {
  let f = null;
  const walk = (v) => { if (f) return; if (typeof v === "string") { if (/^https?:\/\/\S+\.mp4(\?\S*)?$/i.test(v)) f = v; } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(obj); return f;
}
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, n = 0) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { if (n > 5) return reject(new Error("redirects")); res.resume(); return get(res.headers.location, n + 1); }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const w = createWriteStream(dest); res.pipe(w); w.on("finish", () => w.close(() => resolve(dest)));
    }).on("error", reject);
    get(url);
  });
}
async function one([section, kf, motion]) {
  const prompt = `${motion}. ${KEEP}`;
  const img = path.join(KF, kf);
  const { stdout } = await exec("higgsfield", ["generate", "create", "veo3_1", "--prompt", prompt, "--image", img, "--aspect_ratio", "9:16", "--duration", "8", "--wait", "--wait-timeout", "15m", "--json"], { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOME: "/root" } });
  let parsed = null;
  for (const c of stdout.split(/\n(?=[\[{])/)) { try { parsed = JSON.parse(c.trim()); break; } catch { /* */ } }
  const url = (parsed && findMp4(parsed)) || (stdout.match(/https?:\/\/\S+\.mp4(\?\S*)?/i) || [])[0];
  if (!url) throw new Error(`${section}: no mp4 url\n${stdout.slice(0, 500)}`);
  const dest = path.join(OUT, `${section}.mp4`);
  await download(url, dest);
  return { section, dest };
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const idx = i++; try { out[idx] = { status: "ok", ...(await fn(items[idx])) }; } catch (e) { out[idx] = { status: "err", section: items[idx][0], error: String(e).slice(0, 200) }; } } }));
  return out;
}
(async () => {
  await mkdir(OUT, { recursive: true });
  const res = await pool(SCENES, 4, one);
  console.log(JSON.stringify(res, null, 2));
})();
