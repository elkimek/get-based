import type { Component } from 'svelte';
import type { MedicalHistoryDraft } from '../context-medical-history-model.js';
declare const component: Component<{
  initial: MedicalHistoryDraft; sex: string; current(): boolean; save(): void; clear(): void; close(): void;
}, { readDraft(): MedicalHistoryDraft; report(message: string, busy: boolean): void; action(name: string, argument?: number | string): void; hideSuggestions(): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
