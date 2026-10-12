// REDagent's agent: a REDnode Node mod that runs Claude through the Claude Agent
// SDK, with the REDnode kernel's tools, and streams each turn to the chat window
// (index.html) over the package channel.
//
// Safety, see docs/design.md:
//   - the player's own API key, from REDnode's encrypted secrets, approved only in
//     REDagent's own Claude Code config folder: never the player's Claude Code login;
//   - files: read and written only inside the apps folders, never REDagent itself
//     or node_modules (a PreToolUse hook, which runs before anything else);
//   - every change to a file is shown to the player as a diff and backed up first,
//     with Undo; calls that may change the game ask the player first.

import { channel, kernel, pkg, secrets } from 'rednode';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { diffLines } from './diff.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(join(pkg.dir, 'package.json'));
const { query } = await import(
  pathToFileURL(join(pkg.dir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs')).href
);
const CLAUDE_EXE = join(dirname(require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/package.json')), 'claude.exe');

const KEY = 'anthropic-api-key';
const MODELS = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' },
];
const CONFIG_DIR = join(pkg.dataDir, 'claude'); // claude.exe's own folder: config, sessions
const SETTINGS = join(pkg.dataDir, 'settings.json');
const APPS_DIRS = pkg.appsDirs.map((d) => resolve(d));

// Read-only kernel tools run without asking. The rest ask the player, or are refused.
const KERNEL = 'mcp__rednode__';
const READ_ONLY = ['logs', 'game_state', 'perf', 'gameapi_lookup', 'window_text', 'window_image', 'api_get'].map(
  (t) => KERNEL + t,
);
const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const WRITE_TOOLS = ['Write', 'Edit'];
const FILE_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
const BACKUPS = join(pkg.dataDir, 'backups');

mkdirSync(CONFIG_DIR, { recursive: true });

// ---------- settings and state ----------

function readSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS, 'utf8'));
  } catch {
    return {};
  }
}
const settings = { model: MODELS[0].id, ...readSettings() };
const saveSettings = () => writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));

let sessionId = null; // the chat's Claude Code session, resumed turn after turn
let chatCost = 0; // what this chat has cost: the SDK reports a running total per session
let running = null; // AbortController of the turn in progress
let nextConfirm = 1;
const confirms = new Map(); // confirm id -> resolve(answer)
let trustEdits = false; // the player chose "Allow edits for this chat"
const edits = new Map(); // tool use id -> { id, file, backup | null, undone }
let nextEdit = 1;
const notes = []; // told to Claude at the start of the next turn, such as an undo

const post = (msg) => channel.post(msg);

async function status() {
  let tools = 'ok';
  try {
    await kernel.mcp();
  } catch (err) {
    tools = err.message;
  }
  post({
    type: 'status',
    hasKey: !!(await secrets.get(KEY)),
    model: settings.model,
    models: MODELS,
    cost: chatCost,
    busy: !!running,
    tools,
  });
}

// Claude Code uses a key from the environment only once it is approved in its
// config, by the key's last 20 characters. This is REDagent's own config folder.
function approveKey(key) {
  const file = join(CONFIG_DIR, '.claude.json');
  let config = {};
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // a new folder
  }
  const approved = new Set(config.customApiKeyResponses?.approved ?? []);
  approved.add(key.slice(-20));
  config.hasCompletedOnboarding = true;
  config.customApiKeyResponses = { approved: [...approved], rejected: [] };
  writeFileSync(file, JSON.stringify(config, null, 2));
}

// ---------- the briefing ----------

function briefing() {
  const read = (f) => (existsSync(join(pkg.dir, f)) ? readFileSync(join(pkg.dir, f), 'utf8') : '');
  const guide = read(join('briefing', 'overlay-apps.md'));
  return [
    read('briefing.md'),
    `# This PC\n\nThe apps folders: ${APPS_DIRS.map((d) => `\`${d}\``).join(', ')}.`,
    guide ? `# The REDnode guide: Overlay apps\n\n${guide}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------- permissions ----------

// Paths for Read, Glob and Grep must stay inside the apps folders.
function insideApps(p, cwd) {
  if (!p) return true; // the tool's default: the working folder, itself an apps folder
  const full = isAbsolute(p) ? resolve(p) : resolve(cwd, p);
  return APPS_DIRS.some((d) => {
    const rel = relative(d, full);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

// Where REDagent may not write even inside the apps folders: itself, and installed packages.
function writable(p) {
  const full = resolve(APPS_DIRS[0], p);
  const rel = relative(resolve(pkg.dir), full);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return 'REDagent may not change its own files.';
  if (/(^|[\\/])node_modules([\\/]|$)/.test(full)) return 'REDagent may not change installed packages (node_modules).';
  return null;
}

const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
});

const fileGuard = {
  matcher: FILE_TOOLS.join('|'),
  hooks: [
    async (input) => {
      const i = input.tool_input ?? {};
      const p = i.file_path ?? i.path ?? '';
      if (!insideApps(p, APPS_DIRS[0])) return deny('REDagent may only use files inside the REDnode apps folders.');
      if (WRITE_TOOLS.includes(input.tool_name)) {
        const why = writable(p);
        if (why) return deny(why);
      }
      return {};
    },
  ],
};

// ---------- changes to files: a diff for the player, a backup, undo ----------

const shortPath = (full) => {
  for (const d of APPS_DIRS) {
    const rel = relative(d, full);
    if (!rel.startsWith('..') && !isAbsolute(rel)) return rel.replace(/\\/g, '/');
  }
  return full;
};

// What the file would be after the tool runs, or null when that cannot be known.
function afterChange(name, input, before) {
  if (name === 'Write') return String(input.content ?? '');
  if (before === null) return null;
  const oldText = String(input.old_string ?? '');
  const newText = String(input.new_string ?? '');
  if (!oldText || !before.includes(oldText)) return null; // the edit will fail on its own
  return input.replace_all ? before.split(oldText).join(newText) : before.replace(oldText, () => newText);
}

function backup(file, before) {
  if (before === null) return null; // a new file: undo removes it
  const dir = join(BACKUPS, `${Date.now()}-${nextEdit}`);
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, file.replace(/[\\/:]/g, '_'));
  copyFileSync(file, copy);
  return copy;
}

async function confirmChange(name, input, toolUseID, signal) {
  const file = resolve(APPS_DIRS[0], String(input.file_path ?? ''));
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const after = afterChange(name, input, before);
  let allowed = trustEdits;
  if (!allowed) {
    const id = nextConfirm++;
    const d = after === null ? null : diffLines(before ?? '', after);
    post({
      type: 'change',
      id,
      file: shortPath(file),
      created: before === null,
      diff: d ? d.lines.slice(0, 400) : null,
      more: d ? Math.max(0, d.lines.length - 400) : 0,
      added: d?.added ?? 0,
      removed: d?.removed ?? 0,
    });
    const answer = await new Promise((done) => {
      confirms.set(id, done);
      signal?.addEventListener('abort', () => {
        confirms.delete(id);
        done(false);
      });
    });
    if (answer === 'all') trustEdits = true;
    allowed = !!answer;
  }
  if (!allowed) return { behavior: 'deny', message: 'The player did not allow this change. Ask what they want instead.' };
  const editId = nextEdit++;
  edits.set(toolUseID, { id: editId, file, backup: backup(file, before), undone: false, created: before === null });
  return { behavior: 'allow', updatedInput: input };
}

function undo(editId) {
  const e = [...edits.values()].find((x) => x.id === editId);
  if (!e || e.undone) return;
  if (e.backup) copyFileSync(e.backup, e.file);
  else rmSync(e.file, { force: true });
  e.undone = true;
  notes.push(`The player undid your change to ${shortPath(e.file)}${e.backup ? '; it is back to how it was before' : '; the new file was removed'}.`);
  post({ type: 'undone', id: editId });
  console.log(`Undid the change to ${shortPath(e.file)}`);
}

function describe(name, input) {
  const t = name.startsWith(KERNEL) ? name.slice(KERNEL.length) : name;
  if (t === 'api_call') {
    const where = input.class ? `${input.class}.` : input.self !== undefined ? `object ${input.self} ` : '';
    return `call the game: ${where}${input.fn}(${JSON.stringify(input.args ?? []).slice(1, -1)})`;
  }
  if (t === 'apps') return `${input.action} the package "${input.id}"`;
  return `${t} ${JSON.stringify(input)}`;
}

// Asks the player in the chat window; resolves with their answer.
function askPlayer(text, signal) {
  const id = nextConfirm++;
  post({ type: 'confirm', id, text });
  return new Promise((done) => {
    confirms.set(id, done);
    signal?.addEventListener('abort', () => {
      confirms.delete(id);
      done(false);
    });
  });
}

// Decides every tool call: reading is allowed (the hook keeps files inside the
// apps folders), changes ask the player, anything else is refused.
async function canUseTool(name, input, { signal, toolUseID }) {
  if (READ_TOOLS.includes(name) || READ_ONLY.includes(name)) return { behavior: 'allow', updatedInput: input };
  if (WRITE_TOOLS.includes(name)) return confirmChange(name, input, toolUseID, signal);
  const t = name.startsWith(KERNEL) ? name.slice(KERNEL.length) : null;
  if (t === 'apps' && (!input.action || input.action === 'list')) return { behavior: 'allow', updatedInput: input };
  if (t === 'api_call' || t === 'apps') {
    const ok = await askPlayer(describe(name, input), signal);
    return ok
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: 'The player said no. Do not try it another way; ask what they want instead.' };
  }
  return { behavior: 'deny', message: `REDagent cannot use ${name} in this version.` };
}

// ---------- a turn ----------

function cleanEnv(key) {
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: key,
    CLAUDE_CONFIG_DIR: CONFIG_DIR,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function toolName(name) {
  return name.startsWith(KERNEL) ? name.slice(KERNEL.length) : name;
}

function summarize(input, name) {
  // File tools: the file or pattern, relative to the apps folder, is what the player needs.
  if (FILE_TOOLS.includes(name)) {
    const where = input?.file_path ?? input?.path;
    const parts = [input?.pattern, where && shortPath(resolve(APPS_DIRS[0], String(where)))].filter(Boolean);
    if (parts.length) return parts.join(' in ');
  }
  const s = JSON.stringify(input ?? {});
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

async function ask(text) {
  if (running) return;
  const key = await secrets.get(KEY);
  if (!key) {
    post({ type: 'error', text: 'Add your Anthropic API key first.' });
    return;
  }
  approveKey(key);

  const mcpServers = {};
  try {
    const m = await kernel.mcp();
    mcpServers.rednode = { type: 'http', url: m.url, headers: m.headers };
  } catch (err) {
    post({ type: 'notice', text: `Without REDnode's tools: ${err.message}` });
  }

  running = new AbortController();
  post({ type: 'turn-start' });
  console.log(`Turn with ${settings.model}${sessionId ? ' (continuing the chat)' : ''}`);
  try {
    for await (const m of query({
      prompt: notes.length ? `${notes.splice(0).map((n) => `(${n})`).join('\n')}\n\n${text}` : text,
      options: {
        pathToClaudeCodeExecutable: CLAUDE_EXE,
        env: cleanEnv(key),
        cwd: APPS_DIRS[0],
        additionalDirectories: APPS_DIRS.slice(1),
        settingSources: [],
        systemPrompt: briefing(),
        model: settings.model,
        tools: FILE_TOOLS,
        permissionMode: 'default',
        canUseTool,
        hooks: { PreToolUse: [fileGuard] },
        mcpServers,
        includePartialMessages: true,
        resume: sessionId ?? undefined,
        abortController: running,
        maxTurns: 40,
      },
    })) {
      if (m.type === 'system' && m.subtype === 'init') {
        sessionId = m.session_id;
      } else if (m.type === 'stream_event') {
        const ev = m.event;
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') post({ type: 'text-start' });
        else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') post({ type: 'delta', text: ev.delta.text });
        else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          post({ type: 'tool', id: ev.content_block.id, name: toolName(ev.content_block.name) });
        }
      } else if (m.type === 'assistant') {
        for (const b of m.message.content ?? []) {
          if (b.type === 'tool_use') post({ type: 'tool-input', id: b.id, name: toolName(b.name), input: summarize(b.input, b.name) });
        }
      } else if (m.type === 'user') {
        const content = Array.isArray(m.message?.content) ? m.message.content : [];
        for (const b of content) {
          if (b.type !== 'tool_result') continue;
          post({ type: 'tool-done', id: b.tool_use_id, error: !!b.is_error });
          const e = edits.get(b.tool_use_id);
          if (e) {
            if (b.is_error) edits.delete(b.tool_use_id); // nothing changed, nothing to undo
            else post({ type: 'changed', id: e.id, file: shortPath(e.file), created: e.created });
          }
        }
      } else if (m.type === 'result') {
        // total_cost_usd is the session's running total, not this turn's cost.
        // (Found in the C2 test: adding the totals up overcounted.)
        const total = m.total_cost_usd ?? chatCost;
        const cost = Math.max(0, total - chatCost);
        chatCost = Math.max(chatCost, total);
        post({ type: 'turn-end', error: m.is_error ? String(m.result ?? m.subtype) : null, cost, chatCost });
        // Prompt caching is automatic (Claude Code marks the system prompt and the latest
        // messages); these figures show it working: most input should be read from cache.
        const u = m.usage ?? {};
        const cache = `input ${u.input_tokens ?? 0}, from cache ${u.cache_read_input_tokens ?? 0}, to cache ${u.cache_creation_input_tokens ?? 0}`;
        console.log(`Turn done: $${cost.toFixed(4)}, this chat $${chatCost.toFixed(4)}; tokens: ${cache}${m.is_error ? `; error: ${m.result ?? m.subtype}` : ''}`);
      }
    }
  } catch (err) {
    const why = running?.signal.aborted ? 'Stopped.' : err.message.replaceAll(key, '***');
    post({ type: 'turn-end', error: why, cost: 0, chatCost });
    console.log(`Turn ended: ${why}`);
  } finally {
    running = null;
    status();
  }
}

// ---------- messages from the chat window ----------

channel.on(async (msg) => {
  try {
    switch (msg?.type) {
      case 'hello':
        await status();
        break;
      case 'set-key': {
        const key = String(msg.key ?? '').trim();
        if (!key.startsWith('sk-ant-')) {
          post({ type: 'error', text: 'That does not look like an Anthropic API key. They start with sk-ant-.' });
          break;
        }
        await secrets.set(KEY, key);
        console.log('API key saved (encrypted)');
        await status();
        break;
      }
      case 'clear-key':
        await secrets.delete(KEY);
        await status();
        break;
      case 'model':
        if (MODELS.some((x) => x.id === msg.model)) {
          settings.model = msg.model;
          saveSettings();
        }
        await status();
        break;
      case 'ask':
        if (typeof msg.text === 'string' && msg.text.trim()) await ask(msg.text.trim());
        break;
      case 'stop':
        running?.abort();
        break;
      case 'new':
        if (!running) {
          sessionId = null;
          chatCost = 0;
          trustEdits = false;
          notes.length = 0;
          await status();
        }
        break;
      case 'undo':
        undo(Number(msg.id));
        break;
      case 'confirm':
        confirms.get(msg.id)?.(msg.allow === 'all' ? 'all' : !!msg.allow);
        confirms.delete(msg.id);
        break;
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', text: err.message });
  }
});

console.log(`REDagent ready (${MODELS.find((x) => x.id === settings.model)?.name ?? settings.model})`);
status();
