import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect, expectTypeOf, it} from 'vitest';
import type {LensDataWidgetContent, LensWidgetContent} from '../js/lens-widget-content.js';
import type {LensDataWidgetContent as PageContent} from '../js/lens-data-page-presentation.js';
import type {DashboardWidgetContent} from '../js/dashboard-widget-presentation.js';

const original = readFileSync('tests/fixtures/lens-widget-body-dispatch-original.svelte.txt', 'utf8');
const originalSha = '2f1cdf2f3b6a93c427f0cb1893e9c853f2e1b29363d514cfe217f47c11183560';
// Independent original source qualifies every generic import, branch, ordering,
// nullable guard and child prop. Only the impossible final two arms are removed.
function expectedDataSource(): string {
  expect(createHash('sha256').update(original).digest('hex')).toBe(originalSha);
  const edits = [
    ["import type {LensWidgetContent} from '../lens-widget-content.js';", "import type {LensDataWidgetContent} from '../lens-widget-content.js';"],
    [" import type {LensWidgetToolsView} from '../lens-shell-presentation.js';\n", ''],
    [" import BiologyScoreDetail from './BiologyScoreDetail.svelte';\n", ''],
    [" import LightWidgetBody from './LightWidgetBody.svelte';\n", ''],
    ['let {content,tools}:{content:LensWidgetContent;tools?:LensWidgetToolsView}=$props();', 'let {content}:{content:LensDataWidgetContent}=$props();'],
    ["{:else if\n  content.kind === 'biology-score'}{#if tools}<BiologyScoreDetail view={content.view} {tools}/>{:else}<BiologyScoreDetail view={content.view}/>{/if}{:else if\n  content.kind === 'light'}<LightWidgetBody content={content.view}/>{/if}", '{/if}'],
  ] as const;
  let expected = original;
  for (const [before, after] of edits) {expect(expected.split(before)).toHaveLength(2); expected = expected.replace(before, after);}
  return expected;
}
const genericFile = 'js/components/LensDataWidgetBody.svelte';
function qualifyGeneric(source: string): void {expect(source).toBe(expectedDataSource());}

it('makes full-page Light/Biology content impossible for data-page and Dashboard types while preserving the public Lens union', () => {
  expectTypeOf<Extract<LensDataWidgetContent, {kind:'biology-score'|'light'}>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DashboardWidgetContent, {kind:'biology-score'|'light'}>>().toEqualTypeOf<never>();
  expectTypeOf<PageContent>().toEqualTypeOf<LensDataWidgetContent>();
  expectTypeOf<Exclude<LensWidgetContent,LensDataWidgetContent>>().toEqualTypeOf<Extract<LensWidgetContent,{kind:'biology-score'|'light'}>>();
});
it('preserves the exact original generic child tree and receives it directly from both typed page owners', () => {
  qualifyGeneric(readFileSync(genericFile,'utf8'));
  for (const file of ['js/components/LensDataPage.svelte','js/components/DashboardWidgetBody.svelte']) {
    const source = readFileSync(file,'utf8');
    expect(source).toContain("import LensDataWidgetBody from './LensDataWidgetBody.svelte';");
    expect(source).toContain('<LensDataWidgetBody'); expect(source).not.toContain("from './LensWidgetBody.svelte'");
  }
  // The full public dispatcher retains every original branch coordinate and SDK
  // annotation; only the closed internal owners use the narrowed dispatcher.
  expect(createHash('sha256').update(original).digest('hex')).toBe(originalSha);
  expect(readFileSync('js/components/LensWidgetBody.svelte','utf8')).toBe(original);
});
it.each([
  ['widened content type', (source:string) => source.replace('content:LensDataWidgetContent','content:LensWidgetContent')],
  ['eager Biology import', (source:string) => source.replace('<script lang="ts">','<script lang="ts">\n import BiologyScoreDetail from "./BiologyScoreDetail.svelte";')],
  ['eager Light import', (source:string) => source.replace('<script lang="ts">','<script lang="ts">\n import LightWidgetBody from "./LightWidgetBody.svelte";')],
  ['generic branch condition', (source:string) => source.replace("content.kind === 'genome'", "content.kind === 'foreign'")],
  ['child view props', (source:string) => source.replace('<DashboardQuickMarkers view={content.view}/>','<DashboardQuickMarkers view={null}/>')],
  ['null guard', (source:string) => source.replace("content.kind === 'supplements'}{#if content.view}", "content.kind === 'supplements'}{#if true}")],
] as const)('rejects generic dispatcher corruption: %s', (_name, mutate) => {
  const source = readFileSync(genericFile,'utf8'), changed = mutate(source);expect(changed).not.toBe(source);expect(() => qualifyGeneric(changed)).toThrow();
});
