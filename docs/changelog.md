# Changelog

What changed in each REDagent release, for players. Each release takes its notes from its section here: the GitHub release and the version's changelog on the Nexus Mods page.

How to keep it (the Edgemodders convention):

- With each change a player would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**. One change per line.
- Before a release, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it.
- Links are full URLs, since the same text goes to GitHub and Nexus.

## Unreleased

The first release. REDagent is an assistant inside Cyberpunk 2077, powered by Claude, that writes, runs, checks and fixes REDnode mods with you while you play. It uses your own Anthropic API key.

**New**

- A chat window over the game, with Opus 5.5 or Sonnet 5.5 and a cost meter.
- Reads REDnode's Mod log, the game's state, overlay windows and their console, TweakDB and the game itself, through REDnode's tools.
- Writes and edits REDnode mods in the apps folders, showing each change as a diff for you to allow or deny, with a backup and Undo.
- Takes a picture of the game's screen when it needs to see it.
- Swaps changed archives into the running game, after asking you.
- Chats are kept across game starts, with their Undo.
- Other mods can ask REDagent questions (`agent.ask`), once you allow them, within a daily spending limit per mod.
- Asks you before every call that could change your game, and before every archive swap.
- Needs REDnode 0.26.16 or later.
