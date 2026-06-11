// Capture a live site for the commercial pipeline: fullpage shot, hero shot,
// per-section stills, and a manifest.json describing all of it.
//
// Usage:
//   node scripts/site-commercial/capture.mjs --url <url> --slug <slug> \
//     [--viewport 1440x900] [--scale 2] [--mobile] [--max-sections 8] \
//     [--click-text "Dark"]
//
// --click-text dismisses blocking UI (theme pickers, cookie banners) by
// clicking the first visible element with that exact-ish text before capture.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const PIPELINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

// PNG IHDR lives right after the 8-byte signature: 4-byte length, "IHDR",
// then width/height as 32-bit big-endian. No deps needed.
function pngDimensions(buf) {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG (IHDR chunk missing)');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const args = parseArgs(process.argv.slice(2));
const url = args.url;
const slug = args.slug;
if (!url || !slug) {
  console.error('usage: capture.mjs --url <url> --slug <slug> [--viewport WxH] [--scale N] [--mobile] [--max-sections N]');
  process.exit(1);
}

const mobile = Boolean(args.mobile);
const maxSections = Number(args['max-sections'] ?? 8);
const profile = mobile ? 'mobile' : 'desktop';

let viewport;
let deviceScaleFactor;
let contextOptions;

if (mobile) {
  viewport = { width: 390, height: 844 };
  deviceScaleFactor = 3;
  const iphone = devices['iPhone 14 Pro'];
  contextOptions = {
    ...iphone,
    viewport,
    deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  };
} else {
  const m = /^(\d+)x(\d+)$/.exec(args.viewport ?? '1440x900');
  if (!m) {
    console.error(`bad --viewport "${args.viewport}", expected WxH like 1440x900`);
    process.exit(1);
  }
  viewport = { width: Number(m[1]), height: Number(m[2]) };
  deviceScaleFactor = Number(args.scale ?? 2);
  contextOptions = { viewport, deviceScaleFactor };
}

const outDir = path.join(PIPELINE_ROOT, 'public', 'site-commercial', slug, profile);
await mkdir(outDir, { recursive: true });

console.log(`[capture] ${url} → ${outDir} (${profile}, ${viewport.width}x${viewport.height} @${deviceScaleFactor}x)`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  console.log('[capture] navigating...');
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch {
    // networkidle never settles on sites with long-polling / analytics beacons
    console.log('[capture] networkidle timed out, falling back to load + 3s');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  await page.addStyleTag({ content: '*::-webkit-scrollbar{display:none}' });

  if (typeof args['click-text'] === 'string') {
    const text = args['click-text'];
    console.log(`[capture] clicking "${text}" to clear blocking UI...`);
    try {
      await page.getByText(text, { exact: false }).first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch {
      console.log(`[capture] WARNING: nothing clickable matched "${text}", continuing`);
    }
  }

  // Settle pass: walk the whole page so lazy-loaded media and scroll-triggered
  // animations fire BEFORE the fullpage shot — otherwise opacity-0 sections
  // come out blank.
  console.log('[capture] settle pass (scroll-through for lazy load)...');
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    while (window.scrollY < bottom() - 1) {
      window.scrollBy(0, 350);
      await sleep(90);
    }
    await sleep(1200);
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(800);
  });

  console.log('[capture] fullpage.png...');
  const fullBuf = await page.screenshot({ fullPage: true });
  await writeFile(path.join(outDir, 'fullpage.png'), fullBuf);
  const fullDims = pngDimensions(fullBuf);
  console.log(`[capture] fullpage ${fullDims.width}x${fullDims.height}px`);

  console.log('[capture] hero.png...');
  await writeFile(path.join(outDir, 'hero.png'), await page.screenshot());

  // Section candidates: big blocks that span most of the viewport width.
  console.log('[capture] detecting sections...');
  const sections = await page.evaluate((max) => {
    const minWidth = window.innerWidth * 0.6;
    const candidates = [];
    for (const el of document.querySelectorAll('section, main > div, [id]')) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.offsetHeight <= 400 || el.offsetWidth < minWidth) continue;
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      candidates.push({ el, top, height: el.offsetHeight });
    }
    candidates.sort((a, b) => a.top - b.top);
    const picked = [];
    for (const c of candidates) {
      if (picked.some((p) => Math.abs(p.top - c.top) < 100)) continue;
      const heading = c.el.querySelector('h1, h2, h3');
      const label = (heading?.textContent?.trim() || c.el.id || '').slice(0, 60);
      picked.push({ top: c.top, height: c.height, label });
      if (picked.length >= max) break;
    }
    return picked;
  }, maxSections);
  console.log(`[capture] ${sections.length} section(s) detected`);

  const sectionEntries = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    await page.evaluate((top) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.min(top, max), behavior: 'instant' });
    }, s.top);
    await page.waitForTimeout(500);
    const file = `section-${i}.png`;
    await writeFile(path.join(outDir, file), await page.screenshot());
    sectionEntries.push({
      file,
      top: s.top,
      sectionHeight: s.height,
      label: s.label,
      width: viewport.width * deviceScaleFactor,
      height: viewport.height * deviceScaleFactor,
    });
    console.log(`[capture] ${file} (top=${s.top}, "${s.label}")`);
  }

  const manifest = {
    url,
    slug,
    profile,
    capturedAt: new Date().toISOString(),
    viewport: { w: viewport.width, h: viewport.height },
    deviceScaleFactor,
    fullpage: { file: 'fullpage.png', width: fullDims.width, height: fullDims.height },
    hero: {
      file: 'hero.png',
      width: viewport.width * deviceScaleFactor,
      height: viewport.height * deviceScaleFactor,
    },
    sections: sectionEntries,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[capture] manifest.json written — done`);
} catch (err) {
  console.error(`[capture] FAILED: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
