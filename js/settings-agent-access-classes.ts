export const AGENT_COPY = 'gb:agent:min-w-0 gb:agent:flex-auto';
export const AGENT_TITLE = 'gb:agent:text-ink gb:agent:text-[13px] gb:agent:font-semibold gb:agent:leading-[1.35]';
export const AGENT_DESCRIPTION = 'gb:agent:mt-0.5 gb:agent:text-muted gb:agent:text-[11px] gb:agent:leading-[1.45]';
export const AGENT_ROW = [
  'settings-action-row gb:agent:flex gb:agent:items-center gb:agent:justify-between gb:agent:gap-3.5',
  'gb:agent:max-[720px]:items-start gb:agent:max-[720px]:gap-3',
].join(' ');

const BUTTON = [
  'gb:agent:inline-flex gb:agent:items-center gb:agent:justify-center gb:agent:gap-1.5 gb:agent:border',
  'gb:agent:rounded-control gb:agent:[font-family:inherit] gb:agent:font-semibold gb:agent:leading-[normal]',
  'gb:agent:cursor-pointer gb:agent:whitespace-nowrap gb:agent:transition-colors',
  'gb:agent:focus-visible:outline-2 gb:agent:focus-visible:outline-offset-2 gb:agent:focus-visible:outline-accent',
  'gb:agent:disabled:opacity-50 gb:agent:disabled:cursor-not-allowed gb:agent:motion-reduce:transition-none',
].join(' ');
const SECONDARY = `${BUTTON} gb:agent:bg-surface gb:agent:text-secondary gb:agent:border-line gb:agent:hover:bg-hover gb:agent:hover:text-ink`;
export const AGENT_MINI_BUTTON = `${SECONDARY} gb:agent:px-2.5 gb:agent:py-[3px] gb:agent:text-[11px]`;
export const AGENT_FULL_BUTTON = `${SECONDARY} gb:agent:w-full gb:agent:mt-3 gb:agent:px-3.5 gb:agent:py-[7px] gb:agent:text-[12px]`;
export const AGENT_SETUP_BUTTON = [
  BUTTON, 'agent-access-copy-btn gb:agent:bg-accent gb:agent:text-on-accent gb:agent:border-accent',
  'gb:agent:self-end gb:agent:min-h-[34px] gb:agent:px-[13px] gb:agent:py-[7px] gb:agent:text-[12px]',
  'gb:agent:hover:brightness-110 gb:agent:max-[720px]:w-full',
].join(' ');
export const AGENT_LINK = 'gb:agent:text-accent gb:agent:focus-visible:outline-2 gb:agent:focus-visible:outline-accent gb:agent:focus-visible:outline-offset-2';
export const AGENT_TOKEN_HEAD = 'settings-token-head gb:agent:flex gb:agent:items-center gb:agent:justify-between gb:agent:gap-2.5 gb:agent:mb-1.5';
export const AGENT_TOKEN_ACTIONS = 'gb:agent:flex gb:agent:gap-1.5 gb:agent:shrink-0';
export const AGENT_TOKEN_LABEL = 'gb:agent:text-[12px] gb:agent:font-semibold gb:agent:text-secondary';
export const AGENT_TOKEN_BOX = [
  'settings-token-box gb:agent:min-h-5 gb:agent:px-3 gb:agent:py-2.5 gb:agent:border gb:agent:border-line',
  'gb:agent:rounded-control gb:agent:bg-secondary-surface gb:agent:text-ink gb:agent:font-mono',
  'gb:agent:text-[11.5px] gb:agent:leading-[1.6] gb:agent:break-all gb:agent:[overflow-wrap:anywhere]',
].join(' ');
