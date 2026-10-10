/** Progress-owned declarations only; retain every original native class token and state. */
const utilities = {
  "progress": [
    "gb:import-progress-body:[display:flex]",
    "gb:import-progress-body:[flex-direction:column]",
    "gb:import-progress-body:[gap:14px]",
    "gb:import-progress-body:[align-items:flex-start]",
    "gb:import-progress-body:[margin:0_auto]",
    "gb:import-progress-body:[width:fit-content]",
  ].join(' '),
  "step": [
    "gb:import-progress-step:[display:flex]",
    "gb:import-progress-step:[align-items:center]",
    "gb:import-progress-step:[gap:10px]",
    "gb:import-progress-step:[font-size:14px]",
    "gb:import-progress-step:[color:var(--text-muted)]",
    "gb:import-progress-step:[transition:color_0.2s]",
    "gb:import-progress-step-active:[color:var(--text-primary)]",
    "gb:import-progress-step-active:[font-weight:500]",
    "gb:import-progress-step-done:[color:var(--green)]",
  ].join(' '),
  "icon": [
    "gb:import-progress-step-icon:[width:22px]",
    "gb:import-progress-step-icon:[height:22px]",
    "gb:import-progress-step-icon:[display:flex]",
    "gb:import-progress-step-icon:[align-items:center]",
    "gb:import-progress-step-icon:[justify-content:center]",
    "gb:import-progress-step-icon:[font-size:14px]",
    "gb:import-progress-step-icon:[flex-shrink:0]",
    "gb:import-progress-step-icon-done:[color:var(--green)]",
  ].join(' '),
  "spinner": [
    "gb:import-progress-spinner:[display:inline-block]",
    "gb:import-progress-spinner:[width:18px]",
    "gb:import-progress-spinner:[height:18px]",
    "gb:import-progress-spinner:import-progress-spinner-border",
    "gb:import-progress-spinner:[border-radius:50%]",
    "gb:import-progress-spinner:[animation:progressSpin_0.8s_linear_infinite]",
  ].join(' '),
  "bar": [
    "gb:import-progress-bar:[width:100%]",
    "gb:import-progress-bar:[max-width:280px]",
    "gb:import-progress-bar:[height:6px]",
    "gb:import-progress-bar:[background:var(--border)]",
    "gb:import-progress-bar:[border-radius:3px]",
    "gb:import-progress-bar:[margin:0_auto_4px]",
    "gb:import-progress-bar:[overflow:hidden]",
  ].join(' '),
  "fill": [
    "gb:import-progress-fill:[height:100%]",
    "gb:import-progress-fill:[background:var(--accent-gradient)]",
    "gb:import-progress-fill:[border-radius:3px]",
    "gb:import-progress-fill:[transition:width_0.4s_ease]",
  ].join(' '),
  "percentage": [
    "gb:import-progress-percentage:[text-align:center]",
    "gb:import-progress-percentage:[font-size:13px]",
    "gb:import-progress-percentage:[font-weight:600]",
    "gb:import-progress-percentage:[color:var(--text-secondary)]",
    "gb:import-progress-percentage:[margin-bottom:12px]",
    "gb:import-progress-percentage:[font-variant-numeric:tabular-nums]",
  ].join(' '),
  "stage": [
    "gb:import-progress-stage:[text-align:center]",
    "gb:import-progress-stage:[font-size:12px]",
    "gb:import-progress-stage:[color:var(--text-muted)]",
    "gb:import-progress-stage:[margin:-8px_0_12px]",
    "gb:import-progress-stage:[min-height:15px]",
  ].join(' '),
  "filename": [
    "gb:import-progress-filename:[font-size:12px]",
    "gb:import-progress-filename:[color:var(--text-muted)]",
    "gb:import-progress-filename:[margin-top:4px]",
    "gb:import-progress-filename:[align-self:center]",
  ].join(' '),
  "batch": [
    "gb:import-progress-batch:[text-align:center]",
    "gb:import-progress-batch:[color:var(--accent)]",
    "gb:import-progress-batch:[font-weight:600]",
    "gb:import-progress-batch:[font-size:14px]",
    "gb:import-progress-batch:[margin-bottom:12px]",
  ].join(' '),
} as const;
export type ImportProgressReceiver = keyof typeof utilities;

/** The native string is preserved, including pending-row trailing whitespace. */
export function importProgressClasses(nativeClasses: string, receiver: ImportProgressReceiver): string {
  return `${nativeClasses} ${utilities[receiver]}`;
}
