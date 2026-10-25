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
| Brief overview | An assistant inside Cyberpunk 2077, powered by Claude, that writes, runs, checks and fixes REDnode mods with you while you play. Uses your own Anthropic API key. For game version 2.5. (255 characters at most; this is 183) |
| Author | Edgemodders |
| Language | English |
| Primary image | The owner's thumbnail. The banner is already at the top of the description |
| Requirements | REDnode (its Nexus page; note: "0.38.1 or later"). Off-site: an Anthropic API key (console.anthropic.com; note: "Billed by Anthropic per use"). The Claude Agent SDK has no entry: REDagent downloads it, as the description explains |
| Permissions | MIT. Note that the Claude Agent SDK is Anthropic's and is not in the download |
| Tags | Modders resource, utility |

Branding: the name is "REDagent", described as "powered by Claude". No Anthropic or Claude logos on the page or the images, and the page says REDagent is not affiliated with or endorsed by Anthropic.

## The download

One main file: `REDagent-<version>.zip` from the GitHub release (the **Release zip** workflow; `node tools/release-zip.mjs` builds it locally into `release/`). It is laid out like the game folder, so Vortex and an extract by hand put it in the same place, and it holds only REDagent's own files, about 60 KB, with no node_modules:

```
red4ext/plugins/REDnode/apps/redagent/
```

### File description on Nexus

The release workflow sets it from `upload.description` in `nexus.json` ({version} is replaced):

> REDagent {version} for game 2.5. Needs REDnode 0.38.1 or later and your own Anthropic API key. Downloads Anthropic's Claude Agent SDK (about 140 MB) at first start.

## Updating the page

The page is kept through Nexus's v3 API with the owner's key, as REDnode's is (`tools/nexus/`, copied from REDnode's; its README's "Updating the page" has the details). `nexus.json` holds the page number, the internal mod id, the main file's id, how a new version is uploaded (`upload`) and the hash of the description last pulled.

1. `node tools/nexus/nexus.mjs pull` first, and commit what it changed, so an edit made on Nexus (pictures added by hand) is not lost. `node tools/nexus/nexus.mjs status` shows the page's version, its main file's versions and whether the description changed on Nexus.
2. Edit `description.bbcode`, check it with `node ../REDnode/tools/check-bbcode.mjs nexus/description.bbcode`, commit, push. The next release pushes it.
3. For a new version: the release gate first (every in-game test of what goes in has passed), then raise the version in `redagent/package.json` and `redagent/rednode-app.json`, rename **Unreleased** in `docs/changelog.md` to `## <version> (<date>)`, and run the Release zip workflow with **Make a release** and **Update Nexus Mods**. It checks the page first, then uploads the zip as the main file's new version (the old one archived, the page's version set), adds the version's changelog from `node tools/notes.mjs --nexus`, and pushes the description. If the Nexus step fails after the GitHub release, run `node tools/nexus/nexus.mjs release --version <v> --zip <zip> --notes <file>` on the dev PC.
