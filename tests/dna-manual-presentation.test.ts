import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {parse as parseSvelte} from 'svelte/compiler';
import {renderManualSnpDialog} from '../js/dna-manual-presentation.js';

const ports = vi.hoisted(() => ({
  stylesheet: vi.fn<() => Promise<boolean>>(), clear: vi.fn(), ensure: vi.fn<() => HTMLElement>(),
  open: vi.fn(), close: vi.fn(),
}));
vi.mock('../js/dna-runtime.js', () => ({
  loadGeneticsStylesheetForAction: ports.stylesheet, clearPendingDnaImport: ports.clear,
  ensureDnaModalOverlay: ports.ensure, navigateDnaRoute: vi.fn(), setPendingDnaImport: vi.fn(),
}));
vi.mock('../js/modal-lifecycle.js', () => ({openModalOverlay: ports.open, closeModalOverlay: ports.close}));
// Unrelated preview/domain owners are outside these controller-port tests.
vi.mock('../js/dna-mtdna.js', () => ({detectMtDNAMismatch: vi.fn()}));

function native(html: string) {
  const d = new JSDOM('').window.document, template = d.createElement('template');
  template.innerHTML = html;
  return template.content;
}
function eventsOrHtml(value: unknown, result: string[] = []): string[] {
  if (!value || typeof value !== 'object') return result;
  const node = value as {type?: string; name?: string};
  if (node.type === 'HtmlTag' || node.type === 'OnDirective' || node.type === 'EventHandler'
      || node.type === 'Attribute' && /^on/i.test(node.name || '')) result.push(node.name || node.type!);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => eventsOrHtml(item, result));
    else eventsOrHtml(child, result);
  }
  return result;
}

describe('complete manual SNP authored presentation', () => {
  it('preserves the complete original native dialog subtree and whitespace', () => {
    // Source-derived original template with the real fixed action helper results;
    // this fixture is not a claim of a prior browser capture.
    const original = native(fs.readFileSync(new URL('./fixtures/dna-manual-original.html', import.meta.url), 'utf8'));
    const current = native(renderManualSnpDialog());
    expect(current.querySelector('.dna-manual-modal')!.outerHTML).toBe(original.querySelector('.dna-manual-modal')!.outerHTML);
    expect(current.querySelectorAll('.dna-manual-modal')).toHaveLength(1);
  });
  it('preserves every editable native default and the literal multiline placeholder', () => {
    const root = native(renderManualSnpDialog());
    const bulk = root.querySelector<HTMLTextAreaElement>('#manual-snp-bulk')!;
    const source = root.querySelector<HTMLInputElement>('#manual-snp-source')!;
    expect([bulk.rows, bulk.value, bulk.defaultValue, bulk.required, bulk.getAttribute('spellcheck'), bulk.placeholder])
      .toEqual([7, '', '', false, 'false', 'rs1801133 CC\nrs8175347 6/7\nrs429358 TT APOE report']);
    expect([source.type, source.value, source.defaultValue, source.required, source.autocomplete, source.placeholder])
      .toEqual(['text', '', '', false, 'off', 'Manual entry / lab report name']);
    expect([...root.querySelectorAll<HTMLButtonElement>('button')].map(b => [b.type,b.dataset.dnaAction,b.disabled,b.textContent]))
      .toEqual([['button','close-preview',false,'Cancel'],['button','save-manual-snp',false,'Save SNPs']]);
    expect(root.querySelector('#manual-snp-rsid, #manual-snp-genotype, form')).toBeNull();
  });
  it('allows native value editing without interpolating data into the owned HTML', () => {
    const root = native(renderManualSnpDialog()), bulk = root.querySelector<HTMLTextAreaElement>('#manual-snp-bulk')!;
    bulk.value = 'rs1801133 CC\n<script>bad()</script>';
    expect(bulk.defaultValue).toBe('');
    expect(root.querySelector('script')).toBeNull();
    expect(native(renderManualSnpDialog()).querySelector<HTMLTextAreaElement>('#manual-snp-bulk')!.value).toBe('');
  });
  it('has no authored handlers or raw HTML slots and rejects meaningful handler counterfactuals', () => {
    const source = fs.readFileSync(new URL('../js/components/ManualSnpDialog.svelte', import.meta.url), 'utf8');
    expect(eventsOrHtml(parseSvelte(source, {modern: true}))).toEqual([]);
    for (const handler of ['onclick="bad()"','onclick={bad}','on:click={bad}','on:click|preventDefault','{onclick}']) {
      expect(eventsOrHtml(parseSvelte(`<button ${handler}>x</button>`, {modern: true})).length).toBeGreaterThan(0);
    }
    expect(eventsOrHtml(parseSvelte('{@html userValue}', {modern: true}))).toEqual(['HtmlTag']);
  });
});

describe('real manual SNP public controller gates and native delegate', () => {
  let dom: JSDOM;
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    dom = new JSDOM('<div id="dna-modal-overlay"><p>Prior dialog</p></div>');
    for (const name of ['document','window','Element','HTMLElement','MouseEvent','KeyboardEvent'] as const)
      vi.stubGlobal(name, dom.window[name]);
    ports.stylesheet.mockResolvedValue(true);
    ports.ensure.mockImplementation(() => dom.window.document.querySelector<HTMLElement>('#dna-modal-overlay')!);
  });
  afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });
  it('returns false without catalog/clear/overlay writes when CSS is unavailable', async () => {
    const ui = await import('../js/dna-ui.js'), catalog = vi.fn(async () => ({}));
    ui.configureDnaUi({loadSnpTable: catalog}); ports.stylesheet.mockResolvedValue(false);
    expect(await ui.openManualSnpModal()).toBe(false);
    expect(catalog).not.toHaveBeenCalled(); expect(ports.clear).not.toHaveBeenCalled();
    expect(ports.ensure).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('#dna-modal-overlay')!.innerHTML).toBe('<p>Prior dialog</p>');
  });
  it('propagates catalog rejection before pending-state clearing and preserves the old overlay', async () => {
    const ui = await import('../js/dna-ui.js'), error = new Error('catalog failed');
    ui.configureDnaUi({loadSnpTable: async () => {throw error;}});
    await expect(ui.openManualSnpModal()).rejects.toBe(error);
    expect(ports.clear).not.toHaveBeenCalled(); expect(ports.ensure).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('#dna-modal-overlay')!.innerHTML).toBe('<p>Prior dialog</p>');
  });
  it('retains load/clear/overlay/open chronology, overlay identity and exact focus policy', async () => {
    const ui = await import('../js/dna-ui.js'), trace: string[] = [];
    const overlay = dom.window.document.querySelector<HTMLElement>('#dna-modal-overlay')!;
    ports.stylesheet.mockImplementation(async () => {trace.push('css'); return true;});
    ui.configureDnaUi({loadSnpTable: async () => {trace.push('catalog'); return {};}});
    ports.clear.mockImplementation(() => {trace.push('clear');});
    ports.ensure.mockImplementation(() => {trace.push('ensure'); return overlay;});
    ports.open.mockImplementation(() => {trace.push('open'); expect(overlay.querySelector('#manual-snp-bulk')).not.toBeNull();});
    expect(await ui.openManualSnpModal()).toBe(true);
    expect(trace).toEqual(['css','catalog','clear','ensure','open']);
    expect(ports.open).toHaveBeenLastCalledWith(overlay,{initialFocus:'#manual-snp-bulk',focusDelay:30,scrollLock:true});
    expect(await ui.openManualSnpModal()).toBe(true);
    expect(dom.window.document.querySelector('#dna-modal-overlay')).toBe(overlay);
    expect(overlay.querySelectorAll('#manual-snp-bulk')).toHaveLength(1);
  });
  it('sends the two native button actions exactly once through the existing public delegate', async () => {
    const ui = await import('../js/dna-ui.js');
    const {initDnaActionDelegates} = await import('../js/dna-actions.js');
    const save = vi.fn(), close = vi.fn();
    initDnaActionDelegates({saveManualSnpFromModal: save, closeDNAImportPreview: close});
    initDnaActionDelegates({saveManualSnpFromModal: save, closeDNAImportPreview: close});
    await ui.openManualSnpModal();
    dom.window.document.querySelector<HTMLButtonElement>('[data-dna-action="save-manual-snp"]')!.click();
    dom.window.document.querySelector<HTMLButtonElement>('[data-dna-action="close-preview"]')!.click();
    expect(save).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    // JSDOM method calls prove delegate routing, not genuine browser input.
  });
});
