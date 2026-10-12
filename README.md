# REDagent

An assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://github.com/Edgemodders/REDnode) mods and overlay apps with you, while you play. Powered by Claude.

You ask, in a chat window in the game: "make me a mod that warns me when my health drops below 30%". REDagent writes the mod, REDnode's hot reload runs it, REDagent reads the mod's log and checks the game's answers through REDnode's game API, and fixes what is wrong. Every file it writes is shown to you first.

**Status: phase C2, the chat in the game, built; its in-game test is pending.** The design is in [docs/design.md](docs/design.md). C1, the REDnode kernel's MCP server, passed in game.

## Install (developers)

1. Deploy [REDnode](https://github.com/Edgemodders/REDnode) to the game.
2. `cd redagent && npm install`
3. `.\tools\deploy.ps1 -GameDir '<your Cyberpunk 2077 folder>'`
4. In the game, allow REDagent to use REDnode's tools in the REDnode launcher, then paste your API key into REDagent.

`node tools/check-key.mjs` checks a key outside the game.

| You need | Why |
|---|---|
| Cyberpunk 2077 on PC with REDnode | REDagent is a REDnode package |
| Your own Anthropic API key | REDagent calls Claude with your key, and you pay for what you use. No key ships with the mod |

Not affiliated with CD Projekt RED or Anthropic.
