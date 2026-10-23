// Builds the REDagent player zip: the package laid out like the game folder,
// red4ext/plugins/REDnode/apps/redagent/, with no node_modules. The Claude Agent SDK is
// Anthropic's and is not in the zip: REDagent fetches it on the player's PC at first start
// (redagent/sdk.mjs).
//
//   node tools/release-zip.mjs [path to the REDnode repo, default ../REDnode]
//
// Writes release/REDagent-<version>.zip. The briefing is copied from REDnode first
// (tools/build.mjs), so the zip carries the guide of the REDnode it was built against.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(repo, 'redagent');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(pkgDir, 'rednode-app.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error(`package.json is ${pkg.version} but rednode-app.json is ${manifest.version}`);
const version = pkg.version;

const built = spawnSync(process.execPath, [join(repo, 'tools', 'build.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (built.status !== 0) throw new Error('Preparing the briefing failed');

const out = join(repo, 'release');
const stage = join(out, 'stage');
const target = join(stage, 'red4ext', 'plugins', 'REDnode', 'apps', 'redagent');
const zip = join(out, `REDagent-${version}.zip`);
rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(target, { recursive: true });

// Everything in redagent/ but node_modules and backups left by edits.
cpSync(pkgDir, target, {
  recursive: true,
  filter: (src) => !src.split(/[\\/]/).includes('node_modules') && !src.endsWith('.bak'),
});
cpSync(join(repo, 'LICENSE'), join(target, 'LICENSE.txt'));
const rednodeNeeded = manifest.requires?.rednode ?? '';
writeFileSync(
  join(target, 'README.txt'),
  [
    `REDagent ${version}: an assistant for REDnode mods inside Cyberpunk 2077, powered by Claude.`,
    '',
    'For game version 2.31 only, like REDnode. Game version 2.5 is not supported yet.',
    '',
    `Needs: REDnode ${rednodeNeeded} (https://github.com/Edgemodders/REDnode/releases), and your own`,
    'Anthropic API key (console.anthropic.com, under API keys). Anthropic bills you for what you use.',
    '',
    'At first start the REDagent window offers Get the Agent SDK: it downloads Anthropic\'s Claude',
    'Agent SDK (about 140 MB) from npm into REDagent\'s data folder, checked against npm\'s integrity',
    'hashes. Its use is subject to Anthropic\'s terms: https://code.claude.com/docs/en/legal-and-compliance',
    '',
    'Then paste your key and ask. Press F10 for the REDnode launcher, and switch Allowed on for',
    'REDagent\'s "REDnode\'s tools for AI agents" so it can see the game and your mods\' logs.',
    '',
    'Guide: https://edgemodders.github.io/REDagent/guide.html',
    'Source: https://github.com/Edgemodders/REDagent',
    '',
  ].join('\r\n'),
);

// Windows' own tar writes zip files (-a picks the format from the name).
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
const packed = spawnSync(tar, ['-a', '-c', '-f', zip, 'red4ext'], { cwd: stage, stdio: 'inherit' });
if (packed.status !== 0) throw new Error('Zipping failed');
rmSync(stage, { recursive: true, force: true });

console.log(`${zip}: ${(statSync(zip).size / 1024).toFixed(0)} KB, REDagent ${version}, needs REDnode ${rednodeNeeded}`);
