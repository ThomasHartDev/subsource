// Synthesized fallback music bed: layered drone + Am pad + slow pulse + air.
// Used when no generated track is available (Suno/GoAPI out of credits).
// Calm by design — the spec's volume automation and SFX provide the hits.
//
// Usage: node scripts/site-commercial/gen-bed.mjs [out.mp3]

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? path.join(ROOT, 'public', 'site-commercial', 'music', 'music.mp3');
await mkdir(path.dirname(out), { recursive: true });

const D = 32;
const filter = [
  // detuned sub drone, beats at ~0.6Hz
  '[0][1]amix=2:normalize=0,volume=0.40,lowpass=f=130[drone]',
  // Am pad voices with slow independent tremolo, in at 7s
  '[2]volume=0.16,tremolo=f=0.15:d=0.55[pa]',
  '[3]volume=0.12,tremolo=f=0.13:d=0.55[pc]',
  '[4]volume=0.12,tremolo=f=0.17:d=0.55[pe]',
  '[pa][pc][pe]amix=3:normalize=0,adelay=7000|7000,afade=t=in:st=7:d=4.5[pad]',
  // eighth-note-ish pulse for momentum, in at 9s
  '[5]volume=0.14,tremolo=f=2.2:d=0.9,lowpass=f=300,adelay=9000|9000,afade=t=in:st=9:d=2.5[pulse]',
  // airy top, in at 15s
  '[6]highpass=f=7500,volume=0.045,adelay=15000|15000,afade=t=in:st=15:d=5[air]',
  `[drone][pad][pulse][air]amix=4:normalize=0,afade=t=in:d=1.2,afade=t=out:st=${D - 4}:d=4,alimiter=limit=0.7[mix]`,
].join(';');

await run('ffmpeg', [
  '-y', '-v', 'error',
  '-f', 'lavfi', '-i', `sine=frequency=55:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=55.6:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=110:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=130.81:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=164.81:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=82.41:duration=${D}`,
  '-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${D}:seed=5`,
  '-filter_complex', filter,
  '-map', '[mix]', '-ar', '44100', '-b:a', '192k', out,
]);
console.log(`bed written: ${out}`);
