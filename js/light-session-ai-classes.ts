// Shared Sun/device verdict utilities. Semantic hooks retain existing contracts.
const styles: Readonly<Record<string, string>> = {
  'sun-session-ai': 'gb:session-ai:flex gb:session-ai:items-center gb:session-ai:gap-[8px] gb:session-ai:mt-[8px] gb:session-ai:pt-[8px] gb:session-ai:[border-top:1px_solid_var(--border)] gb:session-ai:text-[12px] gb:session-ai:[@media(max-width:600px)]:min-w-0 gb:session-ai:[@media(max-width:600px)]:max-w-full',
  'sun-session-ai-dot': 'gb:session-ai:w-[8px] gb:session-ai:h-[8px] gb:session-ai:[border-radius:50%] gb:session-ai:shrink-0 gb:session-ai:inline-block gb:session-ai:[transition:background_0.3s,box-shadow_0.3s]',
  'sun-session-ai-dot-gray': 'gb:session-ai:[background:var(--text-muted)] gb:session-ai:opacity-[0.45]',
  'sun-session-ai-dot-green': 'gb:session-ai:[background:var(--green)] gb:session-ai:[box-shadow:0_0_6px_rgba(52,211,153,0.5)]',
  'sun-session-ai-dot-yellow': 'gb:session-ai:[background:var(--yellow)] gb:session-ai:[box-shadow:0_0_6px_rgba(251,191,36,0.5)]',
  'sun-session-ai-dot-red': 'gb:session-ai:[background:var(--red)] gb:session-ai:[box-shadow:0_0_6px_rgba(248,113,113,0.5)]',
  'sun-session-ai-dot-shimmer': 'gb:session-ai:[background:linear-gradient(90deg,var(--text-muted)_25%,var(--border)_50%,var(--text-muted)_75%)_0%_0%/200%_100%] gb:session-ai:[animation:shimmer_1.5s_infinite] gb:session-ai:motion-reduce:[animation:none]! gb:session-ai:motion-reduce:[transition:none]! gb:session-ai:motion-reduce:[transform:none]!',
  'sun-session-ai-tip': "gb:session-ai:flex-1 gb:session-ai:min-w-0 gb:session-ai:[color:var(--session-ai-ink,var(--text-muted))] gb:session-ai:whitespace-nowrap gb:session-ai:overflow-hidden gb:session-ai:text-ellipsis gb:session-ai:[[data-theme='neuromancer']_&]:[color:var(--session-ai-ink,var(--text-secondary))] gb:session-ai:[[data-theme='cyberterm']_&]:[color:var(--session-ai-ink,var(--text-secondary))]",
  'sun-session-ai-tip-green': 'gb:session-ai:[--session-ai-ink:var(--success-ink)]',
  'sun-session-ai-tip-yellow': 'gb:session-ai:[--session-ai-ink:var(--warning-ink)]',
  'sun-session-ai-tip-red': 'gb:session-ai:[--session-ai-ink:var(--danger-ink)]',
  'sun-session-ai-prefix': 'gb:session-ai:mr-[2px] gb:session-ai:opacity-[0.85]',
  'sun-session-ai-refresh': 'gb:session-ai:[border:1px_solid_var(--border,rgba(255,255,255,0.08))] gb:session-ai:text-ink gb:session-ai:cursor-pointer gb:session-ai:text-[14px] gb:session-ai:leading-none gb:session-ai:[padding:4px_8px] gb:session-ai:rounded-[6px] gb:session-ai:shrink-0 gb:session-ai:[background:var(--bg-elev-1,rgba(255,255,255,0.03))] gb:session-ai:[transition:color_0.15s,background_0.15s,border-color_0.15s] gb:session-ai:hover:[background:var(--bg-elev-2,rgba(255,255,255,0.06))] gb:session-ai:hover:border-accent gb:session-ai:focus-visible:[outline:2px_solid_var(--accent)] gb:session-ai:focus-visible:outline-offset-[2px] gb:session-ai:[@media(pointer:coarse)]:min-w-[44px] gb:session-ai:[@media(pointer:coarse)]:min-h-[44px]',
  'sun-session-ai-cta': "gb:session-ai:[[data-theme='light']_&]:[color:color-mix(in_srgb,var(--accent-light)_90%,var(--text-primary))] gb:session-ai:bg-transparent gb:session-ai:[border:0] gb:session-ai:text-link-ink gb:session-ai:cursor-pointer gb:session-ai:text-[12px] gb:session-ai:p-0 gb:session-ai:text-left gb:session-ai:flex-1 gb:session-ai:min-w-0 gb:session-ai:hover:underline gb:session-ai:focus-visible:[outline:2px_solid_var(--accent)] gb:session-ai:focus-visible:outline-offset-[2px] gb:session-ai:focus-visible:rounded-[2px] gb:session-ai:[@media(pointer:coarse)]:min-w-[44px] gb:session-ai:[@media(pointer:coarse)]:min-h-[44px]",
  'sun-detail-ai': 'gb:session-ai:mb-[14px] gb:session-ai:[padding:12px_14px] gb:session-ai:rounded-[8px] gb:session-ai:[background:var(--bg-elev-1,rgba(255,255,255,0.03))] gb:session-ai:[border-left:3px_solid_var(--session-ai-border,var(--text-muted))] gb:session-ai:[overflow-wrap:anywhere]',
  'sun-detail-ai-green': 'gb:session-ai:[--session-ai-border:var(--green)]',
  'sun-detail-ai-yellow': 'gb:session-ai:[--session-ai-border:var(--yellow)]',
  'sun-detail-ai-red': 'gb:session-ai:[--session-ai-border:var(--red)]',
  'sun-detail-ai-head': 'gb:session-ai:flex gb:session-ai:items-center gb:session-ai:gap-[10px] gb:session-ai:text-[14px] gb:session-ai:font-semibold gb:session-ai:text-ink',
  'sun-detail-ai-tip': 'gb:session-ai:flex-1 gb:session-ai:min-w-0',
  'sun-detail-ai-body': "gb:session-ai:mt-[6px] gb:session-ai:text-[13px] gb:session-ai:leading-[1.5] gb:session-ai:text-muted gb:session-ai:[[data-theme='neuromancer']_&]:text-secondary gb:session-ai:[[data-theme='cyberterm']_&]:text-secondary",
};
const status = "gb:session-ai:flex gb:session-ai:items-center gb:session-ai:gap-[10px] gb:session-ai:text-[13px] gb:session-ai:text-muted gb:session-ai:[[data-theme='neuromancer']_&]:text-secondary gb:session-ai:[[data-theme='cyberterm']_&]:text-secondary";
export function sessionAIClasses(hooks: string) {
  return hooks.split(/\s+/).map(hook => `${hook} ${styles[hook] || ''}${/^sun-detail-ai-(idle|loading|error)$/.test(hook) ? ` ${status}` : ''}`).join(' ');
}
export const sessionAIIdleDetailButton = 'gb:session-ai:[&.sun-session-ai-refresh]:text-[12px] gb:session-ai:[&.sun-session-ai-refresh]:[padding:4px_10px] gb:session-ai:[&.sun-session-ai-refresh]:[border:1px_solid_var(--border)]';
