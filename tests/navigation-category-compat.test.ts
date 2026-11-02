// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
vi.mock('../js/health-data-loader.js', async original => ({...await original<typeof import('../js/health-data-loader.js')>(), isChartsModuleLoaded: () => true}));
vi.mock('../js/category-page-runtime.js', async original => ({...await original<typeof import('../js/category-page-runtime.js')>(), isCategoryViewsStylesheetLoaded: () => true}));
import {navigate, showCategory} from '../js/views-runtime.js';
import {navigate as productionNavigate} from '../js/navigation-views.js';
import {getLoadedCategoryPageBody} from '../js/category-page-runtime.js';
import {state} from '../js/state.js';
const view = state.currentView;
afterEach(() => {state.currentView = view; vi.restoreAllMocks();});
it('retains the synchronous prepared route after a direct compatibility import', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.body.replaceChildren(); state.currentView = 'dashboard';
  expect(getLoadedCategoryPageBody()?.showCategory).toBe(showCategory);
  expect(navigate).toBe(productionNavigate);
  // Missing main remains the native synchronous no-op. An unnecessary body
  // import would turn this into a Promise despite the prepared public module.
  expect(navigate('biochemistry')).toBeUndefined();
});
