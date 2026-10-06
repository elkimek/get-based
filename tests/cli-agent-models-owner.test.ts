// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ agent: 'codex', target: 'local', model: 'first', effort: '', backend: 'codex', token:'PRIVATE TOKEN',
  connect: vi.fn(async (_agent?:string,_options?:{ isCurrent?:() => boolean }) => {}), models: vi.fn(), targets: vi.fn(), discover: vi.fn(), save: vi.fn(), cache: vi.fn(), notify: vi.fn() }));
vi.mock('../js/agent-chat-settings.js', () => ({
  getAgentHostAgent: () => state.agent, getAgentHostTarget: () => state.target, getAgentHostModel: () => state.model,
  getAgentHostEffort: () => state.effort, getAgentHostEndpoint: () => 'http://127.0.0.1:8324', getAgentHostToken: () => state.token,
  getChatBackend: () => state.backend, setChatBackend: (next: string) => { state.backend = next; },
  connectDetectedAgent: state.connect, discoverLocalChatAgents: state.discover, saveAgentChatSettings: state.save,
}));
vi.mock('../js/agent-chat-client.js', () => ({ listAgentModels: state.models, listAgentExecutionTargets: state.targets, controlAgentHost: vi.fn() }));
vi.mock('../js/agent-model-catalog.js', () => ({ cacheAgentModelCatalog: state.cache }));
vi.mock('../js/utils.js', () => ({ escapeHTML: (value: unknown) => String(value), escapeAttr: (value: unknown) => String(value), showConfirmDialog: vi.fn(), showNotification: state.notify }));
import { refreshDetectedAgentList, renderCLIAgentProviderPanel, setCLIAgentModel, setCLIAgentTarget, setCLIAgentEffort } from '../js/settings-cli-agent-panel.js';
import { cliSettingsFixture } from './helpers/cli-settings-fixture.js';
import { disposeCliAgentSettings } from '../js/cli-agent-settings-component.js';
import { disposeCliAgentModels, getCliAgentModelsView } from '../js/cli-agent-models-component.js';
import type { AgentModel } from '../js/agent-model-catalog.js';
const model = (id: string): AgentModel => ({ id, model: id, displayName: id, isDefault: true, description: '', defaultReasoningEffort: '', supportedReasoningEfforts: [], inputModalities: ['text'] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve,promise }; }
beforeEach(() => {
  Object.assign(state, { agent:'codex',target:'local',model:'first',effort:'',backend:'codex',token:'PRIVATE TOKEN' }); vi.clearAllMocks();
  state.connect.mockResolvedValue(undefined); state.models.mockResolvedValue([model('first')]);
  state.targets.mockResolvedValue([{ id:'local',label:'Local CLI' }, { id:'gateway',label:'Personal gateway',kind:'gateway' }]);
  state.discover.mockResolvedValue([{ id:'codex', name:'Codex', compatible:true,status:'available' }]);
  state.save.mockImplementation(async (settings: Record<string,string>) => Object.assign(state,settings));
  state.cache.mockImplementation((models: AgentModel[]) => models);
  cliSettingsFixture([],state.backend);
});
afterEach(() => { disposeCliAgentSettings(); document.body.replaceChildren(); });
async function ready() { await refreshDetectedAgentList(); await vi.waitFor(() => expect(document.getElementById('cli-agent-model-summary')?.textContent).toContain('first')); }
it('rejects an older discovery result before it overwrites a newer model catalog', async () => {
  const late = deferred<AgentModel[]>(); state.models.mockReturnValueOnce(late.promise);
  await refreshDetectedAgentList(); await vi.waitFor(() => expect(state.models).toHaveBeenCalledOnce());
  await ready(); late.resolve([model('obsolete')]); await Promise.resolve();
  expect(document.getElementById('cli-agent-model-summary')?.textContent).toContain('first');
  expect(state.cache.mock.calls.flat()).not.toContainEqual([model('obsolete')]);
});
it('rejects late model selection after Settings closes and leaves stored choices unchanged', async () => {
  await ready(); const late = deferred<AgentModel[]>(); state.models.mockReturnValueOnce(late.promise);
  const selecting = setCLIAgentModel('obsolete'); await vi.waitFor(() => expect(state.models).toHaveBeenCalledTimes(2));
  disposeCliAgentModels(); document.getElementById('ai-provider-panel')!.remove(); late.resolve([model('obsolete')]); await selecting;
  expect(state.save).not.toHaveBeenCalled(); expect(state.model).toBe('first'); expect(state.notify).not.toHaveBeenCalled();
});
it('keeps the latest explicit model request when two catalog checks resolve out of order', async () => {
  await ready(); const late = deferred<AgentModel[]>(); state.models.mockReturnValueOnce(late.promise);
  const older = setCLIAgentModel('obsolete'); await vi.waitFor(() => expect(state.models).toHaveBeenCalledTimes(2));
  state.models.mockResolvedValueOnce([model('latest')]); await setCLIAgentModel('latest'); late.resolve([model('obsolete')]); await older;
  expect(state.model).toBe('latest'); expect(state.save).toHaveBeenCalledExactlyOnceWith({ model:'latest' });
  expect(document.getElementById('cli-agent-model-summary')?.textContent).toContain('latest');
});
it('does not replace a remounted view with a late execution-target discovery', async () => {
  await ready(); const late = deferred<Array<{ id:string;label:string }>>(); state.targets.mockReturnValueOnce(late.promise);
  const selecting = setCLIAgentTarget('gateway'); await vi.waitFor(() => expect(state.targets).toHaveBeenCalledTimes(2));
  const previous = getCliAgentModelsView(); disposeCliAgentSettings(); cliSettingsFixture([],state.backend); await ready(); expect(previous?.isCurrent()).toBe(false);
  late.resolve([{ id:'gateway',label:'Obsolete gateway' }]); await selecting;
  expect(state.save).not.toHaveBeenCalled(); expect(state.target).toBe('local');
});
it('retains the execution selector and recovery copy when a personal gateway is offline', async () => {
  await ready(); state.targets.mockResolvedValue([{ id:'local',label:'Local CLI' },{ id:'gateway',label:'Personal gateway',kind:'gateway',status:'unavailable',message:'Start this gateway.' }]);
  await setCLIAgentTarget('gateway'); expect(state.target).toBe('gateway');
  expect(document.getElementById('cli-agent-target-summary')?.textContent).toContain('Personal gateway');
  expect(document.getElementById('cli-agent-options')?.textContent).toContain('Start this gateway.');
  await setCLIAgentTarget('local'); await vi.waitFor(() => expect(document.getElementById('cli-agent-model-summary')?.textContent).toContain('first'));
});
it('lets an accepted persistence finish after closure without publishing into another view', async () => {
  await ready(); const late = deferred<void>(); state.save.mockImplementationOnce(async (settings: Record<string,string>) => { await late.promise; Object.assign(state,settings); });
  state.models.mockResolvedValueOnce([model('accepted')]); const selecting = setCLIAgentModel('accepted');
  await vi.waitFor(() => expect(state.save).toHaveBeenCalledOnce()); disposeCliAgentModels(); document.getElementById('cli-agent-options')!.textContent = 'replacement';
  late.resolve(undefined); await selecting; expect(state.model).toBe('accepted'); expect(document.getElementById('cli-agent-options')!.textContent).toBe('replacement');
  expect(state.notify).not.toHaveBeenCalled();
});

it('rejects a catalog obtained with a replaced companion credential before caching or saving it', async () => {
  await ready(); state.cache.mockClear(); const late = deferred<AgentModel[]>(); state.models.mockReturnValueOnce(late.promise);
  const selecting = setCLIAgentModel('obsolete'); await vi.waitFor(() => expect(state.models).toHaveBeenCalledTimes(2));
  state.token = 'NEW PRIVATE TOKEN'; late.resolve([model('obsolete')]); await selecting;
  expect(state.cache).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled(); expect(state.model).toBe('first');
});
it('does not revive controls when Settings closes during native CLI discovery while its DOM remains attached', async () => {
  const late = deferred<Array<{ id:string;name:string;compatible:boolean;status:string }>>(); state.discover.mockReturnValueOnce(late.promise);
  const scanning = refreshDetectedAgentList(); disposeCliAgentSettings();
  late.resolve([{ id:'codex',name:'Codex',compatible:true,status:'available' }]); await scanning;
  await new Promise(resolve => setTimeout(resolve,0));
  expect(getCliAgentModelsView()).toBeNull(); expect(state.models).not.toHaveBeenCalled();
});

it('cancels the initial queued CLI scan when Settings closes before the mount microtask', async () => {
  document.getElementById('ai-provider-panel')!.innerHTML = renderCLIAgentProviderPanel(); disposeCliAgentSettings();
  await Promise.resolve(); expect(state.discover).not.toHaveBeenCalled(); expect(getCliAgentModelsView()).toBeNull();
});

it('rejects programmatic model helpers after teardown even when the Settings DOM remains attached', async () => {
  await ready(); disposeCliAgentSettings(); state.connect.mockClear(); state.save.mockClear(); state.models.mockClear(); state.targets.mockClear();
  await setCLIAgentModel('obsolete'); await setCLIAgentTarget('gateway'); await setCLIAgentEffort('obsolete');
  expect(state.connect).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled(); expect(state.models).not.toHaveBeenCalled(); expect(state.targets).not.toHaveBeenCalled();
});
it('guards model connection publication against a replaced initiating credential', async () => {
  await ready(); const late=deferred<void>(); let guard:(() => boolean) | undefined;
  state.connect.mockImplementationOnce(async (_agent?:string,options?:{ isCurrent?:() => boolean }) => { guard=options?.isCurrent; await late.promise; if (!guard?.()) throw new Error('superseded'); });
  const selecting=setCLIAgentModel('obsolete'); expect(guard?.()).toBe(true); state.token='REPLACEMENT'; expect(guard?.()).toBe(false); late.resolve(); await selecting;
  expect(state.save).not.toHaveBeenCalled(); expect(state.notify).not.toHaveBeenCalled();
});
