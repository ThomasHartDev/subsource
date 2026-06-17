// Rasterize a brand SVG to a color-on-transparent PNG for particle sampling.
// Marks use currentColor strokes, so we tint by setting `color` on a wrapper.
//
// Usage:
//   node scripts/site-commercial/rasterize-logo.mjs --svg <path> --out <path.png> \
//     [--color '#EDEEF0'] [--size 1024]

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[a.slice(2)] = true;
    } else {
      args[a.slice(2)] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const svgPath = args.svg;
const outPath = args.out;
if (!svgPath || !outPath) {
  console.error("usage: rasterize-logo.mjs --svg <path> --out <path.png> [--color '#EDEEF0'] [--size 1024]");
  process.exit(1);
}
const color = args.color ?? '#EDEEF0';
const size = Number(args.size ?? 1024);

let svg = await readFile(svgPath, 'utf8');
if (!svg.includes('currentColor')) {
  console.warn(`[rasterize] WARNING: ${svgPath} has no currentColor — --color won't apply and any baked-in background rect stays opaque`);
}
// Force the SVG to fill the wrapper regardless of its own width/height attrs.
svg = svg.replace(/<svg\b/, '<svg width="100%" height="100%"');

const html = `<!doctype html>
<html>
<body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;color:${color}">${svg}</div>
</body>
</html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.screenshot({ omitBackground: true });

  await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await writeFile(outPath, buf);

  const { size: bytes } = await stat(outPath);
  if (bytes <= 1024) {
    console.error(`[rasterize] FAILED: ${outPath} is only ${bytes} bytes — looks empty`);
    process.exitCode = 1;
  } else {
    // PNG IHDR: width/height big-endian at offsets 16/20
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    console.log(`[rasterize] ${outPath} — ${width}x${height}px, ${bytes} bytes, color ${color}`);
  }
} catch (err) {
  console.error(`[rasterize] FAILED: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
