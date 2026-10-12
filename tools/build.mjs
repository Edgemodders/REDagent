// Prepares the REDagent package: copies REDnode's Overlay apps guide into the
// briefing, so REDagent's instructions match the REDnode it runs on.
//
//   node tools/build.mjs [path to the REDnode repo, default ../REDnode]

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const rednode = resolve(process.argv[2] ?? join(repo, '..', 'REDnode'));
const guide = join(rednode, 'docs', 'overlay-apps.md');
if (!existsSync(guide)) throw new Error(`REDnode's guide is not at ${guide}`);

const out = join(repo, 'redagent', 'briefing');
mkdirSync(out, { recursive: true });
copyFileSync(guide, join(out, 'overlay-apps.md'));
console.log(`Briefing: copied ${guide}`);
