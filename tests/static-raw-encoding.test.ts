import {expect, it} from 'vitest';
import {encodeStaticRawModule, verifyStaticRawModule} from '../scripts/static-raw-encoding.mjs';
it('retains bindings, imports, tagged raw text and verbatim legal notices', async () => {
  const source = '/*! Synthetic MIT License */\nimport {value} from "./value.js";\nexport const originalName = value;\nconst tag = x => x.raw; export const text = tag`\\u0061`;';
  const output = await encodeStaticRawModule('/js/synthetic.js', source);
  expect(output).toContain('Synthetic MIT License');
  await verifyStaticRawModule('/js/synthetic.js', source, output);
  await expect(verifyStaticRawModule('/js/synthetic.js', source, output.replace('originalName', 'renamed'))).rejects.toThrow('Exact current raw-module encoding');
});
