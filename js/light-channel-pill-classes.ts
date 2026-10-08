// Shared pill geometry and states, scoped to authored Light components.
// Parent variants preserve compact strips and the existing channel-card context.
const styles: Readonly<Record<string, string>> = {
  "light-pills-row": [
    "gb:channel-pill:[display:flex] gb:channel-pill:[flex-wrap:wrap] gb:channel-pill:[gap:8px]",
    "gb:channel-pill:[.light-channels-section_&]:[display:grid] gb:channel-pill:[.light-channels-section_&]:[grid-template-columns:repeat(auto-fit,_minmax(min(174px,_100%),_1fr))] gb:channel-pill:[.light-channels-section_&]:[gap:10px]",
    "gb:channel-pill:pill-mobile:[gap:6px] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[grid-template-columns:repeat(2,_minmax(0,_1fr))] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[gap:8px]",
  ].join(' '),
  "light-pill": [
    "gb:channel-pill:[display:inline-flex] gb:channel-pill:[align-items:center] gb:channel-pill:[gap:6px]",
    "gb:channel-pill:[padding:6px_12px] gb:channel-pill:[border-radius:999px] gb:channel-pill:[background:color-mix(in_srgb,_var(--bg-secondary)_78%,_transparent)]",
    "gb:channel-pill:[border:1px_solid_color-mix(in_srgb,_var(--border)_82%,_transparent)] gb:channel-pill:[font-size:12px] gb:channel-pill:[color:var(--text-secondary)]",
    "gb:channel-pill:[transition:background_0.15s,_color_0.15s,_border-color_0.15s] gb:channel-pill:[.light-channels-section_&]:[--channel-accent:var(--accent)] gb:channel-pill:[.light-channels-section_&]:[--channel-tint:color-mix(in_srgb,_var(--channel-accent)_10%,_transparent)]",
    "gb:channel-pill:[.light-channels-section_&]:[position:relative] gb:channel-pill:[.light-channels-section_&]:[display:grid] gb:channel-pill:[.light-channels-section_&]:[grid-template-columns:34px_minmax(0,_1fr)_auto]",
    "gb:channel-pill:[.light-channels-section_&]:[grid-template-areas:'icon_label_count'_'icon_spark_spark'] gb:channel-pill:[.light-channels-section_&]:[align-items:center] gb:channel-pill:[.light-channels-section_&]:[gap:7px_10px]",
    "gb:channel-pill:[.light-channels-section_&]:[min-height:72px] gb:channel-pill:[.light-channels-section_&]:[padding:12px_13px_11px_15px] gb:channel-pill:[.light-channels-section_&]:[border-radius:var(--radius-sm)]",
    "gb:channel-pill:[.light-channels-section_&]:[background:linear-gradient(135deg,_var(--channel-tint),_transparent_58%),_color-mix(in_srgb,_var(--bg-secondary)_62%,_transparent)] gb:channel-pill:[.light-channels-section_&]:[border:1px_solid_color-mix(in_srgb,_var(--channel-accent)_24%,_var(--border))] gb:channel-pill:[.light-channels-section_&]:[color:var(--text-primary)]",
    "gb:channel-pill:[.light-channels-section_&]:[box-shadow:inset_3px_0_0_color-mix(in_srgb,_var(--channel-accent)_76%,_transparent)] gb:channel-pill:[.light-channels-section_&]:[overflow:hidden] gb:channel-pill:pill-mobile:[padding:8px_12px]",
    "gb:channel-pill:pill-mobile:[font-size:13px] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[min-height:78px] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[padding:11px_10px_10px_12px]",
    "gb:channel-pill:[.light-channels-section_&]:pill-mobile:[grid-template-columns:30px_minmax(0,_1fr)] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[grid-template-areas:'icon_label'_'spark_spark'_'count_count'] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[align-items:start]",
    "gb:channel-pill:pill-narrow:[padding:7px_10px] gb:channel-pill:pill-narrow:[font-size:12px]",
  ].join(' '),
  "light-pill-icon": [
    "gb:channel-pill:[font-size:13px] gb:channel-pill:[.light-channels-section_&]:[grid-area:icon] gb:channel-pill:[.light-channels-section_&]:[width:34px]",
    "gb:channel-pill:[.light-channels-section_&]:[height:34px] gb:channel-pill:[.light-channels-section_&]:[display:inline-flex] gb:channel-pill:[.light-channels-section_&]:[align-items:center]",
    "gb:channel-pill:[.light-channels-section_&]:[justify-content:center] gb:channel-pill:[.light-channels-section_&]:[border-radius:50%] gb:channel-pill:[.light-channels-section_&]:[font-size:18px]",
    "gb:channel-pill:[.light-channels-section_&]:[background:color-mix(in_srgb,_var(--channel-accent)_13%,_var(--bg-card))] gb:channel-pill:[.light-channels-section_&]:[border:1px_solid_color-mix(in_srgb,_var(--channel-accent)_30%,_transparent)] gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[background:color-mix(in_srgb,_var(--bg-card)_70%,_transparent)]",
    "gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[border-color:color-mix(in_srgb,_var(--border)_78%,_transparent)] gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[opacity:0.72] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[width:30px]",
    "gb:channel-pill:[.light-channels-section_&]:pill-mobile:[height:30px] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[font-size:16px]",
  ].join(' '),
  "light-pill-label": [
    "gb:channel-pill:[font-weight:500] gb:channel-pill:[.light-channels-section_&]:[grid-area:label] gb:channel-pill:[.light-channels-section_&]:[min-width:0]",
    "gb:channel-pill:[.light-channels-section_&]:[font-size:12.5px] gb:channel-pill:[.light-channels-section_&]:[font-weight:650] gb:channel-pill:[.light-channels-section_&]:[line-height:1.2]",
    "gb:channel-pill:[.light-channels-section_&]:[overflow:hidden] gb:channel-pill:[.light-channels-section_&]:[text-overflow:ellipsis] gb:channel-pill:[.light-channels-section_&]:[white-space:nowrap]",
    "gb:channel-pill:[.light-channels-section_&]:pill-mobile:[white-space:normal] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[overflow-wrap:anywhere] gb:channel-pill:pill-narrow:[max-width:85px]",
    "gb:channel-pill:pill-narrow:[overflow:hidden] gb:channel-pill:pill-narrow:[text-overflow:ellipsis] gb:channel-pill:pill-narrow:[white-space:nowrap]",
    "gb:channel-pill:[.light-channels-section_&]:pill-narrow:[max-width:none] gb:channel-pill:[.light-channels-section_&]:pill-narrow:[white-space:normal]",
  ].join(' '),
  "light-pill-sparkline": [
    "gb:channel-pill:[display:inline-block] gb:channel-pill:[flex:0_0_auto] gb:channel-pill:[width:47px]",
    "gb:channel-pill:[height:14px] gb:channel-pill:[vertical-align:middle] gb:channel-pill:[.light-channels-section_&]:[grid-area:spark]",
    "gb:channel-pill:[.light-channels-section_&]:[width:100%] gb:channel-pill:[.light-channels-section_&]:[max-width:76px] gb:channel-pill:[.light-channels-section_&]:[height:18px]",
    "gb:channel-pill:[.light-channels-section_&]:[justify-self:start] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[max-width:none] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[height:16px]",
  ].join(' '),
  "light-pill-daycount": [
    "gb:channel-pill:[font-size:11px] gb:channel-pill:[font-weight:600] gb:channel-pill:[letter-spacing:0.02em]",
    "gb:channel-pill:[font-variant-numeric:tabular-nums] gb:channel-pill:[color:inherit] gb:channel-pill:[opacity:0.9]",
    "gb:channel-pill:[min-width:24px] gb:channel-pill:[text-align:right] gb:channel-pill:[white-space:nowrap]",
    "gb:channel-pill:[.light-channels-section_&]:[grid-area:count] gb:channel-pill:[.light-channels-section_&]:[min-width:0] gb:channel-pill:[.light-channels-section_&]:[padding:3px_7px]",
    "gb:channel-pill:[.light-channels-section_&]:[border-radius:999px] gb:channel-pill:[.light-channels-section_&]:[background:color-mix(in_srgb,_var(--channel-accent)_12%,_transparent)] gb:channel-pill:[.light-channels-section_&]:[border:1px_solid_color-mix(in_srgb,_var(--channel-accent)_26%,_transparent)]",
    "gb:channel-pill:[.light-channels-section_&]:[color:var(--text-primary)] gb:channel-pill:[.light-channels-section_&]:[text-align:center] gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[background:transparent]",
    "gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[border-color:color-mix(in_srgb,_var(--border)_78%,_transparent)] gb:channel-pill:[.light-channels-section_.light-pill-tier-0_&]:[color:var(--text-secondary)] gb:channel-pill:[.light-channels-section_&]:pill-mobile:[justify-self:start]",
    "gb:channel-pill:[.light-channels-section_&]:pill-mobile:[text-align:left] gb:channel-pill:[.light-channels-section_&]:pill-narrow:[padding-inline:6px] gb:channel-pill:[.light-channels-section_&]:pill-narrow:[font-size:10.5px]",
  ].join(' '),
  "light-pill-tier-0": [
    "gb:channel-pill:[&:where(.light-pill-tier-0)]:[background:color-mix(in_srgb,_var(--bg-primary)_42%,_transparent)] gb:channel-pill:[&:where(.light-pill-tier-0)]:[border-style:dashed] gb:channel-pill:[&:where(.light-pill-tier-0)]:[border-color:color-mix(in_srgb,_var(--text-muted)_48%,_var(--border))]",
    "gb:channel-pill:[&:where(.light-pill-tier-0)]:[color:var(--text-muted)] gb:channel-pill:[.light-channels-section_&.light-pill-tier-0]:[background:color-mix(in_srgb,_var(--bg-secondary)_38%,_transparent)] gb:channel-pill:[.light-channels-section_&.light-pill-tier-0]:[border-style:solid]",
    "gb:channel-pill:[.light-channels-section_&.light-pill-tier-0]:[border-color:color-mix(in_srgb,_var(--border)_88%,_transparent)] gb:channel-pill:[.light-channels-section_&.light-pill-tier-0]:[box-shadow:inset_3px_0_0_color-mix(in_srgb,_var(--text-muted)_28%,_transparent)] gb:channel-pill:[.light-channels-section_&.light-pill-tier-0]:[color:var(--text-secondary)]",
  ].join(' '),
  "light-pill-tier-2": [
    "gb:channel-pill:[&:where(.light-pill-tier-2)]:[color:var(--text-primary)] gb:channel-pill:[&:where(.light-pill-tier-2)]:[border-color:var(--text-muted)]",
  ].join(' '),
  "light-pill-signal-logged": [
    "gb:channel-pill:[&:where(.light-pill-signal-logged)]:[color:var(--text-primary)] gb:channel-pill:[.light-channels-section_&.light-pill-signal-logged]:[border-color:color-mix(in_srgb,_var(--channel-accent)_32%,_var(--border))]",
  ].join(' '),
  "light-pill-signal-empty": [
    "gb:channel-pill:[&:where(.light-pill-signal-empty)]:[color:var(--text-muted)]",
  ].join(' '),
  "light-pill-interactive": [
    "gb:channel-pill:[.light-pills-interactive_&]:[cursor:pointer] gb:channel-pill:[.light-pills-interactive_&]:[font-family:inherit] gb:channel-pill:[.light-pills-interactive_&:hover]:[filter:brightness(1.08)]",
    "gb:channel-pill:[.light-pills-interactive_&:hover]:[border-color:var(--accent)] gb:channel-pill:[.light-channels-section_&.light-pill-interactive:hover]:[border-color:color-mix(in_srgb,_var(--channel-accent)_62%,_var(--border))] gb:channel-pill:[.light-channels-section_&.light-pill-interactive:hover]:[box-shadow:inset_3px_0_0_color-mix(in_srgb,_var(--channel-accent)_86%,_transparent),_0_8px_18px_color-mix(in_srgb,_var(--channel-accent)_12%,_transparent)]",
    "gb:channel-pill:[.light-pills-interactive_&:focus-visible]:[outline:2px_solid_var(--accent)] gb:channel-pill:[.light-pills-interactive_&:focus-visible]:[outline-offset:2px] gb:channel-pill:[.light-pills-interactive_&[aria-expanded='true']]:[border-color:var(--accent)]",
    "gb:channel-pill:[.light-pills-interactive_&[aria-expanded='true']]:[box-shadow:0_0_0_1px_var(--accent)] gb:channel-pill:[.light-channels-section_.light-pills-interactive_&[aria-expanded='true']]:[border-color:color-mix(in_srgb,_var(--channel-accent)_64%,_var(--border))] gb:channel-pill:[.light-channels-section_.light-pills-interactive_&[aria-expanded='true']]:[box-shadow:inset_3px_0_0_color-mix(in_srgb,_var(--channel-accent)_90%,_transparent),_0_0_0_1px_color-mix(in_srgb,_var(--channel-accent)_42%,_transparent)]",
    "gb:channel-pill:[@media(prefers-reduced-motion:reduce)]:[transition:none]! gb:channel-pill:[@media(prefers-reduced-motion:reduce)]:[animation:none]! gb:channel-pill:[@media(prefers-reduced-motion:reduce)]:[transform:none]!",
  ].join(' '),
  "light-pill-dashboard": [
    "gb:channel-pill:[cursor:pointer] gb:channel-pill:[font-family:inherit] gb:channel-pill:[&:hover]:[filter:brightness(1.08)]",
    "gb:channel-pill:[&:hover]:[border-color:var(--accent)] gb:channel-pill:[.light-channels-section_&.light-pill-dashboard:hover]:[border-color:color-mix(in_srgb,_var(--channel-accent)_62%,_var(--border))] gb:channel-pill:[.light-channels-section_&.light-pill-dashboard:hover]:[box-shadow:inset_3px_0_0_color-mix(in_srgb,_var(--channel-accent)_86%,_transparent),_0_8px_18px_color-mix(in_srgb,_var(--channel-accent)_12%,_transparent)]",
    "gb:channel-pill:[&:focus-visible]:[outline:2px_solid_var(--accent)] gb:channel-pill:[&:focus-visible]:[outline-offset:2px]",
  ].join(' '),
};
const accents: Readonly<Record<string, string>> = {
  vitamin_d: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--yellow)]',
  circadian: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--accent)]',
  nir_solar: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--red)]',
  no_cv: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--green)]',
  pomc: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--orange)]',
  violet_eye: 'gb:channel-pill:[.light-channels-section_&.light-pill]:[--channel-accent:var(--purple)]',
};
export function channelPillClasses(names: string, channel?: string): string {
  return names.split(/\s+/).filter(Boolean).flatMap(name => [name, styles[name] || '', name === 'light-pill' && channel ? accents[channel] || '' : '']).join(' ');
}
