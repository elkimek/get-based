export interface LabDateRangeView {
  ranges: {key: string; label: string; active: boolean}[];
  showScope: boolean;
  scope: string;
}
/** Fixed options and literal scope copy; the data controller owns changes. */
export function projectLabDateRange(range: unknown, showScope = false): LabDateRangeView {
  return {ranges: [['3m','3M'],['6m','6M'],['1y','1Y'],['all','All']].map(([key,label]) =>
    ({key: key!, label: label!, active: range === key})), showScope,
    scope: `Filters lab trends and sidebar categories.${range === 'all' ? ' All saved dates are included.' : ' Older results and categories may be hidden.'}`};
}
