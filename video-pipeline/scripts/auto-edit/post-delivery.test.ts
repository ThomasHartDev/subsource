// Pure-logic tests for the auto-post pipeline. No network, no deps beyond node's
// built-in runner: `node --import tsx --test scripts/auto-edit/post-delivery.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planForLane } from "./post-delivery";
import { captionFor, renderCaption, stubCaptions } from "./targets";
import { publicFileName, publicUrlFor, DEFAULT_PUBLIC_BASE } from "../../src/services/media-host";

test("planForLane: meta lanes ready only with full creds", () => {
  const full = { metaToken: "t", igAccountId: "ig", fbPageId: "pg" };
  assert.deepEqual(planForLane("meta-ig-reels", full), { ready: true, adapter: "ig-reels" });
  assert.deepEqual(planForLane("meta-fb-video", full), { ready: true, adapter: "fb-video" });

  const fbOnly = { metaToken: "t", fbPageId: "pg" };
  assert.equal(planForLane("meta-fb-video", fbOnly).ready, true);
  const igPartial = planForLane("meta-ig-reels", fbOnly);
  assert.equal(igPartial.ready, false);
  assert.ok(!igPartial.ready && igPartial.missing.includes("SOCIAL_IG_ACCOUNT_ID"));
});

test("planForLane: empty env lists every missing var for meta-ig-reels", () => {
  const plan = planForLane("meta-ig-reels", {});
  assert.equal(plan.ready, false);
  assert.ok(!plan.ready);
  assert.deepEqual(plan.missing, ["META_ACCESS_TOKEN", "SOCIAL_IG_ACCOUNT_ID", "SOCIAL_FB_PAGE_ID"]);
});

test("planForLane: x/youtube/manual are not-ready with no missing creds", () => {
  for (const lane of ["x-video", "youtube", "manual"] as const) {
    const plan = planForLane(lane, { metaToken: "t", igAccountId: "ig", fbPageId: "pg" });
    assert.equal(plan.ready, false);
    assert.ok(!plan.ready && plan.missing.length === 0);
    assert.ok(plan.reason.length > 0);
  }
});

test("captionFor maps each style to the right body", () => {
  const c = stubCaptions("my tool");
  assert.equal(captionFor("punchy", c).body, "my tool 👇");
  assert.ok(captionFor("youtube", c).body.startsWith("my tool"));
  assert.deepEqual(captionFor("short", c).hashtags, []); // tweets carry no tag line
  assert.ok(captionFor("professional", c).hashtags.length > 0);
});

test("renderCaption appends hashtags as #tags on their own line", () => {
  const c = stubCaptions("widget");
  const rendered = renderCaption("punchy", c);
  assert.match(rendered, /#buildinpublic/);
  assert.ok(rendered.includes("\n\n#"));
  // short style has no hashtags, so no trailing tag block
  assert.equal(renderCaption("short", c).includes("#"), false);
});

test("publicFileName is filesystem/route safe", () => {
  const name = publicFileName("Cool Slug!", "/abs/path/Some File (final).mp4");
  assert.match(name, /^[a-z0-9._-]+$/);
  assert.ok(name.startsWith("cool-slug-"));
  assert.ok(name.endsWith(".mp4"));
  assert.ok(!name.includes("/") && !name.includes(".."));
});

test("publicUrlFor honors base + strips trailing slash", () => {
  assert.equal(publicUrlFor("a.mp4"), `${DEFAULT_PUBLIC_BASE}/a.mp4`);
  assert.equal(publicUrlFor("a.mp4", { publicBase: "https://x.test/m/" }), "https://x.test/m/a.mp4");
});
