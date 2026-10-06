// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { cliSettingsFixture } from './helpers/cli-settings-fixture.js';
import { disposeCliAgentSettings } from '../js/cli-agent-settings-component.js';
import { getCliAgentModelsView,mountCliAgentModels } from '../js/cli-agent-models-component.js';
import { buildCliAgentModelsSnapshot } from '../js/cli-agent-models-presentation.js';
import { normalizeDiscoveredAgent } from '../js/agent-host-discovery.js';
import { buildCliAgentSettingsSnapshot } from '../js/cli-agent-settings-presentation.js';
import { flushSync } from '../js/components/CliAgentSettings.svelte.native.js';
const agent={ id:'codex',name:'Codex',compatible:true,status:'available',endpoint:'http://127.0.0.1:8325',token:'SYNTHETIC-PRIVATE-TOKEN',runtimeMode:'installed',capabilities:['companion-control','companion-restart'] };
afterEach(() => { disposeCliAgentSettings(); document.body.replaceChildren(); });
it('retains the model owner and field identity across discovery and disclosure refreshes', () => {
  const view=cliSettingsFixture([agent],'codex'),host=view.getModelHost()!;
  const models=mountCliAgentModels(host,buildCliAgentModelsSnapshot([],[],{ agent:'codex',target:'local',model:'',effort:'',providerFilter:'' }),() => {});
  const summary=host.querySelector('summary')!; summary.focus();
  view.refresh({ ...view.getSnapshot(),phase:'scanning' }); expect(view.getModelHost()).toBe(host); expect(models.isCurrent()).toBe(true); expect(document.activeElement).toBe(summary);
  view.refresh({ ...view.getSnapshot(),rows:view.getSnapshot().rows.map(row => ({ ...row,collapsed:true })) }); expect(host.hidden).toBe(true); expect(getCliAgentModelsView()).toBe(models);
  view.refresh({ ...view.getSnapshot(),rows:[] }); expect(getCliAgentModelsView()).toBeNull();
});
it('dispatches the shared master toggle once while preventing a legacy change delegate', () => {
  const toggle=vi.fn(); const actions={ scan:vi.fn(),platform:vi.fn(),copy:vi.fn(),login:vi.fn(),test:vi.fn(),toggle,disclose:vi.fn(),control:vi.fn() };
  cliSettingsFixture([agent],'direct',actions); const delegated=vi.fn(); document.body.addEventListener('change',delegated,{ once:true });
  flushSync(() => document.querySelector<HTMLInputElement>('input')!.click()); expect(toggle).toHaveBeenCalledExactlyOnceWith(true,'codex'); expect(delegated).not.toHaveBeenCalled();
  document.body.removeEventListener('change',delegated);
});
it('rejects retained callbacks and stale refreshes without disposing a replacement model owner', () => {
  const scan=vi.fn(); const actions={ scan,platform:vi.fn(),copy:vi.fn(),login:vi.fn(),test:vi.fn(),toggle:vi.fn(),disclose:vi.fn(),control:vi.fn() };
  const old=cliSettingsFixture([agent],'codex',actions),button=document.querySelector<HTMLButtonElement>('[data-settings-action="rescan-cli-agents"]')!;
  const next=cliSettingsFixture([agent],'codex'); const models=mountCliAgentModels(next.getModelHost()!,buildCliAgentModelsSnapshot([],[],{ agent:'codex',target:'local',model:'',effort:'',providerFilter:'' }),() => {});
  button.click(); old.refresh({ ...old.getSnapshot(),rows:[] }); expect(scan).not.toHaveBeenCalled(); expect(models.isCurrent()).toBe(true); expect(old.isCurrent()).toBe(false);
});
it('disables all action controls and nested model fields during single-flight work', () => {
  const view=cliSettingsFixture([agent],'codex'); view.setBusy(true);
  expect(document.querySelector('fieldset')!.disabled).toBe(true);
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button:not([data-settings-action="toggle-cli-agent-options"]),input')) expect(control.disabled).toBe(true);
  view.setBusy(false); expect(document.querySelector('fieldset')!.disabled).toBe(false);
});
it('projects safe management links and refuses remote or credential-bearing frame destinations', () => {
  for (const endpoint of ['https://127.0.0.1:8325','http://remote.example:8325','http://user:password@localhost:8325']) {
    const snapshot=buildCliAgentSettingsSnapshot([normalizeDiscoveredAgent({ ...agent,endpoint,controlAuthorized:false,capabilities:[...agent.capabilities,'companion-management','companion-management-embedded'] })],{ selectedAgent:'codex',backend:'direct',collapsed:new Set(),platform:'linux',origin:'http://localhost:8000',theme:'dark' });
    expect(snapshot.companion?.managementHref).toBe(''); expect(JSON.stringify(snapshot)).not.toContain(agent.token);
  }
  const view=cliSettingsFixture([{ ...agent,name:'<img src=x onerror=alert(1)>',controlAuthorized:false,capabilities:[...agent.capabilities,'companion-management'],endpoint:'http://localhost:8325/secret?token=private#secret' }]);
  expect(view.getSnapshot().companion?.managementHref).toBe('http://127.0.0.1:8325/manage'); expect(document.body.innerHTML).not.toContain(agent.token); expect(document.querySelector('img[src="x"]')).toBeNull();
});
