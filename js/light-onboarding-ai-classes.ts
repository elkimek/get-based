// This surface owns its utilities; semantic hooks keep delegate/import contracts stable.
const styles: Readonly<Record<string, string>> = {
  'light-setup-ai-block': 'gb:onboarding-ai:mt-[14px] gb:onboarding-ai:p-0 gb:onboarding-ai:rounded-none gb:onboarding-ai:bg-transparent gb:onboarding-ai:[border:0] gb:onboarding-ai:[overflow-wrap:anywhere]',
  'light-setup-ai-head': "gb:onboarding-ai:flex gb:onboarding-ai:items-center gb:onboarding-ai:gap-[8px] gb:onboarding-ai:text-[11px] gb:onboarding-ai:font-semibold gb:onboarding-ai:uppercase gb:onboarding-ai:tracking-[0.05em] gb:onboarding-ai:text-muted gb:onboarding-ai:mb-[8px] gb:onboarding-ai:[[data-theme='neuromancer']_&]:text-secondary gb:onboarding-ai:[[data-theme='cyberterm']_&]:text-secondary",
  'light-setup-ai-head-label': 'gb:onboarding-ai:flex-1',
  'sun-detail-ai': 'gb:onboarding-ai:mb-[14px] gb:onboarding-ai:[padding:12px_14px] gb:onboarding-ai:rounded-[8px] gb:onboarding-ai:[background:var(--bg-elev-1,rgba(255,255,255,0.03))] gb:onboarding-ai:[border-left:3px_solid_var(--text-muted)]',
  'sun-detail-ai-green': 'gb:onboarding-ai:[border-left-color:var(--green)]',
  'sun-detail-ai-yellow': 'gb:onboarding-ai:[border-left-color:var(--yellow)]',
  'sun-detail-ai-red': 'gb:onboarding-ai:[border-left-color:var(--red)]',
  'sun-detail-ai-head': 'gb:onboarding-ai:flex gb:onboarding-ai:items-center gb:onboarding-ai:gap-[10px] gb:onboarding-ai:text-[14px] gb:onboarding-ai:font-semibold gb:onboarding-ai:text-ink',
  'sun-detail-ai-tip': 'gb:onboarding-ai:flex-1 gb:onboarding-ai:min-w-0',
  'sun-session-ai-prefix': 'gb:onboarding-ai:mr-[2px] gb:onboarding-ai:opacity-[0.85]',
  'sun-detail-ai-body': "gb:onboarding-ai:mt-[6px] gb:onboarding-ai:text-[13px] gb:onboarding-ai:leading-[1.5] gb:onboarding-ai:text-muted gb:onboarding-ai:[[data-theme='neuromancer']_&]:text-secondary gb:onboarding-ai:[[data-theme='cyberterm']_&]:text-secondary",
  'light-setup-ai-actions': 'gb:onboarding-ai:[margin:8px_0_0] gb:onboarding-ai:pl-[18px] gb:onboarding-ai:text-[13px] gb:onboarding-ai:leading-[1.5] gb:onboarding-ai:text-ink gb:onboarding-ai:[&_li]:my-[2px]',
  'sun-session-ai-dot': 'gb:onboarding-ai:w-[8px] gb:onboarding-ai:h-[8px] gb:onboarding-ai:[border-radius:50%] gb:onboarding-ai:shrink-0 gb:onboarding-ai:inline-block gb:onboarding-ai:[transition:background_0.3s,box-shadow_0.3s]',
  'sun-session-ai-dot-gray': 'gb:onboarding-ai:[background:var(--text-muted)] gb:onboarding-ai:opacity-[0.45]',
  'sun-session-ai-dot-green': 'gb:onboarding-ai:[background:var(--green)] gb:onboarding-ai:[box-shadow:0_0_6px_rgba(52,211,153,0.5)]',
  'sun-session-ai-dot-yellow': 'gb:onboarding-ai:[background:var(--yellow)] gb:onboarding-ai:[box-shadow:0_0_6px_rgba(251,191,36,0.5)]',
  'sun-session-ai-dot-red': 'gb:onboarding-ai:[background:var(--red)] gb:onboarding-ai:[box-shadow:0_0_6px_rgba(248,113,113,0.5)]',
  'sun-session-ai-dot-shimmer': 'gb:onboarding-ai:[background:linear-gradient(90deg,var(--text-muted)_25%,var(--border)_50%,var(--text-muted)_75%)_0%_0%/200%_100%] gb:onboarding-ai:[animation:shimmer_1.5s_infinite] gb:onboarding-ai:motion-reduce:[animation:none]! gb:onboarding-ai:motion-reduce:[transition:none]! gb:onboarding-ai:motion-reduce:[transform:none]!',
  'sun-session-ai-refresh': 'gb:onboarding-ai:[border:1px_solid_var(--border,rgba(255,255,255,0.08))] gb:onboarding-ai:text-ink gb:onboarding-ai:cursor-pointer gb:onboarding-ai:text-[14px] gb:onboarding-ai:leading-none gb:onboarding-ai:[padding:4px_8px] gb:onboarding-ai:rounded-[6px] gb:onboarding-ai:shrink-0 gb:onboarding-ai:[background:var(--bg-elev-1,rgba(255,255,255,0.03))] gb:onboarding-ai:[transition:color_0.15s,background_0.15s,border-color_0.15s] gb:onboarding-ai:hover:[background:var(--bg-elev-2,rgba(255,255,255,0.06))] gb:onboarding-ai:hover:border-accent gb:onboarding-ai:focus-visible:[outline:2px_solid_var(--accent)] gb:onboarding-ai:focus-visible:outline-offset-[2px] gb:onboarding-ai:[@media(pointer:coarse)]:min-w-[44px] gb:onboarding-ai:[@media(pointer:coarse)]:min-h-[44px]',
};
const status = "gb:onboarding-ai:flex gb:onboarding-ai:items-center gb:onboarding-ai:gap-[10px] gb:onboarding-ai:text-[13px] gb:onboarding-ai:text-muted gb:onboarding-ai:[[data-theme='neuromancer']_&]:text-secondary gb:onboarding-ai:[[data-theme='cyberterm']_&]:text-secondary";
const idleButton = 'gb:onboarding-ai:[&.sun-session-ai-refresh]:[font-size:12px] gb:onboarding-ai:[&.sun-session-ai-refresh]:[padding:4px_10px]';
export function onboardingAIClasses(hooks: string) {
  return hooks.split(/\s+/).map(hook => `${hook} ${styles[hook] || ''}${/^sun-detail-ai-(idle|loading|error)$/.test(hook) ? ` ${status}` : ''}`).join(' ');
}
export function onboardingAIButtonClasses(idle: boolean) {
  return `${onboardingAIClasses('sun-session-ai-refresh')}${idle ? ` ${idleButton}` : ''}`;
}
