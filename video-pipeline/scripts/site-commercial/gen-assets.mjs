// One-time asset setup for the 3D engine: Inter woff fonts (troika needs
// ttf/otf/woff — NOT woff2) and ffmpeg-synthesized SFX (risers, whooshes,
// boom) so transitions can hit without licensing anything.
//
// Usage: node scripts/site-commercial/gen-assets.mjs

import { execFile } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONT_DIR = path.join(ROOT, 'public', 'site-commercial', 'fonts');
const SFX_DIR = path.join(ROOT, 'public', 'site-commercial', 'sfx');

const FONTS = {
  'Inter-Regular.woff': 'https://raw.githubusercontent.com/rsms/inter/v3.19/docs/font-files/Inter-Regular.woff',
  'Inter-Bold.woff': 'https://raw.githubusercontent.com/rsms/inter/v3.19/docs/font-files/Inter-Bold.woff',
};

async function exists(p, minBytes = 1) {
  try {
    return (await stat(p)).size >= minBytes;
  } catch {
    return false;
  }
}

await mkdir(FONT_DIR, { recursive: true });
await mkdir(SFX_DIR, { recursive: true });

for (const [name, url] of Object.entries(FONTS)) {
  const out = path.join(FONT_DIR, name);
  if (await exists(out, 50_000)) {
    console.log(`[fonts] ${name} already present`);
    continue;
  }
  console.log(`[fonts] fetching ${name}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed: ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // woff magic = "wOFF"
  if (buf.toString('ascii', 0, 4) !== 'wOFF') throw new Error(`${name}: not a woff file`);
  await writeFile(out, buf);
  console.log(`[fonts] ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// Synthesized SFX. Filtered-noise sweeps read as cinematic motion; nothing
// here sounds synthetic once it's under a music bed.
const SFX = {
  // doppler-ish pass for fast camera rips
  'whoosh.wav':
    'anoisesrc=color=pink:duration=1.4:seed=7,lowpass=f=1100,afade=t=in:d=0.55,afade=t=out:st=0.55:d=0.85,volume=2.2',
  // tension build into a reveal
  'riser.wav':
    'anoisesrc=color=white:duration=2.6:seed=11,highpass=f=300,lowpass=f=5200,afade=t=in:d=2.1,afade=t=out:st=2.2:d=0.4,volume=1.6',
  // sub hit when the monolith lands
  'boom.wav':
    'sine=frequency=46:duration=2.0,afade=t=in:d=0.005,afade=t=out:st=0.12:d=1.8,volume=2.8,lowpass=f=160',
  // sparkle for the finale
  'shimmer.wav':
    'anoisesrc=color=white:duration=2.4:seed=23,highpass=f=6000,afade=t=in:d=0.7,afade=t=out:st=0.9:d=1.5,volume=0.9',
};

for (const [name, filter] of Object.entries(SFX)) {
  const out = path.join(SFX_DIR, name);
  if (await exists(out, 10_000)) {
    console.log(`[sfx] ${name} already present`);
    continue;
  }
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', filter, '-ar', '44100', out]);
  console.log(`[sfx] ${name}`);
}

console.log('done');
