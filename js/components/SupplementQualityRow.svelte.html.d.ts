import type {SupplementQualityView, SupplementCategoryOptionView} from '../supplement-form-presentation.js';
export function renderHTML(props:
  {kind: 'quality'; view: SupplementQualityView}
  | {kind: 'categoryOption'; view: SupplementCategoryOptionView}
): string;
