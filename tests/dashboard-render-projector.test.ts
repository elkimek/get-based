// @vitest-environment jsdom
import {expect, it, vi} from 'vitest';
import {createDashboardWidgetRegistry} from '../js/dashboard-widgets.js';
import type {DashboardWidgetContent} from '../js/dashboard-widget-presentation.js';
const content: DashboardWidgetContent = {kind: 'notes', view: {kind: 'notes', rows: []}};

it('keeps the original three-argument registry path and context identity unchanged', () => {
  const fallback = vi.fn(() => content), registry = createDashboardWidgetRegistry({}, {projectWidgetBody: fallback});
  const ctx = {}, selected = {order: ['notes'], hidden: []};
  expect(registry.getVisibleDashboardWidgetViews(ctx, selected)).toHaveLength(1);
  expect(fallback).toHaveBeenCalledExactlyOnceWith('notes', ctx);
});

it('per-render projector honors hidden/excluded identities and ordered feature faults', () => {
  const fallback = vi.fn(() => {throw new Error('fallback must not run');});
  const registry = createDashboardWidgetRegistry({}, {projectWidgetBody: fallback});
  const ctx = {}, calls: string[] = [], fault = new Error('selected projection failed');
  const project = (id: string, actual: unknown) => {expect(actual).toBe(ctx); calls.push(id); if (id === 'alerts') throw fault; return content;};
  expect(() => registry.getVisibleDashboardWidgetViews(ctx, {order: ['bio-age', 'notes', 'alerts', 'quick-markers'], hidden: ['bio-age']},
    {excludeIds: new Set(['quick-markers'])}, project)).toThrow(fault);
  expect(calls).toEqual(['notes', 'alerts']); expect(fallback).not.toHaveBeenCalled();
});

it('keeps includeEmpty and organizing defaults with an explicit render projector', () => {
  let organizing = true;
  const registry = createDashboardWidgetRegistry({}, {projectWidgetBody: () => content, isOrganizeMode: () => organizing});
  const selected = {order: ['notes'], hidden: []}, project = () => null;
  expect(registry.getVisibleDashboardWidgetViews({}, selected, {}, project)).toHaveLength(1);
  expect(registry.getVisibleDashboardWidgetViews({}, selected, {includeEmpty: false}, project)).toEqual([]);
  organizing = false;
  expect(registry.getVisibleDashboardWidgetViews({}, selected, {}, project)).toEqual([]);
});
