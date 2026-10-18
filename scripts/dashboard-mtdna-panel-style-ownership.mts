import {dashboardGenomeRowsOwnership} from './dashboard-genome-rows-style-ownership.mjs';
import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {dashboardMtdnaStudyOwnership} from './dashboard-mtdna-study-style-ownership.mjs';
export const dashboardMtdnaPanelReceivers=[
  [
    "dashboard-mtdna-panel",
    ".db-mtdna-panel",
    null
  ],
  [
    "dashboard-mtdna-head",
    ".db-mtdna-head,\n.db-mtdna-coupling",
    null
  ],
  [
    "dashboard-mtdna-lineage",
    ".db-mtdna-head > span",
    null
  ],
  [
    "dashboard-mtdna-eyebrow",
    ".db-mtdna-head small",
    null
  ],
  [
    "dashboard-mtdna-haplogroup",
    ".db-mtdna-head strong",
    null
  ],
  [
    "dashboard-mtdna-lens",
    ".db-mtdna-head em",
    null
  ],
  [
    "dashboard-mtdna-coupling-label",
    ".db-mtdna-coupling strong",
    null
  ],
  [
    "dashboard-mtdna-coupling-climate",
    ".db-mtdna-coupling span",
    null
  ],
  [
    "dashboard-mtdna-facts",
    ".db-mtdna-facts",
    null
  ],
  [
    "dashboard-mtdna-fact",
    ".db-mtdna-facts > span",
    null
  ],
  [
    "dashboard-mtdna-fact-label",
    ".db-mtdna-facts small",
    null
  ],
  [
    "dashboard-mtdna-fact-value",
    ".db-mtdna-facts strong",
    null
  ],
  [
    "dashboard-mtdna-copy",
    ".db-mtdna-copy",
    null
  ],
  [
    "dashboard-mtdna-body-text",
    ".db-mtdna-copy p,\n.db-mtdna-caveat",
    null
  ],
  [
    "dashboard-mtdna-environment",
    ".db-mtdna-environment",
    null
  ],
  [
    "dashboard-mtdna-mismatch",
    ".db-mtdna-environment.is-mismatch",
    null
  ],
  [
    "dashboard-mtdna-evidence",
    ".db-mtdna-evidence",
    null
  ],
  [
    "dashboard-mtdna-evidence-summary",
    ".db-mtdna-evidence > summary",
    null
  ],
  [
    "dashboard-mtdna-evidence-count",
    ".db-mtdna-evidence > summary span",
    null
  ],
  [
    "dashboard-mtdna-evidence-body",
    ".db-mtdna-evidence-body",
    null
  ],
  [
    "dashboard-mtdna-study-grid",
    ".db-mtdna-study-grid",
    null
  ],
  [
    "dashboard-mtdna-phone-climate",
    ".db-mtdna-coupling span",
    "(max-width: 680px)"
  ],
  [
    "dashboard-mtdna-phone-facts",
    ".db-mtdna-facts,\n  .db-mtdna-study-grid",
    "(max-width: 680px)"
  ],
  [
    "dashboard-mtdna-loading",
    ".db-genome-loading",
    null
  ],
  [
    "dashboard-mtdna-loading-hover",
    ".db-genome-loading:hover",
    null
  ]
] as const;
export const dashboardMtdnaPanelOwnership={receivers:[...dashboardMtdnaStudyOwnership.receivers,...dashboardMtdnaPanelReceivers],declarationCount:126,compactMetadataPrefix:true,isolateRecipes:true} as const satisfies NativeStyleOwnership;
export const dashboardGenomePresentationOwnership={receivers:[...dashboardMtdnaPanelOwnership.receivers,...dashboardGenomeRowsOwnership.receivers],declarationCount:dashboardMtdnaPanelOwnership.declarationCount+dashboardGenomeRowsOwnership.declarationCount,compactMetadataPrefix:true,isolateRecipes:true} as const satisfies NativeStyleOwnership;
export function compileDashboardMtdnaPanelStyles(input:string,inputPath:string,root:string){return compileNativeStyleBodies(input,inputPath,root,dashboardGenomePresentationOwnership);}
