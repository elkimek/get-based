import type {SupplementPeriodView, SupplementDoseSummaryView} from '../supplement-form-presentation.js';
export function renderHTML(props:
  {kind: 'period'; view: SupplementPeriodView}
  | {kind: 'doseSummary'; view: SupplementDoseSummaryView}
): string;
