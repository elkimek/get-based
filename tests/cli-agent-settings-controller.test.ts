import { afterEach, expect, it, vi } from 'vitest';
import { createCliAgentSettingsController } from '../js/cli-agent-settings-controller.js';
import { buildCliAgentSettingsSnapshot } from '../js/cli-agent-settings-presentation.js';
import { normalizeDiscoveredAgent } from '../js/agent-host-discovery.js';
import type { CliAgentSettingsView } from '../js/cli-agent-settings-contract.js';
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>(r => { resolve=r; }); return { resolve,promise }; }
function fixture() {
  let current=true;
  const context={ agent:'codex',target:'local',model:'first',effort:'high',backend:'codex' };
  const connection={ endpoint:'http://127.0.0.1:8324',token:'SYNTHETIC-PRIVATE-TOKEN' };
  const companion=normalizeDiscoveredAgent({ id:'codex',status:'available',compatible:true,...connection,controlAuthorized:true,runtimeMode:'installed',capabilities:['companion-control','companion-restart'] });
  const snapshot=buildCliAgentSettingsSnapshot([companion],{ selectedAgent:'codex',backend:'codex',collapsed:new Set(),platform:'linux',origin:'http://localhost:8000',theme:'dark' });
  const view:CliAgentSettingsView={ isCurrent:() => current,getSnapshot:() => snapshot,refresh:vi.fn(),setStatus:vi.fn(),setBusy:vi.fn(),getModelHost:() => null,resizeFrame:vi.fn() };
  const ports:Parameters<typeof createCliAgentSettingsController>[0]={
    view:() => view,platform:() => 'linux',context:() => ({ ...context }),connection:() => ({ ...connection }),companion:() => ({ id:companion.id,endpoint:companion.endpoint,token:companion.token }),
    connect:vi.fn(async () => {}),discover:vi.fn(async () => [companion]),models:vi.fn(async () => []),
    save:vi.fn(async ({ agent }) => { context.agent=agent; }),control:vi.fn(async () => ({})),
    setBackend:vi.fn(value => { context.backend=value; }),notify:vi.fn(),confirm:vi.fn(async () => true),clipboard:vi.fn(async () => {}),refresh:vi.fn(async () => {}),resetModels:vi.fn(),busyChanged:vi.fn(),
  };
  return { context,connection,companion,view,ports,controller:createCliAgentSettingsController(ports),close:() => { current=false; } };
}
afterEach(() => vi.useRealTimers());
it('blocks concurrent actions across remount until the accepted action settles', async () => {
  const f=fixture(),pending=deferred<void>(); vi.mocked(f.ports.connect).mockReturnValueOnce(pending.promise);
  const testing=f.controller.test('codex'); f.close(); const replacement={ ...f.view,isCurrent:() => true }; f.ports.view=() => replacement;
  await f.controller.toggle(true,'claude'); expect(f.ports.connect).toHaveBeenCalledOnce(); expect(f.controller.isBusy()).toBe(true);
  pending.resolve(); await testing; expect(f.ports.models).not.toHaveBeenCalled(); expect(f.ports.notify).not.toHaveBeenCalled(); expect(f.controller.isBusy()).toBe(false);
  await f.controller.copy('start'); expect(f.ports.clipboard).toHaveBeenCalledOnce();
});
it('guards connection publication against closed views and replaced credentials', async () => {
  const f=fixture(),pending=deferred<void>(); let guard: (() => boolean) | undefined;
  vi.mocked(f.ports.connect).mockImplementationOnce(async (_agent,options) => { guard=options.isCurrent; await pending.promise; });
  const testing=f.controller.test('codex'); expect(guard?.()).toBe(true); f.connection.token='REPLACEMENT'; expect(guard?.()).toBe(false);
  f.close(); pending.resolve(); await testing; expect(f.ports.models).not.toHaveBeenCalled(); expect(f.ports.notify).not.toHaveBeenCalled();
});
it('rejects a late test catalog after connection replacement', async () => {
  const f=fixture(),pending=deferred<unknown[]>(); vi.mocked(f.ports.models).mockReturnValueOnce(pending.promise);
  const testing=f.controller.test('codex'); await vi.waitFor(() => expect(f.ports.models).toHaveBeenCalledOnce());
  f.connection.token='REPLACEMENT'; pending.resolve([]); await testing; expect(f.ports.notify).not.toHaveBeenCalled(); expect(f.ports.refresh).not.toHaveBeenCalled();
});
it('lets accepted agent persistence finish after close without selecting a backend in another view', async () => {
  const f=fixture(),pending=deferred<void>(); vi.mocked(f.ports.save).mockImplementationOnce(async ({ agent }) => { await pending.promise; f.context.agent=agent; });
  const selecting=f.controller.toggle(true,'claude'); await vi.waitFor(() => expect(f.ports.save).toHaveBeenCalledOnce()); f.close(); pending.resolve(); await selecting;
  expect(f.context.agent).toBe('claude'); expect(f.ports.setBackend).not.toHaveBeenCalled(); expect(f.ports.resetModels).not.toHaveBeenCalled(); expect(f.ports.notify).not.toHaveBeenCalled();
});
it('keeps connection tests target-scoped and selects a connected agent only after saving it', async () => {
  const f=fixture(); f.context.target='gateway'; await f.controller.test('codex');
  expect(f.ports.models).toHaveBeenLastCalledWith({ ...f.connection,agent:'codex',target:'gateway' });
  await f.controller.test('claude'); expect(f.ports.models).toHaveBeenLastCalledWith({ ...f.connection,agent:'claude',target:'local' });
  await f.controller.toggle(true,'claude'); expect(f.context.agent).toBe('claude'); expect(f.context.backend).toBe('codex'); expect(f.ports.resetModels).toHaveBeenCalledOnce();
  await f.controller.toggle(false,'claude'); expect(f.context.backend).toBe('direct');
});
it('rejects management dispatch after closure during uninstall confirmation or discovery', async () => {
  const f=fixture(),confirmation=deferred<boolean>(); vi.mocked(f.ports.confirm).mockReturnValueOnce(confirmation.promise);
  const removing=f.controller.control('uninstall'); f.close(); confirmation.resolve(true); await removing; expect(f.ports.discover).not.toHaveBeenCalled(); expect(f.ports.control).not.toHaveBeenCalled();
  const g=fixture(),discovery=deferred<typeof g.companion[]>(); vi.mocked(g.ports.discover).mockReturnValueOnce(discovery.promise);
  const updating=g.controller.control('update'); g.close(); discovery.resolve([g.companion]); await updating; expect(g.ports.control).not.toHaveBeenCalled();
});
it('refuses unoffered controls and changed discovery authority or lifecycle', async () => {
  const f=fixture(); await f.controller.control('install'); await f.controller.control('unexpected'); expect(f.ports.discover).not.toHaveBeenCalled();
  f.companion.controlAuthorized=false; await f.controller.control('pause'); expect(f.ports.control).not.toHaveBeenCalled(); expect(f.ports.notify).toHaveBeenCalledWith('Companion controls changed. Check the connection again.','error',9000);
  f.companion.controlAuthorized=true; f.companion.paused=true; await f.controller.control('pause'); expect(f.ports.control).not.toHaveBeenCalled();
});
it('manages the selected companion even when another discovered host comes first', async () => {
  const f=fixture(); vi.mocked(f.ports.discover).mockResolvedValue([normalizeDiscoveredAgent({ ...f.companion,id:'claude',endpoint:'http://127.0.0.1:8325' }),f.companion]);
  await f.controller.control('pause'); expect(f.ports.control).toHaveBeenCalledExactlyOnceWith({ ...f.connection,action:'pause' }); expect(f.context.backend).toBe('direct');
});
it('lets accepted pause finish after closure while keeping status and notifications with its owner', async () => {
  const f=fixture(),pending=deferred<Record<string,unknown>>(); vi.mocked(f.ports.control).mockReturnValueOnce(pending.promise);
  const pausing=f.controller.control('pause'); await vi.waitFor(() => expect(f.ports.control).toHaveBeenCalledOnce()); f.close(); pending.resolve({}); await pausing;
  expect(f.context.backend).toBe('direct'); expect(f.ports.notify).not.toHaveBeenCalled(); expect(f.ports.refresh).not.toHaveBeenCalled();
});
it('does not disable a replacement connection after a late accepted pause', async () => {
  const f=fixture(),pending=deferred<Record<string,unknown>>(); vi.mocked(f.ports.control).mockReturnValueOnce(pending.promise);
  const pausing=f.controller.control('pause'); await vi.waitFor(() => expect(f.ports.control).toHaveBeenCalledOnce()); f.connection.token='REPLACEMENT'; pending.resolve({}); await pausing;
  expect(f.context.backend).toBe('codex'); expect(f.ports.notify).not.toHaveBeenCalled();
});
it('does not refresh a reopened view from an older restart timer', async () => {
  vi.useFakeTimers(); const f=fixture(); await f.controller.control('restart-companion'); f.close(); await vi.advanceTimersByTimeAsync(1800); expect(f.ports.refresh).not.toHaveBeenCalled();
});
it('keeps clipboard text private and discards late clipboard feedback after close', async () => {
  const f=fixture(),pending=deferred<void>(); vi.mocked(f.ports.clipboard).mockReturnValueOnce(pending.promise);
  const copying=f.controller.login('claude'); expect(f.ports.clipboard).toHaveBeenCalledExactlyOnceWith('claude auth login --console'); f.close(); pending.resolve(); await copying; expect(f.ports.notify).not.toHaveBeenCalled();
});
it('discards failed test feedback after private credentials change', async () => {
  const f=fixture(); let reject!: (reason:Error) => void;
  vi.mocked(f.ports.models).mockReturnValueOnce(new Promise((_resolve,failure) => { reject=failure; }));
  const testing=f.controller.test('codex');await vi.waitFor(() => expect(f.ports.models).toHaveBeenCalledOnce());
  f.connection.token='REPLACEMENT';reject(new Error('Obsolete private request failed'));await testing;
  expect(f.ports.notify).not.toHaveBeenCalled();expect(f.ports.refresh).not.toHaveBeenCalled();
});

it('refuses a fresh discovery that replaces the companion the displayed controls belong to', async () => {
  const f=fixture();vi.mocked(f.ports.discover).mockResolvedValue([normalizeDiscoveredAgent({ ...f.companion,endpoint:'http://127.0.0.1:8326',token:'ANOTHER-PRIVATE-TOKEN' })]);
  await f.controller.control('pause');expect(f.ports.control).not.toHaveBeenCalled();expect(f.context.backend).toBe('codex');expect(f.ports.notify).toHaveBeenCalledWith('Companion controls changed. Check the connection again.','error',9000);
});
