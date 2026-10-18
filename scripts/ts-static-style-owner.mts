import type {InlineStyleMapOwner} from './inline-style-map-owners.mjs';

/** Static browser property/cssText writes and public compatibility host styles, authored in Tailwind. */
export const tsStaticStyleOwner = {
  "id": "ts-static-ui",
  "input": "css/ts-static-ui.inline.tailwind.css",
  "output": "js/ts-static-ui-inline-style-map.generated.js",
  "exportName": "tsStaticStyles",
  "declarationCount": 28,
  "recipes": [
    [
      "editorInput",
      "ts-static-editor-input"
    ],
    [
      "commitLinkColor",
      "ts-static-commit-link-color",
      "color"
    ],
    [
      "commitLinkDecoration",
      "ts-static-commit-link-decoration",
      "text-decoration"
    ],
    [
      "commitSuffixColor",
      "ts-static-commit-suffix-color",
      "color"
    ],
    [
      "commitSuffixOpacity",
      "ts-static-commit-suffix-opacity",
      "opacity"
    ],
    [
      "syncEventsFallback",
      "ts-static-sync-events-fallback"
    ],
    [
      "syncPopoverAnchor",
      "ts-static-sync-popover-anchor",
      "position"
    ],
    [
      "liveMessageHost",
      "ts-static-live-message-host",
      "display"
    ],
    [
      "messageActionsHost",
      "ts-static-message-actions-host"
    ],
    [
      "speechHost",
      "ts-static-speech-host"
    ]
  ]
} as const satisfies InlineStyleMapOwner;
