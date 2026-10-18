import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

/** Exclusive Quick grid/tile scopes only; shared stat/status/spark/theme rules remain foreign. */
export const dashboardQuickMarkerDataOwnership = {
  "receivers": [
    [
      "dashboard-quick-markers-data-grid",
      ".db-quick-marker-grid",
      null
    ],
    [
      "dashboard-quick-markers-data-tile",
      ".db-quick-marker-grid .db-stat-widget",
      null
    ],
    [
      "dashboard-quick-markers-data-tile-hover",
      ".db-quick-marker-grid .db-stat-widget:hover",
      null
    ],
    [
      "dashboard-quick-markers-data-grid-phone",
      ".db-quick-marker-grid",
      "(max-width: 640px)"
    ],
    [
      "dashboard-quick-markers-data-tile-phone",
      ".db-quick-marker-grid .db-stat-widget",
      "(max-width: 640px)"
    ]
  ],
  "declarationCount": 15
} as const satisfies NativeStyleOwnership;

export const dashboardQuickMarkerWidgetOwnership = {
  "receivers": [
    [
      "dashboard-quick-markers-widget-grid-tablet",
      ".db-quick-marker-grid",
      "(max-width: 1100px)"
    ],
    [
      "dashboard-quick-markers-widget-grid-phone",
      ".db-quick-marker-grid",
      "(max-width: 640px)"
    ]
  ],
  "declarationCount": 2
} as const satisfies NativeStyleOwnership;
