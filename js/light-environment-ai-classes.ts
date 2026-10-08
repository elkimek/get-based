// Environment-owned geometry; shared dot/button/detail utilities stay in the verdict catalog.
const header = "gb:environment-ai:text-[11px] gb:environment-ai:font-semibold gb:environment-ai:uppercase gb:environment-ai:tracking-[0.05em] gb:environment-ai:text-muted gb:environment-ai:mb-[8px] gb:environment-ai:[[data-theme='neuromancer']_&]:text-secondary gb:environment-ai:[[data-theme='cyberterm']_&]:text-secondary";
const styles: Readonly<Record<string, string>> = {
  'light-env-reading-ai': 'gb:environment-ai:flex gb:environment-ai:items-center gb:environment-ai:gap-[6px] gb:environment-ai:basis-full gb:environment-ai:min-w-0 gb:environment-ai:w-full gb:environment-ai:[margin:4px_0_8px_22px] gb:environment-ai:text-[11.5px] gb:environment-ai:text-muted',
  'measurement-tip': 'gb:environment-ai:[&.sun-session-ai-tip]:whitespace-normal gb:environment-ai:[overflow-wrap:anywhere]',
  'measurement-cta': 'gb:environment-ai:[&.sun-session-ai-cta]:text-[11.5px]',
  'light-env-room-ai': 'gb:environment-ai:grid gb:environment-ai:grid-cols-[auto_auto_minmax(0,1fr)_auto] gb:environment-ai:items-center gb:environment-ai:gap-[8px] gb:environment-ai:[margin:-2px_0_0_28px] gb:environment-ai:[padding:7px_0_0] gb:environment-ai:[border-top:1px_dashed_var(--environment-ai-border,color-mix(in_srgb,var(--border)_82%,transparent))] gb:environment-ai:text-[12px] gb:environment-ai:leading-[1.35] gb:environment-ai:[@media(max-width:600px)]:ml-0',
  'light-env-room-ai-green': 'gb:environment-ai:[--environment-ai-border:color-mix(in_srgb,var(--green)_34%,var(--border))]',
  'light-env-room-ai-yellow': 'gb:environment-ai:[--environment-ai-border:color-mix(in_srgb,var(--yellow)_38%,var(--border))]',
  'light-env-room-ai-red': 'gb:environment-ai:[--environment-ai-border:color-mix(in_srgb,var(--red)_36%,var(--border))]',
  'light-env-room-ai-label': "gb:environment-ai:text-muted gb:environment-ai:font-mono gb:environment-ai:text-[10px] gb:environment-ai:font-extrabold gb:environment-ai:tracking-[0] gb:environment-ai:uppercase gb:environment-ai:whitespace-nowrap gb:environment-ai:[[data-theme='neuromancer']_&]:text-secondary gb:environment-ai:[[data-theme='cyberterm']_&]:text-secondary",
  'light-env-room-ai-tip': 'gb:environment-ai:min-w-0 gb:environment-ai:text-secondary gb:environment-ai:[overflow-wrap:anywhere]',
  'light-env-room-ai-refresh': 'gb:environment-ai:self-center gb:environment-ai:min-h-[28px] gb:environment-ai:[&.light-env-room-ai-refresh]:[padding:3px_8px] gb:environment-ai:[&.light-env-room-ai-refresh]:text-[12px] gb:environment-ai:[&.light-env-room-ai-refresh]:[@media(pointer:coarse)]:min-h-[44px]',
  'light-env-screen-ai': 'gb:environment-ai:mt-[14px] gb:environment-ai:pt-[12px] gb:environment-ai:[border-top:1px_solid_var(--border)]',
  'light-env-screen-ai-head': header,
  'light-audit-ai': 'gb:environment-ai:[margin:12px_0_14px_0]',
  'light-audit-ai-head': header,
  'environment-detail': 'gb:environment-ai:[&.sun-detail-ai]:mb-0 gb:environment-ai:[&.sun-detail-ai]:[overflow-wrap:normal]',
  'light-audit-ai-dot': 'gb:environment-ai:[&.light-audit-ai-dot]:w-[9px] gb:environment-ai:[&.light-audit-ai-dot]:h-[9px] gb:environment-ai:mr-[4px] gb:environment-ai:align-middle gb:environment-ai:[@media(max-width:375px)]:hidden',
};
export function environmentAIClasses(hooks: string) {
  return hooks.split(/\s+/).map(hook => `${hook.startsWith('light-') || hook.startsWith('sun-') ? hook : ''} ${styles[hook] || ''}`).join(' ');
}
