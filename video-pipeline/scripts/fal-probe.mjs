import { fal } from "@fal-ai/client";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/root/projects/command-center/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
fal.config({ credentials: env.FAL_API_KEY });
const ids = [
  "half-moon-ai/ai-face-swap/faceswapvideo",
  "half-moon-ai/ai-face-swap",
  "easel-ai/advanced-face-swap",
  "fal-ai/face-swap",
  "fal-ai/pixverse/swap",
  "fal-ai/video-face-swap",
];
for (const id of ids) {
  try {
    await fal.subscribe(id, { input: {} });
    console.log(id, "=> OK(unexpected)");
  } catch (e) {
    const body = e?.body?.detail ?? e?.body ?? e?.message ?? String(e);
    console.log(id, "=>", e?.status, JSON.stringify(body).slice(0, 600));
  }
}
