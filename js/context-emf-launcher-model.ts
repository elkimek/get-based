// Shared, DOM-free projection for the Environment launcher and card summary.
import { getEMFSeverity } from './schema.js';

export interface SummaryEMFAssessment {
  date?: string;
  rooms?: Array<{ sleeping?: boolean; measurements?: Record<string, {value?: number | null} | null> }>;
}

export function emfAssessmentSummary(assessments: readonly SummaryEMFAssessment[]) {
  if (!assessments.length) return '';
  const sorted = [...assessments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const latest = sorted[0]!;
  let worst: ReturnType<typeof getEMFSeverity> = null, worstIdx = -1;
  const tierOrder = ['green', 'yellow', 'orange', 'red'];
  for (const room of latest.rooms || []) {
    const sleeping = room.sleeping !== false;
    for (const [type, m] of Object.entries(room.measurements || {})) {
      if (m && m.value != null) {
        const sev = getEMFSeverity(type, m.value, sleeping);
        if (sev) {
          const idx = tierOrder.indexOf(sev.color);
          if (idx > worstIdx) { worst = sev; worstIdx = idx; }
        }
      }
    }
  }
  const fmtDate = (d: string) => {
    const parsed = new Date(d + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) return String(d || 'saved');
    return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const latestText = latest.date ? fmtDate(latest.date) : 'saved';
  return `EMF: ${sorted.length} assessment${sorted.length > 1 ? 's' : ''} (latest: ${latestText}${worst ? ', ' + worst.label : ''})`;
}

export interface EMFLauncherView {
  count: number;
  hasAssessments: boolean;
  summary: string;
  kicker: string;
  title: string;
  action: string;
}
export function emfAssessmentLauncherView(assessments: readonly SummaryEMFAssessment[]): EMFLauncherView {
  const hasAssessments = assessments.length > 0;
  return {
    count: assessments.length, hasAssessments,
    summary: hasAssessments ? emfAssessmentSummary(assessments) : 'Room-by-room Baubiologie workflow with readings, photos, comparison, and AI interpretation.',
    kicker: hasAssessments ? `${assessments.length} saved` : 'Environment tool',
    title: hasAssessments ? 'Open EMF assessment' : 'Start EMF assessment',
    action: hasAssessments ? 'Open' : 'Start',
  };
}
