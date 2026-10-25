# RED<span class="y">agent</span> docs

REDagent is an assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://edgemodders.github.io/REDnode/) mods with you while you play. You talk to it in a chat window drawn over the game. It is powered by Claude and uses your own Anthropic API key. These pages cover how to use it and how it is built.

| Document | What it covers |
|---|---|
| [Guide](guide.html) | What REDagent can do, what you need, install, first run, how changes to your files work, chats, your key and data, cost, troubleshooting |
| [Changelog](changelog.html) | What changed in each release |
| [Design](design.html) | How REDagent is built: the Agent SDK, the kernel MCP server, the briefing, the tools, the rules it is locked down by, each phase and its in-game test results |
| [REDnode docs](https://edgemodders.github.io/REDnode/) | The runtime REDagent writes mods for: its overlay apps guide, game API and MCP server |

## Roadmap status

As of 2026-10-25. **REDagent 0.3.2 was released on 2026-10-25** on [GitHub](https://github.com/Edgemodders/REDagent/releases) and Nexus, for game 2.5 with REDnode 0.38.1 (0.3.1 is the last for game 2.31); the [guide](guide.html) installs it from the release zip. Each phase ends with an in-game test.

| Phase | Status |
|---|---|
| C1 Kernel MCP server | Done, passed in game 2026-10-12. REDnode's overlay host serves its tools over MCP on localhost with a token: logs, apps, game state, performance, game API lookup, window text and image, live game calls with confirmation. Lives in the REDnode repo |
| C2 Chat in the game | Done, passed in game 2026-10-12. The REDagent package: a streaming chat window, key setup, Opus 5.5 or Sonnet 5.5, a cost meter. The Agent SDK runs inside a REDnode mod process |
| C3 Authoring | Done, passed in game 2026-10-12, fixes passed a second test the same day. Write and Edit kept to the apps folders, a diff card for every change with Allow, Allow all in this chat and Deny, a backup of every file before it changes, Undo from a changes strip |
| C4 Polish | Done, passed in game 2026-10-13. Chats kept on disk and listed, with Undo after a restart; the game's screen through REDnode's `game_image`, with or without the overlay; a waiting line while a card needs you; the Test timer app. HDR capture has unit tests only, not yet seen in game |
| C5 Agent API for mods | Done, passed in game 2026-10-13. Mods ask with `agent.ask` in the `rednode` package once the player allows their `agent` permission; REDagent answers one at a time on Sonnet 5.5 with read-only tools, within a daily limit per mod ($0.25 by default), shown and changed in its Mods view |
| 0.3.1 Mods' tools | Done, passed in game 2026-10-24 with REDnode 0.36.0. REDagent uses the tools other mods offer: those marked read-only run without asking, the rest ask you first |
| C6 REDagent in REDcode | Not started. The agent as a core package with two front ends, the in-game chat and a view in REDcode, with edits reviewed in VS Code's diff editor and REDbridge's WolvenKit operations as tools |

Next: C6. See the [changelog](changelog.html).

REDagent is not affiliated with CD Projekt RED or Anthropic. Source code and issues: [github.com/Edgemodders/REDagent](https://github.com/Edgemodders/REDagent)
