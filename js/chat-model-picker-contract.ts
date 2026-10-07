export interface ChatModelPickerOption {
  value: string;
  label: string;
  search: string;
  selected: boolean;
}
export interface ChatModelPickerState {
  version: number;
  provider: string;
  selectedName: string;
  label: string;
  groups: { key: string; label: string; options: ChatModelPickerOption[] }[];
  efforts: { value: string; label: string }[];
  selectedEffort: number;
  searchable: boolean;
  refreshing: boolean;
}
export const INITIAL_CHAT_MODEL_PICKER: ChatModelPickerState = {
  version: 0, provider: '', selectedName: '', label: 'Select model', groups: [],
  efforts: [], selectedEffort: 0, searchable: false, refreshing: false,
};
export interface ChatModelPickerActions {
  refreshView(): void;
  open(): void;
  select(value: string, version: number): Promise<void>;
  refresh(): Promise<void>;
  effort(value: string, version: number): Promise<void>;
}
export interface ChatModelPickerView {
  isCurrent(): boolean;
  render(state: ChatModelPickerState): void;
  close(focus?: boolean): void;
}
