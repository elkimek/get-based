import type { CompanionPlatform } from './cli-companion-commands.js';
export type CompanionAction = 'pause' | 'resume' | 'install' | 'restart' | 'restart-companion' | 'update' | 'uninstall';
export type CliCopyAction = 'run' | 'start' | 'install';
export interface CliAgentRow {
  id: string; name: string; metadata: string; icon: string; ready: boolean; compatible: boolean;
  selected: boolean; expandable: boolean; collapsed: boolean; status: string; testReason: string; login: boolean;
}
export interface CompanionControl { action: CompanionAction; label: string; disabled: boolean; title: string; danger?: boolean }
export interface CompanionPresentation {
  mode: 'direct' | 'outdated' | 'linked' | 'embedded'; title: string; description: string; guidance: string;
  managementHref: string; controls: CompanionControl[];
}
// Only nonsecret presentation. Discovery endpoint/token pairs remain in services.
export interface CliAgentSettingsSnapshot {
  phase: 'scanning' | 'ready' | 'error'; error: string; rows: CliAgentRow[]; showSetup: boolean;
  platform: CompanionPlatform; runCommand: string; startCommand: string; companion: CompanionPresentation | null;
}
export interface CliAgentSettingsActions {
  scan(): unknown; platform(value: CompanionPlatform): unknown; copy(action: CliCopyAction): unknown;
  login(agent: string): unknown; test(agent: string): unknown; toggle(enabled: boolean, agent: string): unknown;
  disclose(agent: string): unknown; control(action: CompanionAction): unknown;
}
export interface CliAgentSettingsComponentView {
  refresh(next: CliAgentSettingsSnapshot): void; getSnapshot(): CliAgentSettingsSnapshot;
  setStatus(text: string): void; setBusy(value: boolean): void; getModelHost(): HTMLElement | null;
  resizeFrame(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>): void;
}
export interface CliAgentSettingsView extends CliAgentSettingsComponentView { isCurrent(): boolean }
