// Meta Graph API video posting for the auto-edit delivery pipeline (PR3).
// CC's lib/social/post-clients only handles images/links/text; video needs the
// async container flow (IG Reels) and the /videos endpoint (FB), neither of
// which lived anywhere before. Import-light on purpose (node crypto + global
// fetch + env only) so it resolves the same under tsx and node --test.
//
// Auth model mirrors CC: a single META_ACCESS_TOKEN user token, page-scoped
// tokens resolved per page id via /me/accounts. IG business accounts post
// through their parent page's token.

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface PostResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  // skipped = we deliberately didn't attempt the call (missing creds / not
  // wired). Distinct from a hard error so a scheduled run treats it as
  // "blocked, fix config" rather than "the post failed".
  skipped?: boolean;
  reason?: string;
}

type GraphError = { error?: { message: string; code?: number } };

export async function metaGet<T>(path: string, token: string): Promise<T> {
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await resp.json()) as T;
}

export async function metaPost<T>(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await resp.json()) as T;
}

// Resolve the page-scoped access token for a page id from the user token.
// Returns null when the token can't see that page (wrong page id / token).
export async function getPageAccessToken(pageId: string, userToken: string): Promise<string | null> {
  const accounts = await metaGet<{ data?: { id: string; access_token: string }[] } & GraphError>(
    "/me/accounts",
    userToken,
  );
  return accounts.data?.find((p) => p.id === pageId)?.access_token ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ReelInput {
  igAccountId: string;
  pageId: string;
  userToken: string;
  videoUrl: string;
  caption: string;
  // How long to wait for Meta to finish ingesting the video before publishing.
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

// IG Reels publish is a three-step async flow:
//   1. POST /{ig}/media  media_type=REELS, video_url -> creation container id
//   2. poll GET /{container}?fields=status_code until FINISHED (Meta downloads
//      and transcodes the hosted file; this is the part that needs polling)
//   3. POST /{ig}/media_publish creation_id -> published media id
export async function postReelToInstagram(input: ReelInput): Promise<PostResult> {
  const maxWaitMs = input.maxWaitMs ?? 5 * 60_000;
  const pollIntervalMs = input.pollIntervalMs ?? 5_000;

  const pageToken = await getPageAccessToken(input.pageId, input.userToken);
  if (!pageToken) return { ok: false, error: `page ${input.pageId} not visible to META_ACCESS_TOKEN` };

  type Container = { id?: string } & GraphError;
  const container = await metaPost<Container>(
    `/${input.igAccountId}/media`,
    { media_type: "REELS", video_url: input.videoUrl, caption: input.caption, share_to_feed: true },
    pageToken,
  );
  if (container.error) return { ok: false, error: container.error.message };
  if (!container.id) return { ok: false, error: "no creation id returned from IG media container" };

  const deadline = Date.now() + maxWaitMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const status = await metaGet<{ status_code?: string; status?: string } & GraphError>(
      `/${container.id}?fields=status_code,status`,
      pageToken,
    );
    if (status.error) return { ok: false, error: status.error.message };
    lastStatus = status.status_code ?? "";
    if (lastStatus === "FINISHED") break;
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
      return { ok: false, error: `IG container ${lastStatus}: ${status.status ?? ""}`.trim() };
    }
    await sleep(pollIntervalMs);
  }
  if (lastStatus !== "FINISHED") {
    return { ok: false, error: `IG container not ready within ${Math.round(maxWaitMs / 1000)}s (last status ${lastStatus || "unknown"})` };
  }

  const published = await metaPost<{ id?: string } & GraphError>(
    `/${input.igAccountId}/media_publish`,
    { creation_id: container.id },
    pageToken,
  );
  if (published.error) return { ok: false, error: published.error.message };
  if (!published.id) return { ok: false, error: "media_publish returned no id" };

  // Best-effort permalink for a clean URL; fall back to the media id.
  const perma = await metaGet<{ permalink?: string }>(`/${published.id}?fields=permalink`, pageToken);
  return { ok: true, id: published.id, url: perma.permalink ?? `https://www.instagram.com/` };
}

export interface FbVideoInput {
  pageId: string;
  userToken: string;
  videoUrl: string;
  description: string;
}

// FB page video: POST /{page}/videos file_url. Meta fetches + transcodes the
// hosted URL server-side and returns the video id immediately; the post lands
// once processing finishes (no client-side poll needed for the id).
export async function postVideoToFacebookPage(input: FbVideoInput): Promise<PostResult> {
  const pageToken = await getPageAccessToken(input.pageId, input.userToken);
  if (!pageToken) return { ok: false, error: `page ${input.pageId} not visible to META_ACCESS_TOKEN` };

  const result = await metaPost<{ id?: string } & GraphError>(
    `/${input.pageId}/videos`,
    { file_url: input.videoUrl, description: input.description },
    pageToken,
  );
  if (result.error) return { ok: false, error: result.error.message };
  if (!result.id) return { ok: false, error: "FB /videos returned no id" };
  return { ok: true, id: result.id, url: `https://www.facebook.com/${result.id}` };
}
