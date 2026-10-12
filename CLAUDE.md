# REDagent: notes for Claude sessions

REDagent is an in-game assistant for REDnode mods, powered by Claude. Read [docs/design.md](docs/design.md) first. It depends on [REDnode](https://github.com/Edgemodders/REDnode), usually checked out beside this repo at `../REDnode`; read that repo's CLAUDE.md for the runtime, the tests and the conventions.

## Status and next step

- Plan agreed 2026-10-12. Phases C1 to C4 are in the design.
- **C1, the kernel MCP server, is built in the REDnode repo** (`packages/overlay/mcp.js`, `docs/mcp.md`); its in-game test is pending. **Next: C2, the chat in the game, built here**, starting with a spike: the Agent SDK inside a REDnode mod process.
- Stop after each phase for the user's in-game test, as in REDnode.

## Conventions

The same as REDnode's:

- **Commits:** straight to `main` and push, in small logical commits, after agreeing the plan in chat.
- **Git identity:** set per repo to `CyberbuildsAI` with the GitHub no-reply email. Never change the global identity.
- **Writing style:** plain, short sentences, tables for comparisons. Mark anything unverified as unverified.
- **Never commit game files** or data extracted from them.
- **Never commit an API key.** The player's key is entered in the game and stored encrypted on their PC.
- **Branding:** the product is REDagent, "powered by Claude". It must not look like Claude Code or an Anthropic product (Agent SDK terms).
- **Models:** `claude-opus-5-5` by default, `claude-sonnet-5-5` as the cheaper choice.
