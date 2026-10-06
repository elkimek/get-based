export type CliAgentPickerAction = 'set-cli-agent-target' | 'set-cli-agent-provider-filter' | 'set-cli-agent-model' | 'set-cli-agent-effort';
export interface CliAgentPicker {
  id: string; label: string; value: string; options: Array<{ value: string; label: string }>;
  action: CliAgentPickerAction; disabled?: boolean; searchable?: boolean; placeholder?: string;
}
// Only display labels and selected IDs. Host credentials never enter this view.
export interface CliAgentModelsSnapshot {
  context: string; providerFilter: string; pickers: CliAgentPicker[]; note: string; loading: string; error: string;
}
export interface CliAgentModelsComponentView {
  refresh(next: CliAgentModelsSnapshot): void; filter(query: string): void;
}
export interface CliAgentModelsView extends CliAgentModelsComponentView { isCurrent(): boolean }
export type CliAgentModelsAction = (action: CliAgentPickerAction, value: string) => unknown;
