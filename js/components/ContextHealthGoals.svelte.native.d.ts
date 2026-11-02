import type { Component } from 'svelte';
declare const component: Component<{
  initial: unknown; current(): boolean; add(): void; remove(index: number): void; prioritize(index: number, severity: string): void; clear(): void; done(): void; close(): void;
}, { readDraft(): { text: string; severity: string }; refresh(value: unknown): void; report(message: string, busy: boolean, reset?: boolean): void; focusInput(): void; focusPriority(index: number): void }>;
export default component;
export { mount, unmount, flushSync } from 'svelte';
