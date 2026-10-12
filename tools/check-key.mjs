// Checks that an Anthropic API key works with REDagent's agent, outside the game.
//
//   cd redagent && npm install          (once)
//   node tools/check-key.mjs
//
// Asks for the key without showing it, makes one tiny call through the Claude
// Agent SDK the way REDagent does, and prints the reply and what it cost. The key
// is used for this one call only: it is not printed, saved or sent anywhere but
// to Anthropic. Claude Code's own login on this PC is never used.

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The SDK is installed in the package folder, redagent/, not beside this script.
const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'redagent');
const require = createRequire(join(pkg, 'package.json'));
const { query } = await import(
  pathToFileURL(join(pkg, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs')).href
);

// Reads a line from the terminal without echoing it.
function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const key = process.env.REDAGENT_KEY || (await askHidden('Anthropic API key (not shown): '));
if (!key.startsWith('sk-ant-')) {
  console.log('That does not look like an Anthropic API key (they start with sk-ant-).');
  process.exit(1);
}

const exe = join(dirname(require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/package.json')), 'claude.exe');
const configDir = mkdtempSync(join(tmpdir(), 'redagent-check-'));
// Claude Code uses a key from the environment only once it has been approved,
// and remembers approvals in .claude.json in its config folder by the key's last
// 20 characters. REDagent's config folder is its own, so it approves the key there.
writeFileSync(
  join(configDir, '.claude.json'),
  JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: [key.slice(-20)], rejected: [] } }),
);
const env = {
  ...process.env,
  ANTHROPIC_API_KEY: key,
  CLAUDE_CONFIG_DIR: configDir, // never the Claude Code login on this PC
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};
delete env.ANTHROPIC_AUTH_TOKEN;
delete env.CLAUDE_CODE_OAUTH_TOKEN;
delete env.REDAGENT_KEY;

const started = Date.now();
let ok = false;
// A refused key makes Claude Code retry for a long time; give up after 30 seconds.
const abortController = new AbortController();
const timer = setTimeout(() => abortController.abort(), 30000);
try {
  for await (const m of query({
    prompt: 'In one short sentence, what is Night City?',
    options: {
      pathToClaudeCodeExecutable: exe,
      env,
      cwd: configDir,
      settingSources: [],
      systemPrompt: 'You answer in one short line.',
      tools: [],
      permissionMode: 'dontAsk',
      maxTurns: 1,
      model: 'claude-opus-5-5',
      abortController,
    },
  })) {
    if (m.type === 'result') {
      ok = !m.is_error;
      console.log(ok ? `Reply: ${m.result}` : `Failed: ${m.result ?? m.subtype}`);
      if (typeof m.total_cost_usd === 'number') console.log(`Cost: $${m.total_cost_usd.toFixed(5)}`);
    }
  }
} catch (err) {
  const why = abortController.signal.aborted ? 'no answer within 30 seconds: Anthropic probably refused the key' : err.message;
  console.log(`Failed: ${why.replace(key, '***')}`);
} finally {
  clearTimeout(timer);
  rmSync(configDir, { recursive: true, force: true });
}
console.log(`${ok ? 'The key works.' : 'The key did not work.'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(ok ? 0 : 1);
