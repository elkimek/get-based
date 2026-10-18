import assert from 'node:assert/strict';
import path from 'node:path';
import postcss, {type ChildNode, type Node, type Rule, type AtRule} from 'postcss';
import {compile} from '@tailwindcss/node';
import {tokenize,TokenType} from '@csstools/css-tokenizer';

export interface NativeStyleGroup {
    readonly name: 'media' | 'container' | 'supports';
    readonly params: string;
}
export interface NativeStyleReceiverOptions {
    readonly occurrence?: number;
    readonly preserveFormatting?: true;
    readonly groups?: readonly NativeStyleGroup[];
}
export interface NativeStyleOwnership {
    receivers: readonly (readonly [utility: string, selector: string, condition: string | null, options?: NativeStyleReceiverOptions])[];
    declarationCount: number;
    compactMetadataPrefix?: boolean;
    isolateRecipes?: boolean;
}
interface Edit { start: number; end: number; before: string; after: string; owner: string }
export interface NativeRecipeCompileResult {
    css: string;
    expanded: string;
    edits: Edit[];
    receivers: { utility: string; selector: string; condition: string | null; path: number[]; body: string }[];
}
function range(node: ChildNode, source: string): [number, number] {
    const start = node.source?.start?.offset, end = node.source?.end?.offset;
    assert.ok(typeof start === 'number' && typeof end === 'number' && end > start, 'Exact parser offsets required');
    // PostCSS standalone import.toString() omits its semicolon; source offsets include it.
    const literal = node.type === 'atrule' && node.name === 'import' && !node.nodes
        ? node.toString() + ';' : node.toString();
    assert.equal(source.slice(start, end), literal, 'Parser source coordinate round trip');
    return [start, end];
}
function body(rule: Rule, source: string): [number, number] {
    const [start, end] = range(rule, source);
    const open = start + rule.selector.length + (rule.raws.between || '').length;
    assert.equal(source[open], '{'); assert.equal(source[end - 1], '}');
    assert.equal(source.slice(start, open), rule.selector + (rule.raws.between || ''));
    return [open + 1, end - 1];
}
function metadata(node: ChildNode): boolean {
    return node.type === 'atrule' && (node.name === 'utility' || node.name === 'import');
}
function rulePath(rule: Rule): number[] {
    const result: number[] = [];
    let child: Node = rule;
    while (child.parent) {
        const parent: NonNullable<Node['parent']> = child.parent;
        assert.ok(parent.nodes);
        const siblings = parent.nodes.filter(node => (node.type === 'rule' || node.type === 'atrule') && !metadata(node));
        const index = siblings.findIndex(node => node === child); assert.ok(index >= 0);
        result.unshift(index);
        if (parent.type === 'root' || parent.type === 'document') break;
        assert.ok(parent.type === 'rule' || parent.type === 'atrule');
        child = parent;
    }
    return result;
}
function groups(rule: Rule): NativeStyleGroup[] {
    const result: NativeStyleGroup[] = [];
    let parent: Node['parent'] = rule.parent;
    while (parent) {
        if (parent.type === 'atrule') {
            const group = parent as AtRule;
            assert.ok(group.name === 'media' || group.name === 'container' || group.name === 'supports',
                'Owned receiver has only explicitly supported group kinds');
            result.unshift({name: group.name, params: group.params});
        } else assert.ok(parent.type === 'root' || parent.type === 'document', 'No unexpected owned selector nesting');
        parent = parent.parent;
    }
    return result;
}
function declaredGroups(condition: string | null, options?: NativeStyleReceiverOptions): readonly NativeStyleGroup[] {
    return options?.groups ?? (condition ? [{name: 'media', params: condition}] : []);
}
/** Exact CSS token lexemes/data/order; only comma-adjacent layout whitespace is irrelevant. */
export function nativeRecipeValueProof(value: string): readonly unknown[] {
    const tokens = tokenize({css: value});
    return tokens.filter((token, index) => token[0] !== TokenType.Whitespace
        || (tokens[index - 1]?.[0] !== TokenType.Comma && tokens[index + 1]?.[0] !== TokenType.Comma))
        .map(token => [token[0], token[1], token[4]]);
}
export async function compileNativeStyleBodies(input: string, inputPath: string, root: string,
    ownership: NativeStyleOwnership, onDependency: (dependency: string) => void = () => {}): Promise<NativeRecipeCompileResult> {
    assert.ok(Array.isArray(ownership.receivers) && ownership.receivers.length > 0);
    assert.ok(Object.keys(ownership).every(key => ['receivers', 'declarationCount', 'compactMetadataPrefix', 'isolateRecipes'].includes(key)), 'Known ownership options only');
    assert.ok(ownership.compactMetadataPrefix === undefined || typeof ownership.compactMetadataPrefix === 'boolean');
    assert.ok(ownership.isolateRecipes === undefined || typeof ownership.isolateRecipes === 'boolean');
    for (const row of ownership.receivers) {
        assert.ok(row.length === 3 || row.length === 4);
        if (row.length === 4) {
            const options = row[3];
            assert.ok(options && typeof options === 'object');
            assert.ok(Object.keys(options).every(key => key === 'occurrence' || key === 'preserveFormatting' || key === 'groups'));
            if ('occurrence' in options) assert.ok(typeof options.occurrence === 'number' && Number.isSafeInteger(options.occurrence) && options.occurrence >= 0, 'Explicit occurrence is a nonnegative integer');
            if ('groups' in options) {
                assert.equal(row[2], null, 'Explicit groups require a null legacy media condition');
                assert.ok(Array.isArray(options.groups) && options.groups.length > 0, 'Explicit nonempty group ancestry');
                for (const group of options.groups) {
                    assert.ok(group && typeof group === 'object');
                    assert.deepEqual(Object.keys(group).sort(), ['name', 'params'], 'Exact group fields');
                    assert.ok(group.name === 'media' || group.name === 'container' || group.name === 'supports', 'Known group kind');
                    assert.ok(typeof group.params === 'string' && group.params.length > 0, 'Literal group condition');
                }
            }
            if ('preserveFormatting' in options) assert.equal(options.preserveFormatting, true);
            assert.ok(!options.preserveFormatting || ownership.isolateRecipes, 'Source formatting requires exact isolated declaration validation');
        }
        assert.ok(typeof row[0] === 'string' && row[0] && typeof row[1] === 'string' && row[1]);
        assert.ok(row[2] === null || typeof row[2] === 'string' && row[2]);
    }
    assert.ok(Number.isSafeInteger(ownership.declarationCount) && ownership.declarationCount > 0);
    assert.equal(new Set(ownership.receivers.map(row => row[0])).size, ownership.receivers.length, 'Unique semantic utilities');
    assert.equal(new Set(ownership.receivers.map(row => JSON.stringify([row[1], declaredGroups(row[2], row[3]), row[3]?.occurrence ?? null]))).size, ownership.receivers.length, 'Unique selector/group ownership');
    const tree = postcss.parse(input, {from: inputPath});
    const edits: Edit[] = [];
    const imports: AtRule[] = [], utilities: AtRule[] = [], applies: AtRule[] = [];
    tree.walkAtRules(node => {
        if (node.name === 'import') imports.push(node);
        if (node.name === 'utility') utilities.push(node);
        if (node.name === 'apply') applies.push(node);
    });
    assert.equal(imports.length, 1);
    assert.equal(imports[0]!.parent, tree);
    assert.equal(imports[0]!.params, '"tailwindcss" prefix(gb) source(none) reference');
    assert.equal(utilities.length, ownership.receivers.length); assert.equal(applies.length, ownership.receivers.length);
    for (const node of [imports[0]!, ...utilities]) {
        assert.equal(node.parent, tree, 'Compile metadata must be root-only');
        const [start, end] = range(node, input);
        if (!ownership.compactMetadataPrefix)
            edits.push({start, end, before: input.slice(start, end), after: '', owner: '@' + node.name + ' ' + node.params});
    }
    if (ownership.compactMetadataPrefix) {
        const prefixNodes = [imports[0]!, ...utilities];
        assert.deepEqual(tree.nodes.slice(0, prefixNodes.length), prefixNodes, 'Only known compile metadata before native source');
        assert.equal(prefixNodes[0]!.source?.start?.offset, 0);
        const firstNative = tree.nodes[prefixNodes.length]; assert.ok(firstNative);
        const nativeStart = firstNative.source?.start?.offset; assert.ok(typeof nativeStart === 'number' && nativeStart > 0);
        const metadataEnd = prefixNodes[prefixNodes.length - 1]!.source?.end?.offset;
        assert.ok(typeof metadataEnd === 'number' && metadataEnd > 0);
        // Authored metadata ends with exactly two LFs. Any subsequent native prefix whitespace stays verbatim.
        assert.equal(input.slice(metadataEnd, metadataEnd + 2), '\n\n');
        const end = metadataEnd + 2;
        assert.ok(end <= nativeStart && /^[\t\r\n ]*$/.test(input.slice(end, nativeStart)));
        edits.push({start: 0, end, before: input.slice(0, end), after: '', owner: 'compile metadata prefix'});
    }
    const inputRules: Rule[] = [];tree.walkRules(rule => {inputRules.push(rule);});
    const selected = ownership.receivers.map(([utility, selector, condition, options]) => {
        const occurrence = options?.occurrence;
        const recipes = utilities.filter(node => node.params === utility);
        assert.equal(recipes.length, 1, 'Exactly one known semantic recipe');
        assert.ok(recipes[0]!.nodes?.length);
        assert.ok(recipes[0]!.nodes!.every(node => node.type === 'decl' || (options?.preserveFormatting && node.type === 'comment')), 'Recipes contain only ordered declarations and explicitly preserved comments');
        const matches = applies.filter(node => node.params === 'gb:' + utility);
        assert.equal(matches.length, 1, 'Exactly one known receiver apply');
        const apply = matches[0]!; assert.equal(apply.parent?.type, 'rule');
        const rule = apply.parent as Rule;
        assert.equal(rule.selector, selector);
        const sameReceivers = inputRules.filter(candidate => candidate.selector === selector
            && JSON.stringify(groups(candidate)) === JSON.stringify(declaredGroups(condition, options)));
        if (occurrence === undefined) {
            assert.equal(sameReceivers.length, 1, "No duplicate owned selectors");
            assert.ok(sameReceivers[0] === rule, 'Owned receiver identity must match exactly');
        } else {
            assert.ok(occurrence < sameReceivers.length, 'Explicit occurrence must exist');
            assert.ok(sameReceivers[occurrence] === rule, 'Explicit occurrence owns exactly its matched apply');
        }
        assert.deepEqual(groups(rule), declaredGroups(condition, options), 'Exact declared group kinds, conditions and order');
        assert.equal(rule.nodes.length, 1, 'No undeclared receiver children');
        const [start, end] = body(rule, input);
        return {utility, selector, condition, path: rulePath(rule), recipe: recipes[0]!, options, rule, start, end};
    });
    assert.equal(utilities.reduce((count, node) => count + node.nodes!.filter(child => child.type === 'decl').length, 0), ownership.declarationCount);
    // Isolated anchors compile declarations only; native selector/media/path bytes never enter that compiler lane.
    const compileInput = ownership.isolateRecipes
        ? imports[0]!.toString() + ';\n'
            + selected.map(receiver => receiver.recipe.toString()).join('\n') + '\n'
            + selected.map((receiver, index) => `.native-recipe-${index} { @apply gb:${receiver.utility}; }`).join('\n')
        : input;
    const compiled = await compile(compileInput, {base: root, from: inputPath, polyfills: 0,
        onDependency: dependency => {assert.ok(path.isAbsolute(dependency));onDependency(dependency);}});
    const expanded = compiled.build([]);
    const expandedTree = postcss.parse(expanded);
    const expandedRules: Rule[] = [];expandedTree.walkRules(rule => {expandedRules.push(rule);});
    if (ownership.isolateRecipes) {
        assert.equal(expandedRules.length, selected.length, 'Exactly one compiled anchor per owned recipe');
        assert.ok(expandedTree.nodes.every(node => node.type === 'comment' || node.type === 'rule'), 'No undeclared compiled groups');
    }
    const proof = selected.map((receiver, index) => {
        const compileSelector = ownership.isolateRecipes ? `.native-recipe-${index}` : receiver.selector;
        const compileGroups = ownership.isolateRecipes ? [] : declaredGroups(receiver.condition, receiver.options);
        const compilePath = ownership.isolateRecipes ? [index] : receiver.path;
        const matches = expandedRules.filter(rule => rule.selector === compileSelector
            && JSON.stringify(groups(rule)) === JSON.stringify(compileGroups)
            && JSON.stringify(rulePath(rule)) === JSON.stringify(compilePath));
        assert.equal(matches.length, 1, 'Compiled receiver selector/media/path must match exactly');
        const rule = matches[0]!;
        assert.ok(rule.nodes.every(node => node.type === 'decl'), 'Expanded owned body has declarations only');
        if (ownership.isolateRecipes) {
            const declarations = (nodes: NonNullable<AtRule['nodes']>) => nodes.map(node => {
                assert.equal(node.type, 'decl');
                assert.ok(node.type === 'decl');
                return [node.prop, receiver.options?.preserveFormatting ? nativeRecipeValueProof(node.value) : node.value, node.important === true];
            });
            assert.deepEqual(declarations(rule.nodes), declarations(receiver.recipe.nodes!.filter(node => node.type === 'decl')),
                'Compiled recipe property/value/priority/order remains exact');
        }
        const [start, end] = body(rule, expanded);
        let value = expanded.slice(start, end);
        if (receiver.options?.preserveFormatting) {
            const [recipeStart, recipeEnd] = range(receiver.recipe, input);
            const open = input.indexOf('{', recipeStart);
            assert.ok(open >= recipeStart && open < recipeEnd);
            assert.equal(input[recipeEnd - 1], '}');
            // Reuse the one authored body only after the compiled declaration
            // order/value/priority equality above has proved its semantics.
            value = input.slice(open + 1, recipeEnd - 1);
        }
        edits.push({start: receiver.start, end: receiver.end, before: input.slice(receiver.start, receiver.end), after: value, owner: receiver.utility});
        return {utility: receiver.utility, selector: receiver.selector, condition: receiver.condition, path: receiver.path, body: value};
    });
    const sorted = [...edits].sort((a, b) => a.start - b.start);
    let cursor = 0, css = '';
    for (const edit of sorted) {
        assert.ok(edit.start >= cursor && edit.end > edit.start, 'Nonoverlapping closed ownership spans');
        assert.equal(input.slice(edit.start, edit.end), edit.before);
        css += input.slice(cursor, edit.start) + edit.after;cursor = edit.end;
    }
    css += input.slice(cursor);
    // Reconstruct all authored source bytes; every gap was copied verbatim, never reserialized.
    let inverse = '', outputCursor = 0, inputCursor = 0;
    for (const edit of sorted) {
        const gap = input.slice(inputCursor, edit.start);
        assert.equal(css.slice(outputCursor, outputCursor + gap.length), gap);
        inverse += gap + edit.before;
        outputCursor += gap.length;
        assert.equal(css.slice(outputCursor, outputCursor + edit.after.length), edit.after);
        outputCursor += edit.after.length;inputCursor = edit.end;
    }
    assert.equal(css.slice(outputCursor), input.slice(inputCursor));
    inverse += css.slice(outputCursor);assert.equal(inverse, input);
    return {css, expanded, edits: sorted, receivers: proof};
}
