// A small line diff for REDagent's change cards: which lines a change removes
// and adds, with a few lines of context around each change.

const MAX_CELLS = 4_000_000; // beyond this, show the whole file as replaced

/**
 * @param {string} before  the file now ('' for a new file)
 * @param {string} after   the file after the change
 * @param {number} context lines of context around each change
 * @returns {{ lines: { t: ' ' | '+' | '-' | '@', text: string }[], added: number, removed: number }}
 */
export function diffLines(before, after, context = 3) {
  // A final newline ends the last line; it does not start an empty one.
  const split = (text) => (text === '' ? [] : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));
  const a = split(before);
  const b = split(after);

  // Trim the common start and end first: most edits touch a small part of a file.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let ops; // [type, text] for the middle
  if (midA.length * midB.length > MAX_CELLS) {
    ops = [...midA.map((x) => ['-', x]), ...midB.map((x) => ['+', x])];
  } else {
    // Longest common subsequence, then walk it.
    const n = midA.length;
    const m = midB.length;
    const lcs = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * (m + 1) + j] =
          midA[i] === midB[j] ? lcs[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
      }
    }
    ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push([' ', midA[i]]);
        i += 1;
        j += 1;
      } else if (j < m && (i >= n || lcs[i * (m + 1) + j + 1] > lcs[(i + 1) * (m + 1) + j])) {
        ops.push(['+', midB[j]]);
        j += 1;
      } else {
        ops.push(['-', midA[i]]);
        i += 1;
      }
    }
  }

  const all = [...a.slice(0, start).map((x) => [' ', x]), ...ops, ...a.slice(endA).map((x) => [' ', x])];
  const changed = all.map(([t]) => t !== ' ');
  const lines = [];
  let skipped = 0;
  for (let k = 0; k < all.length; k += 1) {
    let near = false;
    for (let d = -context; d <= context && !near; d += 1) near = !!changed[k + d];
    if (near) {
      if (skipped) lines.push({ t: '@', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
      skipped = 0;
      lines.push({ t: all[k][0], text: all[k][1] });
    } else {
      skipped += 1;
    }
  }
  if (skipped && lines.length) lines.push({ t: '@', text: `... ${skipped} unchanged line${skipped === 1 ? '' : 's'}` });
  return {
    lines,
    added: ops.filter(([t]) => t === '+').length,
    removed: ops.filter(([t]) => t === '-').length,
  };
}
