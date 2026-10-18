import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

/** Only the eleven native Dashboard Notes rules; shared Dashboard/editor/theme rules remain foreign. */
export const dashboardLabNotesOwnership = {
  receivers: [
  [
    "dashboard-lab-notes-notes-section",
    ".notes-section",
    null
  ],
  [
    "dashboard-lab-notes-note-card",
    ".note-card",
    null
  ],
  [
    "dashboard-lab-notes-note-card-hover",
    ".note-card:hover",
    null
  ],
  [
    "dashboard-lab-notes-note-card-date",
    ".note-card-date",
    null
  ],
  [
    "dashboard-lab-notes-note-card-text",
    ".note-card-text",
    null
  ],
  [
    "dashboard-lab-notes-note-card-actions",
    ".note-card-actions",
    null
  ],
  [
    "dashboard-lab-notes-note-card-action",
    ".note-card-action",
    null
  ],
  [
    "dashboard-lab-notes-note-card-action-hover",
    ".note-card-action:hover",
    null
  ],
  [
    "dashboard-lab-notes-note-card-action-delete-hover",
    ".note-card-action-delete:hover",
    null
  ],
  [
    "dashboard-lab-notes-add-note-btn",
    ".add-note-btn",
    null
  ],
  [
    "dashboard-lab-notes-add-note-btn-hover",
    ".add-note-btn:hover",
    null
  ]
],
  declarationCount: 54,
} as const satisfies NativeStyleOwnership;
