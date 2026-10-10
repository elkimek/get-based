// @vitest-environment jsdom
import { expect, it } from 'vitest';
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
