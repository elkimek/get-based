export interface ImportRecordView {
  id: string; date: string; count: string; fileName: string; type: string;
  model: string; importedTime: string;
}
export interface ManualRecordView {
  date: string; dateLabel: string; count: string; source: string;
  manual: boolean; dateLocked: boolean;
}
export interface DataEntriesSnapshot {
  empty: boolean; imports: readonly ImportRecordView[]; manual: readonly ManualRecordView[];
}
export interface UsageRowView { label: string; cost: string; requests: string; tokens: string }
export interface AIUsageSnapshot { profile: UsageRowView; global: UsageRowView; canReset: boolean }
export interface SettingsRecordsView<T> { refresh(snapshot: T): void }
