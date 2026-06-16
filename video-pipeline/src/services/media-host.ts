// Host a local file at a public URL so Meta's Graph API can fetch it. Both this
// pipeline and command-center run on the same host (hetzner-cc), and CC serves
// /tmp/lipsync-test publicly (no auth) via /api/temp-media/<filename>. So
// "hosting" is just copying the file into that dir and handing Meta the URL.
//
// Defaults can be overridden with MEDIA_SERVE_DIR / PUBLIC_MEDIA_BASE for a
// different host or local testing.
import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SERVE_DIR = "/tmp/lipsync-test";
export const DEFAULT_PUBLIC_BASE = "https://my-command-center.com/api/temp-media";

export interface HostConfig {
  serveDir?: string;
  publicBase?: string;
}

// Filesystem-safe, collision-resistant name. The temp-media route rejects any
// filename containing "/" or "..", so strip to [a-z0-9._-] and prefix a slug.
export function publicFileName(slug: string, srcPath: string): string {
  const ext = path.extname(srcPath).toLowerCase() || ".mp4";
  const base = path
    .basename(srcPath, path.extname(srcPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "post";
  return `${safeSlug}-${base}${ext}`;
}

// Build the public URL for a hosted filename. Pure (no IO) so it's unit-tested
// and reused by the dry-run plan without copying anything.
export function publicUrlFor(fileName: string, cfg: HostConfig = {}): string {
  const base = (cfg.publicBase ?? process.env.PUBLIC_MEDIA_BASE ?? DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  return `${base}/${fileName}`;
}

export interface HostedFile {
  fileName: string;
  localPath: string;
  url: string;
}

// Copy the file into the serve dir and return where it lives + its public URL.
export async function hostFilePublicly(
  srcPath: string,
  slug: string,
  cfg: HostConfig = {},
): Promise<HostedFile> {
  const serveDir = cfg.serveDir ?? process.env.MEDIA_SERVE_DIR ?? DEFAULT_SERVE_DIR;
  await fs.mkdir(serveDir, { recursive: true });
  const fileName = publicFileName(slug, srcPath);
  const localPath = path.join(serveDir, fileName);
  await fs.copyFile(srcPath, localPath);
  return { fileName, localPath, url: publicUrlFor(fileName, cfg) };
}
