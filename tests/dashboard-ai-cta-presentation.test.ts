import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import * as current from '../js/context-card-dashboard-ai.js';
import * as presentation from '../js/dashboard-ai-cta-presentation.js';
import {expectedDashboardAIHTML,requireDashboardAIGraph} from './helpers/dashboard-ai-genuine-expected-html.js';

const ports = vi.hoisted(() => ({
  state: {importedData: {interpretiveLens: '' as unknown}},
  summary: null as unknown,
  status: {encryption: true, sync: true, backup: true, backupSupported: true} as unknown,
  trace: [] as string[],
  change: (html: string) => html,
}));
function escape(value: unknown): string {
  return value == null ? '' : String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}
function summary() {ports.trace.push('summary'); if (ports.summary instanceof Error) throw ports.summary; return ports.summary;}
function status() {ports.trace.push('status'); return ports.status;}
function attrs(action: string) {ports.trace.push('action:' + action); return `data-dashboard-ai-action="${escape(action)}"`;}
vi.mock('../js/utils.js', () => ({escapeHTML: escape, showNotification: vi.fn()}));
vi.mock('../js/state.js', () => ({state: ports.state}));
vi.mock('../js/lens.js', () => ({getLensSummary: summary, openKnowledgeBaseModal: vi.fn()}));
vi.mock('../js/data-protection-status.js', () => ({getDataProtectionStatus: status}));
vi.mock('../js/backup.js', () => ({pickFolderForBackup: vi.fn()}));
vi.mock('../js/crypto.js', () => ({showEnableEncryptionModal: vi.fn()}));
vi.mock('../js/settings-sync-panel.js', () => ({showSyncSetupModal: vi.fn()}));
vi.mock('../js/context-cards-runtime.js', () => ({openInterpretiveLensEditorRuntime: vi.fn()}));
vi.mock('../js/context-card-dashboard-ai-actions.js', () => ({
  dashboardAIActionAttrs: attrs, configureDashboardAIActionDelegates: vi.fn(), installDashboardAIActionDelegates: vi.fn(),
}));
vi.mock('../js/retrying-module-loader.js', () => ({
  createRetryingModuleLoader: () => ({module: null}), invokeCachedModule: vi.fn(),
}));
let rawIndex = 0;
function capture(kind: string, raw: string, props?: unknown) {
  const directory = process.env['GETBASED_DASHBOARD_AI_RAW'];
  if (directory) fs.writeFileSync(`${directory}/${rawIndex++}-${kind}.json`, JSON.stringify({kind, raw, props}, null, 2), {flag: 'wx'});
}
vi.mock('../js/components/DashboardAIRow.svelte.html.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../js/components/DashboardAIRow.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof actual.renderHTML>[0]) => {
    const raw = actual.renderHTML(props); capture('row-compiled', raw, props); return ports.change(raw);
  }};
});
vi.mock('../js/components/DashboardAICta.svelte.html.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../js/components/DashboardAICta.svelte.html.js')>();
  return {renderHTML: (props: Parameters<typeof actual.renderHTML>[0]) => {
    const raw = actual.renderHTML(props); capture('pill-compiled', raw, props); return ports.change(raw);
  }};
});
interface Original {
  renderInterpretiveLensSection(): string;
  renderKnowledgeBaseSection(): string;
  renderDataProtectionCta(value?: unknown): string;
}
const fixture = fs.readFileSync(new URL('./fixtures/dashboard-ai-cta-original.txt', import.meta.url), 'utf8');
const original = vm.runInNewContext(fixture + '\n({renderInterpretiveLensSection, renderKnowledgeBaseSection, renderDataProtectionCta})', {
  state: ports.state, getLensSummary: summary, getDataProtectionStatus: status,
  dashboardAIActionAttrs: attrs, escapeHTML: escape,
}) as Original;
function native(markup: string): unknown {
  const dom = new JSDOM('', {url: 'https://example.invalid/'});
  try {
    const template = dom.window.document.createElement('template'); template.innerHTML = markup;
    function walk(node: Node): unknown {
      const element = node instanceof dom.window.Element ? node : null;
      return {type: node.nodeType, name: node.nodeName, value: node.nodeValue,
        attrs: element ? [...element.attributes].map(attr => [attr.name, attr.value, attr.namespaceURI]) : null,
        defaults: element instanceof dom.window.HTMLButtonElement
          ? {type: element.type, disabled: element.disabled, value: element.value, tabIndex: element.tabIndex}
          : element instanceof dom.window.HTMLElement ? {tabIndex: element.tabIndex} : null,
        children: [...node.childNodes].map(walk)};
    }
    return [...template.content.childNodes].map(walk);
  } finally {dom.window.close();}
}
function parity(name: keyof Original, value?: unknown) {
  const old = original[name](value); capture('original-' + name, old);
  const oldTrace = [...ports.trace]; ports.trace = [];
  const now = current[name](value);
  const expected = expectedDashboardAIHTML(old);
  expect(now).toBe(expected); expect(native(now)).toEqual(native(expected)); expect(ports.trace).toEqual(oldTrace);
}
beforeEach(() => {
  ports.trace = []; ports.summary = null; ports.state.importedData.interpretiveLens = '';
  ports.status = {encryption: true, sync: true, backup: true, backupSupported: true}; ports.change = html => html;
});
afterEach(() => {ports.change = html => html;});
describe('complete cold-safe Dashboard AI context/protection CTA', () => {
  for (const [label, lens, configured, enabled] of [
    ['unset', '', false, false], ['lens', 'Functional <lens> & "quoted"', false, false],
    ['KB', '', true, true], ['empty-enabled', '', false, true], ['both', 'Longevity', true, true],
  ] as const) it('preserves complete raw/native rows and buttons ' + label, () => {
    ports.state.importedData.interpretiveLens = lens;
    ports.summary = {configured, enabled, displayName: 'Library <Vault>', docCount: 2, aiAvailable: true, multiQueryOn: true};
    parity('renderInterpretiveLensSection'); expect(current.isDashboardAIModuleLoaded()).toBe(false);
  });
  for (const count of [null, 0, 1, 2, Infinity]) it('preserves KB count/rewriting/defaults ' + count, () => {
    ports.summary = {configured: true, enabled: true, displayName: 'My library', docCount: count, aiAvailable: true, multiQueryOn: false};
    parity('renderKnowledgeBaseSection');
  });
  it('preserves summary catch branches and trim exceptions', () => {
    ports.summary = new Error('summary failure'); parity('renderKnowledgeBaseSection');
    ports.trace = []; parity('renderInterpretiveLensSection');
    ports.state.importedData.interpretiveLens = {trim() {throw new Error('trim failure');}};
    for (const render of [original.renderInterpretiveLensSection, current.renderInterpretiveLensSection]) expect(render).toThrow('trim failure');
  });
  for (let mask = 0; mask < 16; mask++) it('preserves full native protection status mask ' + mask, () => {
    parity('renderDataProtectionCta', {encryption: !!(mask & 1), sync: !!(mask & 2), backup: !!(mask & 4), backupSupported: !!(mask & 8)});
  });
  it('preserves fallback truthiness and repeated status getter order', () => {
    function run(api: Original) {
      ports.trace = [];
      ports.status = new Proxy({backup: false, backupSupported: true, encryption: false, sync: true}, {
        get(target, key, receiver) {ports.trace.push('status.' + String(key)); return Reflect.get(target, key, receiver);},
      });
      return {html: api.renderDataProtectionCta(0), trace: [...ports.trace]};
    }
    const old = run(original);
    expect(run(current)).toEqual({...old, html: expectedDashboardAIHTML(old.html)});
  });
  it('preserves repeated KB getters/default-hint count conversion and final action order', () => {
    function run(api: Original) {
      ports.trace = [];
      const count = {[Symbol.toPrimitive](hint: string) {ports.trace.push('count:' + hint); return 2;}};
      ports.summary = new Proxy({configured: false, enabled: true, docCount: count, displayName: 'Research', aiAvailable: true, multiQueryOn: false}, {
        get(target, key, receiver) {ports.trace.push('summary.' + String(key)); return Reflect.get(target, key, receiver);},
      });
      return {html: api.renderKnowledgeBaseSection(), trace: [...ports.trace]};
    }
    const old = run(original);
    expect(run(current)).toEqual({...old, html: expectedDashboardAIHTML(old.html)});
  });
  for (const field of ['docCount', 'displayName', 'configured']) it('preserves throwing summary chronology ' + field, () => {
    function run(api: Original) {
      ports.trace = [];
      ports.summary = new Proxy({configured: true, enabled: true, docCount: 2, displayName: 'Research', aiAvailable: true}, {
        get(target, key, receiver) {ports.trace.push(String(key)); if (key === field) throw new Error(field); return Reflect.get(target, key, receiver);},
      });
      expect(() => api.renderKnowledgeBaseSection()).toThrow(field); return [...ports.trace];
    }
    expect(run(current)).toEqual(run(original));
  });
  it('escapes hostile normal text and off-contract count text without new nodes', () => {
    const hostile = '<img src=x onerror=bad()> <!--[--> gb-dashboard-ai-slot-0-end & " \' ';
    ports.state.importedData.interpretiveLens = hostile;
    ports.summary = {configured: true, enabled: true, displayName: hostile, docCount: {[Symbol.toPrimitive](hint: string) {return hint === 'number' ? 1 : hostile;}}, aiAvailable: false};
    const html = current.renderInterpretiveLensSection(); capture('hostile-current', html);
    const dom = new JSDOM(html);
    try {expect(dom.window.document.querySelector('img,script,[onerror]')).toBeNull(); expect(dom.window.document.body.textContent).toContain(hostile);} finally {dom.window.close();}
  });
  for (const [label, mutate] of [
    ['foreign marker', (html: string) => html.replace('<!--[-->', '<!--foreign-->')],
    ['changed literal aria label', (html: string) => html.replace('aria-label="Manage Knowledge Base"', 'aria-label="Wrong label"')],
    ['duplicate action attribute', (html: string) => html.replace('data-dashboard-ai-action="open-knowledge-base"', 'data-dashboard-ai-action="open-knowledge-base" data-dashboard-ai-action="wrong"')],
    ['changed Unicode icon', (html: string) => html.replace('📚', '💥')],
    ['changed role', (html: string) => html.replace('role="button"', 'role="link"')],
    ['added node', (html: string) => html + '<i>Extra</i>'],
  ] as const) it('detects genuine row corruption ' + label, () => {
    ports.summary = {configured: true, enabled: true, displayName: 'Library', docCount: 1};
    const expected = expectedDashboardAIHTML(original.renderKnowledgeBaseSection());
    expect(current.renderKnowledgeBaseSection()).toBe(expected);
    expect(()=>requireDashboardAIGraph(expected,expected)).not.toThrow();
    ports.change = html => {const changed=mutate(html);expect(changed).not.toBe(html);return changed;};
    expect(()=>requireDashboardAIGraph(current.renderKnowledgeBaseSection(),expected)).toThrow('Changed genuine Dashboard AI graph');
  });
  for (const [label,mutate] of [
    ['native button default',(html:string)=>html.replace('type="button"','type="submit"')],
    ['disabled default',(html:string)=>html.replace('<button','<button disabled')],
    ['action',(html:string)=>html.replace('data-dashboard-ai-action="setup-sync"','data-dashboard-ai-action="wrong"')],
    ['whitespace',(html:string)=>html.replace('\n        ','\n       ')],
  ] as const) it('detects genuine CTA corruption '+label,()=>{
    const state={encryption:true,sync:false,backup:true,backupSupported:true};
    const expected=expectedDashboardAIHTML(original.renderDataProtectionCta(state));
    expect(current.renderDataProtectionCta(state)).toBe(expected);
    ports.change=html=>{const changed=mutate(html);expect(changed).not.toBe(html);return changed;};
    expect(()=>requireDashboardAIGraph(current.renderDataProtectionCta(state),expected)).toThrow('Changed genuine Dashboard AI graph');
  });
  it('projects literal owned rows and preserves the validated public action boundary',()=>{
    const literal='<b data-probe>literal & "quoted"</b><!--[-->gb-dashboard-ai-slot-0-end';
    const row=presentation.projectDashboardLensRow(literal,attrs);
    expect(row).toEqual({ariaLabel:'Edit Interpretive Lens',action:'open-interpretive-lens',title:'Interpretive Lens - click to edit',
      icon:'🪞',label:'Interpretive Lens',detail:literal,editIcon:'✎'});
    expect(()=>presentation.renderDashboardLensRow(literal,()=>'<button onclick="bad()">')).toThrow('Unexpected Dashboard AI delegated action contract');
    const trace:string[]=[];expect(presentation.projectDashboardPersonalizeCta(true,true,action=>trace.push(action))).toBeNull();expect(trace).toEqual([]);
    const source=fs.readFileSync(new URL('../js/dashboard-ai-cta-presentation.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/finishSkeleton|primitive slot|gb-dashboard-ai-slot|matchAll|markup\.slice/);
  });
  it('has no authored handlers/HtmlTag and keeps delegated native defaults', () => {
    for (const name of ['DashboardAIRow', 'DashboardAICta']) {
      const source = fs.readFileSync(new URL('../js/components/' + name + '.svelte', import.meta.url), 'utf8');
      const ast = parse(source, {modern: true}); expect(ast).toBeDefined();
      expect(source).not.toMatch(/\son[a-z]+\s*=|\bon:[a-z]+|\{@html/);
    }
  });
});
