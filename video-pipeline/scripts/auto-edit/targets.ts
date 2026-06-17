// Single source of truth for which social platform gets which rendered file,
// which platform-spec governs it, the caption voice it wants, and how it ships
// (auto-post lane vs manual upload). Both the packager (package-posts.ts, the
// export half) and the auto-poster (post-delivery.ts, PR3) import this so the
// two halves never drift on platform list, file naming, or caption mapping.
import type { PlatformId } from "../../src/types";

export type Orientation = "vertical" | "landscape";
export type CaptionStyle = "punchy" | "youtube" | "professional" | "short" | "casual";

// How a target reaches its platform. The meta-* lanes hit the Graph API video
// endpoints (different calls for IG Reels vs FB feed video); x-video and youtube
// are stubbed until their upload + auth is wired; manual means Thomas uploads it.
export type AutopostLane =
  | "meta-ig-reels"
  | "meta-fb-video"
  | "x-video"
  | "youtube"
  | "manual";

export type Target = {
  key: string;
  label: string;
  orientation: Orientation;
  specId: PlatformId;
  style: CaptionStyle;
  lane: AutopostLane;
};

// The packaged delivery folder writes one `<key>.mp4` per target whose source
// orientation was rendered. Keep keys filesystem-safe (lowercase, hyphenated).
export const TARGETS: Target[] = [
  { key: "tiktok", label: "TikTok", orientation: "vertical", specId: "tiktok-feed", style: "punchy", lane: "manual" },
  { key: "instagram-reels", label: "Instagram Reels", orientation: "vertical", specId: "instagram-reels", style: "punchy", lane: "meta-ig-reels" },
  { key: "youtube-shorts", label: "YouTube Shorts", orientation: "vertical", specId: "youtube-shorts", style: "punchy", lane: "youtube" },
  { key: "youtube", label: "YouTube", orientation: "landscape", specId: "youtube-instream", style: "youtube", lane: "youtube" },
  { key: "linkedin", label: "LinkedIn", orientation: "landscape", specId: "linkedin-feed-landscape", style: "professional", lane: "manual" },
  { key: "x", label: "X / Twitter", orientation: "landscape", specId: "x-feed", style: "short", lane: "x-video" },
  // FB feed accepts 16:9; reuse the LinkedIn landscape constraints.
  { key: "facebook", label: "Facebook", orientation: "landscape", specId: "linkedin-feed-landscape", style: "casual", lane: "meta-fb-video" },
];

// Human-readable note for post.md / the dry-run plan.
export const LANE_LABELS: Record<AutopostLane, string> = {
  "meta-ig-reels": "auto-post (Instagram Reels, Meta Graph API)",
  "meta-fb-video": "auto-post (Facebook video, Meta Graph API)",
  "x-video": "manual upload (X video auto-post not wired)",
  youtube: "manual upload (YouTube auto-post not wired)",
  manual: "manual upload",
};

export type Captions = {
  punchy: { caption: string; hashtags: string[] };
  youtube: { title: string; description: string; hashtags: string[] };
  professional: { caption: string; hashtags: string[] };
  short: { caption: string };
  casual: { caption: string; hashtags: string[] };
};

// Map a target's caption voice to a flat {body, hashtags} the poster can drop
// straight into a Graph caption / post.md section.
export function captionFor(style: CaptionStyle, c: Captions): { body: string; hashtags: string[] } {
  switch (style) {
    case "punchy":
      return { body: c.punchy.caption, hashtags: c.punchy.hashtags };
    case "youtube":
      return { body: `${c.youtube.title}\n\n${c.youtube.description}`, hashtags: c.youtube.hashtags };
    case "professional":
      return { body: c.professional.caption, hashtags: c.professional.hashtags };
    case "short":
      return { body: c.short.caption, hashtags: [] };
    case "casual":
      return { body: c.casual.caption, hashtags: c.casual.hashtags };
  }
}

// One caption string ready for a platform: body + hashtags as #tags on their
// own line. Used by both halves so manual and auto-posted captions match.
export function renderCaption(style: CaptionStyle, c: Captions): string {
  const { body, hashtags } = captionFor(style, c);
  const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return tags ? `${body}\n\n${tags}` : body;
}

// Deterministic fallback so packaging + posting work (and are testable) without
// the claude CLI being available.
export function stubCaptions(topic: string): Captions {
  const t = topic || "my latest build";
  return {
    punchy: { caption: `${t} 👇`, hashtags: ["buildinpublic", "coding", "devtools", "indiehacker", "tech"] },
    youtube: { title: t, description: `A quick look at ${t}.`, hashtags: ["coding", "devtools", "tech"] },
    professional: { caption: `Sharing ${t}. Here's what I learned building it.`, hashtags: ["softwareengineering", "buildinpublic", "devtools"] },
    short: { caption: `${t} 👇` },
    casual: { caption: `Just shipped ${t}.`, hashtags: ["coding", "devtools", "tech"] },
  };
}
