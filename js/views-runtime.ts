// Stable synchronous compatibility exports; the production router loads bodies on demand.
export * from './navigation-views.js';
export {renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard} from './focus-card.js';
export {renderChartCard, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts} from './category-view-renderers.js';
export {showCategory, switchView} from './category-page-view.js';
