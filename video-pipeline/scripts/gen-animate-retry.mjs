// Retry the two clips that failed: youAreServer (Veo NSFW false-positive on the
// "torso" phrasing) and tail (command error). Tamer motion prompts, same style lock.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("public/scenes");
const KF = path.resolve("refs/keyframes");
const KEEP = "Keep the flat 2D cartoon illustration art style, character, colors and composition EXACTLY the same as the input image. No new objects, no text, no words, no style change, no camera cuts.";

const SCENES = [
  ["youAreServer", "08-youareserver.png", "Gentle subtle motion only: a soft warm golden glow pulses and shimmers, the young man breathes calmly and gives a small confident nod"],
  ["tail", "12-tail.png", "The young man gives a warm friendly goodbye wave and a gentle nod, soft ambient shimmer, very slow subtle push-out"],
];

function findMp4(o){let f=null;const w=(v)=>{if(f)return;if(typeof v==="string"){if(/^https?:\/\/\S+\.mp4(\?\S*)?$/i.test(v))f=v;}else if(Array.isArray(v))v.forEach(w);else if(v&&typeof v==="object")Object.values(v).forEach(w);};w(o);return f;}
function download(url,dest){return new Promise((res,rej)=>{const g=(u,n=0)=>https.get(u,(r)=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){if(n>5)return rej(new Error("redirects"));r.resume();return g(r.headers.location,n+1);}if(r.statusCode!==200)return rej(new Error("HTTP "+r.statusCode));const w=createWriteStream(dest);r.pipe(w);w.on("finish",()=>w.close(()=>res(dest)));}).on("error",rej);g(url);});}

async function one([section, kf, motion]) {
  const prompt = `${motion}. ${KEEP}`;
  const img = path.join(KF, kf);
  const { stdout } = await exec("higgsfield", ["generate","create","veo3_1","--prompt",prompt,"--image",img,"--aspect_ratio","9:16","--duration","8","--wait","--wait-timeout","15m","--json"], { maxBuffer: 64*1024*1024, env: { ...process.env, HOME: "/root" } });
  let parsed=null; for (const c of stdout.split(/\n(?=[\[{])/)){try{parsed=JSON.parse(c.trim());break;}catch{/* */}}
  const url=(parsed&&findMp4(parsed))||(stdout.match(/https?:\/\/\S+\.mp4(\?\S*)?/i)||[])[0];
  if(!url) throw new Error(`${section}: no url\n${stdout.slice(0,400)}`);
  await download(url, path.join(OUT, `${section}.mp4`));
  return section;
}
(async () => {
  const res = await Promise.allSettled(SCENES.map(one));
  console.log(JSON.stringify(res.map((r,i)=>r.status==="fulfilled"?{ok:r.value}:{err:SCENES[i][0],reason:String(r.reason).slice(0,200)}),null,2));
})();
