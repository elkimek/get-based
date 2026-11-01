import type { Component } from 'svelte';
import type { LifestyleDraft, LifestyleFormModel } from '../context-lifestyle-form-model.js';
declare const component: Component<{
  model: LifestyleFormModel; initial: LifestyleDraft; hasCurrent: boolean; current(): boolean;
  save(): void; clear(): void; close(): void; back(): void; openEMF(): void; openLightSetup(): void;
}, { readDraft(): LifestyleDraft; refresh(model: LifestyleFormModel, draft: LifestyleDraft, filled: boolean): void; report(message: string, busy: boolean, label?: string): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
