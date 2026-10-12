# REDagent design

REDagent is an assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://github.com/Edgemodders/REDnode) mods and overlay apps with the player, while they play. It works through the REDnode runtime (the "kernel") that mods use: the game API, the mod log, the apps, the overlay windows. Powered by Claude.

Status: **C1, the kernel MCP server, passed in game on 2026-10-12** (in the REDnode repo, [docs](https://edgemodders.github.io/REDnode/mcp.html)). **C2, the chat in the game, is built; its in-game test is pending** (steps below).

## What it can do

| Step | How | REDnode piece it relies on |
|---|---|---|
| Author a mod | Writes `rednode-app.json` and `mod.mjs`, or an HTML app, into the apps folder | Packages and manifests (overlay O3, O6a) |
| Run it | The host picks up a new package; hot reload restarts a changed one in about a second | Hot reload (O6a) |
| See what happened | Reads the mod log: everything a mod printed, crashes cut down to the line in the mod's own file | Mod log (O6a) |
| Check against the game | Calls the game itself, for example to read V's money after a change | `api`, the generic game API (O6b) |
| Know the game | Looks up game types, functions and REDnode's notes | Generated game API types and the game API reference |
| See a window | Reads an overlay window's text, or looks at its image | The host's off-screen pages |
| Fix and repeat | Edits the file; hot reload runs it again | Hot reload |

| Not yet | Why |
|---|---|
| Tier 1 interceptors, declarative rules | Not built in REDnode yet (phases P4 and P3) |
| Reacting to arbitrary game events | Only `OnGameAttached` and UI state today; hooking game functions is REDnode P2 work |
| Live-editing redscript, CET Lua or archive mods | It can edit those files, but the game loads them only at start |
| Seeing the game screen, pressing keys | It sees overlay windows, not the game's final frame. A frame capture needs native work (phase C4) |
| Rebuilding REDnode's native plugin | Needs a game restart |

## Facts that shape the design

From Anthropic's Agent SDK docs, checked 2026-10-12:

| Fact | Effect |
|---|---|
| "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." | Each player enters their own Anthropic API key and pays per use. No key ships with the mod |
| Use of the Agent SDK is governed by Anthropic's Commercial Terms, including in products for end users | It can ship inside a mod |
| A product must keep its own branding and "not appear to be Claude Code or any Anthropic product"; "{YourAgentName} Powered by Claude" is allowed | The product is **REDagent**, "powered by Claude" |
| The TypeScript Agent SDK runs a bundled native Claude Code binary as a separate process; `pathToClaudeCodeExecutable` and `spawnClaudeCodeProcess` control how it starts | Should work from a REDnode mod process. Electron is not covered by the docs: **unverified**, settled by a spike in C2 |
| Custom tools in process (`createSdkMcpServer`, `tool`), MCP servers over HTTP, `PreToolUse` hooks that block a tool before any other check, `disallowedTools`, `settingSources: []`, a custom system prompt, streaming with `includePartialMessages` | Everything the design needs is supported |

## Pieces

| Piece | Repo | What it is |
|---|---|---|
| Kernel MCP server | REDnode | The overlay host serves REDnode's tools over MCP on localhost, protected by a token. One server, two clients: REDagent in the game, and Claude Code on the desktop |
| Package permissions | REDnode | A package asks for powers in its manifest, for example `"permissions": ["logs", "apps", "capture", "files"]`. The player grants them once in the launcher. Today only apps built into the host have them |
| REDagent package | REDagent | A REDnode package: a chat window (overlay app) and the agent (a Node mod in its own process), the briefing, and the settings for the key and the model |

## The agent

The **Claude Agent SDK**, chosen 2026-10-12 after a spike. REDagent is an optional add-on: players of REDnode mods do not need it, so its size is acceptable.

| Spike, 2026-10-12 (SDK 0.3.296) | Result |
|---|---|
| Runs inside a REDnode mod process (Electron utility process, Windows) | Yes: `claude.exe` starts in about 0.5 s |
| Uses the kernel MCP server | Yes: all 9 REDnode tools, beside Claude Code's own |
| Uses an API key | Yes, confirmed with a real key on 2026-10-12, once the key is approved in Claude Code's config: `.claude.json` in the config folder, `customApiKeyResponses.approved` with the key's last 20 characters. Without that it answers "Not logged in" and sends nothing. Shown with a stand-in for Anthropic's API that recorded the key in the `x-api-key` header |
| Size | 282 MB installed; `claude.exe` is 249 MB |
| Files | `claude.exe` writes config, sessions and telemetry into `CLAUDE_CONFIG_DIR`. Inside a package folder that set off REDnode's hot reload in a loop, so the config folder must be outside the apps folder |
| A refused key | Claude Code retries for a long time; REDagent stops after 30 s and says why |

Always set for `claude.exe`: `CLAUDE_CONFIG_DIR` to REDagent's own folder (never the player's Claude Code login), `ANTHROPIC_API_KEY` from REDagent's settings, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, and no `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`. `tools/check-key.mjs` checks a key outside the game the same way.

### What C2 needs from REDnode

| Need | Why |
|---|---|
| A private data folder per package, outside the apps folder | `claude.exe`'s config and sessions, chat history |
| Hot reload that ignores dot folders | A package's own tools may write there |
| Secrets per package, encrypted with Electron's `safeStorage` (main process only) | The player's API key |
| MCP access for a package, with its own token | REDagent's agent uses the kernel's tools even when the external MCP switch is off |
| Several apps folders for developers | Running REDagent from its repo beside REDnode's apps |

| | Agent SDK | Claude API with our own tools |
|---|---|---|
| File reading, editing, searching | Built in | We write them |
| Long chats (context management), sessions | Built in | We build them |
| Permissions and confirmations | Hooks and a permission callback | We build them |
| Size and moving parts | A native binary as a second process; size to be measured | Small, in process |
| Risk | Running inside Electron is unverified | Low |

Locked down either way:

| Rule | How |
|---|---|
| No shell | `disallowedTools: ["Bash"]` |
| Files only in the apps folder | A `PreToolUse` hook denies any read or write outside it. Hooks run before every other check |
| Every write is shown first | A diff in the chat window; nothing is written until the player confirms. Each version is backed up, for undo |
| Game changes are confirmed | `api_call` asks before a call that may change the game, such as `GiveItem` |
| Nothing from the player's PC | `settingSources: []`: no CLAUDE.md or settings from the machine |
| Its own instructions | A custom system prompt, the briefing below |
| The key | Entered once, stored encrypted with Electron's `safeStorage`, passed only to the agent process |

Model: `claude-opus-5-5` by default, `claude-sonnet-5-5` as the cheaper choice. A cost meter shows what each chat has cost.

## The briefing

A system prompt for the REDnode world. Most of it is generated from REDnode's [Overlay apps guide](https://edgemodders.github.io/REDnode/overlay-apps.html), so it stays current and the guide is tested by use.

| It covers | Source |
|---|---|
| What REDnode is: tiers, packages, manifests, hot reload, mod processes | Hand-written, in this repo |
| How to write mods and apps: `rednode`, `game`, `ui`, `api`, the UI kit | Generated from the guide |
| The game API rules: references, 64-bit values as strings, `game.instance` | Generated from the guide |
| Its tools, and when to use which | Hand-written |
| The safety rules | Hand-written |

Game types are looked up on demand with `gameapi_lookup`, not carried in the prompt: there are 15,830 classes.

## Tools

| Tool | Gives | Phase |
|---|---|---|
| `logs` | Mod output: all, one mod, errors only | C1 |
| `apps` | Installed apps and mods, their state and memory; open, close, restart | C1 |
| `game_state` | What the game shows: menus, photo mode, scenes, the main menu, the overlay mode | C1 |
| `perf` | The game's frame rate and the overlay's cost | C1 |
| `gameapi_lookup` | Game types, functions, enum members and REDnode's notes | C1 |
| `window_text`, `window_image` | An overlay window's text, or its image: the window's own pixels, before the plugin places it on screen | C1 |
| `api_call` | A live game call. Calls that may change the game ask first | C1 |
| Read, search, edit, write files | In the apps folder only, with a diff and confirmation for every write, and undo | C3 |

## C2: what was built

| Piece | Where |
|---|---|
| The package | `redagent/`: `rednode-app.json` (an app and a Node mod, its own process, asks for `mcp`), `agent.mjs` (the agent), `index.html` and `chat.js` (the chat window), `briefing.md` (the hand-written briefing) |
| The briefing | `briefing.md`, then the apps folders on this PC, then REDnode's Overlay apps guide, copied by `tools/build.mjs` into `redagent/briefing/` |
| The chat | Streams Claude's text as it comes, shows each tool call, asks before `api_call` and before opening, closing or restarting a package, counts what the chat costs, and lets the player pick Opus 5.5 or Sonnet 5.5 and start a new chat |
| The key | Pasted once (Ctrl+V works in overlay windows), kept in REDnode's encrypted secrets, approved only in REDagent's own Claude Code config folder in its data folder |
| From REDnode | `pkg`, `secrets`, `kernel.mcp()` with a launcher grant, `channel` between the window and the agent, several apps folders, Ctrl shortcuts in overlay windows |
| Deploy | `tools/deploy.ps1`, after REDnode's own deploy |

Tested against a stand-in for Anthropic's API that streams like the real one: the key is saved and sent, the briefing is the system prompt, the kernel's 9 tools are offered, a `logs` call and its answer stream into the chat with Markdown, a second question continues the same chat, an `api_call` waits for **Allow** and then runs, and the cost adds up.

## C2 test

1. Close the game. Deploy REDnode (`tools\deploy-native.ps1`), then REDagent (`tools\deploy.ps1`), both with `-GameDir`.
2. Start the game and load a save. The REDagent window opens at the right, asking for a key.
3. **F10**. In the launcher, find REDagent: switch **Allowed** on for "REDnode's tools for AI agents".
4. Copy your API key, click the key field in REDagent, press **Ctrl+V**, then **Save key**. The chat appears.
5. Ask: "What's in my mod log?" It should call `logs` and summarize. Watch the cost at the bottom.
6. Ask: "What are V's health, level and money?" It should look the functions up and call the game, and ask before each call; allow them.
7. Ask: "Capture the Hello mod window and tell me what it shows."
8. Ask: "Why might the crash mod's Throw button break?" It should read `crash-mod/mod.mjs` and explain.
9. Press **Sonnet 5.5**, ask anything short, and compare the cost.
10. Press **New chat**, then quit the game.

## Phases

Each phase ends with an in-game test, as in REDnode.

| Phase | Builds | The test proves |
|---|---|---|
| **C1 Kernel MCP server** (REDnode repo) | The read-only tools on localhost with a token, and `api_call` with confirmation | From Claude Code on the desktop, while the game runs: "what's V's health?", "show the Mod log errors", "capture the Hello mod window" |
| **C2 Chat in the game** | The REDagent package: a streaming chat window built with the UI kit, key setup, model choice, cost meter. Starts with a spike: the Agent SDK inside a mod process | Questions asked in the game get answers built from live tool calls |
| **C3 Authoring** | Write tools with diff, confirmation and undo; package permissions in the launcher; the write, hot reload, read the log, fix loop | "Make a mod that warns me below 30% health" goes from request to a working mod in the game. "Fix the crash mod's Throw button" fixes it |
| **C4 Polish** | Session history, prompt caching for cost, a capture of the game's frame (native), and what the tests teach | To be decided |
| **C5 Agent API for mods** | A `rednode` API for other mods to use REDagent, brokered by the host: for example `agent.ask(prompt, { context })`, streaming the answer back. A mod must ask for the `agent` permission, the player grants it in the launcher, and spending limits apply per mod, since every call costs the player | A sample mod asks REDagent a question and shows the answer; a mod without the permission is refused |
