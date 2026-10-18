// Settings presentation contract. Existing settings services own side effects.
export const SETTINGS_TABS = [
  { id: 'display', label: 'Display' },
  { id: 'ai', label: 'AI' },
  { id: 'voice', label: 'Voice' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'data', label: 'Data' },
  { id: 'wearables', label: 'Wearables' },
  { id: 'agent', label: 'Agent Access' },
] as const;
import type {AppExtensionHTML} from './app-extension-runtime.js';
export interface SettingsPanelsView {
  readonly displayActive: boolean;
  readonly aiActive: boolean;
  readonly voiceActive: boolean;
  readonly privacyActive: boolean;
  readonly dataActive: boolean;
  readonly wearablesActive: boolean;
  readonly agentActive: boolean;
  readonly benchmarkEntryEpoch: number;
  readonly showUsage: boolean;
  readonly syncReady: boolean;
  readonly messengerReady: boolean;
  readonly extensionAI: AppExtensionHTML;
  readonly extensionPanels: AppExtensionHTML;
}
export interface SettingsShellProps {
  initialTab: string;
  panels: SettingsPanelsView;
  extensionTabs: AppExtensionHTML;
  onNavigateTab: (id: string) => unknown;
}
export const SETTINGS_MODAL_CLASS = [
  'modal settings-modal gb:settings:p-0 gb:settings:w-[min(94vw,860px)]',
  'gb:settings:max-w-[860px] gb:settings:max-h-[90vh] gb:settings:bg-secondary-surface gb:settings:shadow-dialog',
  'gb:settings:overflow-hidden gb:settings:max-[720px]:w-full gb:settings:max-[720px]:h-[calc(100dvh-24px)] gb:settings:max-[720px]:max-h-none',
  'gb:settings:max-[720px]:flex gb:settings:max-[720px]:flex-col',
].join(' ');
export const SETTINGS_TAB_CLASS = [
  'settings-tab-btn gb:settings:relative gb:settings:inline-flex gb:settings:box-border',
  'gb:settings:w-full gb:settings:shrink-0 gb:settings:items-center gb:settings:justify-start',
  'gb:settings:gap-[9px] gb:settings:px-3 gb:settings:py-2.5 gb:settings:border',
  'gb:settings:border-transparent gb:settings:rounded-control gb:settings:bg-transparent gb:settings:text-secondary',
  'gb:settings:text-[13px] gb:settings:font-display gb:settings:font-semibold gb:settings:whitespace-nowrap',
  'gb:settings:cursor-pointer gb:settings:transition-colors gb:settings:hover:text-ink gb:settings:hover:bg-surface',
  'gb:settings:aria-selected:bg-surface gb:settings:aria-selected:text-ink gb:settings:aria-selected:border-line gb:settings:focus-visible:outline-2',
  'gb:settings:focus-visible:outline-offset-2 gb:settings:focus-visible:outline-accent gb:settings:motion-reduce:transition-none gb:settings:max-[720px]:w-auto',
  'gb:settings:[&_svg]:w-[14px] gb:settings:[&_svg]:h-[14px] gb:settings:[&_svg]:shrink-0 gb:settings:[&_svg]:opacity-60',
  'gb:settings:aria-selected:[&_svg]:text-accent gb:settings:aria-selected:[&_svg]:opacity-100',
  'gb:settings:max-[500px]:[&_svg]:w-3 gb:settings:max-[500px]:[&_svg]:h-3',
  'gb:settings:max-[720px]:min-h-10 gb:settings:max-[720px]:h-10 gb:settings:max-[720px]:px-2.5 gb:settings:max-[720px]:py-2',
].join(' ');
