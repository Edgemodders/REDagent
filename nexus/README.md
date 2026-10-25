# REDagent on Nexus Mods

The source of REDagent's Nexus Mods page. **Live at [mod 35670](https://www.nexusmods.com/cyberpunk2077/mods/35670)** (0.3.1 on 2026-10-24). REDnode's page is [mod 35419](https://www.nexusmods.com/cyberpunk2077/mods/35419).

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode. Paste the whole file into the description field (the editor's source mode, or switch to BBCode) |
| `../docs/assets/brand/banner.png` | 2560 x 640, at the top of the description (loaded from GitHub) |
| `../docs/assets/brand/social.png` | 1280 x 640, for links shared on social sites |
| `../docs/assets/brand/icon.png` | 256 x 256 |
| The primary image (thumbnail) | Made by the owner by hand |
| `README.md` | This page |

## Before posting: the placeholders

| In `description.bbcode` | Replace with |
|---|---|
| `Screenshot 1` to `Screenshot 3` (cyan italics) | Upload each picture to the page's Images tab, then replace its line with `[img]<the image's Nexus URL>[/img]` and a one-line caption |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | REDagent |
| Version | The version in `redagent/package.json` (0.3.0) |
| Category | Modders Resources and Tutorials |
| Brief overview | An assistant inside Cyberpunk 2077, powered by Claude, that writes, runs, checks and fixes REDnode mods with you while you play. Uses your own Anthropic API key. For game version 2.31. (255 characters at most; this is 184) |
| Author | Edgemodders |
| Language | English |
| Primary image | The owner's thumbnail. The banner is already at the top of the description |
| Requirements | REDnode (its Nexus page; note: "0.32.1 or later"). Off-site: an Anthropic API key (console.anthropic.com; note: "Billed by Anthropic per use"). The Claude Agent SDK has no entry: REDagent downloads it, as the description explains |
| Permissions | MIT. Note that the Claude Agent SDK is Anthropic's and is not in the download |
| Tags | Modders resource, utility |

Branding: the name is "REDagent", described as "powered by Claude". No Anthropic or Claude logos on the page or the images, and the page says REDagent is not affiliated with or endorsed by Anthropic.

## The download

One main file: `REDagent-<version>.zip` from the GitHub release (the **Release zip** workflow; `node tools/release-zip.mjs` builds it locally into `release/`). It is laid out like the game folder, so Vortex and an extract by hand put it in the same place, and it holds only REDagent's own files, about 60 KB, with no node_modules:

```
red4ext/plugins/REDnode/apps/redagent/
```

### File description on Nexus

> REDagent &lt;version&gt;. Needs REDnode 0.32.1 or later and your own Anthropic API key. Downloads Anthropic's Claude Agent SDK (about 140 MB) at first start. Game version 2.31.

## Updating the page

1. Edit `description.bbcode` here, commit, push.
2. Check it: `node ../REDnode/tools/check-bbcode.mjs nexus/description.bbcode`.
3. Paste the whole file into the description field on Nexus and save.
4. For a new version: the release gate first (every in-game test of what goes in has passed), then raise the version in `redagent/package.json` and `redagent/rednode-app.json`, rename **Unreleased** in `docs/changelog.md` to `## <version> (<date>)`, run the Release zip workflow with **Make a release**, upload the zip as the main file, and paste `node tools/notes.mjs --nexus` into the page's changelog for the version.
