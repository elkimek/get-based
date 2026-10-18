// Shared, scoped presentation tokens. Variants add only their own size/surface.

export const VOICE_COPY = [
  'settings-copy gb:voice:min-w-0 gb:voice:flex-auto',
].join(' ');

export const VOICE_TITLE = [
  'settings-copy-title gb:voice:text-ink gb:voice:text-[13px] gb:voice:font-semibold',
  'gb:voice:leading-[1.35]',
].join(' ');

export const VOICE_DESCRIPTION = [
  'settings-copy-desc gb:voice:mt-0.5 gb:voice:text-muted gb:voice:text-[11px] gb:voice:leading-[1.45]',
].join(' ');

const ROW_BASE = [
  'voice-setting-row gb:voice:grid gb:voice:grid-cols-[minmax(0,1fr)_minmax(180px,auto)] gb:voice:gap-4',
  'gb:voice:items-center gb:voice:[&>:only-child]:col-span-full gb:voice:m-0 gb:voice:px-0 gb:voice:py-3.5',
  'gb:voice:border-b gb:voice:border-line gb:voice:[&[hidden]]:hidden',
  'gb:voice:max-[720px]:grid-cols-1 gb:voice:max-[720px]:gap-2 gb:voice:max-[720px]:py-3',
].join(' ');
export const VOICE_ROW = `${ROW_BASE} gb:voice:last:border-b-0`;
export const VOICE_CONNECTION_ROW = ROW_BASE;

export const VOICE_CARD = [
  'gb:voice:flex gb:voice:flex-col gb:voice:overflow-hidden gb:voice:px-3.5 gb:voice:py-0 gb:voice:border',
  'gb:voice:border-line gb:voice:rounded-control',
  'gb:voice:bg-[color-mix(in_srgb,var(--bg-card)_72%,transparent)] gb:voice:max-[720px]:px-3',
].join(' ');

export const VOICE_CONTROL = [
  'voice-control gb:voice:block gb:voice:w-[min(300px,100%)] gb:voice:max-[720px]:w-full',
].join(' ');

export const VOICE_LINK = [
  'settings-link-btn gb:voice:bg-transparent gb:voice:border-0 gb:voice:text-muted gb:voice:text-[13px]',
  'gb:voice:leading-[normal] gb:voice:[font-family:inherit] gb:voice:cursor-pointer gb:voice:px-0 gb:voice:py-1',
  'gb:voice:no-underline gb:voice:transition-colors gb:voice:hover:text-ink gb:voice:hover:underline',
  'gb:voice:focus-visible:outline-2 gb:voice:focus-visible:outline-offset-2',
  'gb:voice:focus-visible:outline-accent gb:voice:disabled:opacity-50 gb:voice:disabled:cursor-not-allowed',
  'gb:voice:motion-reduce:transition-none',
].join(' ');

export const VOICE_ACTIONS = [
  'gb:voice:flex gb:voice:shrink-0 gb:voice:flex-wrap gb:voice:items-center gb:voice:gap-2',
].join(' ');

export const VOICE_GROUP = [
  'gb:voice:mt-[22px] gb:voice:font-mono gb:voice:text-[11px] gb:voice:font-bold gb:voice:uppercase',
  'gb:voice:tracking-[0.1em] gb:voice:text-muted gb:voice:max-[720px]:mt-[18px]',
].join(' ');

const INPUT_BASE = [
  'gb:voice:box-border gb:voice:w-full gb:voice:min-w-0 gb:voice:min-h-10 gb:voice:mt-0 gb:voice:px-3',
  'gb:voice:py-2.5 gb:voice:border gb:voice:border-line gb:voice:rounded-control gb:voice:text-ink',
  'gb:voice:text-[13px] gb:voice:[color-scheme:dark]',
  'gb:voice:in-[[data-theme=light]]:[color-scheme:light] gb:voice:font-[monospace]',
  'gb:voice:focus:border-accent gb:voice:focus:shadow-[0_0_0_3px_var(--accent-fill)]',
].join(' ');

export const VOICE_INPUT = `${INPUT_BASE} gb:voice:bg-surface gb:voice:leading-[normal]`;

const SELECT_PICKER = [
  'gb:voice:supports-[appearance:base-select]:[appearance:base-select]',
  'gb:voice:supports-[appearance:base-select]:[&::picker(select)]:[appearance:base-select]',
  'gb:voice:[&::picker(select)]:max-h-[min(360px,60vh)] gb:voice:[&::picker(select)]:border',
  'gb:voice:[&::picker(select)]:border-line gb:voice:[&::picker(select)]:rounded-control',
  'gb:voice:[&::picker(select)]:bg-select-popup gb:voice:[&::picker(select)]:text-ink',
  'gb:voice:[&::picker(select)]:shadow-dialog gb:voice:[&::picker-icon]:text-muted',
  'gb:voice:supports-[appearance:base-select]:[&_option]:px-3',
  'gb:voice:supports-[appearance:base-select]:[&_option]:py-2 gb:voice:appearance-auto',
  'gb:voice:cursor-pointer gb:voice:[&_option]:bg-select-popup gb:voice:[&_option]:text-ink',
].join(' ');

export const VOICE_SELECT = `${INPUT_BASE} gb:voice:bg-select-surface gb:voice:leading-[1.5] ${SELECT_PICKER}`;

const BUTTON_BASE = [
  'gb:voice:inline-flex gb:voice:items-center gb:voice:justify-center gb:voice:gap-1.5 gb:voice:border',
  'gb:voice:border-line gb:voice:rounded-control gb:voice:bg-surface gb:voice:text-ink',
  'gb:voice:leading-[normal] gb:voice:font-semibold gb:voice:[font-family:inherit] gb:voice:cursor-pointer',
  'gb:voice:transition-colors gb:voice:hover:bg-hover gb:voice:focus-visible:outline-2',
  'gb:voice:focus-visible:outline-offset-2 gb:voice:focus-visible:outline-accent',
  'gb:voice:disabled:opacity-50 gb:voice:disabled:cursor-not-allowed gb:voice:motion-reduce:transition-none',
].join(' ');

export const VOICE_BUTTON = `${BUTTON_BASE} gb:voice:px-[18px] gb:voice:py-2 gb:voice:text-[14px]`;
export const VOICE_MODEL_BUTTON = `${BUTTON_BASE} gb:voice:px-2.5 gb:voice:py-[3px] gb:voice:text-[11px] gb:voice:m-0 gb:voice:whitespace-nowrap`;
