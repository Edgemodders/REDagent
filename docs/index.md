# RED<span class="y">agent</span>

REDagent is an assistant inside Cyberpunk 2077 that writes, runs, checks and fixes [REDnode](https://edgemodders.github.io/REDnode/) mods with you while you play. You talk to it in a chat window drawn over the game. It is powered by Claude and uses your own Anthropic API key.

> "Make me a mod that warns me when V's health drops below 30%."

REDagent reads what is already installed, writes the mod, and shows you every change before it is made. REDnode loads the mod a moment later. REDagent then reads the mod's log, checks its window and the game's answers, and fixes what is wrong.

> **Status:** an early developer build. The chat (phase C2) and writing mods (phase C3) passed their in-game tests. Chat history and seeing the game's screen (phase C4) are built and waiting for theirs. There is no packaged release yet.

## What it can do

| You ask | What REDagent does |
|---|---|
| "What's in my mod log?" | Reads the REDnode Mod log, including crashes, and explains them |
| "What are V's health, level and money?" | Looks up the game functions and calls the running game. It asks you first before any call that could change the game |
| "What does the Hello mod window show?" | Captures that overlay window and reads it |
| "What's on my screen?" | Takes a picture of the game's screen, with or without REDnode's windows, and describes it |
| "Why does the crash mod break?" | Reads the mod's files and explains the code |
| "Make a mod that ..." | Creates a new REDnode package, waits for it to load, checks it runs, and fixes it |
| "Fix the Throw button" | Changes the file, then checks the log again |

It sees the game's screen only when it takes a picture, which it does when it needs one. It cannot press keys or move the mouse in the game, run commands or install npm packages.

## What you need

| You need | Why |
|---|---|
| Cyberpunk 2077 on PC, with [REDnode](https://github.com/Edgemodders/REDnode) installed | REDagent is a REDnode package. REDnode draws its window and gives it the game's tools |
| Your own Anthropic API key | REDagent calls Claude with your key, and Anthropic bills you for what you use. Get one at [console.anthropic.com](https://console.anthropic.com/) under API keys. No key ships with REDagent. A Claude.ai subscription cannot be used |
| About 300 MB of disk | Most of it is the Claude Agent SDK, which REDagent runs on |
| About 120 MB of memory while the game runs | REDagent runs in its own Node process, outside the game |

## Install

There is no packaged release yet. To install from source:

1. Install REDnode and deploy it to the game, following its [developer setup](https://edgemodders.github.io/REDnode/dev-setup.html).
2. Clone [REDagent](https://github.com/Edgemodders/REDagent) beside REDnode, then run `npm install` in its `redagent` folder.
3. Close the game. Run `.\tools\deploy.ps1 -GameDir '<your Cyberpunk 2077 folder>'`.

## First run

1. Start the game. The REDagent window opens on the right and asks for your key.
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
| [Design](design.md) | How REDagent is built, the phases, and their test results. For developers |
| [REDnode docs](https://edgemodders.github.io/REDnode/) | The runtime REDagent writes mods for, and its overlay apps guide |

REDagent is not affiliated with CD Projekt RED or Anthropic. Source code and issues: [github.com/Edgemodders/REDagent](https://github.com/Edgemodders/REDagent).
