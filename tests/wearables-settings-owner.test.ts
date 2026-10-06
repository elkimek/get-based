// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const ports=vi.hoisted(()=>({
  profileId:'profile-a',state:{importedData:{wearableConnections:{}}},
  view:{profileId:'profile-a',isCurrent:vi.fn(),update:vi.fn(),setManualCounts:vi.fn(),setPending:vi.fn(),setImportProgress:vi.fn()},
  confirm:vi.fn(),config:vi.fn(),range:vi.fn(),deleteManual:vi.fn(),manualSummary:vi.fn(),disconnect:vi.fn(),sync:vi.fn(),backfill:vi.fn(),summary:vi.fn(),oauth:vi.fn(),navigate:vi.fn(),notify:vi.fn(),withdraw:vi.fn(),
}));
vi.mock('../js/state.js',()=>({state:ports.state}));
vi.mock('../js/profile.js',()=>({getActiveProfileId:()=>ports.profileId}));
vi.mock('../js/utils.js',()=>({showNotification:ports.notify,showConfirmDialog:ports.confirm}));
vi.mock('../js/url-safety.js',()=>({SELF_HOSTED_WEARABLE_MESSAGE:'Self-host only',isOfficialGetbasedHost:()=>false}));
vi.mock('../js/wearable-adapters.js',()=>({adapterById:(id:string)=>({id,displayName:id,authType:'oauth2'}),visibleAdapters:()=>[],getOAuthClientId:()=>'',isOAuthAdapterConfigured:()=>true,isWearableRelayUnavailable:()=>false}));
vi.mock('../js/wearables-settings-groups.js',()=>({requestHostedWearableRelayConsent:vi.fn(),withdrawHostedWearableRelayConsent:ports.withdraw}));
vi.mock('../js/wearables-connect.js',()=>({beginConnectOAuth:ports.oauth,backfillWearable:ports.backfill,disconnectWearable:ports.disconnect,syncNow:ports.sync,listConnectedSources:()=>({}),loadWearableRuntimeConfig:ports.config}));
vi.mock('../js/wearables-summary.js',()=>({syncWearableSummary:ports.summary}));
vi.mock('../js/wearables-store.js',()=>({getDailyRange:ports.range}));
vi.mock('../js/wearables-manual.js',()=>({deleteAllManualMetrics:ports.deleteManual,refreshManualSummary:ports.manualSummary}));
vi.mock('../js/wearables-settings-runtime.js',()=>({closeWearableSettingsModal:vi.fn(),confirmWearableSettingsAction:ports.confirm,navigateWearablesDashboard:ports.navigate}));
vi.mock('../js/wearables-settings-view.js',()=>({buildWearablesSettingsSnapshot:()=>({})}));
vi.mock('../js/wearables-settings-component.js',()=>({mountWearablesSettings:()=>ports.view,getWearablesSettingsView:()=>ports.view}));
import {wearableSettingsActionHandlers as actions} from '../js/wearables-settings-panel.js';
function switchProfile(){ports.profileId='profile-b';ports.state.importedData={wearableConnections:{}};}
beforeEach(()=>{
  vi.clearAllMocks();ports.profileId='profile-a';ports.state.importedData={wearableConnections:{}};
  ports.view.profileId='profile-a';ports.view.isCurrent.mockReturnValue(true);
  ports.confirm.mockResolvedValue(true);ports.config.mockResolvedValue(undefined);ports.range.mockResolvedValue([]);
  ports.sync.mockResolvedValue({rows:2});ports.backfill.mockResolvedValue({rows:3});
  document.body.innerHTML='<section id="wearables-section"></section>';
});
it('never redirects manual deletion when the profile changes during confirmation',async()=>{
  let approve!:(value:boolean)=>void;ports.confirm.mockReturnValue(new Promise(resolve=>{approve=resolve;}));
  const task=actions.handleManualDisconnect();switchProfile();approve(true);await task;
  expect(ports.deleteManual).not.toHaveBeenCalled();expect(ports.manualSummary).not.toHaveBeenCalled();expect(ports.navigate).not.toHaveBeenCalled();
});
it('never redirects wearable disconnect or consent withdrawal after confirmation on another profile',async()=>{
  ports.confirm.mockImplementation(async()=>{switchProfile();return true;});
  await actions.handleWearableDisconnect('oura');
  expect(ports.disconnect).not.toHaveBeenCalled();expect(ports.withdraw).not.toHaveBeenCalled();
});
it('keeps a single destructive attempt pending and releases its owned UI after failure',async()=>{
  let approve!:(value:boolean)=>void;ports.confirm.mockReturnValue(new Promise(resolve=>{approve=resolve;}));
  const task=actions.handleManualDisconnect();await actions.handleManualDisconnect();
  expect(ports.confirm).toHaveBeenCalledOnce();expect(ports.view.setPending).toHaveBeenCalledWith('manual',true);
  ports.deleteManual.mockRejectedValueOnce(new Error('Synthetic storage failure'));approve(true);await task;
  expect(ports.view.setPending).toHaveBeenLastCalledWith('manual',false);expect(ports.notify).toHaveBeenCalledWith("Couldn't delete: Synthetic storage failure",'error',4000);
});
it('does not start OAuth after a switched-profile runtime configuration reply',async()=>{
  ports.config.mockImplementation(async()=>{switchProfile();});await actions.handleWearableConnect('oura');expect(ports.oauth).not.toHaveBeenCalled();
});
it('does not derive or navigate a replacement profile after history or sync replies',async()=>{
  ports.backfill.mockImplementation(async()=>{switchProfile();return {rows:3};});await actions.handleWearableBackfill('oura');
  expect(ports.summary).not.toHaveBeenCalled();expect(ports.navigate).not.toHaveBeenCalled();
  ports.profileId='profile-a';ports.sync.mockImplementation(async()=>{switchProfile();return {rows:2};});
  await actions.handleWearableSyncNow('oura');expect(ports.navigate).not.toHaveBeenCalled();
});
it('rejects obsolete view counts and reports a current failed count as retryable',async()=>{
  let finish!:(rows:{weight:number}[])=>void;ports.range.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  document.dispatchEvent(new Event('settings:wearables-rendered'));await vi.waitFor(()=>expect(ports.range).toHaveBeenCalledOnce());ports.view.isCurrent.mockReturnValue(false);finish([{weight:72}]);await Promise.resolve();
  expect(ports.view.setManualCounts).not.toHaveBeenCalled();
  ports.view.isCurrent.mockReturnValue(true);ports.range.mockRejectedValueOnce(new Error('Synthetic IDB failure'));
  document.dispatchEvent(new Event('settings:wearables-rendered'));await Promise.resolve();
  await vi.waitFor(()=>expect(ports.view.setManualCounts).toHaveBeenCalledWith('Could not count entries. Reopen this section to retry.'));
});
