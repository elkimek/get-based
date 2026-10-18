import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

// Sidebar-owned declarations stay in CSS; each receiver keeps its exact native scope.
export const sidebarStyleOwnership = {
  "app-shell": {
    "receivers": [
      [
        "sidebar-app-shell-sidebar-search-wrap",
        ".sidebar-search-wrap",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search-icon",
        ".sidebar-search-icon",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search",
        ".sidebar-search",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search-focus",
        ".sidebar-search:focus",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search-placeholder",
        ".sidebar-search::placeholder",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search-wrap-sidebar-search",
        ".sidebar-search-wrap .sidebar-search",
        null
      ],
      [
        "sidebar-app-shell-nav-section",
        ".nav-section",
        null
      ],
      [
        "sidebar-app-shell-sidebar-title",
        ".sidebar-title",
        null
      ],
      [
        "sidebar-app-shell-nav-item",
        ".nav-item",
        null
      ],
      [
        "sidebar-app-shell-nav-item-hover",
        ".nav-item:hover",
        null
      ],
      [
        "sidebar-app-shell-nav-item-active-nav-item-is-active",
        ".nav-item.active,\n.nav-item.is-active",
        null
      ],
      [
        "sidebar-app-shell-nav-item-active-nav-item-dot-nav-item-is-active-nav-item-dot",
        ".nav-item.active .nav-item-dot,\n.nav-item.is-active .nav-item-dot",
        null
      ],
      [
        "sidebar-app-shell-nav-item-icon",
        ".nav-item-icon",
        null
      ],
      [
        "sidebar-app-shell-nav-item-active-nav-item-icon",
        ".nav-item.active .nav-item-icon",
        null
      ],
      [
        "sidebar-app-shell-nav-item-dot",
        ".nav-item-dot",
        null
      ],
      [
        "sidebar-app-shell-nav-item-label",
        ".nav-item-label",
        null
      ],
      [
        "sidebar-app-shell-nav-item-count-nav-item-count",
        ".nav-item .count,\n.nav-item-count",
        null
      ],
      [
        "sidebar-app-shell-nav-item-flag-count",
        ".nav-item .flag-count",
        null
      ],
      [
        "sidebar-app-shell-nav-item-nav-count",
        ".nav-item .nav-count",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-toggle",
        ".sidebar-group-toggle",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-toggle-hover",
        ".sidebar-group-toggle:hover",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-toggle-focus-visible",
        ".sidebar-group-toggle:focus-visible",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-header-flag-count",
        ".sidebar-group-header .flag-count",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-arrow",
        ".sidebar-group-arrow",
        null
      ],
      [
        "sidebar-app-shell-sidebar-group-header-not-collapsed-sidebar-group-arrow",
        ".sidebar-group-header:not(.collapsed) .sidebar-group-arrow",
        null
      ],
      [
        "sidebar-app-shell-sidebar-add-marker",
        ".sidebar-add-marker",
        null
      ],
      [
        "sidebar-app-shell-sidebar-add-marker-hover",
        ".sidebar-add-marker:hover",
        null
      ],
      [
        "sidebar-app-shell-sidebar-search-max-width-1024px",
        ".sidebar-search",
        "(max-width: 1024px)"
      ],
      [
        "sidebar-app-shell-sidebar-search-wrap-sidebar-search-max-width-1024px",
        ".sidebar-search-wrap .sidebar-search",
        "(max-width: 1024px)"
      ],
      [
        "sidebar-app-shell-nav-item-pointer-coarse",
        ".nav-item",
        "(pointer: coarse)"
      ]
    ],
    "declarationCount": 145
  },
  "redesign-shell": {
    "receivers": [
      [
        "sidebar-redesign-shell-sidebar-search-wrap",
        ".sidebar-search-wrap",
        null
      ],
      [
        "sidebar-redesign-shell-sidebar-search",
        ".sidebar-search",
        null
      ],
      [
        "sidebar-redesign-shell-nav-section",
        ".nav-section",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item",
        ".nav-item",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-hover",
        ".nav-item:hover",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-active-nav-item-is-active",
        ".nav-item.active,\n.nav-item.is-active",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-count-nav-item-count-nav-item-nav-count",
        ".nav-item-count,\n.nav-item .count,\n.nav-item .nav-count",
        null
      ],
      [
        "sidebar-redesign-shell-sidebar-add-marker-hover",
        ".sidebar-add-marker:hover",
        null
      ],
      [
        "sidebar-redesign-shell-sidebar-search-icon-nav-item-icon",
        ".sidebar-search-icon,\n.nav-item-icon",
        null
      ],
      [
        "sidebar-redesign-shell-sidebar-search-icon-svg-nav-item-icon-svg",
        ".sidebar-search-icon svg,\n.nav-item-icon svg",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-icon",
        ".nav-item-icon",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-hover-nav-item-icon",
        ".nav-item:hover .nav-item-icon",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-data-category-dashboard-nav-item-dot",
        ".nav-item[data-category=\"dashboard\"] .nav-item-dot",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-count-nav-item-count-nav-item-flag-count-nav-item-nav-count",
        ".nav-item-count,\n.nav-item .count,\n.nav-item .flag-count,\n.nav-item .nav-count",
        null
      ],
      [
        "sidebar-redesign-shell-nav-item-dot",
        ".nav-item-dot",
        null
      ]
    ],
    "declarationCount": 44
  }
} as const satisfies Record<'app-shell' | 'redesign-shell', Pick<NativeStyleOwnership, 'receivers' | 'declarationCount'>>;
