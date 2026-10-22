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

import { agent, channel, kernel, pkg, secrets } from 'rednode';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
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
const READ_ONLY = [
  'logs',
  'game_state',
  'perf',
  'gameapi_lookup',
  'window_text',
  'window_image',
  'window_console',
  'game_image',
  'api_read',
  'api_get',
  'tweakdb',
].map((t) => KERNEL + t);
const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const WRITE_TOOLS = ['Write', 'Edit'];
const FILE_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
const BACKUPS = join(pkg.dataDir, 'backups');
const CHATS = join(pkg.dataDir, 'chats');
const KEEP_CHATS = 30;

mkdirSync(CONFIG_DIR, { recursive: true });
mkdirSync(CHATS, { recursive: true });

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

// ---------- chats: kept on disk, so a chat survives a restart of the game ----------
//
// Each chat is a file in the data folder: its Claude Code session (resumed on the
// next question), its cost, its changes (for Undo), and what the chat window
// showed, as compact events the window replays.

let chat = newChat();

function newChat() {
  return { id: `${Date.now()}`, title: '', created: Date.now(), updated: Date.now(), events: [] };
}

function saveChat() {
  if (!chat.events.length) return; // an empty chat is not worth a file
  chat.updated = Date.now();
  chat.sessionId = sessionId;
  chat.cost = chatCost;
  chat.model = settings.model;
  chat.notes = [...notes];
  chat.edits = [...edits].map(([toolUseID, e]) => ({ toolUseID, ...e }));
  writeFileSync(join(CHATS, `${chat.id}.json`), JSON.stringify(chat));
}

const chatFile = (id) => join(CHATS, `${String(id).replace(/[^\d]/g, '')}.json`);

function listChats() {
  const all = [];
  for (const f of readdirSync(CHATS)) {
    if (!f.endsWith('.json')) continue;
    try {
      const c = JSON.parse(readFileSync(join(CHATS, f), 'utf8'));
      all.push({ id: c.id, title: c.title || 'Untitled', updated: c.updated, cost: c.cost ?? 0 });
    } catch {
      // a damaged file: skipped
    }
  }
  return all.sort((a, b) => b.updated - a.updated);
}

function forgetOldChats() {
  for (const c of listChats().slice(KEEP_CHATS)) rmSync(chatFile(c.id), { force: true });
}

// Makes a saved chat the current one.
function openChat(id) {
  const c = JSON.parse(readFileSync(chatFile(id), 'utf8'));
  chat = { id: c.id, title: c.title, created: c.created, updated: c.updated, events: c.events ?? [] };
  sessionId = c.sessionId ?? null;
  chatCost = c.cost ?? 0;
  notes.length = 0;
  notes.push(...(c.notes ?? []));
  edits.clear();
  for (const e of c.edits ?? []) {
    const { toolUseID, ...rest } = e;
    edits.set(toolUseID, rest);
  }
  nextEdit = Math.max(1, ...[...edits.values()].map((e) => e.id + 1));
  // Card ids continue after the restored ones, so an old card never answers a new question.
  nextConfirm = Math.max(nextConfirm, ...chat.events.filter((e) => typeof e.id === 'number').map((e) => e.id + 1));
  trustEdits = false; // trust is never restored: the player gives it again
  // No turn runs in a chat just opened: a card left waiting can no longer be answered.
  for (const e of chat.events) if ((e.type === 'confirm' || e.type === 'change') && !e.answer) e.answer = 'Not answered';
}

// What the chat window showed, kept as it happens.
function record(msg) {
  const ev = chat.events;
  const last = ev[ev.length - 1];
  const find = (type, id) => ev.findLast((e) => e.type === type && e.id === id);
  switch (msg.type) {
    case 'text-start':
      ev.push({ type: 'text', text: '' });
      break;
    case 'delta':
      if (last?.type === 'text') last.text += msg.text;
      else ev.push({ type: 'text', text: msg.text });
      break;
    case 'tool':
      ev.push({ type: 'tool', id: msg.id, name: msg.name, input: '', error: false });
      break;
    case 'tool-input': {
      const t = find('tool', msg.id);
      if (t) t.input = msg.input;
      break;
    }
    case 'tool-done': {
      const t = find('tool', msg.id);
      if (t) t.error = msg.error;
      break;
    }
    case 'confirm':
    case 'change':
      ev.push({ ...msg, answer: null });
      break;
    case 'changed':
      ev.push({ ...msg, undone: false });
      break;
    case 'undone': {
      const c = find('changed', msg.id);
      if (c) c.undone = true;
      break;
    }
    case 'turn-end':
    case 'notice':
    case 'error':
      ev.push({ ...msg });
      break;
    default:
      break;
  }
}

// The player's answer to a card, so a replayed card shows it instead of buttons.
function recordAnswer(id, answer) {
  const card = chat.events.findLast((e) => (e.type === 'confirm' || e.type === 'change') && e.id === id);
  if (card) card.answer = answer;
}

// Saved half a second after the last change, so a game that closes mid-turn keeps
// the chat up to that moment.
let saveTimer = null;
const post = (msg) => {
  record(msg);
  channel.post(msg);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveChat, 500);
};

const restore = () => channel.post({ type: 'restore', chat: { id: chat.id, title: chat.title }, events: chat.events });

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

// True when dir is strictly inside root.
function isInside(root, dir) {
  const rel = relative(root, dir);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function undo(editId) {
  const e = [...edits.values()].find((x) => x.id === editId);
  if (!e || e.undone) return;
  if (e.backup) copyFileSync(e.backup, e.file);
  else {
    rmSync(e.file, { force: true });
    // Folders the new file needed, now empty, go too, up to the apps folder.
    for (let dir = dirname(e.file); APPS_DIRS.some((d) => isInside(d, dir)); dir = dirname(dir)) {
      try {
        rmdirSync(dir); // fails when the folder is not empty
      } catch {
        break;
      }
    }
  }
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
  if (t === 'apps') {
    const what = {
      'pin-launcher': (id) => `pin the package "${id}" to the launcher`,
      'unpin-launcher': (id) => `unpin the package "${id}" from the launcher`,
      'pin-hud': (id) => `pin the package "${id}" to the HUD (shown during gameplay)`,
      'unpin-hud': (id) => `unpin the package "${id}" from the HUD (shown only while you interact)`,
    }[input.action];
    return what ? what(input.id) : `${input.action} the package "${input.id}"`;
  }
  if (t === 'archives_reload') {
    const files = (input.files ?? []).map((f) => String(f).split(/[\\/]/).pop());
    return `swap ${files.join(', ')} into the running game (a broken archive can crash the game)`;
  }
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
  if (t === 'api_call' || t === 'apps' || t === 'archives_reload') {
    const ok = await askPlayer(describe(name, input), signal);
    return ok
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: 'The player said no. Do not try it another way; ask what they want instead.' };
  }
  return { behavior: 'deny', message: `REDagent cannot use ${name} in this version.` };
}

// ---------- a turn ----------

// Claude Code runs in the first apps folder; it cannot start in one that does not exist.
function ensureWorkDir() {
  mkdirSync(APPS_DIRS[0], { recursive: true });
}

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

// Claude Code keeps each session in its config folder. A chat whose session is gone
// (the folder was cleared) starts afresh instead of failing.
function sessionExists(id) {
  const projects = join(CONFIG_DIR, 'projects');
  if (!existsSync(projects)) return false;
  return readdirSync(projects).some((d) => existsSync(join(projects, d, `${id}.jsonl`)));
}

async function ask(text) {
  if (running) return;
  const key = await secrets.get(KEY);
  if (!key) {
    post({ type: 'error', text: 'Add your Anthropic API key first.' });
    return;
  }
  approveKey(key);
  ensureWorkDir();

  const mcpServers = {};
  try {
    const m = await kernel.mcp();
    mcpServers.rednode = { type: 'http', url: m.url, headers: m.headers };
  } catch (err) {
    post({ type: 'notice', text: `Without REDnode's tools: ${err.message}` });
  }

  if (!chat.title) chat.title = text.replace(/\s+/g, ' ').slice(0, 60);
  chat.events.push({ type: 'user', text });
  if (chat.events.length === 1) forgetOldChats();
  saveChat();

  if (sessionId && !sessionExists(sessionId)) {
    sessionId = null;
    post({ type: 'notice', text: "Claude no longer has this chat's earlier turns, so it starts afresh from this question." });
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
    // A card still waiting when the turn ended was never answered.
    for (const e of chat.events) if ((e.type === 'confirm' || e.type === 'change') && !e.answer) e.answer = 'Not answered';
    saveChat();
    status();
  }
}

// ---------- messages from the chat window ----------

channel.on(async (msg) => {
  try {
    switch (msg?.type) {
      case 'hello':
        await status();
        restore();
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
          saveChat();
          chat = newChat();
          sessionId = null;
          chatCost = 0;
          trustEdits = false;
          notes.length = 0;
          edits.clear();
          await status();
        }
        break;
      case 'undo':
        undo(Number(msg.id));
        saveChat();
        break;
      case 'confirm':
        if (confirms.has(msg.id)) {
          recordAnswer(msg.id, msg.allow === 'all' ? 'Allowed, with every change in this chat' : msg.allow ? 'Allowed' : 'Denied');
          confirms.get(msg.id)(msg.allow === 'all' ? 'all' : !!msg.allow);
          confirms.delete(msg.id);
        }
        break;
      case 'history':
        channel.post({ type: 'history', current: chat.id, chats: listChats() });
        break;
      case 'mods':
        postMods();
        break;
      case 'mod-settings': {
        const st = modSettings[msg.id] && modState(msg.id);
        if (st) {
          if (Number.isFinite(Number(msg.limit)) && Number(msg.limit) >= 0) st.limit = Math.min(100, Number(msg.limit));
          if (typeof msg.paused === 'boolean') st.paused = msg.paused;
          if (typeof msg.pictures === 'boolean') st.pictures = msg.pictures;
          saveMods();
          console.log(`Mod ${msg.id}: limit $${st.limit.toFixed(2)} a day${st.paused ? ', paused' : ''}${st.pictures ? ', pictures on' : ''}`);
        }
        postMods();
        break;
      }
      case 'open-chat':
        if (!running && String(msg.id) !== chat.id) {
          saveChat();
          openChat(msg.id);
          restore();
          await status();
          console.log(`Opened the chat "${chat.title}"`);
        }
        break;
      case 'delete-chat':
        if (String(msg.id) !== chat.id) rmSync(chatFile(msg.id), { force: true });
        channel.post({ type: 'history', current: chat.id, chats: listChats() });
        break;
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', text: err.message });
  }
});

// The latest chat comes back, so a restart of the game does not lose it.
const latest = listChats()[0];
if (latest) {
  try {
    openChat(latest.id);
  } catch (err) {
    console.log(`Could not open the last chat: ${err.message}`);
  }
}
// ---------- questions from other mods (C5) ----------
//
// Mods that ask for the "agent" permission, once the player allows it, ask with
// agent.ask in the rednode package; the host passes their questions here. They are
// answered one at a time, apart from the player's chat, on Sonnet 5.5, with
// read-only tools: never files written or the game changed. Pictures (window and
// game screen) are off unless the player switches them on for that mod. Each mod
// has a daily spending limit, $0.25 unless the player sets another, and can be
// paused, in the Mods view.

const MOD_MODEL = 'claude-sonnet-5-5';
const DAILY_LIMIT = 0.25;
const MODS_FILE = join(pkg.dataDir, 'mods.json');
const PICTURES = ['window_image', 'game_image'].map((t) => KERNEL + t);

let modSettings = {};
try {
  modSettings = JSON.parse(readFileSync(MODS_FILE, 'utf8'));
} catch {
  // none yet
}
const saveMods = () => writeFileSync(MODS_FILE, JSON.stringify(modSettings, null, 2));
const localDay = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, the player's own day

function modState(id, name) {
  const st = (modSettings[id] ??= { limit: DAILY_LIMIT, paused: false, pictures: false, day: '', today: 0, total: 0, recent: [] });
  if (name) st.name = name;
  if (st.day !== localDay()) {
    st.day = localDay();
    st.today = 0;
  }
  return st;
}

function postMods() {
  const mods = Object.entries(modSettings).map(([id, st]) => ({ id, ...modState(id) }));
  channel.post({ type: 'mods', mods: mods.sort((a, b) => (b.recent[0]?.at ?? 0) - (a.recent[0]?.at ?? 0)) });
}

function modBriefing(from) {
  return `You are REDagent, powered by Claude, inside Cyberpunk 2077 with REDnode. The REDnode mod "${from.name}" (id ${from.id}) asks you a question for its player, and shows your answer in its own window.
- Answer the question briefly and directly, in plain text or simple Markdown: a few sentences unless it needs more.
- You can only read: REDnode's logs, the game state, the game API (look a function up with gameapi_lookup, then read with api_read or api_get), TweakDB, overlay windows and the files in the apps folders. You cannot change files or the game, and you cannot ask the player anything.
- Each tool call costs the player. Use tools only when the answer needs live data; context the mod sends comes with the question.
- If the mod asks for something you cannot do, say so in one sentence.`;
}

let modQueue = Promise.resolve();

async function answerMod(req, st) {
  const key = await secrets.get(KEY);
  if (!key) throw new Error('REDagent has no API key yet. The player adds it in the REDagent window.');
  approveKey(key);
  ensureWorkDir();
  const mcpServers = {};
  try {
    const m = await kernel.mcp();
    mcpServers.rednode = { type: 'http', url: m.url, headers: m.headers };
  } catch {
    // without REDnode's tools: the model and the mod's context only
  }
  const readOnly = new Set([...READ_TOOLS, ...READ_ONLY.filter((t) => st.pictures || !PICTURES.includes(t))]);
  const canUse = async (name, input) => {
    if (readOnly.has(name)) return { behavior: 'allow', updatedInput: input };
    if (name === `${KERNEL}apps` && (!input.action || input.action === 'list')) return { behavior: 'allow', updatedInput: input };
    return { behavior: 'deny', message: 'Questions from mods may only read; this tool is not available to them.' };
  };
  const prompt =
    req.context === undefined ? req.prompt : `${req.prompt}\n\nContext from the mod (JSON):\n${JSON.stringify(req.context).slice(0, 8000)}`;
  const stop = new AbortController();
  req.signal.addEventListener('abort', () => stop.abort());
  console.log(`Question from ${req.from.name}: ${req.prompt.replace(/\s+/g, ' ').slice(0, 80)}`);
  let text = '';
  let cost = 0;
  for await (const m of query({
    prompt,
    options: {
      pathToClaudeCodeExecutable: CLAUDE_EXE,
      env: cleanEnv(key),
      cwd: APPS_DIRS[0],
      additionalDirectories: APPS_DIRS.slice(1),
      settingSources: [],
      systemPrompt: modBriefing(req.from),
      model: MOD_MODEL,
      tools: READ_TOOLS,
      permissionMode: 'default',
      canUseTool: canUse,
      hooks: { PreToolUse: [fileGuard] },
      mcpServers,
      includePartialMessages: true,
      abortController: stop,
      maxTurns: 8,
    },
  })) {
    if (m.type === 'stream_event' && m.event.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') {
      text += m.event.delta.text;
      req.write(m.event.delta.text);
    } else if (m.type === 'result') {
      cost = m.total_cost_usd ?? 0;
      if (m.is_error) throw new Error(String(m.result ?? m.subtype).replaceAll(key, '***'));
    }
  }
  st.today += cost;
  st.total += cost;
  st.recent = [{ at: Date.now(), prompt: req.prompt.replace(/\s+/g, ' ').slice(0, 120), cost }, ...st.recent].slice(0, 5);
  saveMods();
  postMods();
  console.log(`Answered ${req.from.name} for $${cost.toFixed(4)} (today $${st.today.toFixed(3)} of $${st.limit.toFixed(2)})`);
  return { text, cost };
}

agent.serve(async (req) => {
  const st = modState(req.from.id, req.from.name);
  saveMods();
  if (st.paused) throw new Error('The player has paused this mod in REDagent.');
  if (st.today >= st.limit) throw new Error(`This mod has reached its daily limit of $${st.limit.toFixed(2)} in REDagent.`);
  const run = modQueue.then(() => {
    if (req.signal.aborted) throw new Error('Stopped.');
    return answerMod(req, st);
  });
  modQueue = run.catch(() => {});
  return run;
});

console.log(`REDagent ready (${MODELS.find((x) => x.id === settings.model)?.name ?? settings.model})${chat.events.length ? `, chat "${chat.title}"` : ''}`);
status();
