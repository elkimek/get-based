export { scheduleBiologyScoreAIReconcile } from './biology-scores.js';
import {renderHTML} from './components/BiologyScoresPage.svelte.html.js';
import {computeBiologyScores,getBiologyScorePresentationRecords} from './biology-scores.js';
import {getBiologyContextSectionView} from './biology-context-view.js';
import {getLensPageWidgetOrder} from './lens-page-shell-core.js';
import {projectBiologyPage,biologyPageDefaultOrder} from './biology-page-presentation.js';
import {state} from './state.js';
/** Read-only page composition; calculation, request, ordering and writes retain their owners. */
export function renderBiologyPage(ctx: unknown,scoreData: Parameters<typeof getBiologyContextSectionView>[0]): string {
  const records = getBiologyScorePresentationRecords(ctx);
  const defaults = biologyPageDefaultOrder(records);
  const order = {baseline:getLensPageWidgetOrder('biology-scores-baseline',defaults.baseline),
    advanced:getLensPageWidgetOrder('biology-scores-advanced',defaults.advanced),
    waiting:getLensPageWidgetOrder('biology-scores-waiting',defaults.waiting)};
  return renderHTML({view:projectBiologyPage({records,order,planningScores:computeBiologyScores(scoreData || {}),
    context:getBiologyContextSectionView(scoreData),range:state.dateRangeFilter})});
}
