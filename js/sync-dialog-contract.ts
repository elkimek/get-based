// Presentation snapshots contain status only; recovery words stay in live fields.
export type SyncDialogKind = 'setup' | 'restore';
export interface SyncDialogState {
  kind: SyncDialogKind;
  step: 'choices' | 'new' | 'join';
  pending: boolean;
  reloading: boolean;
  message: string;
  tone: 'secondary' | 'warning' | 'success' | 'danger';
}
export interface SyncDialogView {
  update(state: SyncDialogState): void;
  showGeneratedPhrase(value: string): void;
  readPhrase(): string;
  validate(): void;
  acknowledged(): boolean;
  focusFirst(): void;
  clearSecrets(): void;
}
export interface SyncDialogOwner extends SyncDialogView {
  isCurrent(): boolean;
  state(): Readonly<SyncDialogState>;
  patch(patch: Partial<Omit<SyncDialogState, 'kind'>>): void;
  close(): void;
  nudge(): void;
}
export interface SyncDialogServices {
  enabled(): boolean;
  configured(): boolean;
  ownerId(): string | null;
  mnemonic(): string | null;
  enable(options?: { skipPush?: boolean; persist?: boolean }): Promise<unknown>;
  disable(): Promise<unknown>;
  restore(phrase: string): Promise<unknown>;
  notify(message: string, kind: 'info' | 'error'): void;
  refresh(): void;
  release(): void;
  wait(milliseconds: number): Promise<void>;
}
