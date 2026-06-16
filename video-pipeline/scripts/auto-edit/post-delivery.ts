// Auto-post a packaged delivery folder (the output of package-posts.ts) to its
// platforms. Each target carries an auto-post lane (see targets.ts):
//   - meta-ig-reels / meta-fb-video  -> host the mp4 + fire the Graph API
//   - x-video / youtube              -> not wired yet, report as blocked
//   - manual                         -> Thomas uploads it himself
//
// Safety: nothing posts unless SOCIAL_AUTOPOST_ENABLED=1 (or --enable). Without
// it the run is a dry run that prints the plan, so a scheduled invocation can
// never publish to Thomas's real accounts by accident. Lanes missing creds fall
// back to export + a BLOCKED.md listing exactly what to set (blocked-on-thomas).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, renderCaption, type AutopostLane, type Captions, type Target } from "./targets";
import { hostFilePublicly, publicFileName, publicUrlFor } from "../../src/services/media-host";
import { postReelToInstagram, postVideoToFacebookPage, type PostResult } from "../../src/services/social-post";

export interface LaneEnv {
  metaToken?: string;
  igAccountId?: string;
  fbPageId?: string;
}

export type LanePlan =
  | { ready: true; adapter: "ig-reels" | "fb-video" }
  | { ready: false; reason: string; missing: string[] };

// Pure: decide whether a lane can post given the env present, and if not, say
// exactly what's missing. Unit-tested without touching the network.
export function planForLane(lane: AutopostLane, env: LaneEnv): LanePlan {
  switch (lane) {
    case "meta-ig-reels": {
      const missing: string[] = [];
      if (!env.metaToken) missing.push("META_ACCESS_TOKEN");
      if (!env.igAccountId) missing.push("SOCIAL_IG_ACCOUNT_ID");
      if (!env.fbPageId) missing.push("SOCIAL_FB_PAGE_ID");
      return missing.length
        ? { ready: false, reason: `missing ${missing.join(", ")}`, missing }
        : { ready: true, adapter: "ig-reels" };
    }
    case "meta-fb-video": {
      const missing: string[] = [];
      if (!env.metaToken) missing.push("META_ACCESS_TOKEN");
      if (!env.fbPageId) missing.push("SOCIAL_FB_PAGE_ID");
      return missing.length
        ? { ready: false, reason: `missing ${missing.join(", ")}`, missing }
        : { ready: true, adapter: "fb-video" };
    }
    case "x-video":
      return { ready: false, reason: "X video auto-post not wired (needs chunked media upload + elevated API tier)", missing: [] };
    case "youtube":
      return { ready: false, reason: "YouTube auto-post not wired (needs OAuth2 refresh token + Data API v3 upload)", missing: [] };
    case "manual":
      return { ready: false, reason: "manual upload by design", missing: [] };
  }
}

export type Outcome =
  | { target: Target; status: "posted"; url?: string; id?: string }
  | { target: Target; status: "would-post"; adapter: string; url: string }
  | { target: Target; status: "skipped"; reason: string; blocked: boolean }
  | { target: Target; status: "error"; error: string };

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv;
  const dir = flag(argv, "--dir");
  if (!dir) {
    console.error("usage: post-delivery.ts --dir <slug-delivery folder> [--platforms tiktok,facebook] [--enable] [--dry-run]");
    process.exit(2);
  }
  const deliveryDir = path.resolve(dir);
  const only = (flag(argv, "--platforms") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const forceEnable = argv.includes("--enable");
  const forceDry = argv.includes("--dry-run");

  // Master gate. Default-off so scheduled runs never publish without intent.
  const enabled = (process.env.SOCIAL_AUTOPOST_ENABLED === "1" || forceEnable) && !forceDry;
  const dryRun = !enabled;
  if (dryRun) {
    console.log(forceDry ? "[post] --dry-run: showing plan, posting nothing." : "[post] autopost disabled (set SOCIAL_AUTOPOST_ENABLED=1 or pass --enable). Dry run.");
  }

  const captionsPath = path.join(deliveryDir, "captions.json");
  if (!(await fileExists(captionsPath))) {
    console.error(`[post] no captions.json in ${deliveryDir} — run package-posts.ts first`);
    process.exit(2);
  }
  const captions = JSON.parse(await fs.readFile(captionsPath, "utf8")) as Captions;
  const slug = (flag(argv, "--slug") ?? path.basename(deliveryDir).replace(/-delivery$/, "")) || "post";

  const env: LaneEnv = {
    metaToken: process.env.META_ACCESS_TOKEN,
    igAccountId: process.env.SOCIAL_IG_ACCOUNT_ID,
    fbPageId: process.env.SOCIAL_FB_PAGE_ID,
  };

  const outcomes: Outcome[] = [];
  for (const target of TARGETS) {
    if (only.length && !only.includes(target.key)) continue;
    const file = path.join(deliveryDir, `${target.key}.mp4`);
    if (!(await fileExists(file))) {
      // Not an error: this orientation simply wasn't packaged.
      continue;
    }
    const caption = renderCaption(target.style, captions);
    const plan = planForLane(target.lane, env);

    if (!plan.ready) {
      const blocked = plan.missing.length > 0; // missing creds = fixable by Thomas
      outcomes.push({ target, status: "skipped", reason: plan.reason, blocked });
      console.log(`[post] skip ${target.label}: ${plan.reason}`);
      continue;
    }

    if (dryRun) {
      const url = publicUrlFor(publicFileName(slug, file));
      outcomes.push({ target, status: "would-post", adapter: plan.adapter, url });
      console.log(`[post] would post ${target.label} via ${plan.adapter} -> ${url}`);
      console.log(`        caption: ${caption.split("\n")[0]?.slice(0, 80)}`);
      continue;
    }

    try {
      const hosted = await hostFilePublicly(file, slug);
      console.log(`[post] hosting ${target.label} at ${hosted.url}`);
      let result: PostResult;
      if (plan.adapter === "ig-reels") {
        result = await postReelToInstagram({
          igAccountId: env.igAccountId!,
          pageId: env.fbPageId!,
          userToken: env.metaToken!,
          videoUrl: hosted.url,
          caption,
        });
      } else {
        result = await postVideoToFacebookPage({
          pageId: env.fbPageId!,
          userToken: env.metaToken!,
          videoUrl: hosted.url,
          description: caption,
        });
      }
      if (result.ok) {
        outcomes.push({ target, status: "posted", url: result.url, id: result.id });
        console.log(`[post] ✓ ${target.label} -> ${result.url ?? result.id}`);
      } else {
        outcomes.push({ target, status: "error", error: result.error ?? result.reason ?? "unknown" });
        console.warn(`[post] ✗ ${target.label}: ${result.error ?? result.reason}`);
      }
    } catch (e) {
      outcomes.push({ target, status: "error", error: (e as Error).message });
      console.warn(`[post] ✗ ${target.label} threw: ${(e as Error).message}`);
    }
  }

  await writeReports(deliveryDir, outcomes, dryRun);
  const counts = tally(outcomes);
  console.log(`\n[post] done: ${counts.posted} posted, ${counts.wouldPost} would-post, ${counts.skipped} skipped, ${counts.error} error`);
}

function tally(outcomes: Outcome[]) {
  return {
    posted: outcomes.filter((o) => o.status === "posted").length,
    wouldPost: outcomes.filter((o) => o.status === "would-post").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    error: outcomes.filter((o) => o.status === "error").length,
  };
}

// Write post-results.json + a BLOCKED.md (only if creds are missing) so the
// calling agent / cron can forward the blocked list to blocked-on-thomas.md.
async function writeReports(deliveryDir: string, outcomes: Outcome[], dryRun: boolean): Promise<void> {
  await fs.writeFile(
    path.join(deliveryDir, "post-results.json"),
    JSON.stringify({ dryRun, at: new Date().toISOString(), outcomes }, null, 2),
  );

  const blocked = outcomes.filter(
    (o): o is Extract<Outcome, { status: "skipped" }> => o.status === "skipped" && o.blocked,
  );
  if (blocked.length) {
    const missing = new Set<string>();
    for (const b of blocked) {
      for (const m of b.reason.replace(/^missing /, "").split(", ")) missing.add(m);
    }
    let md = `# Auto-post blocked\n\nThese lanes are ready in code but need credentials before they can post:\n\n`;
    for (const b of blocked) md += `- **${b.target.label}** (${b.target.lane}): ${b.reason}\n`;
    md += `\nSet in video-pipeline/.env.local:\n\n`;
    for (const m of [...missing]) md += `- \`${m}\`\n`;
    md += `\nThen re-run with \`SOCIAL_AUTOPOST_ENABLED=1\`.\n`;
    await fs.writeFile(path.join(deliveryDir, "BLOCKED.md"), md);
  } else {
    await fs.rm(path.join(deliveryDir, "BLOCKED.md"), { force: true });
  }
}

// Only auto-run when invoked as a script, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
