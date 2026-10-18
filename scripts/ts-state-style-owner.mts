import type {InlineStyleMapOwner} from './inline-style-map-owners.mjs';

/** Fixed color and motion values for existing physical browser state setters. */
export const tsStateStyleOwner = {
  "id": "ts-state-ui",
  "input": "css/ts-state-ui.inline.tailwind.css",
  "output": "js/ts-state-ui-inline-style-map.generated.js",
  "exportName": "tsStateStyles",
  "declarationCount": 8,
  "recipes": [
    [
      "successColor",
      "ts-state-success-color",
      "color"
    ],
    [
      "mutedColor",
      "ts-state-muted-color",
      "color"
    ],
    [
      "cautionColor",
      "ts-state-caution-color",
      "color"
    ],
    [
      "fadeOpacity",
      "ts-state-fade-opacity",
      "opacity"
    ],
    [
      "bannerTransition",
      "ts-state-banner-transition",
      "transition"
    ],
    [
      "bannerTransform",
      "ts-state-banner-transform",
      "transform"
    ],
    [
      "toastTransition",
      "ts-state-toast-transition",
      "transition"
    ],
    [
      "toastTransform",
      "ts-state-toast-transform",
      "transform"
    ]
  ]
} as const satisfies InlineStyleMapOwner;
