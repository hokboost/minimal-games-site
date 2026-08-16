# Streamer World Builder agent package

This package was written specifically for the uploaded `minimal-games-site (3).zip` repository. It is not a generic “add more games” prompt.

## Included files

- `.claude/agents/streamer-world-builder.md` — the project-level Claude Code agent.
- `docs/STREAMER_WORLD_REPOSITORY_AUDIT.md` — a codebase-specific audit of the current architecture and feature gaps.
- `docs/STREAMER_WORLD_PRODUCT_BLUEPRINT.md` — the target product, subsystem design, content scope, rollout phases, and acceptance gates.
- `docs/streamer-expansion/PROGRESS_TEMPLATE.md` — the progress file the agent should instantiate and maintain.
- `scripts/count-streamer-expansion-lines.js` — a Git-diff-based meaningful-line verifier with anti-padding exclusions.
- `KICKOFF_PROMPT.md` — a concise first instruction for the agent.

## Installation

Copy the package contents into the root of the Minimal Games repository while preserving paths. The agent should end up at:

```text
.claude/agents/streamer-world-builder.md
```

The uploaded repository already contains `.claude/`, so only the `agents` child directory and file need to be added.

## Starting the agent

From the repository root:

```bash
claude --agent streamer-world-builder
```

The agent has an `initialPrompt`, so current Claude Code versions begin with the repository audit and the first incomplete phase automatically. `KICKOFF_PROMPT.md` is also included for manual starts, resumed sessions, or older installations.

The same project agent can also be selected with an agent mention in an interactive Claude Code session. Run it as the main session agent for the full expansion because the work is too large for a short one-shot delegation.

## Important scope note

“50,000 lines” is enforced as meaningful Git additions across production backend, frontend, authored content, migrations, tooling, and tests. Lockfiles, generated output, vendored files, comment-only padding, copied old files, and excessive documentation do not satisfy the threshold. The agent also requires at least 40,000 lines of net growth and category minimums, so deleting and rewriting the same code does not satisfy the request.
