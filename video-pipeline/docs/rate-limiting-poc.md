# Rate Limiting — educational music video (Higgsfield + Remotion POC)

Proof of concept: an Agent-Opus-style "idea → finished video" orchestration, built on
Higgsfield (generative cinematic shots) + Remotion (precise CS graphics) + a real Suno
song, to show why Higgsfield is the better long-term engine for a scripted pipeline.

## Source

- Song: `public/rate-limiting.wav` (Suno, 122.2s, 48k stereo) → `public/rate-limiting.mp3` for render.
- Transcript (word-level): `public/rate-limiting.transcript.json` (faster-whisper small.en).
- Section + caption data: `src/template/rate-limiting-data.ts` (auto-generated from the transcript).

## The song is doubly perfect

The lyrics teach the **token bucket** algorithm literally (request/response, a 100/min cap,
"a bucket of tokens filling up drop by drop", "each request takes one out, when it's empty you
stop", refill rate, "four to nine / too many requests", "slow down... try again... take a rest",
"a limit keeps it alive"), then turn the same mechanic into a metaphor for human burnout
("what if you're the machine... sleep is what refills it... the server that's down can't answer
the calls that matter"). That dual reading is what makes the composite worth doing.

## The engine split (the thesis, made concrete)

- **Remotion draws anything that must be TRUE**: the token bucket fill/drain, the request
  packets, the counter, the server reddening under load, the `429` + `Retry-After: 30s`, the
  recap. Generative models garble text/numbers/diagrams; these must be code.
- **Higgsfield generates anything that must be BEAUTIFUL**: the instrumental "server under
  load" break, the 2am "running on empty" human shot, the calm-dawn outro. Atmospheric, no
  text, gentle motion — exactly where Higgsfield is strong.
- They composite on one Remotion timeline. Agent Opus can't interleave exact token-bucket
  graphics with cinematic B-roll on a custom timeline; its generation flow has no public API
  and its editor is a closed box. That impossibility is the proof.

## Section map (from real lyric timings, 30fps, 3666 frames)

| # | section | t (s) | engine | beat |
|---|---|---|---|---|
| 1 | intro | 0.0–9.7 | higgsfield | title over a pulsing data center |
| 2 | request | 9.7–21.1 | remotion | client↔server, the 100/min cap |
| 3 | bucket | 21.1–32.4 | remotion | token bucket fill/drain/refill (hero) |
| 4 | overload | 32.4–37.1 | remotion | burst, server runs hot + reddens |
| 5 | rejected | 37.1–43.0 | remotion | 429 + Retry-After |
| 6 | why | 43.0–49.2 | remotion | "a limit keeps it alive" |
| 7 | break | 49.2–58.2 | higgsfield | server straining under load |
| 8 | youAreServer | 58.2–70.0 | hybrid | bucket relabeled "energy", sleep refills |
| 9 | burnout | 70.0–80.6 | hybrid | downed server, loved ones in the queue |
| 10 | chorus | 80.6–92.3 | remotion | 429 reprise, both meanings land |
| 11 | outro | 93.0–102.1 | hybrid | "set your limit, let the bucket refill" |
| 12 | tail | 102.1–122.2 | higgsfield | cinematic outro + brand card |

## Build

- Composition: `src/template/RateLimiting.tsx`, registered as `RateLimiting` in `Root.tsx`
  (1080×1920, 30fps). Higgsfield clips drop in via the `higgsfieldClips` prop
  (section name → path under `public/`); missing clips fall back to cinematic placeholders so
  the video always renders.
- Higgsfield shots: `scripts/gen-higgsfield.mjs` (Veo 3.1, 9:16, 8s, ~22 credits each) →
  `public/higgsfield/{break,human,tail}.mp4`.
- Captions: continuous karaoke from the word-level transcript.

## Status

- [x] Song pulled, transcribed, section map locked
- [x] Remotion educational core built + typechecks + renders (still + full draft)
- [x] Full-length half-res draft rendered (`out/rate-limiting-draft.mp4`) and delivered
- [ ] Higgsfield shots generated and wired into the slots
- [ ] Full-res composite render + delivery

## Render

```bash
# studio preview
pnpm studio   # open the RateLimiting composition

# draft (fast)
npx remotion render src/index.tsx RateLimiting out/rate-limiting-draft.mp4 --scale=0.5 --concurrency=3

# full-res, with Higgsfield clips wired via inputProps
npx remotion render src/index.tsx RateLimiting out/rate-limiting.mp4 \
  --props='{"audioSrc":"rate-limiting.mp3","higgsfieldClips":{"intro":"higgsfield/break.mp4","break":"higgsfield/break.mp4","youAreServer":"higgsfield/human.mp4","burnout":"higgsfield/human.mp4","outro":"higgsfield/tail.mp4","tail":"higgsfield/tail.mp4"}}'
```
