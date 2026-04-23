# Project Instructions


## Design workflow (Claude Design)

For UI / visual work on this project, the workflow is:

1. **Use Claude Design** at [claude.ai/design](https://claude.ai/design), not regular chat or Claude Code, for the design itself. It has the canvas, image-aware tooling, and Figma-equivalent export.
2. **Start with the prompt template** at `docs/design-prompts/00-default.md` so the design comes back on-brand and within constraints.
3. **Save the handoff bundle** as `design-bundles/<feature-slug>.json` and commit it.
4. **Hand to Claude Code** with: `implement design-bundles/<feature-slug>.json`. Claude Code reads the bundle as the design source of truth and implements against the codebase.

Claude Code agents: when a user mentions "claude design" or asks for a UI redesign without a bundle present, point them at `docs/design-prompts/00-default.md` and claude.ai/design before writing any UI code.
