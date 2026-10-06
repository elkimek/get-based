// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from '../js/components/CliAgentModels.svelte.native.js';
import { mountCliAgentModels, disposeCliAgentModels } from '../js/cli-agent-models-component.js';
import { buildCliAgentModelsSnapshot, getCLIAgentModelProvider } from '../js/cli-agent-models-presentation.js';
import type { AgentModel } from '../js/agent-model-catalog.js';
const model = (id: string, isDefault = false): AgentModel => ({ id, model: id, displayName: id, description: '', isDefault,
  defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '' }], inputModalities: ['text'] });
const rows = Array.from({ length: 16 }, (_,i) => model(`openrouter/model-${i}`, i === 0));
const selection = { agent: 'opencode', target: 'local', model: 'openrouter/model-1', effort: 'high', providerFilter: '' };
function fixture() {
  const host = document.createElement('div'); host.id = 'cli-agent-options'; document.body.append(host);
  const initial = buildCliAgentModelsSnapshot(rows,[],selection), action = vi.fn(), view = mountCliAgentModels(host,initial,action);
  return { host, initial, action, view };
}
afterEach(() => { disposeCliAgentModels(); document.body.replaceChildren(); });
it('projects provider catalogs, missing saved IDs and unsupported reasoning without credentials', () => {
  const snapshot = buildCliAgentModelsSnapshot([...rows,model('anthropic/model')], [{ id: 'local', label: 'Local CLI' }, { id: 'gateway', label: 'Personal', kind: 'gateway', status: 'unavailable' }],
    { ...selection, target: 'gateway', model: 'missing', effort: 'ultra' });
  expect(snapshot.pickers.map(p => p.id)).toEqual(['cli-agent-target','cli-agent-provider','cli-agent-model','cli-agent-effort']);
  expect(snapshot.pickers[0]!.options[1]!.label).toBe('Personal · offline');
  expect(snapshot.pickers[2]!.options).toContainEqual({ value: 'missing', label: 'missing · unavailable' });
  expect(snapshot.pickers[3]!.options).toContainEqual({ value: 'ultra', label: 'ultra · unavailable' });
  expect(snapshot.note).toContain('local health-data tools and background feature jobs are not available');
  expect(getCLIAgentModelProvider('hermes', model('custom:ollama:llama'))).toBe('custom:ollama');
  expect(getCLIAgentModelProvider('openclaw',model('openai/gpt'))).toBe('openai');
});
it('preserves search, focus and disclosure across snapshot refreshes, and resets them for another execution target', () => {
  const f = fixture(), input = f.host.querySelector<HTMLInputElement>('input')!;
  flushSync(() => { input.value = 'model-15'; input.dispatchEvent(new Event('input', { bubbles: true })); }); input.focus();
  f.view.refresh({ ...f.initial, error: 'Temporary failure' });
  expect(f.host.querySelector('input')).toBe(input); expect(document.activeElement).toBe(input); expect(input.value).toBe('model-15');
  expect(f.host.querySelector('#cli-agent-model-result-count')!.textContent).toBe('1 model');
  f.view.refresh({ ...f.initial, context: 'opencode:gateway' }); expect(input.value).toBe('');
});
it('searches labels and IDs through a compatibility port and shows an empty result accurately', () => {
  const f = fixture(); f.view.filter('OPENROUTER/model-15'); expect(f.host.querySelectorAll('#cli-agent-model-options button')).toHaveLength(1);
  f.view.filter('no-match'); expect(f.host.querySelector('#cli-agent-model-result-count')!.textContent).toBe('0 models');
  f.view.filter(''); expect(f.host.querySelectorAll('#cli-agent-model-options button')).toHaveLength(17);
});
it('sends each selection once, blocks the legacy delegate and rejects retained controls after replacement', () => {
  const f = fixture(), delegated = vi.fn(); document.body.addEventListener('click', delegated, { once: true });
  const button = f.host.querySelector<HTMLButtonElement>('[data-value="openrouter/model-2"]')!; button.click();
  expect(f.action).toHaveBeenCalledExactlyOnceWith('set-cli-agent-model','openrouter/model-2'); expect(delegated).not.toHaveBeenCalled();
  f.action.mockClear(); fixture(); button.click(); expect(f.action).not.toHaveBeenCalled(); expect(f.view.isCurrent()).toBe(false);
});
it('supports arrow, home, end and escape keys without dispatching a selection', () => {
  const f = fixture(), buttons = [...f.host.querySelectorAll<HTMLButtonElement>('#cli-agent-model-options button')];
  const press = (button: HTMLButtonElement,key: string) => flushSync(() => button.dispatchEvent(new KeyboardEvent('keydown',{ key,bubbles:true,cancelable:true })));
  buttons[0]!.focus(); press(buttons[0]!, 'End'); expect(document.activeElement).toBe(buttons.at(-1));
  press(buttons.at(-1)!, 'ArrowDown'); expect(document.activeElement).toBe(buttons[0]);
  press(buttons[0]!, 'Escape'); expect(document.activeElement).toBe(f.host.querySelector('#cli-agent-model-summary')); expect(f.action).not.toHaveBeenCalled();
});
it('renders hostile labels as text and makes unavailable reasoning controls disabled', () => {
  const f = fixture(), dangerous = model('<img src=x onerror=alert(1)>'); dangerous.supportedReasoningEfforts = [];
  f.view.refresh(buildCliAgentModelsSnapshot([dangerous],[],{ ...selection,agent:'hermes',model:dangerous.id }));
  expect(f.host.querySelector('img')).toBeNull(); expect(f.host.textContent).toContain(dangerous.id);
  const summary = f.host.querySelector('#cli-agent-effort-summary')!; expect(summary.getAttribute('aria-disabled')).toBe('true');
  expect(f.host.querySelector<HTMLButtonElement>('[data-settings-action="set-cli-agent-effort"]')!.disabled).toBe(true);
  expect(f.host.textContent).toContain('Uses Hermes setting');
});

it('retains model identity when names contain slashes or descriptions, stripping only an actual provider prefix', () => {
  const models = [model('openrouter/model-1'),model('openrouter/model-2'),model('openrouter/model-3')];
  models[0]!.displayName = 'Model 1 · long description'; models[1]!.displayName = 'Model family/version'; models[2]!.displayName = 'OpenRouter / Branded model';
  const snapshot = buildCliAgentModelsSnapshot(models,[],selection), options = snapshot.pickers.find(p => p.id === 'cli-agent-model')!.options;
  expect(options.find(o => o.value === models[0]!.id)!.label).toBe('Model 1 · long description');
  expect(options.find(o => o.value === models[1]!.id)!.label).toBe('Model family/version');
  expect(options.find(o => o.value === models[2]!.id)!.label).toBe('Branded model');
});
