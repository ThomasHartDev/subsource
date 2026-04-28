## Iteration mode

Render to ONE platform during creative iteration to save credits:

  pnpm render premium iterate

That's tiktok-feed only. After the creative is locked, fan out with `pnpm render premium default` (6 platforms) or `pnpm render premium all` (16).

## Ad profile (analytics foundation)

Every render produces a `<output>.profile.json` next to the MP4 capturing every decision the pipeline made: hook template, humor flavor, voice provider, music provider, palette, scene plan, cuts/sec, costs, external call timings.

Inspect with:

  pnpm tsx scripts/inspect-profile.ts out/<slug>-<tier>-<timestamp>.profile.json

The profile is the foundation for performance analytics. command-center will later ingest these via `POST /api/ad-videos` and correlate features to conversion. Schema lives at `~/.claude/skills/make-ad/profile-schema.json`.
