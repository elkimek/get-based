import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {sealCompiledInputs, restoreCompiledInputs, verifyCompiledInputs} from '../scripts/ci-compiled.mjs';

const cleanup: string[] = [];
afterEach(async () => {for (const root of cleanup.splice(0)) await fs.rm(root, {recursive: true, force: true});});
async function fixture() {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'getbased-compiled-')); cleanup.push(root);
  const write = async (file: string, body: string) => {await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true}); await fs.writeFile(path.join(root, file), body);};
  await write('.gitignore', '.local-notes/\n*.js\n*.map\ncss/feature.css\n');
  await write('js/feature.ts', 'export const value = 1;'); await write('js/feature.js', 'export const value = 1;');
  await write('js/feature.js.map', '{"sources":["feature.ts"]}');
  await write('css/feature.tailwind.css', '@import "tailwindcss";'); await write('css/feature.css', '.feature{display:flex}');
  await write('js/Panel.svelte', '<p>Feature</p>'); await write('js/Panel.svelte.native.js', 'export default function Panel(){}');
  execFileSync('git', ['init'], {cwd: root, stdio: 'ignore'});
  execFileSync('git', ['-c', 'user.name=Synthetic CI', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', 'Synthetic CI'], {cwd: root, stdio: 'ignore'});
  return {root, write, transport: path.join(root, '.local-notes/ci/compiled')};
}
describe('portable exact compiler output reuse', () => {
  it('restores into a different checkout without shipping native dependencies or changing any authored input', async () => {
    const sample = await fixture(), manifest = await sealCompiledInputs(sample.root);
    expect(manifest.outputs.map(row => row.file)).toEqual(['css/feature.css', 'js/Panel.svelte.native.js', 'js/feature.js', 'js/feature.js.map']);
    expect(manifest.inputs.every(row => !row.file.startsWith('node_modules/'))).toBe(true);
    const consumer = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'getbased-compiled-consumer-')); cleanup.push(consumer);
    await fs.cp(sample.root, consumer, {recursive: true});
    for (const row of manifest.outputs) await fs.unlink(path.join(consumer, row.file));
    expect(await restoreCompiledInputs(consumer)).toEqual(manifest);
    expect(await verifyCompiledInputs(consumer)).toEqual(manifest);
    expect(await fs.readFile(path.join(consumer, 'js/feature.ts'), 'utf8')).toBe('export const value = 1;');
  });
  it.each(['js/feature.ts', 'css/feature.tailwind.css', '.gitignore'])('rejects changed current input %s before restoring outputs', async file => {
    const sample = await fixture(); await sealCompiledInputs(sample.root);
    await sample.write(file, 'changed current input');
    await sample.write('js/feature.js', 'keep current output');
    await expect(restoreCompiledInputs(sample.root)).rejects.toThrow('Exact current authored inputs');
    expect(await fs.readFile(path.join(sample.root, 'js/feature.js'), 'utf8')).toBe('keep current output');
  });
  it('rejects added or removed authored files and stale revisions', async () => {
    const sample = await fixture(); await sealCompiledInputs(sample.root);
    await sample.write('js/new.ts', 'export const added = 1;');
    await expect(verifyCompiledInputs(sample.root)).rejects.toThrow('Exact current authored inputs');
    await fs.unlink(path.join(sample.root, 'js/new.ts')); await fs.unlink(path.join(sample.root, 'js/feature.ts'));
    await expect(verifyCompiledInputs(sample.root)).rejects.toThrow('Exact current authored inputs');
    const manifestFile = path.join(sample.transport, 'manifest.json'), data = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    data.revision = '0'.repeat(40); await fs.writeFile(manifestFile, JSON.stringify(data));
    await expect(verifyCompiledInputs(sample.root)).rejects.toThrow('Exact compiled revision');
  });
  it.each(['missing', 'extra', 'modified', 'linked'])('rejects %s payload before replacing any output', async kind => {
    const sample = await fixture(); await sealCompiledInputs(sample.root);
    const file = path.join(sample.transport, 'payload.br');
    if (kind === 'extra') await fs.writeFile(path.join(sample.transport, 'extra.js'), 'extra');
    else if (kind === 'modified') await fs.writeFile(file, 'corrupt');
    else {await fs.unlink(file); if (kind === 'linked') await fs.symlink(path.join(sample.root, 'js/feature.js'), file);}
    await sample.write('css/feature.css', 'current output');
    await expect(restoreCompiledInputs(sample.root)).rejects.toThrow();
    expect(await fs.readFile(path.join(sample.root, 'css/feature.css'), 'utf8')).toBe('current output');
  });
  it.each(['../private.js', 'node_modules/foreign.js', 'js/feature.ts', '/absolute.js', 'js/../foreign.js'])('rejects unsafe or authored output member %s', async file => {
    const sample = await fixture(); await sealCompiledInputs(sample.root);
    const target = path.join(sample.transport, 'manifest.json'), data = JSON.parse(await fs.readFile(target, 'utf8'));
    data.outputs = [{...data.outputs[0], file}]; await fs.writeFile(target, JSON.stringify(data));
    await expect(restoreCompiledInputs(sample.root)).rejects.toThrow();
  });
  it('rejects linked targets and changed restored bytes', async () => {
    const sample = await fixture(); await sealCompiledInputs(sample.root);
    await fs.unlink(path.join(sample.root, 'js/feature.js')); await fs.symlink(path.join(sample.root, 'js/feature.ts'), path.join(sample.root, 'js/feature.js'));
    await expect(restoreCompiledInputs(sample.root)).rejects.toThrow('No linked output target');
    await fs.unlink(path.join(sample.root, 'js/feature.js')); await restoreCompiledInputs(sample.root);
    await sample.write('js/feature.js', 'corrupt');
    await expect(verifyCompiledInputs(sample.root)).rejects.toThrow('Exact restored compiler output');
  });
});

it('keeps normal npm install scripts, all producer gates and explicit fail-closed CI reuse', async () => {
  const workflow = await fs.readFile('.github/workflows/test.yml', 'utf8'), prepare = await fs.readFile('scripts/prepare.mts', 'utf8');
  expect(workflow).not.toContain('--ignore-scripts'); expect(workflow).toContain('npm run typecheck:migration-tests');
  expect(workflow).toContain('npm run architecture:check'); expect(workflow).toContain('npm run quality');
  expect(workflow.indexOf('npm run typecheck')).toBeLessThan(workflow.indexOf('node scripts/ci-compiled.mts seal'));
  expect(workflow).toContain('node scripts/ci-compiled.mts restore'); expect(workflow).toContain("GETBASED_CI_COMPILED: '1'");
  expect(prepare).toContain("process.env['GITHUB_ACTIONS'], 'true'"); expect(prepare).toContain('await verifyCompiledInputs()');
  expect(prepare).toContain("['run', 'typescript:build']");
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8')); expect(pkg.scripts.prepare).toBe('node scripts/prepare.mts');
});
