import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compileCategoryViewsNativeStyles } from '../scripts/category-views-native-styles.mjs';

const root = path.resolve('.');
const inputPath = path.join(root, 'css/category-views.tailwind.css');
const input = readFileSync(inputPath, 'utf8');
const coarseReceiver = '.chart-layers-row { @apply gb:chart-layers-coarse; }';

// Synthetic foreign CSS intentionally contains the multiline var-containing value
// that a whole-sheet Tailwind serialization collapses. It is not a current-output oracle.
const foreign = `/* foreign bytes, including comments and blank lines */
.foreign-category-background {
  background:
    linear-gradient(135deg, var(--accent), transparent),
    var(--bg-card);
}

@media (max-width: 601px) {
  .foreign-category-nested { color: var(--text-muted); }
}
`;
const coarseSibling = '/* foreign coarse sibling */\n  .foreign-category-touch { min-height: 45px; }\n  ';

it('expands owned recipes without reserializing foreign multiline values or media siblings', async () => {
  expect(input).toContain(coarseReceiver);
  const source = input.replace(coarseReceiver, coarseSibling + coarseReceiver) + '\n' + foreign;
  const { css } = await compileCategoryViewsNativeStyles(source, inputPath, root);
  expect(css).toContain(foreign);
  expect(css).toContain(coarseSibling);
  expect(css.indexOf(coarseSibling)).toBeLessThan(css.lastIndexOf('.chart-layers-row'));
  expect(css).toMatch(/\.compare-swap-btn \{\s*min-height: 44px;\s*\}/);
  expect(css).not.toContain('@apply');
  expect(css).not.toContain('@utility');
  expect(css).not.toContain('@import "tailwindcss"');
});

const invalidInputs: [string, () => string][] = [
  ['unknown receiver utility', () => input.replace('@apply gb:chart-layers-wrapper;', '@apply gb:chart-layers-unknown;')],
  ['duplicate owned selector even without an apply', () => input + '\n.chart-layers-wrapper { position: relative; }\n'],
  ['coarse receiver moved outside its native media group', () => input.replace(coarseReceiver, '') + '\n' + coarseReceiver + '\n'],
  ['duplicate semantic recipe', () => input + '\n@utility chart-layers-wrapper { position: relative; }\n'],
  ['extra undeclared receiver declaration', () => input.replace('@apply gb:chart-layers-trigger;', '@apply gb:chart-layers-trigger; color: red;')],
];
it.each(invalidInputs)('rejects %s before copying an invalid ownership span', async (_name, mutate) => {
  const changed = mutate();
  expect(changed).not.toBe(input);
  await expect(compileCategoryViewsNativeStyles(changed, inputPath, root)).rejects.toMatchObject({ code: 'ERR_ASSERTION' });
});
