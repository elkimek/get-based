import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

// Fixed Custom Marker declarations only. The delegate retains inline display.
export const customMarkerOwnership = {
  "receivers": [
    [
      "custom-marker-category-row",
      ".marker-form-modal #cm-new-cat-row",
      null
    ],
    [
      "custom-marker-category-icon",
      ".marker-form-modal #cm-new-cat-icon",
      null
    ],
    [
      "custom-marker-category-name",
      ".marker-form-modal #cm-new-cat",
      null
    ],
    [
      "custom-marker-range-row",
      ".marker-form-modal .cm-range-row",
      null
    ],
    [
      "custom-marker-range-divider",
      ".marker-form-modal .cm-range-divider",
      null
    ]
  ],
  "declarationCount": 11,
  "compactMetadataPrefix": true,
  "isolateRecipes": true
} as const satisfies NativeStyleOwnership;
