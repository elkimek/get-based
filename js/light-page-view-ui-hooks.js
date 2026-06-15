// @ts-check
// light-page-view-ui-hooks.js - wire Light page shell dependencies after UI modules load.

import { renderSunDataSourceSettings } from './settings.js';
import { navigate } from './views.js';
import { configureLightPageView } from './light-page-view.js';

configureLightPageView({
  navigate,
  renderSunDataSourceSettings,
});
