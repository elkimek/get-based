// Scoped controls share the existing semantic theme tokens.
const BUTTON = 'import-btn gb:sync:min-h-11 gb:sync:px-3 gb:sync:py-[7px] gb:sync:rounded-[var(--radius-sm)] gb:sync:border gb:sync:border-line gb:sync:text-[12px] gb:sync:font-semibold gb:sync:[font-family:inherit] gb:sync:cursor-pointer gb:sync:transition-colors gb:sync:motion-reduce:transition-none gb:sync:focus-visible:outline-2 gb:sync:focus-visible:outline-offset-2 gb:sync:focus-visible:outline-accent gb:sync:disabled:opacity-50 gb:sync:disabled:cursor-not-allowed';
export const SYNC_SECONDARY = `${BUTTON} import-btn-secondary gb:sync:bg-surface gb:sync:text-secondary gb:sync:hover:bg-hover gb:sync:hover:text-ink`;
export const SYNC_PRIMARY = `${BUTTON} import-btn-primary gb:sync:bg-accent gb:sync:text-on-accent gb:sync:border-accent gb:sync:hover:brightness-110`;
export const SYNC_DANGER = `${BUTTON} gb:sync:bg-danger gb:sync:text-on-danger gb:sync:border-danger gb:sync:hover:border-ink`;
export const SYNC_DISCONNECT = `${SYNC_SECONDARY} sync-disable-btn gb:sync:text-danger gb:sync:border-[color-mix(in_srgb,var(--red)_55%,var(--border))]`;
export const SYNC_ACTIONS = 'gb:sync:grid gb:sync:grid-cols-2 gb:sync:max-[375px]:grid-cols-1 gb:sync:gap-2 gb:sync:mt-3.5 gb:sync:[&>button]:w-full';
export const SYNC_HELP = 'gb:sync:text-[11px] gb:sync:text-secondary gb:sync:leading-[1.45] gb:sync:mt-1.5';
export const SYNC_INPUT = 'gb:sync:flex-1 gb:sync:min-w-0 gb:sync:min-h-11 gb:sync:text-[12px] gb:sync:rounded-[6px] gb:sync:bg-secondary-surface gb:sync:text-ink gb:sync:border gb:sync:border-line gb:sync:px-2.5 gb:sync:py-1.5 gb:sync:font-mono gb:sync:focus:outline-2 gb:sync:focus:outline-offset-2 gb:sync:focus:outline-accent';
