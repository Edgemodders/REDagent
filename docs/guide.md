---
title: Guide
---

# RED<span class="y">agent</span> guide

REDagent is an assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://edgemodders.github.io/REDnode/) mods with you while you play. You talk to it in a chat window drawn over the game. It is powered by Claude and uses your own Anthropic API key.

> "Make me a mod that warns me when V's health drops below 30%."

REDagent reads what is already installed, writes the mod, and shows you every change before it is made. REDnode loads the mod a moment later. REDagent then reads the mod's log, checks its window and the game's answers, and fixes what is wrong.

## What it can do

| You ask | What REDagent does |
|---|---|
| "What's in my mod log?" | Reads the REDnode Mod log, including crashes, and explains them |
| "What are V's health, level and money?" | Looks up the game functions and reads them from the running game. It asks you first before every call that could change the game |
| "What does the Hello mod window show?" | Captures that overlay window and reads it |
| "Swap my changed archive into the game" | Swaps it into the running game through REDnode, so a changed mesh or texture shows without a restart. It asks you first |
| "What's on my screen?" | Takes a picture of the game's screen, with or without REDnode's windows, and describes it |
| "Why does the crash mod break?" | Reads the mod's files and explains the code |
| "Make a mod that ..." | Creates a new REDnode package, waits for it to load, checks it runs, and fixes it |
| "Fix the Throw button" | Changes the file, then checks the log again |

It sees the game's screen only when it takes a picture, which it does when it needs one. It cannot press keys or move the mouse in the game, run commands or install npm packages.

## What you need

| You need | Why |
|---|---|
| Cyberpunk 2077 on PC, **game version 2.31**, with [REDnode](https://github.com/Edgemodders/REDnode/releases) 0.32.1 or later installed | REDagent is a REDnode package. REDnode draws its window and gives it the game's tools. Game version 2.5 is not supported yet: REDnode and REDagent move to it once RED4ext, redscript and Codeware support it |
| Your own Anthropic API key | REDagent calls Claude with your key, and Anthropic bills you for what you use. Get one at [console.anthropic.com](https://console.anthropic.com/) under API keys. No key ships with REDagent. A Claude.ai subscription cannot be used |
| About 300 MB of disk, and a 140 MB download at first start | REDagent runs on Anthropic's Claude Agent SDK. It is not in REDagent's zip: REDagent downloads it once, when you press **Get the Agent SDK** |
| About 120 MB of memory while the game runs | REDagent runs in its own Node process, outside the game |

## Install

1. Install [REDnode](https://github.com/Edgemodders/REDnode/releases) 0.32.1 or later, with its own requirements (RED4ext and redscript).
2. Download `REDagent-<version>.zip` from [REDagent's releases](https://github.com/Edgemodders/REDagent/releases). Extract it into your Cyberpunk 2077 folder, or add it to Vortex or EDGEdeck. It puts REDagent in `red4ext\plugins\REDnode\apps\redagent`.

To install from source instead, for working on REDagent itself: deploy REDnode following its [developer setup](https://edgemodders.github.io/REDnode/dev-setup.html), clone REDagent beside REDnode, close the game and run `.\tools\deploy.ps1 -GameDir '<your Cyberpunk 2077 folder>'`. With `npm install` run in the `redagent` folder first, REDagent uses the Agent SDK from there and skips the download.

## The Claude Agent SDK

REDagent runs on Anthropic's Claude Agent SDK. The SDK is Anthropic's, not open source, so REDagent does not ship it. At first start the REDagent window shows **Get the Agent SDK**. Pressing it downloads Anthropic's own packages from npm, a pinned version of about 140 MB, and checks each against npm's integrity hash before unpacking it into `%APPDATA%\@rednode\overlay\packages\redagent\sdk`. A download that fails or does not match is thrown away, and you can press the button again. Its use is subject to [Anthropic's terms](https://code.claude.com/docs/en/legal-and-compliance).

## First run

1. Start the game. The REDagent window opens on the right. Press **Get the Agent SDK** and wait for it to finish. Then it asks for your key.
2. Press **F10** to open the REDnode launcher. Find REDagent and switch **Allowed** on for "REDnode's tools for AI agents". Without this, REDagent can still chat and read your mods' files, but it cannot see the Mod log, the game or overlay windows.
3. Copy your API key. Click the key field in REDagent, press **Ctrl+V**, then **Save key**. The chat appears.
4. Ask something short, like "What's in my mod log?"

## How changes to your files work

REDagent only writes inside REDnode's apps folders. It never changes its own files or anything in a `node_modules` folder, and it cannot write anywhere else on your PC.

Before each change, the chat shows a card with the change as a diff: added lines in green, removed lines in red. You choose:

| Button | What happens |
|---|---|
| **Allow** | This one change is made |
| **Allow all in this chat** | This change and every later change in this chat are made without asking. **New chat** turns this off again |
| **Deny** | Nothing changes. REDagent is told you said no, and asks what you want instead |

REDagent backs up each file before it changes it. Every change it makes is listed in the chat with an **Undo** button. The strip above the input counts the chat's changes; **Show** lists them all, each with Undo, however far the chat has scrolled. Undo puts the file back as it was, or removes a file REDagent created, and any folder that is then empty. REDagent is told about the undo when you next ask it something.

Backups are kept in `%APPDATA%\@rednode\overlay\packages\redagent\backups`.

## Chats are kept

Each chat is saved as it goes, with its changes, so closing the game does not lose it. The last chat comes back when the game starts, and Undo still works on its changes. **Chats** lists the last 30 chats: **Open** one to see it and carry on where you left off, or **Delete** it. **New** starts a fresh chat. "Allow all in this chat" is never brought back: you give it again when you want it.

Chats are kept in `%APPDATA%\@rednode\overlay\packages\redagent\chats`.

## Mods that ask REDagent

Other mods can ask REDagent questions and show you the answers, for example a mod that suggests a build or explains an error. A mod can ask only once you allow its "questions to the AI assistant" permission in the REDnode launcher or Mod Manager.

| What | How it works |
|---|---|
| What a mod's question may do | Only read: logs, the game state, the game API, overlay windows' text and your mods' files. It never changes your files or your game |
| Pictures | Pictures of windows and of your screen are off for every mod. Switch **Pictures** on for a mod in the Mods view if you want it |
| Model | Sonnet 5.5, whatever your chat uses, to keep it cheap |
| Cost | Each mod has a daily limit, $0.25 unless you change it. Past it, the mod's questions are refused until the next day |
| Control | **Chats**, then the **Mods** tab, lists each mod that has asked: what it spent today and in all, its limit (type a new one and press **Set**), **Paused** to stop it, **Pictures**, and its last questions |

## Your key and your data

| What | Where it goes |
|---|---|
| Your API key | Stored encrypted with your Windows account, by REDnode. It is only used to talk to Anthropic and is never shown again. **Key** in the chat's footer replaces it |
| Your questions and REDagent's answers | Sent to Anthropic's API, as with any Claude API use |
| What REDagent reads to answer | Also sent to Anthropic: mod logs, values from the game, pictures of overlay windows and of the game's screen, and the files it reads from the apps folders |
| Everything else | Stays on your PC. REDagent does not send telemetry |

## What it costs

You pay Anthropic per use. Each answer shows its own cost under it in dim text, next to the chat's running total. The footer shows the chat's total too.

A picture of the game's screen costs about as much as a page of text. REDagent takes one when it needs to see, not on every question.

| Model | Use it for |
|---|---|
| **Opus 5.5** (the default) | Writing and fixing mods, and harder questions |
| **Sonnet 5.5** | Quick questions, at a lower price |

In our first test, six questions (five on Opus 5.5, one on Sonnet 5.5) cost $0.34 in all. Each took 11 to 55 seconds. Anthropic caches REDagent's long instructions for a few minutes, so questions asked close together cost less. A long chat costs more per question, because the whole chat is sent each time. Use **New chat** when you change topic.

## When something goes wrong

| You see | Do this |
|---|---|
| "REDnode's tools are off" | In the launcher (F10), switch **Allowed** on for REDagent |
| "That does not look like an Anthropic API key" | Copy the whole key. Anthropic keys start with `sk-ant-` |
| An error about your key or credit | Check the key and your credit at console.anthropic.com, then press **Key** and save the key again |
| REDagent asks for your key again | The saved key could not be read, for example after a Windows account change. Paste it again |
| The window is gone | Open it again from the launcher (F10) |
| Anything else | Open the REDnode Mod log app. REDagent's lines start with `[redagent]` |

## More

| Page | What it covers |
|---|---|
| [Docs index](./) | Every REDagent document, and the roadmap status |
| [Design](design.md) | How REDagent is built, the phases, and their test results. For developers |
| [REDnode docs](https://edgemodders.github.io/REDnode/) | The runtime REDagent writes mods for, and its overlay apps guide |

REDagent is not affiliated with CD Projekt RED or Anthropic. Source code and issues: [github.com/Edgemodders/REDagent](https://github.com/Edgemodders/REDagent).
