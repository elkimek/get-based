// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { createDashboardPageView } from '../js/dashboard-page-view.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Dashboard page DOM boundary', () => {
  it('does not start dashboard work after the main container is removed', () => {
    const { showDashboard } = createDashboardPageView({});

    expect(() => showDashboard({ dates: null })).not.toThrow();
  });
});
