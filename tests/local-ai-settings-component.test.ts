// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from '../js/components/LocalAiSettings.svelte.native.js';
import { mountLocalAiSettings, disposeLocalAiSettings } from '../js/local-ai-settings-component.js';
import type { LocalAiSettingsActions, LocalAiSettingsSnapshot } from '../js/local-ai-settings-contract.js';
import { buildLocalAiAdvisor, checkedAdvisorModels, localAiLocationSnapshot } from '../js/local-ai-settings-view.js';
const actions = (): LocalAiSettingsActions => ({ test: vi.fn(), select: vi.fn(), copy: vi.fn(), applyOverride: vi.fn(), clearOverride: vi.fn() });
function fixture() {
  const host = document.createElement('div'); document.body.append(host);
  const snapshot: LocalAiSettingsSnapshot = { ...localAiLocationSnapshot('http://localhost:11434','llama3.2'), selectedModel: 'llama3.2', models: [], advisor: null };
  const callbacks = actions(), view = mountLocalAiSettings(host, snapshot, callbacks);
  return { host, view, snapshot, callbacks };
}
afterEach(() => { disposeLocalAiSettings(); document.body.replaceChildren(); });
it('keeps editable credentials in private properties and preserves their fields/focus during model updates', () => {
  const f = fixture(); f.view.setConnection({ url: 'https://PRIVATE.test', apiKey: 'PRIVATE KEY' });
  const input = f.host.querySelector<HTMLInputElement>('#local-ai-apikey-input')!; input.focus();
  f.view.refresh({ ...f.snapshot, models: [{ value: 'llama3.2', label: 'Llama' }] });
  expect(f.host.querySelector('#local-ai-apikey-input')).toBe(input); expect(document.activeElement).toBe(input); expect(input.value).toBe('PRIVATE KEY');
  expect(JSON.stringify(f.view.getSnapshot())).not.toContain('PRIVATE'); expect(f.host.innerHTML).not.toContain('PRIVATE');
});
it('scrubs held private fields and rejects controls retained from a replaced owner', () => {
  const f = fixture(); f.view.setConnection({ url: 'https://private.test', apiKey: 'KEY' });
  const fields = [...f.host.querySelectorAll<HTMLInputElement>('#local-ai-url-input,#local-ai-apikey-input')], button = f.host.querySelector<HTMLButtonElement>('[data-provider-panel-action]')!;
  fixture(); expect(f.view.isCurrent()).toBe(false); expect(fields.map(field => field.value)).toEqual(['','']); button.click(); expect(f.callbacks.test).not.toHaveBeenCalled();
});
it('routes model, keyboard disclosure and live hardware fields once through its owned callbacks', () => {
  const f = fixture(), hardware = { gpu: { name: 'GPU', vram: 16, unified: false, renderer: null, source: 'manual' }, ram: { gb: 32, source: 'manual' }, cpuThreads: 8 };
  const details = checkedAdvisorModels([{ name: 'llama3.2', size: 3e9 }]);
  f.view.refresh({ ...f.snapshot, models: [{ value: 'llama3.2', label: 'Llama' }] }); f.view.setAdvisor(buildLocalAiAdvisor(details,hardware,true,true,'llama3.2',16));
  const select = f.host.querySelector<HTMLSelectElement>('select')!; select.dispatchEvent(new Event('change', { bubbles: true })); expect(f.callbacks.select).toHaveBeenCalledExactlyOnceWith('llama3.2');
  const toggle = f.host.querySelector<HTMLButtonElement>('[data-local-ai-action="toggle-override"]')!;
  flushSync(() => toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  f.host.querySelector<HTMLInputElement>('#hw-vram-override-input')!.value = '24'; f.host.querySelector<HTMLButtonElement>('[data-local-ai-action="apply-hardware-override"]')!.click(); expect(f.callbacks.applyOverride).toHaveBeenCalledExactlyOnceWith('24');
});
it('renders hostile model metadata as text and keeps cloud pricing/privacy guidance', () => {
  const f = fixture(); const rows = checkedAdvisorModels([{ name: '<img src=x onerror=alert(1)>', size: 3e9 }]);
  const hardware = { gpu: { name: null, vram: null, unified: false, renderer: null, source: 'remote' }, ram: { gb: null, source: 'unknown' }, cpuThreads: null };
  f.view.refresh({ ...f.snapshot, ...localAiLocationSnapshot('https://remote.test','kimi:cloud'), models: [{ value: 'kimi:cloud', label: 'Cloud' }] });
  f.view.setAdvisor(buildLocalAiAdvisor(rows,hardware,false,false,'kimi:cloud',null));
  expect(f.host.querySelector('img')).toBeNull(); expect(f.host.textContent).toContain('<img src=x'); expect(f.host.textContent).toContain('Cloud model · provider terms may apply'); expect(f.host.textContent).toContain('off-device');
});
it('checks model projection fields and preserves observed runtime/context and unknown fit distinctions', () => {
  const details = checkedAdvisorModels([{ name: 'test', size: 3e9, loaded: true, vramAllocated: 2e9, contextLength: 8192, maxContextLength: 16384, nativeModelKey: 'PRIVATE', apiKey: 'PRIVATE' }, { name: 'test' }, { name: 2 }, { name: 'unknown', size: Infinity }]);
  expect(details).toHaveLength(2); expect(JSON.stringify(details)).not.toContain('PRIVATE');
  const hardware = { gpu: { name: null, vram: null, unified: false, renderer: null, source: 'remote' }, ram: { gb: null, source: 'unknown' }, cpuThreads: null };
  const advisor = buildLocalAiAdvisor(details,hardware,false,false,'test',null);
  expect(advisor.chips.join(' ')).toContain('2.0 GB VRAM'); expect(advisor.rows[0]!.details).toContain('8,192 token context loaded'); expect(advisor.rows[0]!.details).toContain('16,384 max context'); expect(advisor.rows[1]!.verdict).toBe('Size unknown');
});
