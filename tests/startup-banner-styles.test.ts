import {restorePreviousSharedButtonSelectors} from './helpers/shared-button-specificity-inverse.js';
import {restoreStartupCategoryStyleBytes} from './helpers/startup-category-style-inverse.js';
import {restoreSidebarStyleBodies} from './helpers/sidebar-style-inverse.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss, {type Rule} from 'postcss';
import {expect, it} from 'vitest';
import {compileCategoryViewsNativeStyles} from '../scripts/category-views-native-styles.mjs';
import {compileNativeStyleBodies} from '../scripts/native-recipe-styles.mjs';
import {compileStartupBannerStyles, appShellOwnership, syncStatusOwnership, type StartupBannerLane} from '../scripts/startup-banner-style-ownership.mjs';

interface Receiver {utility: string; selector: string; condition: string | null}
interface Fixture {categorySha256: string; lanes: Array<{lane: StartupBannerLane; input: string; original: string; receivers: Receiver[]}>}
const root = path.resolve('.');
const fixture = JSON.parse(readFileSync('tests/fixtures/startup-banner-original.json', 'utf8')) as Fixture;
function media(rule: Rule) {
    const result: string[] = [];
    for (let parent: Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent)
        if (parent.type === 'atrule') {expect(parent.name).toBe('media');result.unshift(parent.params);}
    return result;
}
function selected(source: string, receiver: Receiver): Rule {
    const matches: Rule[] = [];
    postcss.parse(source).walkRules(rule => {
        if (rule.selector === receiver.selector && JSON.stringify(media(rule)) === JSON.stringify(receiver.condition ? [receiver.condition] : [])) matches.push(rule);
    });
    expect(matches).toHaveLength(1);
    return matches[0]!;
}
function bodyRange(rule: Rule): [number, number] {
    const start = rule.source!.start!.offset!, end = rule.source!.end!.offset!;
    return [start + rule.selector.length + (rule.raws.between || '').length + 1, end - 1];
}
function laneReceivers(lane: Fixture['lanes'][number]): Receiver[] {
    return lane.lane === 'app-shell' ? [...lane.receivers, ...syncStatusOwnership.receivers.filter(([utility]) => utility !== 'sync-popover-mobile').map(([utility, selector, condition]) => ({utility, selector, condition}))] : lane.receivers;
}
function foreignBytes(source: string, receivers: Receiver[]) {
    const ranges = receivers.map(receiver => ({receiver, range: bodyRange(selected(source, receiver))})).sort((a, b) => a.range[0] - b.range[0]);
    let result = '', cursor = 0;
    for (const {receiver, range: [start, end]} of ranges) {
        result += source.slice(cursor, start) + `/* owned ${receiver.utility} */`;cursor = end;
    }
    return result + source.slice(cursor);
}
function declarations(rule: Rule) {
    return rule.nodes.map(node => {
        expect(node.type).toBe('decl');
        if (node.type !== 'decl') throw new Error('Unexpected owned child');
        return [node.prop, node.value, node.important === true];
    });
}


const mobileSelector = 'body.mobile-dashboard-active .sync-popover,\n  body.mobile-tabs-active .sync-popover';
/** Remove only the new exact mobile block, after proving selector/media/declarations/root position. */
function withoutMobileSync(source: string) {
    const root = postcss.parse(source), matches: Rule[] = [];
    root.walkRules(rule => {if (rule.selector === mobileSelector) matches.push(rule);});
    expect(matches).toHaveLength(1);const rule = matches[0]!;
    expect(media(rule)).toEqual(['(max-width: 799px)']);
    const group = rule.parent;expect(group?.type).toBe('atrule');
    if (!group || group.type !== 'atrule') throw new Error('Exact mobile media required');
    expect(group.name).toBe('media');expect(group.params).toBe('(max-width: 799px)');expect(group.parent).toBe(root);expect(group.nodes).toEqual([rule]);
    expect(declarations(rule)).toEqual([['max-height', 'calc(100dvh - 164px - env(safe-area-inset-bottom, 0px) - var(--mobile-visual-bottom-offset, 0px))', false], ['overflow-y', 'auto', false]]);
    const index = root.nodes.indexOf(group), preceding = root.nodes[index - 1];
    expect(preceding?.type).toBe('rule');if (!preceding || preceding.type !== 'rule') throw new Error('Original popover predecessor required');
    expect(preceding.selector).toBe('.sync-popover');expect(media(preceding)).toEqual([]);
    const start = preceding.source!.end!.offset!, end = group.source!.end!.offset!;
    expect(source.slice(start, group.source!.start!.offset!)).toBe('\n');
    expect(source.slice(group.source!.start!.offset!, end)).toBe(group.toString());
    return source.slice(0, start) + source.slice(end);
}

it.each(fixture.lanes)('preserves every foreign byte and owned declaration at $lane native anchors', async lane => {
    const inputPath = path.join(root, lane.input), input = readFileSync(inputPath, 'utf8');
    const {css: sidebarCSS} = await compileStartupBannerStyles(lane.lane, input, inputPath, root);
    const css = restoreSidebarStyleBodies(lane.lane, restorePreviousSharedButtonSelectors(lane.lane, sidebarCSS));
    expect(foreignBytes(lane.lane === 'app-shell' ? withoutMobileSync(css) : css, laneReceivers(lane))).toBe(foreignBytes(lane.original, laneReceivers(lane)));
    for (const receiver of laneReceivers(lane))
        expect(declarations(selected(css, receiver))).toEqual(declarations(selected(lane.original, receiver)));
    expect(css).not.toContain('@apply');expect(css).not.toContain('@utility');
    expect(css).not.toContain('@import "tailwindcss"');
});

it('retains both shared desktop/mobile keyframes and the unqualified progress/foreign stacking rules', async () => {
    const lane = fixture.lanes.find(row => row.lane === 'app-shell')!;
    const inputPath = path.join(root, lane.input);
    const {css: sidebarCSS} = await compileStartupBannerStyles('app-shell', readFileSync(inputPath, 'utf8'), inputPath, root);
    const css = restoreSidebarStyleBodies('app-shell', restorePreviousSharedButtonSelectors('app-shell', sidebarCSS));
    function keyframes(source: string) {
        const result: string[] = [];
        postcss.parse(source).walkAtRules('keyframes', node => {if (node.params === 'analytics-consent-in') result.push(node.toString());});
        return result;
    }
    expect(keyframes(lane.original)).toHaveLength(2);
    expect(keyframes(css)).toEqual(keyframes(lane.original));
    const untouched = ['.version-update-progress[hidden], .version-update-actions[hidden]', '.version-update-progress-fill'];
    for (const selector of untouched) {
        const oldRules: string[] = [], newRules: string[] = [];
        postcss.parse(lane.original).walkRules(selector, rule => {oldRules.push(rule.toString());});
        postcss.parse(css).walkRules(selector, rule => {newRules.push(rule.toString());});
        expect(oldRules.length).toBeGreaterThan(0);expect(newRules).toEqual(oldRules);
    }
});

it('keeps the accepted category compiler output byte-exact through the compatibility export', async () => {
    const inputPath = path.join(root, 'css/category-views.tailwind.css');
    const {css} = await compileCategoryViewsNativeStyles(readFileSync(inputPath, 'utf8'), inputPath, root);
    expect(createHash('sha256').update(restoreStartupCategoryStyleBytes(css)).digest('hex')).toBe(fixture.categorySha256);
});

const app = fixture.lanes.find(row => row.lane === 'app-shell')!;
const inputPath = path.join(root, app.input), input = readFileSync(inputPath, 'utf8');
const invalid: Array<[string, () => string]> = [
    ['unknown apply', () => input.replace('@apply gb:analytics-banner;', '@apply gb:unknown-banner;')],
    ['duplicate utility', () => input + '\n@utility analytics-banner { position: fixed; }'],
    ['duplicate receiver', () => input + '\n.analytics-consent-banner { color: red; }'],
    ['foreign ancestry on owned receiver', () => input.replace('.analytics-consent-banner { @apply gb:analytics-banner; }', '@supports (display: grid) {.analytics-consent-banner { @apply gb:analytics-banner; }}')],
    ['wrong native media', () => input.replace('@media (max-width: 600px)', '@media (max-width: 601px)')],
    ['extra owned declaration', () => input.replace('@apply gb:analytics-banner;', '@apply gb:analytics-banner; color: red;')],
];
it.each(invalid)('rejects $0 without reformatting a foreign sheet', async (_name, mutate) => {
    const changed = mutate();expect(changed).not.toBe(input);
    await expect(compileStartupBannerStyles('app-shell', changed, inputPath, root)).rejects.toMatchObject({code: 'ERR_ASSERTION'});
});
it('rejects incorrect declared ownership counts and a nonboolean metadata option', async () => {
    const ownership = appShellOwnership;
    await expect(compileNativeStyleBodies(input, inputPath, root, {...ownership, declarationCount: ownership.declarationCount + 1})).rejects.toMatchObject({code: 'ERR_ASSERTION'});
    // Exercise a real untyped caller, without changing the typed production API.
    const wrong = {...ownership, compactMetadataPrefix: 'true'};
    await expect(Reflect.apply(compileNativeStyleBodies, undefined, [input, inputPath, root, wrong])).rejects.toMatchObject({code: 'ERR_ASSERTION'});
    const invalidIsolation = {...ownership, isolateRecipes: 'true'};
    await expect(Reflect.apply(compileNativeStyleBodies, undefined, [input, inputPath, root, invalidIsolation])).rejects.toMatchObject({code: 'ERR_ASSERTION'});
});

it('rejects corruption of the sole new block before comparing all historical foreign bytes', async () => {
    const {css: sidebarCSS} = await compileStartupBannerStyles('app-shell', input, inputPath, root);
    const css = restoreSidebarStyleBodies('app-shell', restorePreviousSharedButtonSelectors('app-shell', sidebarCSS));
    const old = withoutMobileSync(css), start = css.indexOf('\n@media (max-width: 799px) {\n  body.mobile-dashboard-active .sync-popover,'), end = start + css.length - old.length;
    expect(start).toBeGreaterThan(0);const block = css.slice(start, end);
    const mutations = [old, old + block, css.replace(block, block.replace('799px', '798px')), css + block, css.replace(block, block.replace('overflow-y: auto;', 'overflow-y: auto; width:10px;'))];
    for (const changed of mutations) {expect(changed).not.toBe(css);expect(() => withoutMobileSync(changed)).toThrow();}
});
