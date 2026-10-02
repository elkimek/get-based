interface ContextChange { field: string; date?: string; snapshot?: unknown }
interface TimelineOptions { includeInsightCards: boolean; includeLightContext: boolean; fmtDate: (date: string | undefined) => string }

// Builds the profile-context change timeline included in AI lab context.

import { INSIGHT_CONTEXT_CHANGE_FIELDS } from './context-source-registry.js';
import { summarizeChange } from './lab-context-output.js';

const FIELD_LABELS: Record<string, string> = {
  diet: 'Diet & Digestion',
  exercise: 'Exercise',
  sleepRest: 'Sleep & Rest',
  lightCircadian: 'Light & Circadian',
  stress: 'Stress',
  loveLife: 'Love Life',
  environment: 'Environment',
  diagnoses: 'Medical History',
  healthGoals: 'Health Goals',
  interpretiveLens: 'Interpretive Lens',
  contextNotes: 'Context Notes',
  menstrualCycle: 'Menstrual Cycle',
};

export function buildContextChangeTimeline(changeHistory: readonly ContextChange[], { includeInsightCards, includeLightContext, fmtDate }: TimelineOptions) {
  if (!includeInsightCards || changeHistory.length === 0) return '';

  // Defensive against legacy entries without dates: sorting on undefined used
  // to take down the complete model-context assembly after any profile save.
  const sorted = [...changeHistory].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const byField: Record<string, ContextChange[]> = {};
  for (const entry of sorted) {
    if (!byField[entry.field]) byField[entry.field] = [];
    byField[entry.field]!.push(entry);
  }

  const lines: string[] = [];
  for (const entry of sorted) {
    if (!INSIGHT_CONTEXT_CHANGE_FIELDS.includes(entry.field)) continue;
    if (entry.field === 'lightCircadian' && !includeLightContext) continue;
    const fieldEntries = byField[entry.field]!;
    const index = fieldEntries.indexOf(entry);
    const previous = index > 0 ? fieldEntries[index - 1]!.snapshot : null;
    const diff = summarizeChange(previous, entry.snapshot);
    if (diff) lines.push(`- ${fmtDate(entry.date)}: ${FIELD_LABELS[entry.field] || entry.field} — ${diff}`);
  }

  return lines.length > 0
    ? `[section:changeTimeline]\n## Context Change Timeline\n${lines.join('\n')}\n[/section:changeTimeline]\n\n`
    : '';
}
