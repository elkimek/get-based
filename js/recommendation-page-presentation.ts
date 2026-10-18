import type {LensHeaderView, LensWidgetChromeView} from './lens-shell-presentation.js';
import type {LensActionsView} from './lens-content-presentation.js';
import type {LensContentGrid} from './lens-page-shell-core.js';
import type {RecommendationCardView} from './recommendation-presentation.js';

export type RecommendationPageContent =
  | {kind: 'loading'}
  | {kind: 'disabled'; widget: LensWidgetChromeView}
  | {kind: 'empty'}
  | {kind: 'groups'; grid: LensContentGrid<RecommendationCardView[]>};
export interface RecommendationPageView {
  header: LensHeaderView; actions: LensActionsView; content: RecommendationPageContent;
}
