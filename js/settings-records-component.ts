// Records and usage share lifecycle ownership, while their snapshots stay component-free.
import DataEntriesSettings, { mount, unmount, flushSync } from './components/DataEntriesSettings.svelte.native.js';
import AIUsageSettings, { mount as mountUsage, unmount as unmountUsage, flushSync as flushUsage } from './components/AIUsageSettings.svelte.native.js';
import { getDataEntriesSnapshot, getAIUsageSnapshot } from './settings-records-view.js';
import type { DataEntriesSnapshot, AIUsageSnapshot, SettingsRecordsView } from './settings-records-contract.js';

let entries: SettingsRecordsView<DataEntriesSnapshot> | null = null;
let usage: SettingsRecordsView<AIUsageSnapshot> | null = null;
let entriesHost: HTMLElement | null = null;
let usageHost: HTMLElement | null = null;
export function disposeSettingsRecords(): void {
  if (entries) void unmount(entries);
  if (usage) void unmountUsage(usage);
  flushSync(); flushUsage(); entries = null; usage = null; entriesHost = null; usageHost = null;
}
export function refreshDataEntriesView(): void {
  const host = document.getElementById('data-entries-content');
  if (!host) return;
  const snapshot = getDataEntriesSnapshot();
  if (entries && entriesHost === host) { flushSync(() => entries?.refresh(snapshot)); return; }
  if (entries) { void unmount(entries); flushSync(); }
  entriesHost = host; entries = mount(DataEntriesSettings, { target: host, props: { initial: snapshot } }); flushSync();
}
export function refreshAIUsageView(): void {
  const host = document.getElementById('ai-usage-content');
  if (!host) return;
  const snapshot = getAIUsageSnapshot();
  if (usage && usageHost === host) { flushUsage(() => usage?.refresh(snapshot)); return; }
  if (usage) { void unmountUsage(usage); flushUsage(); }
  usageHost = host; usage = mountUsage(AIUsageSettings, { target: host, props: { initial: snapshot } }); flushUsage();
}
export function mountSettingsRecords(): void { refreshDataEntriesView(); refreshAIUsageView(); }
