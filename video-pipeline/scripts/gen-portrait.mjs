// Generate one Higgsfield image and download it. Generic.
// Usage: HOME=/root PROMPT="..." OUT=refs/avatars/x.png MODEL=seedream_v4_5 node scripts/gen-portrait.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const MODEL = process.env.MODEL || "seedream_v4_5";
const PROMPT = process.env.PROMPT;
const OUT = path.resolve(process.env.OUT || "refs/avatars/out.png");
if (!PROMPT) throw new Error("set PROMPT");

function findImg(o){let f=null;const w=(v)=>{if(f)return;if(typeof v==="string"){if(/^https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(v))f=v;}else if(Array.isArray(v))v.forEach(w);else if(v&&typeof v==="object")Object.values(v).forEach(w);};w(o);return f;}
function dl(url,dest){return new Promise((res,rej)=>{const g=(u,n=0)=>https.get(u,(r)=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){if(n>5)return rej(new Error("redir"));r.resume();return g(r.headers.location,n+1);}if(r.statusCode!==200)return rej(new Error("HTTP "+r.statusCode));const w=createWriteStream(dest);r.pipe(w);w.on("finish",()=>w.close(()=>res(dest)));}).on("error",rej);g(url);});}

(async () => {
  await mkdir(path.dirname(OUT), { recursive: true });
  const { stdout } = await exec("higgsfield", ["generate","create",MODEL,"--prompt",PROMPT,"--aspect_ratio","9:16","--wait","--wait-timeout","8m","--json"], { maxBuffer: 64*1024*1024, env: { ...process.env, HOME: "/root" } });
  let parsed=null; for(const c of stdout.split(/\n(?=[\[{])/)){try{parsed=JSON.parse(c.trim());break;}catch{/* */}}
  const url=(parsed&&findImg(parsed))||(stdout.match(/https?:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?/i)||[])[0];
  if(!url) throw new Error("no image url\n"+stdout.slice(0,500));
  await dl(url, OUT);
  console.log("DONE:", OUT);
})().catch((e)=>{console.error("ERROR:",String(e).slice(0,300));process.exit(1);});
