import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

export const emojiPickerOwnership = {
  "receivers": [
    [
      "emoji-picker-01",
      ".emoji-picker",
      null
    ],
    [
      "emoji-picker-02",
      ".emoji-picker-search",
      null
    ],
    [
      "emoji-picker-03",
      ".emoji-picker-search input",
      null
    ],
    [
      "emoji-picker-04",
      ".emoji-picker-search input:focus",
      null
    ],
    [
      "emoji-picker-05",
      ".emoji-picker-cats",
      null
    ],
    [
      "emoji-picker-06",
      ".emoji-picker-cats button",
      null
    ],
    [
      "emoji-picker-07",
      ".emoji-picker-cats button.active, .emoji-picker-cats button:hover",
      null
    ],
    [
      "emoji-picker-08",
      ".emoji-picker-grid",
      null
    ],
    [
      "emoji-picker-09",
      ".emoji-picker-grid span",
      null
    ],
    [
      "emoji-picker-10",
      ".emoji-picker-grid span:hover",
      null
    ],
    [
      "emoji-picker-11",
      ".emoji-picker-label",
      null
    ],
    [
      "emoji-picker-reset",
      ".emoji-picker-cats button[data-cat=\"__reset\"]",
      null
    ]
  ],
  "declarationCount": 58,
  "compactMetadataPrefix": true,
  "isolateRecipes": true
} as const satisfies NativeStyleOwnership;
