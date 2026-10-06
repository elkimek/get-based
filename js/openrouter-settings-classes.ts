// Prefixed utilities are scoped to this provider's owned root.
export const OR_PANEL = 'ai-provider-panel gb:openrouter:flex gb:openrouter:flex-col gb:openrouter:gap-3 gb:openrouter:min-w-0 gb:openrouter:text-ink';
export const OR_COPY = 'gb:openrouter:text-xs gb:openrouter:text-secondary gb:openrouter:leading-relaxed';
export const OR_INPUT = 'api-key-input gb:openrouter:w-full gb:openrouter:min-w-0 gb:openrouter:max-w-full gb:openrouter:min-h-11 gb:openrouter:mt-0 gb:openrouter:rounded-control gb:openrouter:border gb:openrouter:border-line gb:openrouter:bg-select-surface gb:openrouter:text-ink gb:openrouter:px-3 gb:openrouter:py-2 gb:openrouter:focus-visible:outline-2 gb:openrouter:focus-visible:outline-accent gb:openrouter:focus-visible:outline-offset-2';
export const OR_ACTIONS = 'gb:openrouter:flex gb:openrouter:flex-wrap gb:openrouter:items-center gb:openrouter:gap-2';
export const OR_BUTTON = 'gb:openrouter:min-h-11 gb:openrouter:cursor-pointer gb:openrouter:rounded-control gb:openrouter:border gb:openrouter:border-line gb:openrouter:px-3 gb:openrouter:py-2 gb:openrouter:text-sm gb:openrouter:font-semibold gb:openrouter:leading-snug gb:openrouter:focus-visible:outline-2 gb:openrouter:focus-visible:outline-accent gb:openrouter:focus-visible:outline-offset-2 gb:openrouter:disabled:cursor-wait';
export const OR_PRIMARY = OR_BUTTON + ' gb:openrouter:bg-accent gb:openrouter:text-on-accent';
export const OR_SECONDARY = OR_BUTTON + ' gb:openrouter:bg-surface gb:openrouter:text-ink';
export const OR_LINK = 'gb:openrouter:text-ink gb:openrouter:underline gb:openrouter:underline-offset-2 gb:openrouter:focus-visible:outline-2 gb:openrouter:focus-visible:outline-accent';
export const OR_NOTICE = OR_COPY + ' gb:openrouter:rounded-control gb:openrouter:border gb:openrouter:border-line gb:openrouter:bg-secondary-surface gb:openrouter:p-3';
export const OR_TONES = { secondary: 'gb:openrouter:text-secondary', success: 'gb:openrouter:text-success-ink', warning: 'gb:openrouter:text-warning-ink', danger: 'gb:openrouter:text-danger-ink' } as const;
