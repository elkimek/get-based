import type {Component} from 'svelte';
import type {FocusCardBodyView} from '../focus-card-presentation.js';
declare const component: Component<{view: FocusCardBodyView}, {
  setView(view: FocusCardBodyView): void;
  getStreamElement(): HTMLSpanElement | null;
}>;
export default component;
export {mount, unmount, flushSync} from 'svelte';
