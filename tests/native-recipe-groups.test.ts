import path from 'node:path';
import {expect, it} from 'vitest';
import {compileNativeStyleBodies, type NativeStyleGroup, type NativeStyleOwnership} from '../scripts/native-recipe-styles.mjs';
const root = path.resolve('.');
const recipe = '\n  /* keep authored comment */\n  color: var(--text);\n  padding: 1px 2px !important;\n';
const prefix = '@import "tailwindcss" prefix(gb) source(none) reference;\n@utility exact-group {' + recipe + '}\n\n';
const declared: readonly NativeStyleGroup[] = [
    {name: 'media', params: '(max-width: 900px)'},
    {name: 'supports', params: '(appearance: base-select)'},
    {name: 'container', params: 'biology-page (max-width: 650px)'}
];
function wrap(body: string, groups: readonly NativeStyleGroup[] = declared) {
    return groups.reduceRight((value, group) => '@' + group.name + ' ' + group.params + ' {\n' + value + '\n}', body);
}
const input = prefix + wrap('.owned { @apply gb:exact-group; }');
const ownership: NativeStyleOwnership = {
    receivers: [['exact-group', '.owned', null, {preserveFormatting: true, groups: declared}]],
    declarationCount: 2, compactMetadataPrefix: true, isolateRecipes: true
};
function run(source = input, owner = ownership) {
    return compileNativeStyleBodies(source, path.join(root, 'css/native-group-test.css'), root, owner);
}
it('preserves complete authored group headers, order, comments, priorities and bytes', async () => {
    const result = await run();
    expect(result.css).toBe(wrap('.owned {' + recipe + '}'));
    expect(result.receivers).toHaveLength(1);
    expect(result.receivers[0]!.body).toBe(recipe);
});
it.each([
    ['kind', input.replace('@supports ', '@container ')],
    ['params', input.replace('(appearance: base-select)', '(appearance: auto)')],
    ['order', prefix + wrap('.owned { @apply gb:exact-group; }', [declared[1]!, declared[0]!, declared[2]!])],
    ['missing ancestry', prefix + wrap('.owned { @apply gb:exact-group; }', declared.slice(1))],
    ['extra ancestry', prefix + '@supports (display: grid) {\n' + wrap('.owned { @apply gb:exact-group; }') + '\n}'],
    ['unknown kind', input.replace('@supports ', '@layer ')],
    ['selector nesting', prefix + '.outer {\n' + wrap('.owned { @apply gb:exact-group; }') + '\n}'],
    ['duplicate receiver', input + '\n' + wrap('.owned { color: red; }')]
])('rejects changed %s', async (_name, source) => {
    await expect(run(source)).rejects.toThrow();
});
it('rejects mixing an explicit group with the legacy media condition', async () => {
    await expect(run(input, {...ownership, receivers: [['exact-group', '.owned', '(max-width: 900px)', {groups: declared, preserveFormatting: true}]]})).rejects.toThrow('null legacy media');
});
it('retains strict legacy media matching and duplicate rejection', async () => {
    const legacy: NativeStyleOwnership = {...ownership, receivers: [['exact-group', '.owned', '(max-width: 900px)', {preserveFormatting: true}]]};
    const groups: readonly NativeStyleGroup[] = [declared[0]!];
    expect((await run(prefix + wrap('.owned { @apply gb:exact-group; }', groups), legacy)).css).toBe(wrap('.owned {' + recipe + '}', groups));
    await expect(run(prefix + wrap('.owned { @apply gb:exact-group; }\n.owned { color: red; }', groups), legacy)).rejects.toThrow('duplicate');
    await expect(run(input, legacy)).rejects.toThrow();
});
