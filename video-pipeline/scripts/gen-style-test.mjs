// Style-test: can Higgsfield image models match the Agent Opus flat-illustration
// aesthetic (teal bg, gold tokens, clean flat-vector explainer)? Generate the
// same prompt across a few models so we can pick the closest match before
// committing credits to animating a full set.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("refs/style-tests");

const PROMPT =
  "Flat vector cartoon illustration, modern tech-explainer style, bright teal background (#27b6cf), a young man in a green crewneck and jeans standing beside a tall glass jar half full of glowing golden coin-tokens on a small mint-green platform, a few gold tokens floating above and dropping into the jar, clean thick dark outlines, flat cel shading with soft dimensional highlights, friendly and clean, vertical 9:16 composition, no text, no watermark";

const MODELS = ["nano_banana_2", "seedream_v4_5", "flux_2"];

function findImg(obj) {
  let f = null;
  const walk = (v) => {
    if (f) return;
    if (typeof v === "string") {
      if (/^https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(v)) f = v;
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(obj);
  return f;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, n = 0) =>
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (n > 5) return reject(new Error("redirects"));
            res.resume();
            return get(res.headers.location, n + 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          const w = createWriteStream(dest);
          res.pipe(w);
          w.on("finish", () => w.close(() => resolve(dest)));
        })
        .on("error", reject);
    get(url);
  });
}

async function one(model) {
  const args = ["generate", "create", model, "--prompt", PROMPT, "--aspect_ratio", "9:16", "--wait", "--wait-timeout", "8m", "--json"];
  const { stdout } = await exec("higgsfield", args, { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOME: "/root" } });
  let parsed = null;
  for (const c of stdout.split(/\n(?=[\[{])/)) {
    try { parsed = JSON.parse(c.trim()); break; } catch { /* scan */ }
  }
  const url = (parsed && findImg(parsed)) || (stdout.match(/https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?/i) || [])[0];
  if (!url) throw new Error(`${model}: no image url\n${stdout.slice(0, 600)}`);
  const ext = (url.match(/\.(png|jpe?g|webp)/i) || [".png"])[0];
  const dest = path.join(OUT, `${model}${ext}`);
  await download(url, dest);
  return { model, dest };
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const res = await Promise.allSettled(MODELS.map(one));
  console.log(JSON.stringify(res.map((r, i) => (r.status === "fulfilled" ? r.value : { model: MODELS[i], error: String(r.reason).slice(0, 200) })), null, 2));
})();
