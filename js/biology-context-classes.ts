// Context-specific presentation. Shared dashboard buttons retain their stylesheet owner.
const styles = (...rules: string[]): string => rules.join(' ');
const classes: Record<string, string> = {
  'biology-context-ai-panel': styles(
    "gb:biology-context:[margin:0_0_16px] gb:biology-context:[padding:14px] gb:biology-context:[border:1px_solid_var(--border)]",
    "gb:biology-context:[border-radius:var(--radius)] gb:biology-context:[background:color-mix(in_srgb,var(--bg-card)_82%,transparent)] gb:biology-context:[display:grid]",
    "gb:biology-context:[gap:12px] gb:biology-context:[&.biology-context-ai-required]:[border-color:color-mix(in_srgb,var(--accent)_28%,var(--border))] gb:biology-context:[&.biology-context-ai-required]:[background:linear-gradient(135deg,color-mix(in_srgb,var(--accent)_6%,var(--bg-card))_0%,var(--bg-card)_100%)]",
    "gb:biology-context:[&.biology-context-ai-required]:[box-shadow:inset_0_1px_0_rgba(255,255,255,.03)]",
  ),
  'biology-context-ai-head': styles(
    "gb:biology-context:[display:flex] gb:biology-context:[justify-content:space-between] gb:biology-context:[gap:12px]",
    "gb:biology-context:[align-items:flex-start]",
  ),
  'biology-context-copy': styles(
    "gb:biology-context:[margin:4px_0_0] gb:biology-context:[color:var(--text-secondary)] gb:biology-context:[font-size:13px]",
    "gb:biology-context:[line-height:1.45]",
  ),
  'biology-context-suggestions': styles(
    "gb:biology-context:[display:grid] gb:biology-context:[gap:10px]",
  ),
  'biology-context-suggestion': styles(
    "gb:biology-context:[display:grid] gb:biology-context:[gap:8px] gb:biology-context:[padding:12px]",
    "gb:biology-context:[border:1px_solid_var(--border)] gb:biology-context:[border-radius:var(--radius-sm)] gb:biology-context:[background:var(--bg-secondary)]",
  ),
  'biology-context-suggestion-heading': styles(
    "gb:biology-context:[display:flex] gb:biology-context:[flex-wrap:wrap] gb:biology-context:[justify-content:space-between]",
    "gb:biology-context:[gap:8px]",
  ),
  'biology-context-suggestion-label': styles(
    "gb:biology-context:[color:var(--text-primary)]",
  ),
  'biology-context-meta': styles(
    "gb:biology-context:[color:var(--text-muted)] gb:biology-context:[font-size:12px]",
  ),
  'biology-context-evidence': styles(
    "gb:biology-context:[margin:0] gb:biology-context:[padding-left:18px] gb:biology-context:[color:var(--text-secondary)]",
    "gb:biology-context:[font-size:12px] gb:biology-context:[line-height:1.4]",
  ),
  'biology-context-actions': styles(
    "gb:biology-context:[display:flex] gb:biology-context:[flex-wrap:wrap] gb:biology-context:[gap:8px]",
  ),
  'biology-score-context-fields': styles(
    "gb:biology-context:[display:grid] gb:biology-context:[gap:10px] gb:biology-context:[margin:16px_0]",
    "gb:biology-context:[font-size:14px]",
  ),
  'biology-context-field': styles(
    "gb:biology-context:[display:flex] gb:biology-context:[align-items:center] gb:biology-context:[gap:10px]",
  ),
  'biology-scores-note': styles(
    "gb:biology-context:[margin:0] gb:biology-context:[color:var(--text-muted)] gb:biology-context:[font-size:12px]",
    "gb:biology-context:[line-height:1.45]",
  ),
  'biology-context-review-summary': styles(
    "gb:biology-context:[cursor:pointer] gb:biology-context:[font-weight:500] gb:biology-context:[font-size:14px]",
    "gb:biology-context:[padding:8px_0]",
  ),
  'biology-score-context-banner': styles(
    "gb:biology-context:[display:flex] gb:biology-context:[flex-wrap:wrap] gb:biology-context:[gap:6px]",
    "gb:biology-context:[&:not(.biology-score-context-page)]:[margin-top:10px]",
    "gb:biology-context:[align-items:center] gb:biology-context:[color:var(--text-secondary)] gb:biology-context:[font-size:12px]",
  ),
  'biology-score-context-page': styles(
    "gb:biology-context:[margin:-6px_0_16px] gb:biology-context:[padding:0_2px]",
  ),
  'biology-context-banner-heading': styles(
    "gb:biology-context:[color:var(--text-primary)] gb:biology-context:[margin-right:2px]",
  ),
  'biology-context-banner-label': styles(
    "gb:biology-context:[padding:3px_7px] gb:biology-context:[border:1px_solid_var(--border)] gb:biology-context:[border-radius:var(--radius-sm)]",
    "gb:biology-context:[background:var(--bg-card)]",
  ),
  'biology-context-control': styles(
    "gb:biology-context:focus-visible:[outline:2px_solid_var(--accent)] gb:biology-context:focus-visible:[outline-offset:2px]",
  ),
};
export function biologyContextClasses(names: string): string {
  return names.split(/\s+/).map(name => `${name} ${classes[name] || ''}`).join(' ');
}
