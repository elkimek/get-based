// @ts-check
// light-page-view-ui-hooks.js - wire eager shell dependencies for the deferred Light page.

import { navigate } from './views.js';
import { configureLightPageView } from './light-page-view.js';

configureLightPageView({
  navigate,
});
