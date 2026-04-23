# Design Bundles

This directory holds Claude Design handoff bundles. Each bundle is a JSON file describing a design to be implemented in this project.

## Workflow

1. Open [claude.ai/design](https://claude.ai/design).
2. Use the prompt template at `docs/design-prompts/00-default.md` (paste relevant sections, fill in project specifics).
3. Iterate until the design looks right.
4. Click "Hand off to Claude Code". Save the bundle here as `<feature-slug>.json`.
5. Tell Claude Code: `implement design-bundles/<feature-slug>.json`.

## Bundles are committed

Bundles are version-controlled so design history travels with the code. If you need to revisit why a design decision was made, the bundle is the source of truth from the design phase.
