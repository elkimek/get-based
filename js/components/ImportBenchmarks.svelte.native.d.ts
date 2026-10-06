import type { Component } from 'svelte';
import type { BenchmarkSnapshot, BenchmarkActions, BenchmarkComponentView } from '../import-benchmark-contract.js';
declare const ImportBenchmarks: Component<{ initial: BenchmarkSnapshot; actions: BenchmarkActions; mode?: 'dialog'|'body'|'differences'; showDifferenceClose?: boolean },BenchmarkComponentView>;
export default ImportBenchmarks;
export { mount, unmount, flushSync } from 'svelte';
