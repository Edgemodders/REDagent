# REDagent: notes for Claude sessions

REDagent is an in-game assistant for REDnode mods, powered by Claude. Read [docs/design.md](docs/design.md) first. It depends on [REDnode](https://github.com/Edgemodders/REDnode), usually checked out beside this repo at `../REDnode`; read that repo's CLAUDE.md for the runtime, the tests and the conventions.

## Status and next step

- Plan agreed 2026-10-12. Phases C1 to C4 are in the design.
- C1, the kernel MCP server, passed in game on 2026-10-12 (in the REDnode repo: `packages/overlay/mcp.js`, `docs/mcp.md`). C2, the chat in the game (`redagent/`), passed in game on 2026-10-12. C3, authoring (Write and Edit kept to the apps folders, a diff card for every change, backups and Undo), passed in game on 2026-10-12, and its fixes (the changes strip with Undo, REDnode's click-through, repaint and scrollbar fixes, Show for closed mod windows) passed a second test the same day. C4, polish (chat history on disk with a Chats list; the game's screen through REDnode's `game_image`; a waiting line), passed in game on 2026-10-13. O8 Mod Manager in REDnode passed too. C5, the agent API for mods (`agent.serve` in agent.mjs, the Mods view), passed in game on 2026-10-13. Next: C6, REDagent in REDcode, after REDnode's W1 and O9 (order agreed with the user). Deploy with `tools/deploy.ps1 -GameDir ...` after REDnode's deploy; `node tools/build.mjs` prepares the briefing. For local runs without a key, a stand-in API can be set with `ANTHROPIC_BASE_URL`.
- Stop after each phase for the user's in-game test, as in REDnode.

## Docs site

- `docs/` is published by GitHub Pages at https://edgemodders.github.io/REDagent/ through `.github/workflows/pages.yml` (Settings > Pages > Source: GitHub Actions). Jekyll renders it with the HUD layout copied from REDbridge.
- `docs/index.md` is the landing page, laid out like the other tools' docs sites (EDGEdeck, REDnode): the document ledger at the top, then the roadmap status table per phase. Bump its date and the phase rows with each phase. `docs/guide.md` is the player's guide: what REDagent does, install, first run, changes and undo, key and data, cost, troubleshooting. Keep it current with each phase, in plain words for players. `docs/design.md` is for developers.
- Add every new page to `nav` in `docs/_config.yml`. The banner, icon and badges come from `tools/brand/` (`render.ps1`); update the status badge in `badges.py` when the phase changes.

## Conventions

The same as REDnode's:

- **Commits:** straight to `main` and push, in small logical commits, after agreeing the plan in chat.
- **Git identity:** set per repo to `CyberbuildsAI` with the GitHub no-reply email. Never change the global identity.
- **Writing style:** plain, short sentences, tables for comparisons. Mark anything unverified as unverified.
- **Never commit game files** or data extracted from them.
- **Never commit an API key.** The player's key is entered in the game and stored encrypted on their PC.
- **Branding:** the product is REDagent, "powered by Claude". It must not look like Claude Code or an Anthropic product (Agent SDK terms).
- **Models:** `claude-opus-5-5` by default, `claude-sonnet-5-5` as the cheaper choice.
