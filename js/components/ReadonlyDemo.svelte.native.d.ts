import type {Component} from 'svelte';
import type {DemoProfile} from '../readonly-demo-model.js';
declare const Demo: Component<{profiles: DemoProfile[]}>;
export default Demo;
export {mount, unmount, flushSync} from 'svelte';
