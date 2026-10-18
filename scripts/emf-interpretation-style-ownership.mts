import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
// Only the EMF interpretation owner; native positions and phone ancestry stay exact.
export const emfInterpretationOwnership={
  "receivers": [
    [
      "emf-interpretation-overlay",
      ".emf-interp-overlay",
      null
    ],
    [
      "emf-interpretation-overlay-open",
      ".emf-interp-overlay.show",
      null
    ],
    [
      "emf-interpretation-dialog",
      ".emf-interp-modal",
      null
    ],
    [
      "emf-interpretation-header",
      ".emf-interp-header",
      null
    ],
    [
      "emf-interpretation-title",
      ".emf-interp-header h3",
      null
    ],
    [
      "emf-interpretation-body",
      ".emf-interp-body",
      null
    ],
    [
      "emf-interpretation-body-heading",
      ".emf-interp-body h1, .emf-interp-body h2, .emf-interp-body h3",
      null
    ],
    [
      "emf-interpretation-first-heading",
      ".emf-interp-body h1:first-child, .emf-interp-body h2:first-child, .emf-interp-body h3:first-child",
      null
    ],
    [
      "emf-interpretation-lists",
      ".emf-interp-body ul, .emf-interp-body ol",
      null
    ],
    [
      "emf-interpretation-list-item",
      ".emf-interp-body li",
      null
    ],
    [
      "emf-interpretation-strong",
      ".emf-interp-body strong",
      null
    ],
    [
      "emf-interpretation-paragraph",
      ".emf-interp-body p",
      null
    ],
    [
      "emf-interpretation-placeholder",
      ".emf-interp-placeholder",
      null
    ],
    [
      "emf-interpretation-error",
      ".emf-interp-error",
      null
    ],
    [
      "emf-interpretation-footer",
      ".emf-interp-footer",
      null
    ],
    [
      "emf-interpretation-meta",
      ".emf-interp-meta",
      null
    ],
    [
      "emf-interpretation-actions",
      ".emf-interp-actions",
      null
    ],
    [
      "emf-interpretation-overlay-phone",
      ".emf-interp-overlay",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-dialog-phone",
      ".emf-interp-modal",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-header-phone",
      ".emf-interp-header",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-title-phone",
      ".emf-interp-header h3",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-body-phone",
      ".emf-interp-body",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-footer-phone",
      ".emf-interp-footer",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-actions-phone",
      ".emf-interp-actions",
      "(max-width: 600px)"
    ],
    [
      "emf-interpretation-action-button-phone",
      ".emf-interp-actions .import-btn",
      "(max-width: 600px)"
    ]
  ],
  "declarationCount": 73,
  "compactMetadataPrefix": true,
  "isolateRecipes": true
} as const satisfies NativeStyleOwnership;
export function compileEMFInterpretationStyles(input:string,inputPath:string,root:string){return compileNativeStyleBodies(input,inputPath,root,emfInterpretationOwnership);}
