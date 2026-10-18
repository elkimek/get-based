// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {readFileSync} from 'node:fs';
import {renderUtilsPrompt} from '../js/utils-dialog-rendering.js';
import {readFrozen} from './helpers/knowledge-base-current-capture.mjs';
import {qualifySharedUtilsNativeDeclarations, qualifySharedUtilsOwners} from './helpers/knowledge-base-utils-dialog-contract.js';
import { equalOriginalDOM } from './helpers/knowledge-base-frozen-contract.js';

it('normalizes reviewed renderer formatting while retaining literal and native contracts', () => {
  const original = '<span class="kb-model-copy">\n  <b>Profile</b>\n  <small>Details</small>\n</span>';
  const authored = '<!--[0--><span class="kb-model-copy"><b>Profile</b> <small>Details</small></span><!--]-->';
  expect(() => equalOriginalDOM(original, authored)).not.toThrow();
  expect(() => equalOriginalDOM(
    '<select id="lens-library-select">\n<option value="x">Loading…</option>\n</select>',
    '<select id="lens-library-select"><option value="x">Loading…</option></select>',
  )).not.toThrow();

  expect(() => equalOriginalDOM(
    '<details class="kb-setup-details">\n<summary>Setup</summary>\n<div>Exact instructions</div>\n</details>',
    '<details class="kb-setup-details"><summary>Setup</summary> <div>Exact instructions</div></details>',
  )).not.toThrow();
  expect(() => equalOriginalDOM(
    '<div class="kb-footer-secondary">\n  \n</div>',
    '<div class="kb-footer-secondary"> </div>',
  )).not.toThrow();

  for (const [before, after] of [
    ['<span>one <b>two</b></span>', '<span>one<b>two</b></span>'],
    ['<span class="kb-model-meta">10&nbsp;MB</span>', '<span class="kb-model-meta">10 MB</span>'],
    ['<span>\n<b>one</b>\n</span>', '<span><b>one</b></span>'],
    ['<div> </div>', '<div></div>'],
    ['<span>exact</span>', '<!--unknown--><span>exact</span>'],
    ['<span>exact</span>', '<!--[2--><span>exact</span>'],
    ['<span>exact</span>', '<span class="unreviewed-utility">exact</span>'],
    ['<input value="saved">', '<input value="changed">'],
    ['<input type="checkbox" checked>', '<input type="checkbox">'],
  ]) {
    expect(() => equalOriginalDOM(before!, after!)).toThrow();
  }
});


it('qualifies only the exact independently reviewed shared Utils prompt receivers', () => {
  const original = readFrozen<{samples: Array<{kind: string; name: string; html: string}>}>('candidate-original.json').samples.find(sample => sample.kind === 'library-create' && sample.name === 'empty-models-plain-name')!.html;
  const current = renderUtilsPrompt({message: 'Name for the new library?', inputType: 'text', defaultValue: '', placeholder: 'e.g. Research Papers', cancelLabel: 'Cancel', okLabel: 'Create'});
  expect(() => equalOriginalDOM(current, original)).not.toThrow();
  for (const corrupt of [
    current.replace('gb:utils-dialog-panel:utils-dialog-panel', 'unreviewed-utility'),
    current.replace('gb:utils-dialog-input-focus:utils-dialog-input-focus', ''),
    current.replace('gb:utils-dialog-message:utils-dialog-message', 'gb:utils-dialog-panel:utils-dialog-panel'),
    current.replace('confirm-actions gb:', 'confirm-actions unreviewed-utility gb:'),
    current.replace('confirm-input gb:', 'confirm-input gb:utils-dialog-input:utils-dialog-input gb:'),
    current.replace('value=""', 'value="changed"'),
    current.replace('Name for the new library?', 'Changed prompt'),
  ]) expect(() => equalOriginalDOM(corrupt, original)).toThrow();
  expect(() => equalOriginalDOM('<div class="gb:utils-dialog-panel:utils-dialog-panel">Other owner</div>', '<div>Other owner</div>')).toThrow();
});

it('rejects changed Utils source ownership, CSS, native values, priorities and declaration order', () => {
  expect(() => qualifySharedUtilsOwners()).not.toThrow();
  for (const changed of ['js/utils-dialog-classes.ts', 'js/components/UtilsPromptPresentation.svelte', 'css/utils-dialog.tailwind.css']) {
    expect(() => qualifySharedUtilsOwners(file => readFileSync(file, 'utf8') + (file === changed ? '\n/* changed */' : ''))).toThrow('Reviewed shared Utils owner changed');
  }
  const authored = readFileSync('css/utils-dialog.tailwind.css', 'utf8'), native = readFileSync('tests/fixtures/modal-shared-remaining-base-original.css', 'utf8');
  for (const corrupt of [authored.replace('padding: 24px 26px', 'padding: 25px 26px'), authored.replace('font-size: 15px', 'font-size: 15px !important'), authored.replace('display: flex;\n  gap: 10px;', 'gap: 10px;\n  display: flex;')]) expect(() => qualifySharedUtilsNativeDeclarations(corrupt, native)).toThrow();
});
