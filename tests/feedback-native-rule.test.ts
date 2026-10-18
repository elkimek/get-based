import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { restoreFeedbackNoticeRule } from '../scripts/feedback-native-rule.mjs';
const bytes = readFileSync('tests/fixtures/feedback/original-notice.json');
const fixture = JSON.parse(bytes.toString()) as {
  schemaVersion: number; originalNoticeBody: string; selector: string; loweredBlock: string;
  originalModalBaseSHA256: string; compilerInputSHA256: string;
};
const recipe = '@utility feedback-notice-block {\n' + fixture.originalNoticeBody + '\n}\n';
const original = fixture.selector + ' {\n' + fixture.originalNoticeBody + '\n}';
const prefix = '/* unrelated before */\n.foreign-a { background: red; }\n';
const suffix = '\n@media (width <= 720px) { .foreign-b { padding: 2px; } }\n/* untouched end */\n';
const compiled = prefix + fixture.loweredBlock + suffix;
it('pins the independent original eight declarations and observed compiler shape', () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('f60da50a48ff8ce7d67c48973efb15801bd07a1923699a2537d22a3f51f08420');
  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.originalNoticeBody.split('\n')).toHaveLength(8);
  const ownedSource = readFileSync('css/feedback.tailwind.css', 'utf8');
  expect([...ownedSource.matchAll(/^@utility feedback-notice-block \{\n([^{}]*)^\}/gm)].map(m => m[0])).toEqual([recipe.trimEnd()]);
});
it('restores the exact original unsupported/supported rule with every foreign byte unchanged', () => {
  expect(restoreFeedbackNoticeRule(compiled, recipe)).toBe(prefix + original + suffix);
});
const corruptions: [string, string, string][] = [
  ['missing selector', prefix + suffix, recipe],
  ['duplicate selector', compiled + fixture.loweredBlock, recipe],
  ['different selector scope', compiled.replace('#feedback-modal *', '#foreign *'), recipe],
  ['missing recipe', compiled, ''],
  ['duplicate recipe', compiled, recipe + recipe],
  ['missing declaration', compiled, recipe.replace('  color: var(--text-muted);\n', '')],
  ['swapped declaration order', compiled, recipe.replace('  margin: 0;\n  padding: 10px 12px;', '  padding: 10px 12px;\n  margin: 0;')],
  ['unsupported recipe value', compiled, recipe.replace('76%', '75%')],
  ['compiled declaration drift', compiled.replace('font-size: 11.5px', 'font-size: 12px'), recipe],
  ['altered fallback', compiled.replace('background: var(--bg-card)', 'background: transparent'), recipe],
  ['altered support condition', compiled.replace('in lab, red, red', 'in srgb, red, red'), recipe],
  ['extra support declaration', compiled.replace('  @supports', '  opacity: 1;\n  @supports'), recipe],
  ['extra support node', compiled.replace('  @supports', '  @supports (display: grid) { color: red; }\n  @supports'), recipe],
  ['already restored block', prefix + original + suffix, recipe],
];
it.each(corruptions)('rejects %s without a fallback rewrite', (_name, input, source) => {
  expect(() => restoreFeedbackNoticeRule(input, source)).toThrow();
});
