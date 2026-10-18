import type {SupplementUnitOptionView, SupplementIngredientView} from '../supplement-form-presentation.js';
export function renderHTML(props:
  {kind: 'unitOption'; view: SupplementUnitOptionView}
  | {kind: 'ingredient'; view: SupplementIngredientView}
): string;
