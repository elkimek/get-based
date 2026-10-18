// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {createDashboardWidgetRegistry} from '../js/dashboard-widgets.js';
import {createDashboardLabWidgetRenderers} from '../js/dashboard-lab-widget-renderers.js';
import {renderDashboardWidgetContent, type DashboardWidgetContent} from '../js/dashboard-widget-presentation.js';
import {state} from '../js/state.js';
const importedData = state.importedData;
afterEach(() => {state.importedData = importedData; vi.restoreAllMocks();});

it('projects selected feature data once, preserving order and excluding hidden widgets before reads', () => {
  const emptyNotes: DashboardWidgetContent = {kind: 'notes', view: {kind: 'notes', rows: []}};
  const calls: string[] = [];
  const render = vi.fn(() => {throw new Error('HTML renderer must not run');});
  const registry = createDashboardWidgetRegistry({renderDashboardNotesWidget: render, renderDashboardBioAgeWidget: render}, {
    projectWidgetBody(id: string) {calls.push(id); return emptyNotes;},
  });
  const entries = registry.getVisibleDashboardWidgetViews({}, {order: ['notes', 'bio-age', 'alerts'], hidden: ['bio-age']}, {excludeIds: new Set(['alerts'])});
  expect(entries.map(entry => entry.def.id)).toEqual(['notes']);
  expect(entries[0]!.content).toBe(emptyNotes);
  expect(calls).toEqual(['notes']);
  expect(render).not.toHaveBeenCalled();
});

it('keeps native empty Notes controls while filtering empty Quick Markers unless organizing', () => {
  const projectWidgetBody = (id: string): DashboardWidgetContent => id === 'notes'
    ? {kind: 'notes', view: {kind: 'notes', rows: []}}
    : {kind: 'quick-markers', view: {kind: 'quick-markers', rows: []}};
  let organizing = false;
  const registry = createDashboardWidgetRegistry({}, {projectWidgetBody, isOrganizeMode: () => organizing});
  const prefs = {order: ['quick-markers', 'notes'], hidden: []};
  expect(registry.getVisibleDashboardWidgetViews({}, prefs).map(entry => entry.def.id)).toEqual(['notes']);
  organizing = true;
  expect(registry.getVisibleDashboardWidgetViews({}, prefs).map(entry => entry.def.id)).toEqual(['quick-markers', 'notes']);
  expect(registry.getVisibleDashboardWidgetViews({}, prefs, {includeEmpty: false}).map(entry => entry.def.id)).toEqual(['notes']);
});

it('uses the actual Notes domain projector once and renders the same captured data without rereading storage', () => {
  const reads: string[] = [];
  (state as {importedData: unknown}).importedData = {get notes() {reads.push('notes'); return [{date: '2026-01-01', text: 'Snapshot <&>'}];}};
  const lab = createDashboardLabWidgetRenderers({markerHasData: () => true, rerenderDashboardFromWidgetChange: () => {}});
  const project = vi.spyOn(lab, 'projectDashboardNotesWidget');
  const registry = createDashboardWidgetRegistry(lab, {projectWidgetBody: () => ({kind: 'notes', view: lab.projectDashboardNotesWidget()})});
  const [entry] = registry.getVisibleDashboardWidgetViews({}, {order: ['notes'], hidden: []});
  expect(project).toHaveBeenCalledTimes(1);
  expect(reads).toEqual(['notes', 'notes', 'notes']);
  expect(entry!.content!.kind).toBe('notes');
  const html = renderDashboardWidgetContent(entry!.content);
  const host = document.createElement('div');
  host.innerHTML = html;
  const note = host.querySelector('.note-card-text');
  expect(note?.textContent).toBe('Snapshot <&>');
  expect(note?.children).toHaveLength(0);
  expect(project).toHaveBeenCalledTimes(1);
  expect(reads).toEqual(['notes', 'notes', 'notes']);
});

it('stops at the failing feature and never falls back to native HTML', () => {
  const calls: string[] = [];
  const fault = new Error('feature projection failed');
  const registry = createDashboardWidgetRegistry({}, {projectWidgetBody(id: string) {calls.push(id); if (id === 'alerts') throw fault; return null;}});
  expect(() => registry.getVisibleDashboardWidgetViews({}, {order: ['notes', 'alerts', 'bio-age'], hidden: []})).toThrow(fault);
  expect(calls).toEqual(['notes', 'alerts']);
});

it('requires a first-party projector instead of accepting serialized children', () => {
  const registry = createDashboardWidgetRegistry({});
  expect(() => registry.getVisibleDashboardWidgetViews({}, {order: ['notes'], hidden: []})).toThrow('Missing Dashboard feature projector');
});

it('retains native Light empty filtering while keeping loading and Today fallback visible', () => {
  let light: DashboardWidgetContent = {kind: 'dashboard-light', view: {kind: 'conditions', view: null}};
  const registry = createDashboardWidgetRegistry({}, {projectWidgetBody: () => light});
  const prefs = {order: ['light-conditions-now'], hidden: []};
  expect(registry.getVisibleDashboardWidgetViews({}, prefs)).toEqual([]);
  light = {kind: 'dashboard-light', view: {kind: 'page', view: null}};
  expect(registry.getVisibleDashboardWidgetViews({}, prefs)).toEqual([]);
  expect(registry.getVisibleDashboardWidgetViews({}, prefs, {includeEmpty: true})).toHaveLength(1);
  light = {kind: 'dashboard-light', view: {kind: 'loading'}};
  expect(registry.getVisibleDashboardWidgetViews({}, prefs)).toHaveLength(1);
  light = {kind: 'dashboard-light', view: {kind: 'today', view: null}};
  expect(registry.getVisibleDashboardWidgetViews({}, prefs)).toHaveLength(1);
});
