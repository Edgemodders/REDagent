# REDagent

An assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://github.com/Edgemodders/REDnode) mods and overlay apps with you, while you play. Powered by Claude.

You ask, in a chat window in the game: "make me a mod that warns me when my health drops below 30%". REDagent writes the mod, REDnode's hot reload runs it, REDagent reads the mod's log and checks the game's answers through REDnode's game API, and fixes what is wrong. Every file it writes is shown to you first.

**Status: planned.** The design is in [docs/design.md](docs/design.md). The first phase, C1, is the REDnode kernel's MCP server, in the REDnode repo.

| You need | Why |
|---|---|
| Cyberpunk 2077 on PC with REDnode | REDagent is a REDnode package |
| Your own Anthropic API key | REDagent calls Claude with your key, and you pay for what you use. No key ships with the mod |

Not affiliated with CD Projekt RED or Anthropic.
