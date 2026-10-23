// Prints the release notes for one version from its section of docs/changelog.md. The release
// workflow uses it for the GitHub release, and stops when the version has no section.
//
//   node tools/notes.mjs [version]            markdown for GitHub, with the install line
//   node tools/notes.mjs [version] --nexus    plain lines for Nexus's changelog field
//   --out <file>                              writes the notes to a file (UTF-8)
//
// The version defaults to redagent/package.json's.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const nexus = args.includes('--nexus');
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const version = args.find((a) => !a.startsWith('--')) ?? JSON.parse(readFileSync(root + 'redagent/package.json', 'utf8')).version;
const lines = readFileSync(root + 'docs/changelog.md', 'utf8').split(/\r?\n/);

const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start < 0) {
  console.error(`docs/changelog.md has no section for ${version}: rename Unreleased to "## ${version} (date)" first`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
if (end < 0) end = lines.length;
const section = lines.slice(start + 1, end);
if (!section.some((line) => line.trim())) {
  console.error(`docs/changelog.md: the section for ${version} is empty`);
  process.exit(1);
}

if (nexus) {
  const plain = (text) =>
    text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
  const result = [];
  let group = '';
  for (const line of section) {
    const groupHeading = line.match(/^\*\*(.+)\*\*$/);
    if (groupHeading) group = groupHeading[1];
    else if (line.startsWith('- ')) result.push((group ? `${group}: ` : '') + plain(line.slice(2)));
    else if (line.trim()) result.push(plain(line.trim()));
  }
  write(result.join('\n'));
} else {
  write(`${section.join('\n').trim()}

**Install:** install [REDnode](https://github.com/Edgemodders/REDnode/releases) first, then extract this zip into the game folder, or add it to Vortex or EDGEdeck. At first start, press **Get the Agent SDK** in the REDagent window, then paste your Anthropic API key. Guide: https://edgemodders.github.io/REDagent/guide.html (changelog: https://edgemodders.github.io/REDagent/changelog.html)`);
}

function write(text) {
  if (out) writeFileSync(out, text + '\n', 'utf8');
  else console.log(text);
}
