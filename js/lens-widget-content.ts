import type {GenomeImportView,BodySourcesView} from './lens-content-presentation.js';
import type {DashboardQuickMarkersView} from '../types/dashboard-owned-widgets.js';
import type {DashboardKeyTrendsView} from './dashboard-key-trends-presentation.js';
import type {DashboardGenomeWidgetView} from './dashboard-genome-rows-presentation.js';

import type {DashboardBiometricsOverviewView} from '../types/dashboard-biometric-views.js';
import type {DashboardInsightsView} from '../types/dashboard-insights-view.js';
import type {NutritionDashboardView} from './nutrition-dashboard-model.js';
import type {SupplementSection} from './supplement-dashboard-presentation.js';
import type {CycleOverviewPresentationView} from './cycle-overview-presentation.js';
import type {ContextCatalogView} from './context-card-catalog-presentation.js';
import type {FocusCardView} from './focus-card-presentation.js';
import type {RecommendationPresentationView} from './recommendation-presentation.js';

import type {BiologyScoreDetailView} from './biology-card-presentation.js';
import type {LightWidgetContent} from './light-page-presentation.js';
export type LensWidgetContent =
  | {readonly kind: 'quick-markers'; readonly view: DashboardQuickMarkersView}
  | {readonly kind: 'key-trends'; readonly view: DashboardKeyTrendsView}
  | {readonly kind: 'genome'; readonly view: DashboardGenomeWidgetView}
  | {readonly kind: 'genome-import'; readonly view: GenomeImportView}
  | {readonly kind: 'wearables'; readonly view: DashboardBiometricsOverviewView}
  | {readonly kind: 'body-sources'; readonly view: BodySourcesView}
  | {readonly kind: 'nutrition' | 'fuel'; readonly view: NutritionDashboardView | null}
  | {readonly kind: 'supplements'; readonly view: SupplementSection | null}
  | {readonly kind: 'cycle'; readonly view: CycleOverviewPresentationView | null}
  | {readonly kind: 'focus'; readonly view: FocusCardView}
  | {readonly kind: 'recommendations'; readonly view: RecommendationPresentationView}
  | {readonly kind: 'insights'; readonly view: DashboardInsightsView | null}
  | {readonly kind: 'profile-context'; readonly view: ContextCatalogView | null}
  | {readonly kind:'biology-score';readonly view:BiologyScoreDetailView}
  | {readonly kind:'light';readonly view:LightWidgetContent};

/** Generic data pages and Dashboard cannot receive full Light/Biology page widgets. */
export type LensDataWidgetContent = Exclude<LensWidgetContent, {kind:'biology-score'|'light'}>;

/** One finite set of feature-owned bodies is shared by typed pages and public chrome. */
export function lensWidgetHasContent(content:LensWidgetContent|null):boolean {
 if(content===null)return false;
 if(content.kind==='light')return content.view.kind!=='setup'||content.view.props!==null;
 return content.view!==null&&(content.kind!=='quick-markers'||content.view.rows.length>0);
}
const kinds=new Set(['quick-markers','key-trends','genome','genome-import','wearables','body-sources','nutrition','fuel','supplements','cycle','focus','recommendations','insights','profile-context','biology-score','light']);
export function requireLensWidgetContent(value:unknown):LensWidgetContent|null {
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='object'||!('kind'in value)||!kinds.has(String(value.kind))||!('view'in value))
  throw new TypeError('Lens content must be a typed owner view');
 return value as LensWidgetContent;
}
