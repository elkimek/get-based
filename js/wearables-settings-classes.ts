// Utilities are owned by #wearables-section; dashboard styles are unaffected.
export const WEARABLES_HELP = 'gb:wearables:text-[12px] gb:wearables:text-secondary gb:wearables:leading-[1.55] gb:wearables:m-0 gb:wearables:break-words';
export const WEARABLES_FOCUS = 'gb:wearables:focus-visible:outline-2 gb:wearables:focus-visible:outline-offset-2 gb:wearables:focus-visible:outline-accent';
export const WEARABLES_SUMMARY = `wearable-row-summary gb:wearables:flex gb:wearables:items-center gb:wearables:gap-3 gb:wearables:min-h-14 gb:wearables:px-4 gb:wearables:py-3 gb:wearables:max-[480px]:px-3 gb:wearables:max-[480px]:gap-2 gb:wearables:list-none gb:wearables:select-none gb:wearables:cursor-pointer gb:wearables:[&::-webkit-details-marker]:hidden ${WEARABLES_FOCUS}`;
const ACTION = `gb:wearables:inline-flex gb:wearables:items-center gb:wearables:justify-center gb:wearables:gap-1.5 gb:wearables:[@media(pointer:coarse)]:min-h-11 gb:wearables:[@media(pointer:coarse)]:px-4 gb:wearables:[@media(pointer:coarse)]:py-2.5 gb:wearables:border gb:wearables:border-line gb:wearables:rounded-full gb:wearables:bg-none gb:wearables:opacity-100 gb:wearables:whitespace-normal gb:wearables:leading-none gb:wearables:[font-family:inherit] gb:wearables:text-[12px] gb:wearables:cursor-pointer gb:wearables:transition-none gb:wearables:motion-reduce:transition-none gb:wearables:disabled:opacity-50 gb:wearables:disabled:cursor-progress gb:wearables:no-underline gb:wearables:break-words gb:wearables:text-center ${WEARABLES_FOCUS}`;
export const WEARABLES_BUTTON = 'wearable-action ' + ACTION + ' gb:wearables:px-3.5 gb:wearables:py-[7px] gb:wearables:font-medium';
export const WEARABLES_CONNECT = 'wearable-action-row-btn ' + ACTION + ' gb:wearables:min-w-[88px] gb:wearables:px-4 gb:wearables:py-1.5 gb:wearables:font-semibold';
export const WEARABLES_BUTTON_TONE = {
  primary: 'wearable-action-primary gb:wearables:bg-accent gb:wearables:text-on-accent gb:wearables:border-accent gb:wearables:filter-none gb:wearables:hover:bg-accent',
  secondary: 'wearable-action-secondary gb:wearables:bg-transparent gb:wearables:text-secondary gb:wearables:hover:bg-secondary-surface',
  danger: 'wearable-action-danger gb:wearables:bg-transparent gb:wearables:text-danger gb:wearables:hover:bg-secondary-surface',
};
