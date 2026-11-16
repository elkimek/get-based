import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { readNativeFunctionCoverage } from '../scripts/native-coverage-receipt.mjs';

it('regenerates authenticated Node and jsdom coverage witnesses on repeated cached runs', async () => {
  const root = process.cwd(), fixture = fs.mkdtempSync(path.join(root, 'tests/.native-coverage-producer-'));
  try {
    fs.mkdirSync(path.join(fixture, 'js'));
    fs.mkdirSync(path.join(fixture, 'tests'));
    fs.symlinkSync(path.join(root, 'scripts'), path.join(fixture, 'scripts'), 'dir');
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const source = 'export function increment(value) { return value + 1; }';
    fs.writeFileSync(path.join(fixture, 'js/fixture.ts'), source);
    fs.writeFileSync(path.join(fixture, 'js/fixture.js'), source);
    for (const environment of ['node', 'jsdom']) fs.writeFileSync(path.join(fixture, `tests/${environment}.test.ts`), `// @vitest-environment ${environment}
import { expect, it } from 'vitest';
import { increment } from '../js/fixture.js';
it('executes the ${environment} production source', () => { expect(increment(2)).toBe(3); });
`);
    const config = path.join(fixture, 'vitest.config.mts'), reports = path.join(fixture, 'tests/reports');
    fs.writeFileSync(config, `import base from ${JSON.stringify(path.join(root, 'vitest.config.js'))};
export default {...base, root: ${JSON.stringify(fixture)}, test: {...base.test, fsModuleCache: true,
  setupFiles: [], globalSetup: [], include: ['tests/node.test.ts', 'tests/jsdom.test.ts'],
  coverage: {...base.test.coverage, enabled: true, customProviderModule: ${JSON.stringify(path.join(fixture, 'scripts/native-coverage-runtime.mjs'))}, reportsDirectory: ${JSON.stringify(reports)}}}};
`);
    const runIds: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config, '--maxWorkers=2'], { cwd: fixture, timeout: 45000, maxBuffer: 1024 * 1024 });
      const data = await readNativeFunctionCoverage(path.join(reports, 'coverage-functions.json'), { root: fixture });
      runIds.push(data.runId);
      const captures = JSON.parse(fs.readFileSync(path.join(reports, 'captures.json'), 'utf8')) as Array<{ environment: string; testFiles: string[] }>;
      expect(captures.map(capture => capture.environment).sort()).toEqual(['client', 'ssr']);
      expect(captures.flatMap(capture => capture.testFiles).sort()).toEqual(['tests/jsdom.test.ts', 'tests/node.test.ts']);
      expect(data.files).toHaveLength(1);
      expect(data.files[0]!.file).toBe('js/fixture.js');
      expect(data.files[0]!.called.some(fn => fn.count > 0)).toBe(true);
    }
    expect(new Set(runIds).size).toBe(2);
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
}, 100000);
