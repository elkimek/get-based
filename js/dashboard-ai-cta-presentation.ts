import {renderHTML as rowHTML} from './components/DashboardAIRow.svelte.html.js';
import {renderHTML as ctaHTML} from './components/DashboardAICta.svelte.html.js';
import type {getLensSummary} from './lens.js';

type Summary = ReturnType<typeof getLensSummary>;
type ActionAttributes = (action: string) => unknown;
export type DashboardAIAction = 'open-interpretive-lens' | 'open-knowledge-base' | 'open-personalize-ai-picker'
  | 'enable-encryption' | 'setup-sync' | 'setup-backup' | 'open-data-protection-picker';
export interface DashboardAIRowView {
  readonly ariaLabel: string;
  readonly action: DashboardAIAction;
  readonly title: string;
  readonly icon: string;
  readonly label: string;
  readonly detail: string;
  readonly editIcon: string;
}
export interface DashboardAICtaView {
  readonly action: DashboardAIAction;
  readonly ariaLabel: string;
  readonly icon: string;
  readonly label: string;
  readonly leading: string;
  readonly trailing: string;
}
function literalText(value: unknown): string { return value == null ? '' : String(value); }
function actionAttribute(action: DashboardAIAction, attributes: ActionAttributes): DashboardAIAction {
  // Preserve the native template's default-hint interpolation of the helper result.
  const actual = `${attributes(action)}`;
  if (actual !== `data-dashboard-ai-action="${action}"`) {
    throw new Error('Unexpected Dashboard AI delegated action contract');
  }
  return action;
}
export function projectDashboardLensRow(lens: unknown, attributes: ActionAttributes): DashboardAIRowView {
  const action = actionAttribute('open-interpretive-lens', attributes);
  const detail = literalText(lens);
  return {ariaLabel: 'Edit Interpretive Lens', action, title: 'Interpretive Lens - click to edit',
    icon: '🪞', label: 'Interpretive Lens', detail, editIcon: '✎'};
}
export function renderDashboardLensRow(lens: unknown, attributes: ActionAttributes): string {
  return rowHTML({view: projectDashboardLensRow(lens, attributes)});
}
export function projectDashboardKnowledgeRow(summary: Summary, attributes: ActionAttributes): DashboardAIRowView {
  // Repeated property reads and default-hint count conversion occur in the original order.
  const docFragment = (summary.docCount != null && summary.docCount > 0)
    ? ` · ${summary.docCount} document${summary.docCount !== 1 ? 's' : ''}` : '';
  const rewriteFragment = summary.aiAvailable
    ? ` · query rewriting ${summary.multiQueryOn ? 'on' : 'off'}` : '';
  const emptyEnabledFragment = (!summary.configured && summary.enabled)
    ? ' · enabled, no documents indexed yet' : '';
  const detail = `${literalText(summary.displayName)}${emptyEnabledFragment}${docFragment}${rewriteFragment}`;
  const action = actionAttribute('open-knowledge-base', attributes);
  return {ariaLabel: 'Manage Knowledge Base', action, title: 'Knowledge Base - click to manage',
    icon: '📚', label: 'Knowledge Base', detail, editIcon: '✎'};
}
export function renderDashboardKnowledgeRow(summary: Summary, attributes: ActionAttributes): string {
  return rowHTML({view: projectDashboardKnowledgeRow(summary, attributes)});
}
export function projectDashboardPersonalizeCta(lensSet: boolean, kbSet: boolean, attributes: ActionAttributes): DashboardAICtaView | null {
  if (lensSet && kbSet) return null;
  const icon = !lensSet && !kbSet ? '✨' : !kbSet ? '📚' : '🪞';
  const label = !lensSet && !kbSet ? 'Personalize how AI answers' : !kbSet ? 'Connect a knowledge base' : 'Set an interpretive lens';
  const selectedAction = !lensSet && !kbSet ? 'open-personalize-ai-picker' : !kbSet ? 'open-knowledge-base' : 'open-interpretive-lens';
  const action = actionAttribute(selectedAction, attributes);
  return {action, ariaLabel: label, icon, label, leading: '\n    ', trailing: '\n  '};
}
export function renderDashboardPersonalizeCta(lensSet: boolean, kbSet: boolean, attributes: ActionAttributes): string {
  const view = projectDashboardPersonalizeCta(lensSet, kbSet, attributes);
  return view ? ctaHTML({view}) : '';
}
export type ProtectionCta = 'encryption' | 'sync' | 'backup' | 'multiple';
const protectionCopy = {
  encryption: {action: 'enable-encryption', ariaLabel: 'Enable encryption', label: 'Enable encryption', icon: '🔒', leading: '\n        ', trailing: '\n      '},
  sync: {action: 'setup-sync', ariaLabel: 'Set up cross-device sync', label: 'Sync to other devices', icon: '📡', leading: '\n        ', trailing: '\n      '},
  backup: {action: 'setup-backup', ariaLabel: 'Set up auto-backup', label: 'Set up auto-backup', icon: '💾', leading: '\n      ', trailing: '\n    '},
  multiple: {action: 'open-data-protection-picker', ariaLabel: 'Protect your data', label: 'Protect your data', icon: '🛡', leading: '\n    ', trailing: '\n  '},
} as const satisfies Record<ProtectionCta, DashboardAICtaView>;
export function projectDashboardProtectionPill(kind: ProtectionCta, attributes: ActionAttributes): DashboardAICtaView {
  const view = protectionCopy[kind];
  const action = actionAttribute(view.action, attributes);
  return {...view, action};
}
export function renderDashboardProtectionPill(kind: ProtectionCta, attributes: ActionAttributes): string {
  return ctaHTML({view: projectDashboardProtectionPill(kind, attributes)});
}
