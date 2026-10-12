// REDagent's chat window. The agent itself runs in agent.mjs, REDagent's Node
// mod; the two talk over the package channel (channel in the rednode package).
// A classic script: Chromium does not load module files from a file:// page, but
// a dynamic import of the rednode package (through the page's import map) works.
'use strict';

(async () => {
const { channel } = await import('rednode');

const $ = (id) => document.getElementById(id);
const log = $('log');
let state = { hasKey: false, busy: false };
let current = null; // the assistant message being streamed: { el, text }
const tools = new Map(); // tool use id -> line element
let editingKey = false;

// ---------- Markdown, small and safe: everything is escaped first ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
}

function markdown(text) {
  const out = [];
  const lines = text.split('\n');
  let list = null;
  const closeList = () => {
    if (list) out.push(list === 'ul' ? '</ul>' : '</ol>');
    list = null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('```')) {
      closeList();
      const code = [];
      for (i += 1; i < lines.length && !lines[i].startsWith('```'); i += 1) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const bullet = /^\s*[-*] (.*)$/.exec(line);
    const numbered = /^\s*\d+[.)] (.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)[1])}</li>`);
      continue;
    }
    closeList();
    const heading = /^#{1,6} (.*)$/.exec(line);
    if (heading) out.push(`<h4>${inline(heading[1])}</h4>`);
    else if (/^\|.*\|\s*$/.test(line)) out.push(`<pre><code>${esc(line)}</code></pre>`); // tables stay readable as text
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('');
}

// ---------- the log ----------

const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
function add(el) {
  const stick = atBottom();
  log.append(el);
  if (stick) log.scrollTop = log.scrollHeight;
  return el;
}
function div(className, html) {
  const el = document.createElement('div');
  el.className = className;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

// Streamed text is drawn once per animation frame. The messages to draw are
// queued themselves: a turn may end before the frame comes.
const toRender = new Set();
function renderCurrent() {
  if (!current) return;
  if (!toRender.size) {
    requestAnimationFrame(() => {
      const stick = atBottom();
      for (const msg of toRender) msg.el.innerHTML = markdown(msg.text);
      toRender.clear();
      if (stick) log.scrollTop = log.scrollHeight;
    });
  }
  toRender.add(current);
}

let working = null;
function setWorking(on) {
  if (on && !working) working = add(div('working', 'WORKING...'));
  if (!on && working) {
    working.remove();
    working = null;
  }
  if (working) log.append(working); // keep it last
}

// ---------- views ----------

function show() {
  const needKey = !state.hasKey || editingKey;
  $('setup').hidden = !needKey;
  $('chat').hidden = needKey;
  $('cancel-key').hidden = !state.hasKey;
  $('send').hidden = state.busy;
  $('stop').hidden = !state.busy;
  for (const b of document.querySelectorAll('[data-model]')) {
    if (b.dataset.model === state.model) b.removeAttribute('variant');
    else b.setAttribute('variant', 'ghost');
  }
  $('cost').textContent = `This chat: $${(state.cost ?? 0).toFixed(3)}`;
}

function send() {
  const input = $('prompt');
  const text = (input.value ?? '').trim();
  if (!text || state.busy) return;
  input.setAttribute('value', '');
  input.value = '';
  add(div('msg user', esc(text).replace(/\n/g, '<br>')));
  channel.post({ type: 'ask', text });
}

$('send').addEventListener('click', send);
$('prompt').addEventListener('submit', send);
$('stop').addEventListener('click', () => channel.post({ type: 'stop' }));
$('new').addEventListener('click', () => {
  if (state.busy) return;
  log.replaceChildren();
  current = null;
  channel.post({ type: 'new' });
});
for (const b of document.querySelectorAll('[data-model]')) {
  b.addEventListener('click', () => channel.post({ type: 'model', model: b.dataset.model }));
}
$('key-button').addEventListener('click', () => {
  editingKey = true;
  show();
});
$('cancel-key').addEventListener('click', () => {
  editingKey = false;
  show();
});
$('save-key').addEventListener('click', () => {
  const field = $('key');
  const key = (field.value ?? '').trim();
  field.setAttribute('value', '');
  field.value = '';
  if (!key) return;
  editingKey = false;
  channel.post({ type: 'set-key', key });
});

// ---------- messages from the agent ----------

channel.on((m) => {
  switch (m?.type) {
    case 'status':
      state = m;
      show();
      if (m.hasKey && m.tools !== 'ok' && !log.querySelector('.notice.tools')) {
        add(div('notice tools', esc(`REDnode's tools are off: ${m.tools}`)));
      }
      break;
    case 'turn-start':
      state.busy = true;
      current = null;
      show();
      setWorking(true);
      break;
    case 'text-start':
      current = { el: add(div('msg agent')), text: '' };
      setWorking(true);
      break;
    case 'delta':
      if (!current) current = { el: add(div('msg agent')), text: '' };
      current.text += m.text;
      renderCurrent();
      break;
    case 'tool': {
      current = null;
      const el = add(div('tool', `&#9656; <span class="name">${esc(m.name)}</span> <span class="args"></span>`));
      tools.set(m.id, el);
      setWorking(true);
      break;
    }
    case 'tool-input': {
      const el = tools.get(m.id);
      if (el) el.querySelector('.args').textContent = m.input === '{}' ? '' : m.input;
      break;
    }
    case 'tool-done': {
      const el = tools.get(m.id);
      if (el && m.error) el.classList.add('error');
      break;
    }
    case 'confirm': {
      const card = add(div('confirm', `<div>REDagent wants to <code>${esc(m.text)}</code></div>`));
      const row = div('row');
      const allow = document.createElement('rn-button');
      allow.textContent = 'Allow';
      const deny = document.createElement('rn-button');
      deny.textContent = 'Deny';
      deny.setAttribute('variant', 'ghost');
      const answer = (yes) => {
        channel.post({ type: 'confirm', id: m.id, allow: yes });
        row.replaceWith(div('answer', yes ? 'Allowed' : 'Denied'));
      };
      allow.addEventListener('click', () => answer(true));
      deny.addEventListener('click', () => answer(false));
      row.append(allow, deny);
      card.append(row);
      break;
    }
    case 'turn-end':
      current = null;
      setWorking(false);
      if (m.error) add(div('error', esc(m.error)));
      state.busy = false;
      state.cost = m.chatCost;
      show();
      break;
    case 'notice':
      add(div('notice', esc(m.text)));
      break;
    case 'error':
      add(div('error', esc(m.text)));
      break;
    default:
      break;
  }
});

channel.post({ type: 'hello' });
})();
