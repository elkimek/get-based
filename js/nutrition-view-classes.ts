// Scoped role recipes preserve the original nutrition hierarchy and compact desktop density.
export const focus = 'gb:nutrition:focus-visible:outline-2 gb:nutrition:focus-visible:outline-accent gb:nutrition:focus-visible:outline-offset-2';
export const coarseTarget = 'gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:[@media(pointer:coarse)]:min-w-[45px]';
export const button = `import-btn import-btn-secondary ${focus} ${coarseTarget}`;
export const primary = `import-btn import-btn-primary ${focus} ${coarseTarget}`;
// Dashboard summaries keep compact typography with a full action hit area on every pointer type.
const dashboardTarget = 'gb:nutrition-dashboard:min-h-[44px] gb:nutrition-dashboard:min-w-[44px]';
// The empty-content ring sits below the retained label inside the existing 44px target.
export const dashboardLoading = "gb:nutrition:relative gb:nutrition:aria-busy:cursor-progress gb:nutrition:aria-busy:after:content-[''] gb:nutrition:aria-busy:after:pointer-events-none gb:nutrition:aria-busy:after:absolute gb:nutrition:aria-busy:after:bottom-[3px] gb:nutrition:aria-busy:after:left-1/2 gb:nutrition:aria-busy:after:-translate-x-1/2 gb:nutrition:aria-busy:after:size-1.5 gb:nutrition:aria-busy:after:box-border gb:nutrition:aria-busy:after:rounded-full gb:nutrition:aria-busy:after:border gb:nutrition:aria-busy:after:border-current gb:nutrition:aria-busy:after:border-r-transparent gb:nutrition:motion-safe:aria-busy:after:animate-[nutrition-analysis-spin_.8s_linear_infinite]";
export const dashboardButton = `dashboard-action-btn ${focus} ${coarseTarget} ${dashboardTarget}`;
export const dashboardPrimary = `dashboard-action-btn dashboard-action-btn-primary ${focus} ${coarseTarget} ${dashboardTarget}`;
export const closeButton = `modal-close ${focus} ${coarseTarget}`;
export const textAction = `gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-[5px] gb:nutrition:[font-family:inherit] gb:nutrition:text-xs gb:nutrition:font-bold gb:nutrition:leading-normal gb:nutrition:text-accent gb:nutrition:whitespace-nowrap gb:nutrition:cursor-pointer ${focus} ${coarseTarget}`;
export const readableTextAction = textAction.replace('gb:nutrition:text-accent', 'gb:nutrition:text-link-ink');
export const starterAction = `gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:[font-family:inherit] gb:nutrition:text-[11px] gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-accent gb:nutrition:cursor-pointer gb:nutrition:hover:underline ${focus} ${coarseTarget} ${dashboardTarget}`;
export const historyTab = `gb:nutrition:min-h-[38px] gb:nutrition:border-0 gb:nutrition:rounded-[7px] gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:[font-family:inherit] gb:nutrition:text-xs gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-secondary gb:nutrition:cursor-pointer gb:nutrition:aria-selected:bg-surface gb:nutrition:aria-selected:text-ink gb:nutrition:aria-selected:shadow-[0_1px_4px_color-mix(in_srgb,black_10%,transparent)] gb:nutrition:max-[720px]:min-h-[44px] ${focus} ${coarseTarget}`;
export const historyRange = `ctx-btn-option gb:nutrition:max-[720px]:min-h-[44px] gb:nutrition:max-[720px]:flex-1 ${coarseTarget}`;
export const mealDelete = `gb:nutrition:min-h-8 gb:nutrition:border-0 gb:nutrition:rounded-[7px] gb:nutrition:bg-transparent gb:nutrition:px-[7px] gb:nutrition:py-[5px] gb:nutrition:[font-family:inherit] gb:nutrition:text-[10px] gb:nutrition:font-bold gb:nutrition:leading-normal gb:nutrition:text-muted gb:nutrition:cursor-pointer gb:nutrition:hover:text-danger-ink ${focus} ${coarseTarget}`;
export const inlineLog = `gb:nutrition:shrink-0 gb:nutrition:border-0 gb:nutrition:rounded-full gb:nutrition:bg-accent/10 gb:nutrition:px-2 gb:nutrition:py-1 gb:nutrition:[font-family:inherit] gb:nutrition:text-[10px] gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-ink gb:nutrition:cursor-pointer ${focus} ${coarseTarget} ${dashboardTarget} ${dashboardLoading}`;
const panelSurface = 'gb:nutrition:min-w-0 gb:nutrition:grid gb:nutrition:content-start gb:nutrition:rounded-xl gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_2.5%,var(--bg-card))]';
export const panel = `${panelSurface} gb:nutrition:gap-3.5 gb:nutrition:p-[15px]`;
export const targetPanel = `${panelSurface} gb:nutrition:gap-3.5 gb:nutrition:p-4`;
export const copy = 'gb:nutrition:text-muted gb:nutrition:text-[11px] gb:nutrition:leading-[1.45] gb:nutrition:[overflow-wrap:anywhere] gb:nutrition-dashboard:text-secondary';
// Small explanatory copy needs a readable ink on every supported theme surface.
export const readableCopy = 'gb:nutrition:text-secondary gb:nutrition:text-[11px] gb:nutrition:leading-[1.45] gb:nutrition:[overflow-wrap:anywhere]';
export const modalCopy = 'gb:nutrition:m-0 gb:nutrition:text-muted gb:nutrition:text-[13px] gb:nutrition:leading-normal';
export const readableModalCopy = 'gb:nutrition:m-0 gb:nutrition:text-secondary gb:nutrition:text-[13px] gb:nutrition:leading-normal';
export const heading = 'gb:nutrition:text-xs gb:nutrition:font-bold gb:nutrition:uppercase gb:nutrition:tracking-wide gb:nutrition:text-ink';
export const goalHead = 'gb:nutrition:flex gb:nutrition:items-baseline gb:nutrition:justify-between gb:nutrition:gap-2.5 gb:nutrition:text-xs';
export const card = 'gb:nutrition:grid gb:nutrition:gap-0.5 gb:nutrition:rounded-[9px] gb:nutrition:bg-surface gb:nutrition:p-2.5 gb:nutrition:min-w-0';
export const field = 'nutrition-field gb:nutrition:grid gb:nutrition:gap-1.5 gb:nutrition:min-w-0 gb:nutrition:[&>span]:text-[13px] gb:nutrition:[&>span]:font-[650] gb:nutrition:[&_small]:font-normal';
export const input = `gb:nutrition:box-border gb:nutrition:w-full gb:nutrition:max-w-full gb:nutrition:min-w-0 gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:px-[11px] gb:nutrition:py-2.5 gb:nutrition:[font-family:inherit] gb:nutrition:text-sm gb:nutrition:leading-[1.35] gb:nutrition:font-normal gb:nutrition:text-ink gb:nutrition:disabled:opacity-60 gb:nutrition:aria-invalid:border-danger gb:nutrition:max-[720px]:text-base ${coarseTarget} ${focus}`;
export const summary = `gb:nutrition:cursor-pointer gb:nutrition:text-xs gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-ink ${focus} ${coarseTarget}`;
export const editorSummary = `gb:nutrition:cursor-pointer gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:leading-normal gb:nutrition:py-[9px] gb:nutrition:text-ink ${focus} ${coarseTarget}`;
export const comparisonSummary = `gb:nutrition:cursor-pointer gb:nutrition:text-[11px] gb:nutrition:font-bold gb:nutrition:leading-normal gb:nutrition:text-ink ${focus} ${coarseTarget}`;
export const formGrid = 'gb:nutrition:grid gb:nutrition:grid-cols-3 gb:nutrition:gap-[9px] gb:nutrition:max-[720px]:grid-cols-2 gb:nutrition:max-[380px]:grid-cols-1';
export const formHead = 'gb:nutrition:flex gb:nutrition:flex-wrap gb:nutrition:items-start gb:nutrition:justify-between gb:nutrition:gap-4';
export const rings = 'gb:nutrition:grid gb:nutrition:grid-cols-[repeat(auto-fit,minmax(min(100%,132px),1fr))] gb:nutrition:gap-3 gb:nutrition:justify-items-center';
export const goalGrid = (expanded: boolean) => `gb:nutrition:grid gb:nutrition:items-start gb:nutrition:gap-3.5 ${expanded ? 'gb:nutrition:grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]' : 'gb:nutrition:grid-cols-1'}`;

export const fuelSummary = `gb:nutrition:cursor-pointer gb:nutrition:text-[11px] gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-ink ${focus} ${coarseTarget} ${dashboardTarget}`;
export const fluidPreset = `gb:nutrition:min-h-[42px] gb:nutrition:rounded-lg gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:p-0 gb:nutrition:[font-family:inherit] gb:nutrition:text-xs gb:nutrition:font-extrabold gb:nutrition:leading-normal gb:nutrition:text-ink gb:nutrition:cursor-pointer ${focus} ${coarseTarget}`;
export const fluidPanel = 'gb:nutrition:min-w-0 gb:nutrition:grid gb:nutrition:gap-2 gb:nutrition:rounded-[10px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-[color-mix(in_srgb,var(--accent)_2.5%,var(--bg-card))] gb:nutrition:p-3';

export const goalPanel = `${panelSurface} gb:nutrition:gap-[11px] gb:nutrition:p-[15px]`;
export const timingPanel = `${panelSurface} gb:nutrition:gap-2.5 gb:nutrition:p-[15px]`;
export const ingredientInput = `gb:nutrition:box-border gb:nutrition:w-full gb:nutrition:min-w-0 gb:nutrition:rounded-[7px] gb:nutrition:border gb:nutrition:border-line gb:nutrition:bg-surface gb:nutrition:px-[9px] gb:nutrition:py-2 gb:nutrition:[font-family:inherit] gb:nutrition:text-[13px] gb:nutrition:leading-normal gb:nutrition:font-normal gb:nutrition:text-ink gb:nutrition:max-[720px]:text-base ${focus} ${coarseTarget}`;
export const ingredientRemove = `gb:nutrition:size-[30px] gb:nutrition:rounded-lg gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:p-0 gb:nutrition:text-xl gb:nutrition:text-muted gb:nutrition:cursor-pointer gb:nutrition:max-[720px]:size-11 ${focus} ${coarseTarget}`;
export const modelSettings = `gb:nutrition:shrink-0 gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:px-0 gb:nutrition:py-0.5 gb:nutrition:[font-family:inherit] gb:nutrition:text-[11px] gb:nutrition:font-[750] gb:nutrition:leading-normal gb:nutrition:text-accent gb:nutrition:cursor-pointer gb:nutrition:hover:underline ${focus} ${coarseTarget}`;
