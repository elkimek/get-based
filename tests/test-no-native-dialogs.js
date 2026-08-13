#!/usr/bin/env node
// Guard against window.prompt() / window.confirm() / window.alert() regressions.
// Native blocking dialogs are a UX liability (they freeze the tab, can't be
// styled, don't fit dark mode) and flat-out unavailable in several common
// contexts — sandboxed iframes, file:// PWAs, cross-origin workers, some
// enterprise browser configurations. We replaced all three with custom
// Promise-based dialogs (`showConfirmDialog`, `showPromptDialog`, and
// `showNotification`) and this test pins the replacement: any new call site
// with a raw window.prompt/confirm/alert breaks CI before it reaches users.
//
// Allowed references (docstrings only, never active calls):
//   - js/utils.js   — docstring for the showPromptDialog replacement
//   - js/lens.js    — comment referencing the native API in passing

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const JS_DIR = path.join(ROOT, 'js');

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

function findCalls(source, fnName) {
  // Split on newlines, strip single-line comments before matching so that
  // comments like "// window.prompt() is disabled" don't trigger.
  const hits = [];
  const lines = source.split('\n');
  const callRe = new RegExp(`\\b${fnName}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Drop the // comment tail so matches inside comments are ignored.
    const commentIdx = (() => {
      // Very naive strip: find the first // not inside a string literal.
      let inStr = null;
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (inStr) {
          if (c === '\\') { j++; continue; }
          if (c === inStr) inStr = null;
        } else {
          if (c === '"' || c === "'" || c === '`') inStr = c;
          else if (c === '/' && line[j + 1] === '/') return j;
        }
      }
      return -1;
    })();
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    if (callRe.test(code)) {
      // Filter methods (`foo.prompt(`), we only flag bare / window.prompt.
      // Match: start-of-line, whitespace, `=`, `(`, `{`, `;`, `!`, or `window.`.
      const idx = code.search(callRe);
      const before = code.slice(0, idx);
      // Look at the immediate preceding non-space char.
      const prev = before.replace(/\s+$/, '').slice(-1);
      if (prev && /[.\w]/.test(prev) && !before.endsWith('window.')) continue;
      hits.push({ line: i + 1, text: line.trim() });
    }
  }
  return hits;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith('.js')) yield p;
  }
}

function main() {
  console.log('=== test-no-native-dialogs ===\n');
  const offenders = { prompt: [], alert: [], confirm: [] };
  for (const file of walk(JS_DIR)) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    for (const fn of ['prompt', 'alert', 'confirm']) {
      for (const hit of findCalls(src, fn)) {
        offenders[fn].push({ file: rel, ...hit });
      }
    }
  }

  for (const fn of ['prompt', 'alert', 'confirm']) {
    const hits = offenders[fn];
    if (hits.length === 0) {
      assert(`no window.${fn}() call sites in js/`, true);
    } else {
      const detail = hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join('\n    ');
      assert(`no window.${fn}() call sites in js/`, false,
        `${hits.length} hit(s):\n    ${detail}\n  Use showPromptDialog / showConfirmDialog / showNotification instead.`);
    }
  }

  // Sanity check: the showPromptDialog export exists.
  const utils = fs.readFileSync(path.join(JS_DIR, 'utils.js'), 'utf8');
  assert('utils.js exports showPromptDialog',
    /export function showPromptDialog/.test(utils));
  assert('showPromptDialog stays module-only',
    !/Object\.assign\(window,[^)]*showPromptDialog/.test(utils));
  assert('showPromptDialog uses a normal text control',
    /id="prompt-dialog-input" class="confirm-input"/.test(utils));
  assert('showPromptDialog uses a primary, non-destructive action',
    /confirm-btn confirm-btn-primary" id="prompt-ok"/.test(utils)
      && !/confirm-btn-danger" id="prompt-ok"/.test(utils));

  console.log(`\nTotal: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
