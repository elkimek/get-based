// Security/Backup control and surface tokens; feature services stay unaware of styling.
const BUTTON = [
  'import-btn gb:protection:inline-flex gb:protection:items-center gb:protection:justify-center gb:protection:gap-1.5',
  'gb:protection:[@media(pointer:coarse)]:min-h-11 gb:protection:rounded-control gb:protection:border',
  'gb:protection:font-semibold gb:protection:[font-family:inherit] gb:protection:cursor-pointer',
  'gb:protection:transition-colors gb:protection:motion-reduce:transition-none',
  'gb:protection:focus-visible:outline-2 gb:protection:focus-visible:outline-offset-2 gb:protection:focus-visible:outline-accent',
  'gb:protection:disabled:opacity-50 gb:protection:disabled:cursor-not-allowed',
].join(' ');
export const PROTECTION_PRIMARY = `${BUTTON} gb:protection:px-[18px] gb:protection:py-2 gb:protection:text-[14px] import-btn-primary gb:protection:bg-accent gb:protection:text-on-accent gb:protection:border-accent gb:protection:hover:brightness-110`;
export const PROTECTION_SECONDARY = `${BUTTON} gb:protection:px-[18px] gb:protection:py-2 gb:protection:text-[14px] import-btn-secondary gb:protection:bg-surface gb:protection:text-secondary gb:protection:border-line gb:protection:hover:bg-hover gb:protection:hover:text-ink`;
export const PROTECTION_RESTORE = `${BUTTON} import-btn-secondary gb:protection:bg-surface gb:protection:text-secondary gb:protection:border-line gb:protection:hover:bg-hover gb:protection:hover:text-ink gb:protection:px-2.5 gb:protection:py-1 gb:protection:text-[12px]`;
export const PROTECTION_ACTIONS = 'gb:protection:flex gb:protection:gap-2 gb:protection:flex-wrap';
export const PROTECTION_DESCRIPTION = 'gb:protection:text-[12px] gb:protection:text-secondary gb:protection:leading-[1.5]';
export const FOLDER_STATUS = 'backup-folder-status gb:protection:text-[13px] gb:protection:text-ink gb:protection:font-semibold gb:protection:mb-1.5 gb:protection:px-2.5 gb:protection:py-1.5 gb:protection:rounded-control gb:protection:border-l-[3px] gb:protection:break-words';
