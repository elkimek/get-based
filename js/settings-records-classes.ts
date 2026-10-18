// Semantic bundles shared by imported-data and usage controls.
export const RECORD_CARD = [
  'imported-entry gb:records:grid gb:records:grid-cols-[minmax(0,1fr)_auto] gb:records:gap-3 gb:records:items-center',
  'gb:records:px-4 gb:records:py-2.5 gb:records:bg-surface gb:records:border gb:records:border-line',
  'gb:records:rounded-control gb:records:mb-1.5 gb:records:text-[13px]',
  'gb:records:max-[641px]:grid-cols-1 gb:records:max-[641px]:items-stretch gb:records:max-[641px]:p-3',
].join(' ');
export const RECORD_META = 'ie-meta gb:records:flex gb:records:items-center gb:records:gap-2 gb:records:min-w-0 gb:records:mt-[3px] gb:records:text-secondary gb:records:text-[11px] gb:records:leading-[1.35] gb:records:max-[641px]:flex-wrap';
export const RECORD_ACTIONS = 'ie-actions gb:records:flex gb:records:items-center gb:records:gap-1 gb:records:justify-end gb:records:max-[641px]:justify-start gb:records:max-[641px]:flex-wrap';
export const RECORD_HEADING = 'gb:records:text-[11px] gb:records:text-secondary gb:records:uppercase gb:records:tracking-[0.5px] gb:records:mb-1';
const EDIT_BUTTON = [
  'gb:records:bg-transparent gb:records:border-0 gb:records:text-secondary gb:records:cursor-pointer',
  'gb:records:text-[12px] gb:records:px-2.5 gb:records:py-1 gb:records:rounded-[4px] gb:records:[font-family:inherit]',
  'gb:records:leading-[normal] gb:records:transition-colors gb:records:motion-reduce:transition-none',
  'gb:records:focus-visible:outline-2 gb:records:focus-visible:outline-offset-2 gb:records:focus-visible:outline-accent',
].join(' ');
export const RECORD_EDIT = `ie-edit ${EDIT_BUTTON} gb:records:hover:text-ink gb:records:hover:bg-hover`;
export const RECORD_REMOVE = `ie-remove ${EDIT_BUTTON} gb:records:hover:text-danger gb:records:hover:bg-[var(--red-bg)]`;
const BUTTON = [
  'gb:records:inline-flex gb:records:items-center gb:records:justify-center gb:records:gap-1.5',
  'gb:records:px-[18px] gb:records:py-2 gb:records:rounded-control gb:records:border gb:records:[font-family:inherit]',
  'gb:records:font-semibold gb:records:leading-[normal] gb:records:cursor-pointer',
  'gb:records:transition-colors gb:records:motion-reduce:transition-none',
  'gb:records:focus-visible:outline-2 gb:records:focus-visible:outline-offset-2 gb:records:focus-visible:outline-accent',
].join(' ');
export const RECORD_PRIMARY = `${BUTTON} gb:records:text-[14px] gb:records:bg-accent gb:records:text-on-accent gb:records:border-accent gb:records:hover:brightness-110`;
const SECONDARY = `${BUTTON} gb:records:bg-surface gb:records:text-secondary gb:records:border-line gb:records:hover:bg-hover gb:records:hover:text-ink`;
export const RECORD_SECONDARY = `${SECONDARY} gb:records:text-[14px]`;
export const RECORD_USAGE_BUTTON = `${SECONDARY} gb:records:mt-2 gb:records:text-[11px]`;
export const RECORD_DANGER = `${BUTTON} gb:records:text-[14px] gb:records:bg-surface gb:records:text-danger gb:records:border-danger gb:records:hover:bg-hover`;
