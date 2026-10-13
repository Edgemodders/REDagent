# REDagent design

REDagent is an assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://github.com/Edgemodders/REDnode) mods and overlay apps with the player, while they play. It works through the REDnode runtime (the "kernel") that mods use: the game API, the mod log, the apps, the overlay windows. Powered by Claude.

Status: **C1, the kernel MCP server, passed in game on 2026-10-12** (in the REDnode repo, [docs](https://edgemodders.github.io/REDnode/mcp.html)). **C2, the chat in the game, passed in game on 2026-10-12.** **C3, authoring, passed in game on 2026-10-12**, except Undo, which is left for the next test (results below). Then C6, REDagent in REDcode, planned with the REDcode session.

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

Prompt caching is automatic: Claude Code marks the system prompt (the briefing, about 23,000 characters) and the latest messages, and the tools come before them, so each turn reads the briefing and the chat so far from the cache. Checked on 2026-10-12 with a stand-in API (three cache markers per request). A model switch, or a pause of more than about 5 minutes, writes the cache again. The mod log shows each turn's tokens read from and written to the cache.

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

**Result, 2026-10-12: passed.** The key was pasted with Ctrl+V and saved; the tools were allowed in the launcher; every question was answered from live tool calls (the mod log, V's health, level and money through `api_call` after **Allow**, the Hello mod window's image, the crash mod's code). Six turns, five on Opus 5.5 and one on Sonnet 5.5, cost **$0.34** in all; turns took 11 to 55 seconds. The agent process used about 116 MB.

| Finding | Notes |
|---|---|
| The cost shown was too high | The SDK's `total_cost_usd` is the running total of the session, and REDagent added the totals up. **Fixed:** the chat's cost is the latest total, a turn's cost the difference |
| A window's invisible part caught clicks (Hello mod over the Mod log's title bar) | In REDnode: the plugin now logs, for every press, which windows lie under the cursor and the transparency it sees, to find the cause in the next test |
| Request: double-click a title bar to roll the window up | Built in REDnode's UI kit, for the next test |

## C3: what was built

| Piece | Where |
|---|---|
| Write and Edit | Claude Code's own tools, added beside Read, Glob and Grep. A PreToolUse hook, which runs before anything else, denies a write outside the apps folders, in REDagent's own folder or in any `node_modules` |
| The change card | Before a write, `agent.mjs` works out the file after the change (Write: the new content; Edit: the replacement) and posts a line diff (`diff.mjs`) with 3 lines of context. Long diffs fold. The player picks **Allow**, **Allow all in this chat** or **Deny**. A denied change goes back to Claude as "the player did not allow this change" |
| Backups and Undo | Each allowed change backs the file up first, into REDagent's data folder (`backups/`). Once the tool reports success, the chat shows "Changed ..." or "Created ..." with **Undo**. Undo restores the backup, or removes a file REDagent created. The next prompt tells Claude what was undone |
| Trust | "Allow all in this chat" lasts until **New chat** |
| The briefing | Says REDagent can write, lists what it may not touch, and gives the loop: read, small change, wait for hot reload, check `apps`, `logs` and the window, fix. New packages get `"open": true` so they start at once |
| From REDnode | New packages start, and removed ones stop, without a restart (5163e89). A package skipped because its manifest names a file that does not exist yet is looked at again when any of its files changes, so writing the manifest first works. A secret that cannot be decrypted (saved under another Windows account) counts as unset instead of crashing the mod |

Tested in the mock game with the stand-in API: a new manifest shows a card with +5 lines, **Allow** writes it, REDnode skips the package until `main.mjs` exists and then starts it, **Undo** removes the file and REDnode stops the package. An Edit after a Read shows a -1/+1 card; **Allow all in this chat** applies it, **Undo** restores the backup, the next prompt carries the undo note, and the next edit runs without a card. Writes to REDagent's folder, to a `node_modules` folder and to `C:\Windows\Temp` are all denied, and no file appears.

## C3 test

Steps 1 and 2 are the same as the C2 test (deploy both, load a save, the key is already saved).

1. Close the game. Deploy REDnode, then REDagent.
2. Start the game and load a save. Check that REDagent's tools are still **Allowed** in the launcher (F10).
3. Ask: "Make a mod that shows a warning when V's health is below 30%." A card shows each new file as a diff. Press **Allow** on the first, then **Allow all in this chat**.
4. Watch REDagent check its work (`apps`, `logs`, maybe `window_text`). The new mod should appear in the launcher and run.
5. Get hurt below 30% (or ask REDagent to set V's health lower and allow that call). The warning should show.
6. Press **Undo** on one of the changes. Ask: "What did I just undo?" It should know.
7. Ask: "Fix the crash mod's Throw button." Allow the change, then press **Throw** in the crash mod. The Mod log should show no new crash.
8. Ask: "Change your own briefing to say hello." It should say it may not change its own files.
9. Press **New chat**, ask for a small change to the new mod: the card should come back (trust ends with the chat).
10. Quit the game.

**Result, 2026-10-12: passed, except Undo, which was not tried.** REDagent wrote a low-health warning mod: REDnode started the new package at once, and the mod ran and showed its warning. REDagent then fixed the crash mod (hot reload restarted it). It refused to change its own briefing, and after **New chat** the change cards came back. Prompt caching worked: after the first turn, each turn read 35,000 to 187,000 tokens from the cache and wrote at most 2,800. The 8 turns of the first chat cost **$0.50**, the whole test $0.54.

| Finding | Notes |
|---|---|
| The Undo buttons scrolled out of reach while the mod was built | **Fixed:** a strip above the input counts this chat's changes; **Show** lists them all, each with Undo. Undoing a new file also removes the folders it needed, when they are empty |
| Invisible parts of windows caught clicks (Hello mod's strip under its frame, rolled-up windows) | In REDnode, two causes. The plugin's transparency readback failed for every window whose width is not a multiple of 64, so those windows had no transparency map, and a window without one caught every click in its rectangle. **Fixed** in plugin 0.12.1; a window that has drawn nothing now lets clicks through |
| The launcher tab and REDagent were invisible until hovered or switched off and on | In REDnode: with GPU sharing, a repaint request sends no frame when the page has not changed. **Fixed:** a repaint also draws a 1-pixel, almost transparent mark for two frames. Checked in the mock |
| Closing a mod's window left no way to get it back | In REDnode: the launcher now shows "Window closed" with **Show** under the mod |
| Request: a stopwatch in the game for timing test steps | Proposed: a small built-in app whose marks are written to the log |

## Phases

Each phase ends with an in-game test, as in REDnode.

| Phase | Builds | The test proves |
|---|---|---|
| **C1 Kernel MCP server** (REDnode repo) | The read-only tools on localhost with a token, and `api_call` with confirmation | From Claude Code on the desktop, while the game runs: "what's V's health?", "show the Mod log errors", "capture the Hello mod window" |
| **C2 Chat in the game** | The REDagent package: a streaming chat window built with the UI kit, key setup, model choice, cost meter. Starts with a spike: the Agent SDK inside a mod process | Questions asked in the game get answers built from live tool calls |
| **C3 Authoring** | Claude Code's Write and Edit tools, kept to the apps folders (never REDagent itself or `node_modules`); a diff card for every change with Allow, Deny and "Allow edits for this chat"; a backup of every file before it changes, with Undo; REDnode starting new packages and manifest changes without a restart; the briefing's write, hot reload, check, fix loop. No "files" permission: Node mods have full Node access, so REDnode cannot enforce one; REDagent limits itself | "Make a mod that warns me below 30% health" goes from request to a working mod in the game. "Fix the crash mod's Throw button" fixes it |
| **C4 Polish** | Session history, prompt caching for cost, a capture of the game's frame (native), and what the tests teach | To be decided |
| **C5 Agent API for mods** | A `rednode` API for other mods to use REDagent, brokered by the host: for example `agent.ask(prompt, { context })`, streaming the answer back. A mod must ask for the `agent` permission, the player grants it in the launcher, and spending limits apply per mod, since every call costs the player | A sample mod asks REDagent a question and shows the answer; a mod without the permission is refused |
| **C6 REDagent in REDcode** | REDagent's agent split into a core package shared by two front ends: the in-game chat, and a REDagent view in REDcode's activity bar, beside REDnode's views. In the editor, edits show in VS Code's diff editor. The same briefing, kernel tools and settings. REDbridge's WolvenKit editing operations, exposed as MCP tools by REDbridge (being added in the REDcode session), give the same agent archive and asset work | From REDcode: "make a mod that ..." produces a working mod in the running game, with edits reviewed in VS Code |
