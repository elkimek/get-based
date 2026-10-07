import { chatModelEffortOptions, friendlyChatModelGroup, type ChatModelControlState } from './chat-model-control-state.js';
import type { ChatModelPickerState } from './chat-model-picker-contract.js';

export function chatModelPickerState(
  state: ChatModelControlState,
  version: number,
  refreshing: boolean,
): ChatModelPickerState {
  const efforts = chatModelEffortOptions(state);
  const selectedEffort = Math.max(0, efforts.findIndex(option => option.value === state.selectedEffort));
  const effort = efforts.find(option => option.value === state.selectedEffort)?.label || '';
  const groups = new Map<string, ChatModelPickerState['groups'][number]>();
  for (const model of state.models) {
    const key = model.group || '';
    if (!groups.has(key)) groups.set(key, { key, label: String(friendlyChatModelGroup(key)), options: [] });
    groups.get(key)!.options.push({
      value: String(model.id ?? ''),
      label: String(model.name ?? ''),
      search: String(model.search ?? '').toLowerCase(),
      selected: model.id === state.selectedId,
    });
  }
  return {
    version,
    provider: String(state.providerLabel ?? ''),
    selectedName: String(state.selectedName ?? ''),
    label: `${state.selectedName}${state.selectedEffort && effort ? ` · ${effort}` : ''}`,
    groups: [...groups.values()],
    efforts: state.efforts.length ? efforts : [],
    selectedEffort,
    searchable: state.models.length > 9,
    refreshing,
  };
}
