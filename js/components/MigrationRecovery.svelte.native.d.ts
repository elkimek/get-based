import type { Component } from 'svelte';
import type { MigrationViewState, MigrationActions } from '../migration-view.js';
declare const MigrationRecovery: Component<{initial: MigrationViewState; actions: MigrationActions}, {
  update(value: MigrationViewState): void; clearSecrets(): void;
}>;
export default MigrationRecovery;
export { mount, unmount, flushSync } from 'svelte';
