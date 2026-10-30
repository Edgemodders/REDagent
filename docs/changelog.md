# Changelog

What changed in each REDagent release, for players. Each release takes its notes from its section here: the GitHub release and the version's changelog on the Nexus Mods page.

How to keep it (the Edgemodders convention):

- With each change a player would notice, add a line under **Unreleased**, in its group: **New**, **Changed**, **Fixed** or **Other**. One change per line.
- Before a release, rename **Unreleased** to `## <version> (<date>)` and start a new empty **Unreleased** above it.
- Links are full URLs, since the same text goes to GitHub and Nexus.

## Unreleased

**Changed**

- Your Anthropic API key is now one of the keys every EDGE tool shares (REDnode 0.48.0, https://github.com/Edgemodders/REDnode/issues/23): **Set up the key** opens REDnode's own Key request window, where you paste it once, and it is changed or removed in REDnode's Settings, under Keys. A key REDagent kept before is offered to the shared keys at your first question, then deleted; if you decline, REDagent keeps using its own copy.
- Needs REDnode 0.48.0 or later.

**New**

- Knows EDGEmat's material tools, which REDnode 0.45.0 runs for in-game assistants: ask REDagent to find a garment's materials, explain their layers, or recolor them in your WolvenKit project. Searches run at once; changes ask you first.

## 0.3.2 (2026-10-25)

**The first release for game version 2.5**, with REDnode 0.38.1. For game 2.31, use REDagent 0.3.1.

**Changed**

- Needs REDnode 0.38.1 or later, on game version 2.5.
- REDagent's briefing, its copy of REDnode's guide, now comes from REDnode 0.38.1: it knows development folders, calling other packages (mod services) and describing a service, so it can write mods that use them.

## 0.3.1 (2026-10-24)

**The last release for game version 2.31**, like REDnode 0.37.0. The next release moves to 2.5 with REDnode.

**New**

- Uses the tools other mods offer through REDnode (REDnode 0.36.0 and later): those that only read run at once, the rest ask you first, as the game API's calls do. Questions from mods may use only the reading ones.

**Other**

- The guide shows where to allow REDnode's tools: REDnode's Mod Manager, since a new package is not in the launcher until you pin it.

## 0.3.0 (2026-10-23)

The first release, for game version 2.31. REDagent is an assistant inside Cyberpunk 2077, powered by Claude, that writes, runs, checks and fixes REDnode mods with you while you play. It uses your own Anthropic API key.

**New**

- A chat window over the game, with Opus 5.5 or Sonnet 5.5 and a cost meter.
- Reads REDnode's Mod log, the game's state, overlay windows and their console, TweakDB and the game itself, through REDnode's tools.
- Writes and edits REDnode mods in the apps folders, showing each change as a diff for you to allow or deny, with a backup and Undo.
- Takes a picture of the game's screen when it needs to see it.
- Swaps changed archives into the running game, after asking you.
- Chats are kept across game starts, with their Undo.
- Other mods can ask REDagent questions (`agent.ask`), once you allow them, within a daily spending limit per mod.
- Asks you before every call that could change your game, and before every archive swap. Reads of quest facts and the journal (REDnode's `game_facts` and `game_journal`) do not ask.
- Gets Anthropic's Claude Agent SDK, which it runs on, at first start: press **Get the Agent SDK** in its window. It downloads about 140 MB from Anthropic's own packages on npm into REDagent's data folder, checked against npm's integrity hashes, so the download of REDagent itself stays small.
- For game version 2.31 only, like REDnode. Needs REDnode 0.32.1 or later.
