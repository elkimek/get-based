import {renderHTML} from './components/DashboardLightWidgetBody.svelte.html.js';
import type {ReviewAIView} from './light-review-ai-presentation.js';
import type {LightPageBodyProps} from './light-page-presentation.js';
import type {ConditionsPresentationProps} from './light-conditions-presentation.js';

/** Captured Light display data. Loading and domain services remain in their owners. */
export type DashboardLightWidgetView =
  | Readonly<{kind:'loading'}>
  | Readonly<{kind:'today';view:Readonly<ReviewAIView>|null}>
  | Readonly<{kind:'conditions';view:Readonly<ConditionsPresentationProps>|null}>
  | Readonly<{kind:'page';view:Readonly<LightPageBodyProps>|null}>;

export function renderDashboardLightWidget(view:DashboardLightWidgetView):string {
  return renderHTML({view});
}
