// Each native Sync action owns its dimensions; the foundation has no size conflicts.
const CONTROL = 'import-btn gb:sync:[@media(pointer:coarse)]:min-h-11 gb:sync:[@media(pointer:coarse)]:min-w-11 gb:sync:rounded-[var(--radius-sm)] gb:sync:border gb:sync:border-line gb:sync:font-semibold gb:sync:[font-family:inherit] gb:sync:leading-[normal] gb:sync:cursor-pointer gb:sync:transition-colors gb:sync:motion-reduce:transition-none gb:sync:focus-visible:outline-2 gb:sync:focus-visible:outline-offset-2 gb:sync:focus-visible:outline-accent gb:sync:disabled:opacity-50 gb:sync:disabled:cursor-not-allowed';
const SECONDARY = CONTROL + ' import-btn-secondary gb:sync:bg-surface gb:sync:text-secondary gb:sync:hover:bg-hover gb:sync:hover:text-ink';
const MANAGEMENT = ' gb:sync:min-h-9 gb:sync:px-3 gb:sync:py-[7px] gb:sync:text-[12px]';
export const SYNC_SECONDARY = SECONDARY + MANAGEMENT;
export const SYNC_PRIMARY = CONTROL + MANAGEMENT + ' import-btn-primary gb:sync:bg-accent gb:sync:text-on-accent gb:sync:border-accent gb:sync:hover:brightness-110';
export const SYNC_DANGER = CONTROL + ' gb:sync:text-[11px] gb:sync:px-2.5 gb:sync:py-1 gb:sync:bg-danger gb:sync:text-on-danger gb:sync:border-danger gb:sync:hover:border-ink';
export const SYNC_TOMBSTONE_RESTORE = CONTROL + ' gb:sync:text-[11px] gb:sync:px-2.5 gb:sync:py-1 gb:sync:bg-success gb:sync:text-black gb:sync:border-success';
export const SYNC_IDENTITY_COPY = SECONDARY + ' gb:sync:px-2.5 gb:sync:py-1 gb:sync:text-[11px]';
export const SYNC_MNEMONIC_BUTTON = SECONDARY + ' gb:sync:px-2.5 gb:sync:py-0.5 gb:sync:text-[11px]';
export const SYNC_RELAY_SAVE = SECONDARY + ' gb:sync:px-3 gb:sync:py-1 gb:sync:text-[12px]';
export const SYNC_DIAGNOSE = SECONDARY + ' gb:sync:px-3.5 gb:sync:py-[7px] gb:sync:text-[12px]';
export const SYNC_DISCONNECT = SECONDARY + ' sync-disable-btn gb:sync:px-3.5 gb:sync:py-[5px] gb:sync:text-[12px] gb:sync:text-danger gb:sync:border-[color-mix(in_srgb,var(--red)_55%,var(--border))]';
export const SYNC_MANAGEMENT_DISCONNECT = SYNC_DISCONNECT + ' gb:sync:min-h-9';
export const SYNC_ACTIONS = 'gb:sync:grid gb:sync:grid-cols-2 gb:sync:max-[375px]:grid-cols-1 gb:sync:gap-2 gb:sync:mt-3.5 gb:sync:[&>button]:w-full';
export const SYNC_HELP = 'gb:sync:text-[11px] gb:sync:text-secondary gb:sync:leading-[1.45] gb:sync:mt-1.5';
export const SYNC_INPUT = 'gb:sync:flex-1 gb:sync:min-w-0 gb:sync:[@media(pointer:coarse)]:min-h-11 gb:sync:text-[12px] gb:sync:rounded-[6px] gb:sync:bg-secondary-surface gb:sync:text-ink gb:sync:border gb:sync:border-line gb:sync:px-2.5 gb:sync:py-1.5 gb:sync:font-mono gb:sync:focus:outline-2 gb:sync:focus:outline-offset-2 gb:sync:focus:outline-accent';
