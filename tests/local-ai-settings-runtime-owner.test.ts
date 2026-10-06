// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ config: { url: 'http://localhost:11434', apiKey: 'KEY', model: 'old', mode: 'ollama' }, selected: 'old', provider: 'ollama', backend: 'direct', discover: vi.fn(), hardware: vi.fn(), cached: null as unknown }));
vi.mock('../js/api.js', () => ({ getOllamaConfig: () => state.config, getOllamaMainModel: () => state.selected, setOllamaMainModel: vi.fn((value: string) => { state.selected = value; }), getAIProvider: () => state.provider, getOllamaPIIUrl: () => 'http://other.test', getOllamaPIIApiKey: () => '', getOllamaPIIModel: () => '', saveOllamaConfig: vi.fn(), saveOllamaPIIApiKey: vi.fn(), setOllamaPIIModel: vi.fn(), setOllamaPIIUrl: vi.fn() }));
vi.mock('../js/agent-chat-settings.js', () => ({ getChatBackend: () => state.backend }));
vi.mock('../js/local-ai-discovery.js', async original => ({ ...await original<typeof import('../js/local-ai-discovery.js')>(), discoverLocalAI: state.discover, getCachedLocalAiDiscovery: () => state.cached }));
vi.mock('../js/hardware.js', async original => ({ ...await original<typeof import('../js/hardware.js')>(), detectHardware: state.hardware }));
import { hydrateLocalAiSettings, initSettingsOllamaCheck, renderModelAdvisor } from '../js/provider-local-ai-controls.js';
import { disposeLocalAiSettings, getLocalAiSettingsView } from '../js/local-ai-settings-component.js';
import { getCachedLocalAiModelDetails, clearCachedLocalAiModelDetails } from '../js/provider-local-ai-runtime.js';
const hardware = { gpu: { name: 'GPU', vram: 16, unified: false, renderer: null, source: 'manual' }, ram: { gb: 32, source: 'manual' }, cpuThreads: 8 };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function host() { const element = document.createElement('div'); document.body.append(element); hydrateLocalAiSettings(element); return getLocalAiSettingsView()!; }
afterEach(() => { disposeLocalAiSettings(); document.body.replaceChildren(); clearCachedLocalAiModelDetails(); localStorage.clear(); vi.clearAllMocks(); state.config = { url: 'http://localhost:11434', apiKey: 'KEY', model: 'old', mode: 'ollama' }; state.selected = 'old'; state.provider = 'ollama'; state.backend = 'direct'; });
it.each(['close','provider','account','backend'] as const)('rejects passive discovery after %s changes without reconciling another model or cache', async change => {
  const view = host(), request = deferred<unknown>(); state.discover.mockReturnValueOnce(request.promise); initSettingsOllamaCheck();
  if (change === 'close') { disposeLocalAiSettings(); host(); }
  if (change === 'provider') state.provider = 'custom';
  if (change === 'account') state.config = { ...state.config, apiKey: 'OTHER' };
  if (change === 'backend') state.backend = 'codex';
  request.resolve({ available: true, models: ['new'], modelDetails: [{ name: 'new', vision: true }], provider: 'ollama' });
  await new Promise(resolve => setTimeout(resolve, 0)); expect(state.selected).toBe('old'); expect(getCachedLocalAiModelDetails().modelDetails).toEqual([]); expect(view.getStatus().text).not.toContain('Connected');
});
it('retains full domain vision/reasoning/runtime metadata while projecting checked advisor fields', async () => {
  const view = host(); state.hardware.mockResolvedValue(hardware);
  state.discover.mockResolvedValueOnce({ available: true, models: ['new'], modelDetails: [{ name: 'new', vision: true, reasoning: { allowedOptions: ['high'] }, nativeModelKey: 'NATIVE', loadedInstanceId: 'INSTANCE', size: 3e9 }], provider: 'ollama', baseUrl: state.config.url });
  initSettingsOllamaCheck(); await vi.waitFor(() => expect(view.getStatus().status).toBe('connected'));
  expect(state.selected).toBe('new'); expect(getCachedLocalAiModelDetails().modelDetails[0]).toMatchObject({ vision: true, nativeModelKey: 'NATIVE', loadedInstanceId: 'INSTANCE', reasoning: { allowedOptions: ['high'] } });
  expect(JSON.stringify(view.getSnapshot())).not.toContain('NATIVE'); expect(JSON.stringify(view.getSnapshot())).not.toContain('KEY');
});
it('cannot apply delayed hardware advice to another mounted owner or changed model', async () => {
  const view = host(), detection = deferred<typeof hardware>(); state.hardware.mockReturnValueOnce(detection.promise);
  const work = renderModelAdvisor([{ name: 'old', size: 3e9 }], null, true); disposeLocalAiSettings(); const replacement = host(); detection.resolve(hardware); await work;
  expect(replacement.getSnapshot().advisor).toBeNull(); expect(view.isCurrent()).toBe(false);
  const later = deferred<typeof hardware>(); state.hardware.mockReturnValueOnce(later.promise); const second = renderModelAdvisor([{ name: 'old', size: 3e9 }],null,true); state.selected = 'new'; later.resolve(hardware); await second; expect(replacement.getSnapshot().advisor).toBeNull();
});
