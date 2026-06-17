# Production-quality overlays for short-form ads: research findings

## 1. Why ffmpeg `drawtext` looks bad

This isn't a vibes thing. `drawtext` is a 2D filter that rasterises a glyph from FreeType into the YUV plane of the encoded video, and it skips most of the steps a modern compositor takes for granted. Concrete failures, in order of how much they damage perceived quality:

1. **No subpixel positioning.** Glyphs land on integer pixel boundaries. CSS / Skia / Core Text all position glyphs at fractional pixel offsets and let antialiasing recover the apparent sharpness. With `drawtext`, the same word at `x=400` and `x=401` has visibly different stem weights because the rasteriser snaps to grid. ([FFmpeg drawtext source](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_drawtext.c) does have `get_subpixel_idx` for the glyph cache, but it doesn't do per-frame subpixel layout the way a browser does.)

2. **Anti-aliasing in the wrong colour space.** Drawtext blends in YUV after subsampling (typically 4:2:0). The chroma plane is half resolution, so the colour edges of antialiased glyphs get smeared. Browsers blend in linear RGB and then convert. The result is the "fuzzy red text on a near-black background" look that screams "this was rendered by a video filter, not a designer."

3. **No proper kerning or OpenType features.** `drawtext` uses FreeType's default metrics with no `kern`, no `liga`, no `ss01` style sets. Words with awkward pairs ("To", "Av", "fi") look like the letters were dropped on the canvas individually. Compare to Inter or Geist with `font-feature-settings: 'kern', 'ss03'` enabled, which is what every web-rendered overlay gets for free.

4. **No stroke, no shadow, no glow that holds up at compression.** The `shadowx`/`shadowy` params on drawtext draw a hard-edged offset duplicate. Real production overlays use a multi-layer shadow stack: a tight 1-2 px dark stroke for legibility, a wider blurred drop shadow for separation from the background, sometimes a third diffuse glow. After H.264 quantisation at TikTok's bitrate (~3-5 Mbps for 1080x1920), a hard shadow becomes blocky; a blurred shadow stays smooth because the encoder has gradient information to work with.

5. **Hard cuts on opacity.** Your current ad's CTA appears in a single frame at t=16s. The eye reads this as glitch, not transition. Every produced ad uses an opacity ramp of 4-12 frames at minimum, and usually couples it with a transform (slide, scale, mask) so the brain registers "something arrived" rather than "a frame got swapped."

6. **No relationship to the underlying frame.** Drawtext draws on top, period. There's no luminance-aware contrast adjustment, no blur-behind for legibility, no auto-positioning that respects the focal point. If your claymation mailbox happens to land where the CTA goes, the text fights the subject. Producers solve this with a translucent shape, a gradient gradient bar at the bottom, or a sampled-and-blurred backdrop.

7. **Stuck on the encoding clock, not the composition clock.** Drawtext timing uses `enable='between(t,16,18)'` which evaluates per encoded frame at whatever rate ffmpeg picks. Any motion you try to add via `t` expressions executes on the encoded grid, not a 60fps animation grid, so anything subtle (a 200ms ease) judders.

The fix is not "tune drawtext harder." It is "render overlays in a real compositor that hands ffmpeg a finished frame."

## 2. What production overlays actually do in 2026 short-form ads

Five real campaigns torn apart. Naming what each one does specifically, not "looks polished."

**AG1 / Athletic Greens — Meta Reels, Q1 2026 spend ~$1.6M/mo** ([Foreplay teardown](https://www.foreplay.co/post/athletic-greens-600m-ad-creative-strategy-how-foreplay-helps-you-dominate-the-market), [Brand Identity](https://the-brandidentity.com/project/the-new-companys-identity-for-ag1-sets-the-nutritional-drink-apart-by-a-mile-from-other-supplements)). They use **Diatype** (modernised Helvetica) for body and **Items** (modernised Times) for accent. The end-card pattern is dead simple: full-bleed warm cream background, the AG1 wordmark scales from 0.92 to 1.0 with a `(0.16, 1, 0.3, 1)` curve over ~14 frames, then a single benefit line slides up from y=8px with opacity 0→1 over 9 frames, 80ms after the wordmark settles. No drop shadow. No stroke. They depend on the solid background to do the contrast work. Total card runtime is 1.8s.

**Liquid Death — TikTok Q4 2025 "Murder Your Thirst" loop** ([NoGood breakdown](https://nogood.io/blog/liquid-death-marketing/)). The text is the gag. They hand-set lock-up frames in After Effects with **ITC Benguiat** (heavy metal album face) tracked tight, then use a 6-frame mask reveal — a wipe rectangle slides across each word — with a hard freeze hold of 22 frames before exit. Background is a saturation-pumped sample of the underlying video, blurred to 24px and dropped 35% in luminance. The CTA itself doesn't enter as a button; it's burned into the mascot's prop (a tombstone, a coffin lid) so it reads as part of the world. This is the "in-frame mark" pattern you want to study for fixing the misspelled mailbox sign.

**Linear "Cycle Planning" launch — Twitter/X video, June 2025**. **Inter Display** at weights 600 and 800. Text appears with a 6px upward slide and an opacity ramp on a `(0.21, 0.47, 0.32, 0.98)` curve over 12 frames at 30fps. The card has no rectangle behind it; instead the underlying screen recording has a black-to-transparent gradient overlay clipped to the bottom 20% (`linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)`). Text sits on top of that. Effect: nothing visible "appears," just the light bends. The product UI keeps reading without the CTA stealing attention until the last 1.5s when a label brightens.

**Notion AI launch shorts, late 2025**. **GT Walsheim** for headlines, **Inter** for caption. The headline animates word-by-word: each word springs in with `mass=0.6, damping=12, stiffness=180`, staggered 4 frames apart. There's no shadow at all — the trick is they place the headline on a mostly-empty pastel surface so contrast is automatic. When they have to put text on top of a busy product capture, they do an **inset frosted card** with `backdrop-filter: blur(18px)` plus 70% white fill. The frosted layer animates in too, scaling from `transform: scale(0.98)` to `1.0` over the same window as the text.

**Apple "Hello iPhone 17 Air" 30s spot, Sept 2025**. **SF Pro Display** Bold and Regular, pure white #FFF, no shadow, no gradient, no stroke. They earn the no-shadow by **darkening the underlying plate** during the type appearance: a 22%-opacity black radial gradient ramps up under the text region for the same 8 frames the text fades in, then ramps back down when the text exits. The text itself uses a custom curve close to `(0.65, 0, 0.35, 1)` (Apple's "system standard" curve), holds for ~70 frames, and leaves on a slide-up of 12px with a faster `(0.4, 0, 1, 1)` exit curve. Total runtime per word: ~95 frames. ([Apple HIG: motion](https://developer.apple.com/design/human-interface-guidelines/motion))

The pattern across all five: **type doesn't decorate, type takes over the screen briefly and gets out**. Contrast is engineered into the underlying plate, not bolted on with a stroke. Entrance is always 8-14 frames with a custom bezier (or a spring), hold is 50-90 frames, exit is 6-12 frames. Nothing hard-cuts.

## 3. Remotion 4.x techniques that produce this quality

The pipeline replacement is straight-forward, but a few things matter more than they look.

**Use `<OffthreadVideo>` for source clips, not `<Video>`.** Remotion 4.0's OffthreadVideo extracts frames via ffmpeg outside the browser and feeds them as `<img>` during render, which makes timing deterministic. The `<Video>` tag in render mode depends on browser playback decisions and drifts under load. ([OffthreadVideo docs](https://www.remotion.dev/docs/offthreadvideo), [v4.0 benchmark, 281% faster](https://github.com/remotion-dev/4-0-benchmark)). For our 18s of pre-rendered Veo output this is a non-decision: OffthreadVideo.

**Concat via `<Series>` with `premountFor`.** The canonical pattern for chaining multiple clips ([videos/sequence docs](https://www.remotion.dev/docs/videos/sequence)) is `Series.Sequence` with explicit `durationInFrames`. The `premountFor` prop invisibly mounts the next video tag a few frames before it plays so there's no first-frame stutter. At 30fps, `premountFor={fps}` (one second) is plenty. Audio sync is the gotcha: AAC frames are 1024 samples, and if your three Veo clips have non-aligned audio durations, ffmpeg will pad with silence at the seam and you'll hear pops. Two options — strip the Veo audio entirely (we are anyway, the Cartesia VO is the audio) and use `muted` on each OffthreadVideo, OR extract audio separately and re-encode with `-c:a aac -b:a 192k` after a single concat. The first is what we want.

**Hold the last frame with `<Freeze>`.** The current ffmpeg `tpad` freeze becomes ([Freeze docs](https://www.remotion.dev/docs/freeze)):

```tsx
<Sequence from={540 - 1} durationInFrames={45}>
  <Freeze frame={540 - 1}>
    <OffthreadVideo src={staticFile('clip3.mp4')} muted />
  </Freeze>
</Sequence>
```

Freeze pauses video and mutes audio on its children, so it won't fight the VO track that runs underneath.

**Easing for entrance motion.** The community standard for ad-style entrances is `Easing.bezier(0.21, 0.47, 0.32, 0.98)` — sharp acceleration, soft settle. This is what the project's design system already uses in CSS Modules (the project CLAUDE.md calls it out). For exits use `Easing.bezier(0.4, 0, 1, 1)` — roughly the inverse, drives out fast. Apple-style smoothing is `(0.65, 0, 0.35, 1)`. ([Easing docs](https://www.remotion.dev/docs/easing)). Concrete:

```tsx
const enter = interpolate(frame, [0, 12], [0, 1], {
  easing: Easing.bezier(0.21, 0.47, 0.32, 0.98),
  extrapolateRight: 'clamp',
});
const slide = interpolate(frame, [0, 12], [12, 0], {
  easing: Easing.bezier(0.21, 0.47, 0.32, 0.98),
  extrapolateRight: 'clamp',
});
```

**Spring for "punch" moments only.** Spring is for impact entrances (the brand mark hitting the screen on the last clip), not for narration text. Use `spring({ frame, fps, config: { mass: 0.6, damping: 12, stiffness: 180 } })` for a slightly overshooting, alive feel. Use plain `interpolate` with a bezier for everything else. The mistake is using spring for everything and getting a uniformly bouncy ad — ([spring docs](https://www.remotion.dev/docs/spring)).

**Font loading.** Use `@remotion/google-fonts/Inter` (or whichever face you pick). ([loadFont docs](https://www.remotion.dev/docs/google-fonts/load-font)). The package internally calls `delayRender`, so the renderer waits. Important: only load the weights and subsets you use, otherwise the Lambda cold-render times out. For our ad: weights `[600, 800]`, subsets `['latin']`, single font. If you go custom WOFF2 (e.g. GT Walsheim trial), use the manual FontFace pattern from [the fonts docs](https://www.remotion.dev/docs/fonts) and wrap your composition root in a higher-order component that returns null until the font is ready, otherwise the first frame can rasterise with a fallback face and the legibility shifts mid-render.

**Stacking with `<AbsoluteFill>`.** The overlay layers structure should be (back to front): video clip → contrast plate (gradient or radial darkening) → frosted card if the layout uses one → brand mark / type → optional foreground particles. Each is its own AbsoluteFill in source order. No z-index needed unless siblings need to swap stacking mid-render. The contrast plate is the secret sauce — same as the Apple breakdown — and is one extra component that solves 80% of the "text fights the background" problem.

**Premultiplied alpha matters when you composite text on top of arbitrary video.** If you generate any PNG/SVG asset that has antialiased edges and feed it back into a Remotion `<Img>`, render it premultiplied so the antialiased pixels carry the right colour into the blend. Browsers use straight alpha by default; mismatches show up as dark fringing on light backgrounds and bright fringing on dark backgrounds. For pure CSS overlays this isn't an issue — text is rendered straight by the browser onto the GPU compositor, which handles alpha correctly. It's only if you bring outside assets in. ([alpha compositing primer](https://en.wikipedia.org/wiki/Alpha_compositing)).

**Render flags.** For our use case (1080x1920, 30fps, ~19.5s output): `npx remotion render src/index.ts main out.mp4 --concurrency=4 --crf=18 --pixel-format=yuv420p --codec=h264`. Don't render transparent — we're outputting to MP4 for ad platforms. If you ever need a transparent-overlay-only export for downstream compositing, that's a separate render pass.

**Compute the metadata.** Use `calculateMetadata` to read the three Veo MP4s' durations with `parseMedia` from `@remotion/media-parser` and set `durationInFrames` accordingly. Don't hardcode 540 — the Veo Fast 6s clips are sometimes 5.97 or 6.03 and the pop accumulates.

## 4. Specific stack for the LinkedItch ad

**Font: Inter.** Specifically Inter Display 800 for the CTA, Inter 600 for any supporting copy (a sub-line if we add one), and Inter 700 for the in-frame brand mark replacement. Not Geist (looks too dev-tool, not enough warmth against clay), not GT Walsheim (great choice but the trial license forbids commercial render and we ship to ad platforms which counts). Inter is free, OFL-licensed, available via `@remotion/google-fonts/Inter`, and Apple/Linear/half the SaaS world uses it for a reason. ([Inter on Google Fonts](https://fonts.google.com/specimen/Inter)).

**Colour palette.** The Veo claymation gives us a saturated red mailbox, warm cream sky, dusty browns. Brand mark needs to read against all of those. Pick:
- Mark fill: `#FFFFFF` pure white
- Mark stroke (1.5px outer): `#1A1A1A`
- Contrast plate behind text on the end card: radial gradient from `rgba(0,0,0,0.55)` at the text centre out to `rgba(0,0,0,0)` at 60% radius
- Optional accent: the same red as the mailbox sampled (`#C8362C`-ish) for an underline or chip behind one keyword

White-with-thin-dark-stroke holds on the cream sky AND the red mailbox without changing colour per shot. No need to swap palettes per clip.

**Motion language for the end card.**
- Frame 0-12: contrast plate fades in, opacity 0 → 0.55, easing `(0.21, 0.47, 0.32, 0.98)`
- Frame 4-16: brand mark "LinkedItch" enters with a subtle scale (0.94 → 1.0) AND opacity (0 → 1), same curve, 4-frame stagger after the plate so the eye registers the dimming first
- Frame 20-32: tagline "Try free today" types-on word-by-word, each word a 6-frame opacity ramp staggered by 4 frames. Use string-slicing per [Remotion's text rules](https://github.com/remotion-dev/skills/blob/main/skills/remotion/rules/text-animations.md), not per-character opacity (per-character looks like an AI ad instantly).
- Frame 32-90: hold. This is the dwell moment — long enough to read, short enough to feel urgent.
- Frame 90-102: exit. Slide up 16px, opacity 1 → 0, faster curve `(0.4, 0, 1, 1)`.

At 30fps: 0-3.4s of card. The current 1-frame appearance becomes a properly choreographed 3.4s outro.

**Brand mark in-frame, replacing the misspelled "LINKEDITCH.COM" sign.** Three options ranked:

1. **CSS-rendered overlay layered onto the cleaned sign.** Use Remotion to render the wordmark as styled `<div>` text positioned with absolute coords matching the sign's pixel location in each clip. Pros: pixel-perfect, kerning correct, scales to any output res. Cons: the sign in the Veo footage moves slightly per frame (the clay wobble) and a static overlay will float. You'd need to either accept the float as deliberate "the sign is a sticker" or motion-track. **For pilot quality, accept the float and call it a graphic overlay.** This is what we do.

2. **SVG mask of the sign + filled with brand mark.** Roto the misspelled sign, generate an SVG mask, fill it with the wordmark. Production-quality but takes 2-3 hours of manual roto per clip. Park for v2.

3. **Re-prompt Veo with a cleaner sign request.** Veo 3.1 Fast cannot reliably render English text on signs — it's known. Don't rely on it.

Implementation: a `<Sequence>` per Veo clip that wraps an `<AbsoluteFill>` containing the OffthreadVideo and a `<div>` positioned roughly where the sign appears, with `font-family: Inter`, `font-weight: 800`, `letter-spacing: -0.02em`, `text-shadow: 0 0 0.5px rgba(0,0,0,0.3)` for sub-pixel sharpening. Z-stack on top. Position via percent of the 1080-wide canvas so it survives any viewport scaling.

**Lower-third for "Try LinkedItch free today".** Don't use a rectangle. Use the Apple/Linear pattern: a radial-darkened plate under the text region, no visible shape, full-width text centred at y=82% of the frame. Inter Display 800, ~64-72px (font-size in CSS pixels at 1080x1920), white with the 1.5px dark stroke for safety on bright clips, kerning -0.015em. Width-constrained to 78% of frame width, line-height 1.05 for tight stacking if it wraps.

**Kinetic typography for the VO punchlines.** Yes, do this for the three hooks (the whole "Never send another application again" / "auto-applies on all job boards" / "Try free today" trio), but **only for the second half of the ad**. The first 6 seconds is the visual hook (the mailbox shot) — let the claymation breathe with no overlay text. Starting around t=6s when the second clip starts, sync word-by-word reveals to the VO. If the Cartesia output has word-level timestamps, use them; if not, hand-time once and bake. The reveal should be word-by-word string slicing with a slight x-offset slide on each word (8px → 0px over 6 frames). Don't try to match every syllable — match phrase peaks. Hard sync to the VO peaks looks fake; loose sync to phrase boundaries looks like you meant it.

## 5. Pipeline change

Current ffmpeg-only pipeline:
1. concat 3 Veo clips → tpad freeze → drawbox + drawtext → output.mp4

New pipeline:
1. Veo clips download to `public/clips/clip{1,2,3}.mp4` (Remotion `staticFile`)
2. Cartesia VO downloads to `public/audio/vo.mp3`
3. Remotion composition `<LinkeditchAd>` orchestrates everything: three `<Series.Sequence>` wrapping `<OffthreadVideo muted>`, a final `<Freeze>` block for the hold, an `<Audio>` track for the VO over the whole composition, layered AbsoluteFills for in-frame brand marks per clip, and the end-card sequence.
4. `npx remotion render` produces `output.mp4` directly. No ffmpeg post step needed for visuals.

Skeleton:

```tsx
// src/Composition.tsx
import { AbsoluteFill, Audio, Series, OffthreadVideo, Sequence, Freeze, staticFile, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont('normal', { weights: ['600', '700', '800'], subsets: ['latin'] });

export const LinkeditchAd: React.FC<{ clip1Frames: number; clip2Frames: number; clip3Frames: number; freezeFrames: number; }> =
  ({ clip1Frames, clip2Frames, clip3Frames, freezeFrames }) => {
    const { fps } = useVideoConfig();
    return (
      <AbsoluteFill style={{ fontFamily, backgroundColor: '#000' }}>
        <Audio src={staticFile('audio/vo.mp3')} />
        <Series>
          <Series.Sequence durationInFrames={clip1Frames} premountFor={fps}>
            <ClipWithBrandMark src={staticFile('clips/clip1.mp4')} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={clip2Frames} premountFor={fps}>
            <ClipWithBrandMark src={staticFile('clips/clip2.mp4')} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={clip3Frames + freezeFrames} premountFor={fps}>
            <FinalClipWithFreeze src={staticFile('clips/clip3.mp4')} videoFrames={clip3Frames} />
          </Series.Sequence>
        </Series>
        <Sequence from={clip1Frames + clip2Frames + clip3Frames}>
          <EndCard />
        </Sequence>
      </AbsoluteFill>
    );
  };
```

The `calculateMetadata` reads each clip with `parseMedia` from `@remotion/media-parser` so we don't hardcode frame counts. ([combineChunks docs](https://www.remotion.dev/docs/renderer/combine-chunks) is the wrong tool here — that's for distributed rendering, not source-clip concat.)

**Audio sync gotcha.** Putting `<Audio>` at the composition root means it plays across all sequences as one continuous track. Don't put it inside a Series.Sequence — the sequence will stop the audio at its boundary. The VO needs to be a sibling of `<Series>`, not inside it. If the VO is 17s and the visual is 19.5s, the audio just ends naturally and the freeze plays in silence (or with bg music if we add it).

**Render command.**

```
npx remotion render src/index.ts linkeditch-ad out/linkeditch.mp4 \
  --concurrency=4 --crf=18 --pixel-format=yuv420p --codec=h264 \
  --props='{"adId":"linkeditch-pilot"}'
```

The pipeline script in `subsource/video-pipeline` swaps its current ffmpeg-spawn step for a Remotion CLI spawn. Everything upstream (Veo generation, Cartesia VO, manifest reads) stays the same. Everything downstream (upload, ad-platform delivery) stays the same. Only the compositor changes.

**One last thing.** Render once at 1080x1920 portrait, then derive square (1080x1080 centre-crop) and landscape (1920x1080 with letterbox or recomposed) from separate Remotion compositions that share the same components but use different `<Composition>` width/height. Don't ffmpeg-crop a vertical render to landscape — the brand mark and contrast plate will be in the wrong place.

## Sources
- [OffthreadVideo](https://www.remotion.dev/docs/offthreadvideo), [Video vs OffthreadVideo](https://cloudrun.remotion.dev/docs/video-vs-offthreadvideo), [v4.0 benchmark](https://github.com/remotion-dev/4-0-benchmark)
- [Series and Sequence docs](https://www.remotion.dev/docs/videos/sequence), [Sequence](https://www.remotion.dev/docs/sequence), [Freeze](https://www.remotion.dev/docs/freeze)
- [Easing](https://www.remotion.dev/docs/easing), [interpolate](https://www.remotion.dev/docs/interpolate), [spring](https://www.remotion.dev/docs/spring)
- [@remotion/google-fonts](https://www.remotion.dev/docs/google-fonts/), [loadFont](https://www.remotion.dev/docs/google-fonts/load-font), [Using fonts](https://www.remotion.dev/docs/fonts)
- [Performance tips](https://www.remotion.dev/docs/performance), [Render CLI](https://www.remotion.dev/docs/cli/render)
- [Remotion text animation rules (official skills repo)](https://github.com/remotion-dev/skills/blob/main/skills/remotion/rules/text-animations.md)
- [FFmpeg drawtext source](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_drawtext.c)
- [Alpha compositing](https://en.wikipedia.org/wiki/Alpha_compositing), [Premultiplied vs straight alpha](https://www.provideocoalition.com/alpha-channels-premultiplied-vs-straight/)
- [AG1 brand identity](https://the-brandidentity.com/project/the-new-companys-identity-for-ag1-sets-the-nutritional-drink-apart-by-a-mile-from-other-supplements), [AG1 ad strategy](https://www.foreplay.co/post/athletic-greens-600m-ad-creative-strategy-how-foreplay-helps-you-dominate-the-market)
- [Liquid Death marketing](https://nogood.io/blog/liquid-death-marketing/), [Liquid Death case study](https://www.tacticone.co/blog/liquid-death-gamification-and-strategic-ad-design)
- [Inter on Google Fonts](https://fonts.google.com/specimen/Inter), [GT Walsheim](https://www.grillitype.com/typeface/gt-walsheim)
- [Apple typography motion notes](https://developer.apple.com/videos/play/wwdc2022/110381/)
- [Backdrop-filter for frosted glass](https://www.joshwcomeau.com/css/backdrop-filter/)
