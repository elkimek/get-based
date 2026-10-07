import type { Component } from 'svelte';
import type { ContextNotesPresentation } from '../context-notes-session.js';
declare const component: Component<{ initial: ContextNotesPresentation; renderId: string }>;
export default component;
export { hydrate, unmount, flushSync } from 'svelte';
