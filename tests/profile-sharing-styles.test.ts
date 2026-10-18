import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss, {type Rule} from 'postcss';
import {expect, it} from 'vitest';
import {emojiPickerOwnership} from '../scripts/emoji-picker-style-ownership.mjs';
import {restoreReviewedStyleBodies} from './helpers/style-owner-body-correspondence.js';
import {profileSharingOwnership} from '../scripts/profile-sharing-style-ownership.mjs';

interface Receiver {
    utility: string;
    selector: string;
    condition: string | null;
    declarations: Array<[string, string, boolean]>;
}
interface OriginalFixture {foreignSha256: string; receivers: Receiver[]}
import {compileModalPresentationStyles} from '../scripts/modal-presentation-style-ownership.mjs';
const root = path.resolve('.');
const inputPath = path.join(root, 'css/modal-shared.base.css');
const input = readFileSync(inputPath, 'utf8');
// Original-source fixture; never derive the expected values from the new recipes or emitted CSS.
const fixture = JSON.parse(readFileSync('tests/fixtures/profile-sharing-styles-original.json', 'utf8')) as OriginalFixture;
function media(rule: Rule) {
    const result: string[] = [];
    for (let parent: Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule') {
            expect(parent.name).toBe('media');
            result.unshift(parent.params);
        }
    }
    return result;
}
function owned(source: string, receiver: Receiver): Rule {
    const matches: Rule[] = [];
    postcss.parse(source).walkRules(rule => {
        if (rule.selector === receiver.selector && JSON.stringify(media(rule)) === JSON.stringify(receiver.condition ? [receiver.condition] : [])) matches.push(rule);
    });
    expect(matches).toHaveLength(1);
    return matches[0]!;
}
function foreignBytes(source: string) {
    const spans = fixture.receivers.map(receiver => {
        const rule = owned(source, receiver);
        const start = rule.source!.start!.offset! + rule.selector.length + (rule.raws.between || '').length + 1;
        const end = rule.source!.end!.offset! - 1;
        expect(source[start - 1]).toBe('{');
        expect(source[end]).toBe('}');
        return {receiver, start, end};
    }).sort((a, b) => a.start - b.start);
    let result = '', cursor = 0;
    for (const {receiver, start, end} of spans) {
        expect(start).toBeGreaterThanOrEqual(cursor);
        result += source.slice(cursor, start) + `/* owned ${receiver.utility} */`;
        cursor = end;
    }
    return result + source.slice(cursor);
}
const diagnoseOriginal=JSON.parse(readFileSync('tests/fixtures/sync-diagnose-styles-original.json','utf8')) as {receivers:Array<{selector:string;condition:string|null;before:string}>};
function restoreDiagnoseForeign(source:string) {
    const spans=diagnoseOriginal.receivers.map(receiver=>{
        const rule=owned(source,{utility:'new Diagnose owner',selector:receiver.selector,condition:receiver.condition,declarations:[]});
        const actual=rule.nodes.map(node=>{if(node.type!=='decl')throw new Error('Foreign Diagnose child');return [node.prop,node.value,node.important===true];});
        const parsed=postcss.parse('a{'+receiver.before+'}').first;if(parsed?.type!=='rule')throw new Error('Expected original body');
        const expected=parsed.nodes.map(node=>{if(node.type!=='decl')throw new Error('Invalid original fixture');return [node.prop,node.value,node.important===true];});
        expect(actual).toEqual(expected);
        const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;
        expect(source[start-1]).toBe('{');expect(source[end]).toBe('}');return {start,end,before:receiver.before};
    }).sort((a,b)=>b.start-a.start);
    expect(spans).toHaveLength(75);
    let result=source;for(const span of spans)result=result.slice(0,span.start)+span.before+result.slice(span.end);return result;
}
const emojiNative=readFileSync('tests/fixtures/emoji-picker-original.css','utf8');
function restoreEmojiForeign(source:string):string {
 const tree=postcss.parse(source),reset:Rule[]=[];
 tree.walkRules(rule=>{if(rule.selector==='.emoji-picker-cats button[data-cat="__reset"]')reset.push(rule);});
 expect(reset).toHaveLength(1);expect(reset[0]!.parent?.type).toBe('root');
 expect(reset[0]!.nodes.map(node=>{if(node.type!=='decl')throw new Error('Foreign reset node');return [node.prop,node.value,node.important===true];})).toEqual([['font-size','12px',false],['font-family','inherit',false]]);
 const start=reset[0]!.source!.start!.offset,end=reset[0]!.source!.end!.offset;
 expect(source.slice(start,end)).toBe(reset[0]!.toString());expect(source[start-1]).toBe('\n');
 const withoutReset=source.slice(0,start-1)+source.slice(end);
 const receivers=emojiPickerOwnership.receivers.filter(([,selector])=>selector!=='.emoji-picker-cats button[data-cat="__reset"]').map(([,selector,media])=>({selector,media}));
 expect(receivers).toHaveLength(11);
 return restoreReviewedStyleBodies(withoutReset,emojiNative,receivers);
}
function verifyOriginal(source: string) {
    source=restoreDiagnoseForeign(restoreEmojiForeign(source));
    expect(createHash('sha256').update(foreignBytes(source)).digest('hex')).toBe(fixture.foreignSha256);
    for (const receiver of fixture.receivers) {
        const declarations = owned(source, receiver).nodes.map(node => {
            expect(node.type).toBe('decl');
            if (node.type !== 'decl') throw new Error('Unexpected owned declaration child');
            return [node.prop, node.value, node.important === true];
        });
        expect(declarations).toEqual(receiver.declarations);
    }
    expect(source).not.toContain('@apply');
    expect(source).not.toContain('@utility');
    expect(source).not.toContain('@import "tailwindcss"');
}
let nativeResult: ReturnType<typeof compileModalPresentationStyles> | undefined;
function compiled() {return nativeResult ??= compileModalPresentationStyles(input, inputPath, root);}

it('restores all 34 original Sharing bodies and every foreign byte at the same native selector/media anchors', async () => {
    expect(fixture.receivers).toHaveLength(34);
    expect(fixture.receivers.reduce((count, row) => count + row.declarations.length, 0)).toBe(154);
    expect(profileSharingOwnership.receivers).toEqual(fixture.receivers.map(row => [row.utility, row.selector, row.condition]));
    const result = await compiled();
    expect(result.receivers.filter(row => profileSharingOwnership.receivers.some(owner => owner[0] === row.utility))).toHaveLength(34);
    verifyOriginal(result.css);
});

const invalid: Array<[string, () => string]> = [
    ['unknown apply', () => input.replace('@apply gb:profile-share-overlay;', '@apply gb:unknown-sharing;')],
    ['duplicate receiver', () => input + '\n#profile-share-overlay.modal-overlay { z-index: 650; }'],
    ['changed 640px ancestry', () => input.replace('@media (max-width: 640px)', '@media (max-width: 639px)')],
    ['additional owned declaration', () => input.replace('@apply gb:profile-share-status;', '@apply gb:profile-share-status; color: red;')],
];
it.each(invalid)('rejects an undeclared recipe boundary: %s', async (_name, mutate) => {
    const changed = mutate();
    expect(changed).not.toBe(input);
    await expect(compileModalPresentationStyles(changed, inputPath, root)).rejects.toMatchObject({code: 'ERR_ASSERTION'});
});

it.each([
    ['shared overlay transition', '.modal-overlay {', '.modal-overlay.changed {'],
    ['owned transition value', 'transition: all 0.15s;', 'transition: all 0.16s;'],
] as const)('independent original oracle rejects %s drift', async (_name, before, after) => {
    const css = (await compiled()).css;
    const changed = css.replace(before, after);
    expect(changed).not.toBe(css);
    expect(() => verifyOriginal(changed)).toThrow();
});

it('independent original oracle rejects reordered font shorthand and override', async () => {
    const css = (await compiled()).css;
    const receiver = fixture.receivers.find(row => row.utility === 'profile-share-stop-button');
    expect(receiver).toBeDefined();
    const rule = owned(css, receiver!);
    const start = rule.source!.start!.offset!, end = rule.source!.end!.offset!;
    const raw = css.slice(start, end);
    const changedBody = raw.replace(/font: inherit;(\s*)font-size: 12px;/, 'font-size: 12px;$1font: inherit;');
    expect(changedBody).not.toBe(raw);
    const changed = css.slice(0, start) + changedBody + css.slice(end);
    expect(() => verifyOriginal(changed)).toThrow();
});

it.each(emojiPickerOwnership.receivers)('foreign-body correspondence rejects changed Emoji declaration: %s',async(_utility,selector,condition)=>{
 const css=(await compiled()).css;
 verifyOriginal(css);
 const tree=postcss.parse(css),matches:Rule[]=[];
 tree.walkRules(rule=>{if(rule.selector===selector&&JSON.stringify(media(rule))===JSON.stringify(condition?[condition]:[]))matches.push(rule);});
 expect(matches).toHaveLength(1);
 const declaration=matches[0]!.nodes[0];expect(declaration?.type).toBe('decl');
 if(declaration?.type!=='decl')throw new Error('Expected finite Emoji declaration');
 declaration.value+='__changed';const changed=tree.toString();expect(changed).not.toBe(css);
 expect(()=>verifyOriginal(changed)).toThrow();
});
