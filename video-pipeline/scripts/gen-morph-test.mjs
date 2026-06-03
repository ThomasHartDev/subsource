// One morph-transition test: does Kling 3.0 produce a clean, on-style seamless
// morph from scene A's last frame into scene B? Validates before we generate all 11.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";

const exec = promisify(execFile);
const START = path.resolve("refs/morph-test/bucket-last.png"); // extracted by bash
const END = path.resolve("refs/keyframes/04-overload.png");
const OUT = path.resolve("refs/morph-test/bucket-to-overload.mp4");
const PROMPT =
  "Smooth seamless morph transition that fluidly transforms the first scene into the second scene, keeping the exact same flat 2D cartoon illustration style, teal background and character; continuous flowing motion, no hard cut, no text, no words";

function findMp4(o){let f=null;const w=(v)=>{if(f)return;if(typeof v==="string"){if(/^https?:\/\/\S+\.mp4(\?\S*)?$/i.test(v))f=v;}else if(Array.isArray(v))v.forEach(w);else if(v&&typeof v==="object")Object.values(v).forEach(w);};w(o);return f;}
function dl(url,dest){return new Promise((res,rej)=>{const g=(u,n=0)=>https.get(u,(r)=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){if(n>5)return rej(new Error("redir"));r.resume();return g(r.headers.location,n+1);}if(r.statusCode!==200)return rej(new Error("HTTP "+r.statusCode));const w=createWriteStream(dest);r.pipe(w);w.on("finish",()=>w.close(()=>res(dest)));}).on("error",rej);g(url);});}

(async () => {
  const { stdout } = await exec("higgsfield", ["generate","create","kling3_0","--prompt",PROMPT,"--start-image",START,"--end-image",END,"--aspect_ratio","9:16","--duration","5","--wait","--wait-timeout","12m","--json"], { maxBuffer: 64*1024*1024, env: { ...process.env, HOME: "/root" } });
  let parsed=null; for(const c of stdout.split(/\n(?=[\[{])/)){try{parsed=JSON.parse(c.trim());break;}catch{/* */}}
  const url=(parsed&&findMp4(parsed))||(stdout.match(/https?:\/\/\S+\.mp4(\?\S*)?/i)||[])[0];
  if(!url){console.error("NO URL\n"+stdout.slice(0,800));process.exit(1);}
  await dl(url, OUT);
  console.log("MORPH OK ->", OUT);
})();
