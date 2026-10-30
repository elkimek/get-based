import type { Component } from 'svelte';
declare const KnowledgeFilePreview: Component<{
  files: readonly Readonly<{ name: string; text: string }>[];
  close(): void;
}>;
export default KnowledgeFilePreview;
export { mount, unmount, flushSync } from 'svelte';
