// Generate the 11 boundary morph-transitions (Kling 3.0 start->end interpolation):
// scene A's last frame fluidly morphs into scene B's opening, same flat style.
// These replace the cross-dissolves so the video reads as one continuous piece.
// Output: public/transitions/<fromSection>.mp4
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("public/transitions");
const LAST = path.resolve("refs/morph-frames");
const KF = path.resolve("public/keyframes");

const ORDER = ["intro", "request", "bucket", "overload", "rejected", "why", "break", "youAreServer", "burnout", "chorus", "outro", "tail"];
const PAIRS = ORDER.slice(0, -1).map((from, i) => [from, ORDER[i + 1]]);

const PROMPT =
  "Smooth seamless morph transition that fluidly transforms the first image into the second image, keeping the exact same flat 2D cartoon illustration style, bright teal background and character; one continuous flowing motion, no hard cut, no text, no words, no watermark";

function findMp4(o){let f=null;const w=(v)=>{if(f)return;if(typeof v==="string"){if(/^https?:\/\/\S+\.mp4(\?\S*)?$/i.test(v))f=v;}else if(Array.isArray(v))v.forEach(w);else if(v&&typeof v==="object")Object.values(v).forEach(w);};w(o);return f;}
function dl(url,dest){return new Promise((res,rej)=>{const g=(u,n=0)=>https.get(u,(r)=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){if(n>5)return rej(new Error("redir"));r.resume();return g(r.headers.location,n+1);}if(r.statusCode!==200)return rej(new Error("HTTP "+r.statusCode));const w=createWriteStream(dest);r.pipe(w);w.on("finish",()=>w.close(()=>res(dest)));}).on("error",rej);g(url);});}

async function one([from, to]) {
  const start = path.join(LAST, `${from}-last.png`);
  const end = path.join(KF, `${to}.png`);
  const { stdout } = await exec("higgsfield", ["generate","create","kling3_0","--prompt",PROMPT,"--start-image",start,"--end-image",end,"--aspect_ratio","9:16","--duration","5","--wait","--wait-timeout","12m","--json"], { maxBuffer: 64*1024*1024, env: { ...process.env, HOME: "/root" } });
  let parsed=null; for(const c of stdout.split(/\n(?=[\[{])/)){try{parsed=JSON.parse(c.trim());break;}catch{/* */}}
  const url=(parsed&&findMp4(parsed))||(stdout.match(/https?:\/\/\S+\.mp4(\?\S*)?/i)||[])[0];
  if(!url) throw new Error(`${from}->${to}: no url\n${stdout.slice(0,400)}`);
  await dl(url, path.join(OUT, `${from}.mp4`));
  return `${from}->${to}`;
}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const idx=i++;try{out[idx]={ok:await fn(items[idx])};}catch(e){out[idx]={err:items[idx][0],reason:String(e).slice(0,180)};}}}));return out;}
(async () => {
  await mkdir(OUT, { recursive: true });
  const res = await pool(PAIRS, 4, one);
  console.log(JSON.stringify(res, null, 2));
})();
