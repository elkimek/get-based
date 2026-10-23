// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import { state } from '../js/state.js';
import { createNavigate, getInitialView } from '../js/views-router.js';
import { configureViewsRouterRuntimeDeps } from '../js/views-router-runtime.js';
let restore: ReturnType<typeof configureViewsRouterRuntimeDeps>;
let close: Mock<() => void>;
let render: Mock<() => void>;
let navigate: ReturnType<typeof createNavigate>;
beforeEach(() => {
  state.currentView = 'light';
  document.body.innerHTML = '<nav id="sidebar-nav" class="mobile-open"><div class="nav-item" data-category="light"></div><div class="nav-item" data-category="dashboard"></div></nav>';
  close = vi.fn(() => document.getElementById('sidebar-nav')!.classList.remove('mobile-open'));
  render = vi.fn();
  restore = configureViewsRouterRuntimeDeps({ closeMobileSidebar: close, syncImportStatusFab: () => {} });
  navigate = createNavigate({ routeHandlers: { light: render, dashboard: render } });
});
afterEach(() => { configureViewsRouterRuntimeDeps(restore); document.body.innerHTML = ''; localStorage.clear(); });
it('keeps an open mobile menu usable during a background refresh of the current route', () => {
  navigate('light', { preserveSidebar: true });
  expect(render).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
  expect(document.getElementById('sidebar-nav')!.classList.contains('mobile-open')).toBe(true);
  expect(state.currentView).toBe('light');
});
it('still closes the menu for user navigation, including selecting the current route', () => {
  navigate('light'); expect(close).toHaveBeenCalledOnce();
  expect(document.getElementById('sidebar-nav')!.classList.contains('mobile-open')).toBe(false);
});
it('does not preserve the menu across a route change even when refresh options are supplied', () => {
  navigate('dashboard', { preserveSidebar: true });
  expect(close).toHaveBeenCalledOnce(); expect(state.currentView).toBe('dashboard');
  expect(document.getElementById('sidebar-nav')!.classList.contains('mobile-open')).toBe(false);
});
it.each(['nutrition','supplements'] as const)('routes and restores %s without requiring lab data',route=>{
  const standalone=vi.fn(),category=vi.fn(),sync=vi.fn();
  const open=createNavigate({routeHandlers:{[route]:standalone,category},syncMobileBottomNav:sync});
  open(route);
  expect(standalone).toHaveBeenCalledOnce();expect(category).not.toHaveBeenCalled();
  expect(state.currentView).toBe(route);expect(getInitialView()).toBe(route);
  expect(sync).toHaveBeenCalledWith(route);expect(close).toHaveBeenCalledOnce();
});
