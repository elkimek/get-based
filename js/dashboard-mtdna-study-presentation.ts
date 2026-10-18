import {renderHTML} from './components/DashboardMtdnaStudy.svelte.html.js';
import type {MtdnaStudyReader} from '../types/dashboard-widget-renderers.js';

export interface DashboardMtdnaStudyView {
  readonly pmid: string; readonly directionClass: string; readonly label: string; readonly direction: string; readonly title: string;
  readonly scope: string | null; readonly summary: string | null; readonly model: string | null; readonly limitations: string | null;
}
const text = (value: unknown): string => value == null ? '' : String(value);
export function projectDashboardMtdnaStudy(study: MtdnaStudyReader | null | undefined): DashboardMtdnaStudyView {
  // Keep the native renderer's repeated property/coercion reads in order.
  // In particular, direction is read independently for class and visible copy.
  const pmid = String(study?.pmid || '').replace(/\D/g, '');
  const directionClass = String(study?.direction || 'context').toLowerCase();
  const label = text(study?.studyLabel || 'Study');
  const direction = text(study?.direction || 'context');
  const title = text(study?.title || 'Mitochondrial evidence');
  const scope = study?.scopeLabel ? text(study.scopeLabel) : null;
  const summary = study?.summary ? text(study.summary) : null;
  const model = study?.model ? text(study.model) : null;
  const limitations = study?.limitations ? text(study.limitations) : null;
  return {pmid,directionClass,label,direction,title,scope,summary,model,limitations};
}

/** Stable synchronous public ABI; the real component owns its SSR nodes. */
export function renderDashboardMtdnaStudy(study: MtdnaStudyReader | null | undefined): string {
  return renderHTML({view:projectDashboardMtdnaStudy(study)});
}
