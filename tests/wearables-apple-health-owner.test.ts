import { beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({
  profileId:'profile-a', state:{ importedData:{wearableConnections:{} as Record<string,unknown>} },
  parse:vi.fn(), upsert:vi.fn(), meta:vi.fn(), save:vi.fn(), summary:vi.fn(), parseCycle:vi.fn(), preview:vi.fn(),
}));
vi.mock('../js/profile.js', () => ({ getActiveProfileId:()=>ports.profileId }));
vi.mock('../js/state.js', () => ({ state:ports.state }));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile:ports.save }));
vi.mock('../js/utils.js', () => ({ isDebugMode:()=>false }));
vi.mock('../js/wearables-store.js', () => ({ upsertDailyBatch:ports.upsert,setMeta:ports.meta }));
vi.mock('../js/wearables-summary.js', () => ({ syncWearableSummary:ports.summary }));
vi.mock('../js/wearables-connect.js', () => ({ listConnectedSources:()=>({apple_health:{}}) }));
vi.mock('../js/wearables-apple-health-parser.js', () => ({ parseAppleHealthBlob:ports.parse,parseAppleHealthXml:vi.fn() }));
vi.mock('../js/wearables-apple-health-runtime.js', () => ({ getAppleHealthJSZip:vi.fn(),parseAppleHealthCycleRuntime:ports.parseCycle,showAppleHealthCyclePreviewRuntime:ports.preview }));
import { importAppleHealthFile } from '../js/wearables-apple-health.js';
const file = new File(['<HealthData/>'],'synthetic-export.xml',{type:'application/xml'});
const rows = [{source:'apple_health',date:'2026-06-01',weight:72.4}];
beforeEach(() => {
  vi.clearAllMocks(); ports.profileId='profile-a'; ports.state.importedData={wearableConnections:{}};
  ports.parse.mockResolvedValue(rows); ports.upsert.mockResolvedValue(undefined); ports.meta.mockResolvedValue(undefined);
  ports.save.mockResolvedValue(true); ports.summary.mockResolvedValue(undefined); ports.parseCycle.mockResolvedValue(false);
});
it('captures the initiating profile before parsing and never redirects rows or connection metadata', async () => {
  const original=ports.state.importedData;
  let finish!: (value:typeof rows)=>void; ports.parse.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const task=importAppleHealthFile(file);
  ports.profileId='profile-b'; const replacement={wearableConnections:{}}; ports.state.importedData=replacement;
  finish(rows); await task;
  expect(ports.upsert).toHaveBeenCalledWith('profile-a',rows);
  expect(ports.meta.mock.calls[0]![0]).toBe('profile-a');
  expect(ports.save).toHaveBeenCalledWith('profile-a',original,{baseData:{wearableConnections:{}},forceProfileScope:true,reason:'apple-health-import'});
  expect(original.wearableConnections.apple_health).toMatchObject({fileName:'synthetic-export.xml',coverageDays:1});
  expect(replacement.wearableConnections).toEqual({}); expect(ports.summary).not.toHaveBeenCalled(); expect(ports.preview).not.toHaveBeenCalled();
});
it('does not derive a summary from a replacement profile after an asynchronous write', async () => {
  const original=ports.state.importedData;
  ports.upsert.mockImplementation(async()=>{ports.profileId='profile-b';ports.state.importedData={wearableConnections:{}};});
  await importAppleHealthFile(file);
  expect(ports.save).toHaveBeenCalledWith('profile-a',original,{baseData:{wearableConnections:{}},forceProfileScope:true,reason:'apple-health-import'}); expect(ports.summary).not.toHaveBeenCalled();
});
it('does not offer cycle review on a switched profile after delayed cycle parsing', async () => {
  ports.parseCycle.mockImplementation(async()=>{ports.profileId='profile-b';return {observations:[{}]};});
  const result=await importAppleHealthFile(file);
  expect(result.cycleImport).toBeNull(); expect(ports.preview).not.toHaveBeenCalled();
});
it('rechecks the profile after the pre-review hook before opening the cycle preview', async () => {
  ports.parseCycle.mockResolvedValue({observations:[{}]});
  const result=await importAppleHealthFile(file,null,{beforeCycleReview:()=>{ports.profileId='profile-b';}});
  expect(ports.preview).not.toHaveBeenCalled(); expect(result.cycleError).toContain('Profile changed before cycle review');
});
it('preserves successful import progress/summary and reports a declined durable write', async () => {
  const stages:string[]=[]; await importAppleHealthFile(file,progress=>stages.push(progress.stage));
  expect(ports.summary).toHaveBeenCalledWith('profile-a',{apple_health:{}}); expect(stages.at(-1)).toBe('done');
  ports.save.mockResolvedValue(false); ports.preview.mockClear();
  await expect(importAppleHealthFile(file)).rejects.toThrow('Apple Health connection could not be saved');
  expect(ports.preview).not.toHaveBeenCalled();
});
