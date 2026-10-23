// The Claude Agent SDK, fetched on the player's PC at first start.
//
// The SDK is Anthropic's (all rights reserved), so REDagent's zip does not carry it. The
// player gets it from Anthropic's own packages on npm: two pinned versions, each checked
// against npm's sha512 integrity before it is unpacked into REDagent's data folder. The
// SDK's code imports only Node's own modules, so it runs from there; claude.exe is passed
// to it by path. A developer's `npm install` in redagent/ is used when it has the same
// version, so a deploy from the repo needs no download.

import { createHash } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export const SDK_VERSION = '0.3.308';
const PARTS = [
  {
    name: '@anthropic-ai/claude-agent-sdk',
    folder: 'claude-agent-sdk',
    integrity: 'sha512-oda1EZ4wjculEQWjakYSEM12qiB4hU2jgMEhg9bvNhW++tvp8CKZ9ad6gVAl3psADktEg6C8MYGlfNpvnO47Ug==',
  },
  {
    name: '@anthropic-ai/claude-agent-sdk-win32-x64',
    folder: 'claude-agent-sdk-win32-x64',
    integrity: 'sha512-ZzjrLY5lkGDKUciNzeIdB6t2f9KMeUuE/KBK6VzwHj6mymiT+YMI/6qrfmbjE6uH0g0G1epoLUUlb+iZcW8t/g==',
  },
];
const tarball = (p) => `https://registry.npmjs.org/${p.name}/-/${p.name.split('/')[1]}-${SDK_VERSION}.tgz`;

/** Where the SDK is, or null: `{ sdk, exe, from }` with sdk the path of sdk.mjs. */
export function findSdk(pkgDir, dataDir) {
  const dev = join(pkgDir, 'node_modules', '@anthropic-ai');
  if (sameVersion(join(dev, PARTS[0].folder)) && existsSync(join(dev, PARTS[1].folder, 'claude.exe'))) {
    return { sdk: join(dev, PARTS[0].folder, 'sdk.mjs'), exe: join(dev, PARTS[1].folder, 'claude.exe'), from: 'node_modules' };
  }
  const dir = join(dataDir, 'sdk', SDK_VERSION);
  if (existsSync(join(dir, 'ready.json')) && existsSync(join(dir, PARTS[1].folder, 'claude.exe'))) {
    return { sdk: join(dir, PARTS[0].folder, 'sdk.mjs'), exe: join(dir, PARTS[1].folder, 'claude.exe'), from: 'download' };
  }
  return null;
}

function sameVersion(folder) {
  try {
    return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version === SDK_VERSION;
  } catch {
    return false;
  }
}

/**
 * Downloads, checks and unpacks the SDK into dataDir/sdk/<version>. onProgress gets
 * `{ part, of, name, received, total }` (total 0 when the server does not say).
 * Resolves with what findSdk returns.
 */
export async function installSdk(pkgDir, dataDir, { onProgress = () => {}, signal } = {}) {
  const root = join(dataDir, 'sdk');
  const dir = join(root, SDK_VERSION);
  const work = `${dir}.part`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    for (const [i, part] of PARTS.entries()) {
      const file = join(work, `${part.folder}.tgz`);
      await download(part, file, (received, total) => onProgress({ part: i + 1, of: PARTS.length, name: part.name, received, total }), signal);
      await untar(file, join(work, part.folder));
      rmSync(file, { force: true });
    }
    writeFileSync(join(work, 'ready.json'), JSON.stringify({ version: SDK_VERSION, at: new Date().toISOString() }, null, 2));
    rmSync(dir, { recursive: true, force: true });
    renameSync(work, dir);
  } catch (err) {
    rmSync(work, { recursive: true, force: true });
    throw err;
  }
  // Older versions are no longer used.
  for (const d of readdirSync(root)) if (d !== SDK_VERSION) rmSync(join(root, d), { recursive: true, force: true });
  return findSdk(pkgDir, dataDir);
}

async function download(part, file, progress, signal) {
  const res = await fetch(tarball(part), { signal });
  if (!res.ok || !res.body) throw new Error(`npm answered ${res.status} for ${part.name}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha512');
  const out = createWriteStream(file);
  let received = 0;
  let last = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    received += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (Date.now() - last > 500) {
      last = Date.now();
      progress(received, total);
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  progress(received, total);
  const got = `sha512-${hash.digest('base64')}`;
  if (got !== part.integrity) throw new Error(`${part.name} did not match npm's integrity check, so it was not installed`);
}

// A small tar reader for npm's packages: plain files and folders, with long names from
// pax ("x") or GNU ("L") headers. Every path is kept inside `dest`, and npm's leading
// "package/" is dropped.
async function untar(file, dest) {
  mkdirSync(dest, { recursive: true });
  const base = normalize(dest + sep);
  let buf = Buffer.alloc(0);
  let mode = 'header';
  let size = 0; // bytes left in this entry's body
  let pad = 0; // bytes of padding after it
  let fd = null;
  let meta = null; // a pax or GNU long-name body being read
  let longName = null;
  let done = false;

  const target = (name) => {
    const rel = name.replace(/^package\//, '');
    const full = normalize(join(dest, rel));
    if (!full.startsWith(base) || rel.split('/').includes('..')) throw new Error(`Unsafe path in the package: ${name}`);
    return full;
  };

  const step = () => {
    while (!done) {
      if (mode === 'skip') {
        const n = Math.min(pad, buf.length);
        buf = buf.subarray(n);
        pad -= n;
        if (pad) return;
        mode = 'header';
      } else if (mode === 'body') {
        const n = Math.min(size, buf.length);
        if (n) {
          if (fd !== null) writeSync(fd, buf, 0, n);
          else if (meta) meta.push(Buffer.from(buf.subarray(0, n)));
          buf = buf.subarray(n);
          size -= n;
        }
        if (size) return;
        if (fd !== null) {
          closeSync(fd);
          fd = null;
        }
        if (meta) {
          const body = Buffer.concat(meta.chunks);
          if (meta.type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
          else if (meta.type === 'x') {
            const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
            if (path) longName = path[1];
          }
          meta = null;
        }
        mode = 'skip';
      } else {
        if (buf.length < 512) return;
        const h = buf.subarray(0, 512);
        buf = buf.subarray(512);
        if (h.every((b) => b === 0)) {
          done = true;
          return;
        }
        const str = (at, len) => h.subarray(at, at + len).toString('utf8').replace(/\0.*$/s, '');
        size = parseInt(str(124, 12).trim() || '0', 8);
        pad = (512 - (size % 512)) % 512;
        const type = String.fromCharCode(h[156] || 48);
        const prefix = str(345, 155);
        const name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
        if (type === 'x' || type === 'L' || type === 'g') {
          meta = type === 'g' ? { type, chunks: [], push() {} } : { type, chunks: [], push(c) { this.chunks.push(c); } };
        } else {
          longName = null;
          if (type === '0' || type === '7') {
            const full = target(name);
            mkdirSync(dirname(full), { recursive: true });
            fd = openSync(full, 'w');
          } else if (type === '5') {
            mkdirSync(target(name), { recursive: true });
          } // links and other types: npm packages have none; their bodies are skipped
        }
        mode = 'body';
      }
    }
  };

  try {
    await pipeline(createReadStream(file), createGunzip(), async function* (source) {
      for await (const chunk of source) {
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
        step();
      }
    });
  } finally {
    if (fd !== null) closeSync(fd);
  }
  if (!done && (mode !== 'header' || buf.length)) throw new Error('The package ended early');
}
