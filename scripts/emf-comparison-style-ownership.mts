import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {emfEditorOwnership} from './emf-editor-style-ownership.mjs';
import {emfInterpretationOwnership} from './emf-interpretation-style-ownership.mjs';

const comparisonReceivers = [
  [
    "emf-comparison-emf-compare-header",
    ".emf-compare-header",
    null
  ],
  [
    "emf-comparison-emf-compare-label",
    ".emf-compare-label",
    null
  ],
  [
    "emf-comparison-emf-compare-arrow",
    ".emf-compare-arrow",
    null
  ],
  [
    "emf-comparison-emf-compare-note",
    ".emf-compare-note",
    null
  ],
  [
    "emf-comparison-emf-compare-table",
    ".emf-compare-table",
    null
  ],
  [
    "emf-comparison-emf-compare-table-table",
    ".emf-compare-table table",
    null
  ],
  [
    "emf-comparison-emf-compare-table-th",
    ".emf-compare-table th",
    null
  ],
  [
    "emf-comparison-emf-compare-table-th-first-child",
    ".emf-compare-table th:first-child",
    null
  ],
  [
    "emf-comparison-emf-compare-room",
    ".emf-compare-room",
    null
  ],
  [
    "emf-comparison-emf-compare-cell",
    ".emf-compare-cell",
    null
  ],
  [
    "emf-comparison-emf-compare-table-tr-last-child-td",
    ".emf-compare-table tr:last-child td",
    null
  ],
  [
    "emf-comparison-emf-compare-header-max-width-600px",
    ".emf-compare-header",
    "(max-width: 600px)"
  ],
  [
    "emf-comparison-emf-compare-arrow-max-width-600px",
    ".emf-compare-arrow",
    "(max-width: 600px)"
  ],
  [
    "emf-comparison-emf-compare-table-max-width-600px",
    ".emf-compare-table",
    "(max-width: 600px)"
  ],
  [
    "emf-comparison-emf-compare-table-th-group-max-width-600px",
    ".emf-compare-table th, .emf-compare-cell",
    "(max-width: 600px)"
  ]
] as const;
export const emfComparisonOwnership = {
  ...emfInterpretationOwnership,
  receivers: [...emfInterpretationOwnership.receivers, ...comparisonReceivers,
    ['emf-photo-lightbox', '.emf-lightbox', null],
    ['emf-photo-image', '.emf-lightbox img', null], ...emfEditorOwnership.receivers],
  declarationCount: emfInterpretationOwnership.declarationCount + 51 + emfEditorOwnership.declarationCount,
} as const satisfies NativeStyleOwnership;
export function compileEMFComparisonStyles(input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,emfComparisonOwnership);
}
