import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
export const dashboardMtdnaStudyOwnership = {
  receivers: [
  [
    "dashboard-mtdna-study-01",
    ".db-mtdna-study",
    null
  ],
  [
    "dashboard-mtdna-study-02",
    ".db-mtdna-study-mixed",
    null
  ],
  [
    "dashboard-mtdna-study-03",
    ".db-mtdna-study-null",
    null
  ],
  [
    "dashboard-mtdna-study-04",
    ".db-mtdna-study-head",
    null
  ],
  [
    "dashboard-mtdna-study-05",
    ".db-mtdna-study-head span,\n.db-mtdna-study-head em",
    null
  ],
  [
    "dashboard-mtdna-study-06",
    ".db-mtdna-study-head em",
    null
  ],
  [
    "dashboard-mtdna-study-07",
    ".db-mtdna-study > strong",
    null
  ],
  [
    "dashboard-mtdna-study-08",
    ".db-mtdna-study > small",
    null
  ],
  [
    "dashboard-mtdna-study-09",
    ".db-mtdna-study p",
    null
  ],
  [
    "dashboard-mtdna-study-10",
    ".db-mtdna-study dl",
    null
  ],
  [
    "dashboard-mtdna-study-11",
    ".db-mtdna-study dt",
    null
  ],
  [
    "dashboard-mtdna-study-12",
    ".db-mtdna-study dd",
    null
  ],
  [
    "dashboard-mtdna-study-13",
    ".db-mtdna-study > a",
    null
  ]
],
  declarationCount: 43, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
export function compileDashboardMtdnaStudyStyles(input: string,inputPath: string,root: string) {
  return compileNativeStyleBodies(input,inputPath,root,dashboardMtdnaStudyOwnership);
}
