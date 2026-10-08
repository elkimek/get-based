// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createNavigate } from '../js/views-router.js';
import { routeRevision } from '../js/route-lifecycle.js';
import { state } from '../js/state.js';
const previous = state.currentView;
afterEach(() => { state.currentView = previous; localStorage.clear(); });
it('distinguishes an actual route change from a same-view DOM refresh and an away/back round trip', () => {
  state.currentView = 'dashboard'; const before = routeRevision(), host = document.createElement('div');
  const navigate = createNavigate({ routeHandlers: { body: () => host.replaceChildren(document.createElement('section')), insight: () => host.replaceChildren(document.createElement('article')) } });
  navigate('body'); const first = host.firstElementChild; expect(routeRevision()).toBe(before + 1);
  navigate('body'); expect(host.firstElementChild).not.toBe(first); expect(routeRevision()).toBe(before + 1);
  navigate('insight'); navigate('body'); expect(routeRevision()).toBe(before + 3);
});
