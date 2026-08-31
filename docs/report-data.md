# Report data contract

Reports have a renderer-independent data contract in
`js/export-report-data.js`. PDF rendering and AI summaries are consumers of
report data; they are not the source of truth for range or status resolution.

Use `collectReportData(options)` from `js/export-report.js` (or the `js/export.js`
facade) to collect the active profile. The result is detached from app state and
can be serialized as JSON for a local integration or another authorized agent:

```js
const report = collectReportData({
  preset: 'full',
  dateRange: 'all',
  sections: ['flagged', 'categories', 'summary', 'trends', 'supplements', 'notes', 'genetics', 'context'],
});
```

The top-level `schemaVersion` must be checked before relying on the shape. Each
lab marker contains all selected results, and each result contains:

- its collection date and draw-level context;
- result-file and collection-context provenance when the source entry records it;
- the source report's original range and unit when an import snapshot can be
  matched exactly (kept separate from the converted range used for status);
- the numeric and display value;
- marker-level and value-level notes;
- the range used for status, ranges displayed for the selected mode, and all
  available reference/optimal ranges;
- the resolved range label, kind, source, and status.

`scope.rangeMode` records what the user chose to display and
`scope.statusBasis` records how statuses were judged. In “both” mode, reference
and optimal ranges are available for display, while optimal guidance judges
status when available. Reference is the fallback, and a phase-specific
reference range takes precedence.

`low`, `normal`, and `high` are emitted only when an applicable range has at
least one bound. A result whose context deliberately suppresses both bounds is
`unrated`, not silently in range.

The report sections remain a data-minimization boundary. Unselected labs,
notes, supplements, genetics, or profile context are represented as `null` or
empty collections. Callers that need a full snapshot must explicitly select
the full set of sections. `buildReportAgentContext(options)` provides a bounded
plain-text projection, while `collectReportData(options)` is the lossless
structured interface.

For deterministic tests or non-UI consumers, call `buildReportDataSnapshot()`
directly with prepared active data, profile metadata, imported profile data,
normalized report options, range mode, and unit system.
