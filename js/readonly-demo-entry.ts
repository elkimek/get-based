import Demo, {mount} from './components/ReadonlyDemo.svelte.native.js';
import type {DemoProfile} from './readonly-demo-model.js';
/** Called only by the dedicated build with committed fictional fixture views. */
export function mountReadonlyDemo(profiles: DemoProfile[]): void {
  mount(Demo, {target: document.getElementById('demo-root')!, props: {profiles}});
}
