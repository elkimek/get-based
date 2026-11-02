// Lab view changes are session presentation controls, never profile mutations.
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import { validateAppNavigation } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
import { state } from './state.js';
import { getActiveData } from './data.js';
import { setDateRange, navigateDataViewOutcomeRuntime } from './data-view-controls.js';
import { setCategoryViewMode, loadCategoryViewsStylesheet } from './category-page-runtime.js';
import { safeMarkerId } from './utils.js';
export async function openLabView(request: AppNavigationRequest, canOpen: () => boolean): Promise<AppNavigationReceipt> {
  const destination = request.view === 'category' ? request.category : 'labs';
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, reason, dataSaved: false, settingsSaved: false });
  validateAppNavigation(request);
  if (!['labs', 'category'].includes(request.view)) return rejected('Choose Labs or an exact category.');
  if (!canOpen()) return rejected('This view request expired.');
  if (!destination || request.view === 'category' && (!safeMarkerId(destination) || !Object.hasOwn(getActiveData().categories, destination))) return rejected('Choose an exact existing lab category.');
  if (request.view === 'category') {
    const loader = await import('./health-data-loader.js');
    await Promise.all([import('./category-page-view.js'), loader.loadChartsModule(), loadCategoryViewsStylesheet()]);
    if (!canOpen()) return rejected('The view changed while category controls were loading.');
  }
  const owner = { profile: state.currentProfile, thread: state.currentThreadId, root: state.importedData, history: state.chatHistory };
  const owns = () => state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root && state.chatHistory === owner.history;
  const before = { view: state.currentView, range: state.dateRangeFilter, layout: state.categoryView };
  // All validation/preparation must finish before publishing session preferences.
  if (!canOpen()) return rejected('This view request expired.');
  let rendered = false;
  try {
    if (request.range) setDateRange(request.range, { navigate: false });
    if (request.layout) setCategoryViewMode(request.layout);
    rendered = await navigateDataViewOutcomeRuntime(destination, getActiveData());
  } catch { /* Report any session selection that did complete accurately. */ }
  if (!owns()) return rejected('The profile or conversation changed during navigation.');
  const opened = rendered && state.currentView === destination;
  const changed = opened || before.range !== state.dateRangeFilter || before.layout !== state.categoryView || before.view !== state.currentView;
  return { changed,
    opened: opened ? request.view : null, labRange: state.dateRangeFilter, layout: state.categoryView,
    scope: 'current app session; lab history reads use this range unless explicit dates are supplied', dataSaved: false, settingsSaved: false,
    ...(!opened ? { reason: changed ? 'The view selection changed, but rendering could not be confirmed. Open the native Labs view.' : 'The requested view could not be opened. Try the native Labs view.' } : {}) };
}
