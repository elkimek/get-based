import { chatReviewLifecycle } from '../shared/chat-review-contract.js';
import { expect, it } from 'vitest';
import { renderHTML as renderActions } from '../js/components/ChatMessageActions.svelte.html.js';
const renderHTML = ({ controls, index }: { controls: ReturnType<typeof normalizeAppControls>; index: number }) => renderActions({ view: { index, kind: 'assistant', retry: null, resume: false, speech: false, context: [], reviews: controls.map(control => ({ kind: 'app' as const, control, lifecycle: chatReviewLifecycle(control.status) })) } });
import { normalizeAppControls } from '../shared/agent-control-contract.js';
const record = { version: 1, id: 'control-test', profileId: 'profile-test', threadId: 'thread-test', action: 'display.preferences',
  parameters: { unitSystem: 'US' }, baseline: { unitSystem: 'EU' }, reason: 'Explicit display preference', evidence: 'Use US units', status: 'pending' };
it('shows exact disclosure values and escapes group labels, with fresh review required for further access changes', () => {
  const context = { ...record, action: 'context.preferences', leaseId: 'context-lease', parameters: { sources: { 'genetics-summary': false }, groups: { 'lab-group-<Private>': false }, nutritionDays: 7, wearableSeriesDays: 0 }, baseline: { sources: { 'genetics-summary': true }, groups: { 'lab-group-<Private>': true }, nutritionDays: 90, wearableSeriesDays: 30 } };
  const html = renderHTML({ controls: normalizeAppControls([context], true), index: 0 }); expect(html).toContain('Assistant context sources'); expect(html).toContain('APOE &amp; mtDNA summary'); expect(html).toContain('&lt;Private>'); expect(html).not.toContain('<Private>'); expect(html).toContain('90 days'); expect(html).toContain('Use the native settings or editor'); expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/);
  const saved = renderHTML({ controls: normalizeAppControls([{ ...context, status: 'changed', undoAvailable: true }], true), index: 0 }); expect(saved).not.toContain('Context preferences saved'); expect(saved).toContain('Use the native settings or editor'); expect(saved).not.toContain('undo-app-control');
});
it('expires restored disclosure reviews and never accepts imported saved labels as consent', () => {
  const context = { ...record, action: 'context.preferences', leaseId: 'context-lease', parameters: { sources: { wearables: false } }, baseline: { sources: { wearables: true } } };
  expect(renderHTML({ controls: normalizeAppControls([context]), index: 0 })).toContain('Use the native settings or editor');
  const imported = renderHTML({ controls: normalizeAppControls([{ ...context, status: 'changed', undoAvailable: true }]), index: 0 }); expect(imported).toContain('Use the native settings or editor'); expect(imported).not.toContain('Context preferences saved'); expect(imported).not.toMatch(/(?:apply|undo)-app-control/);
});
it('retains historical unit values without asserting a save or exposing Apply/Undo authority', () => {
  for (const status of ['pending','changed','undone','expired']) {
    const html = renderHTML({ controls: normalizeAppControls([{ ...record, status, undoAvailable: true }],true), index: 0 });
    expect(html).toContain('International (SI)'); expect(html).toContain('Previous app-management request');
    expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/); expect(html).not.toContain('Display preference saved');
  }
});
it.each(['applying', 'queued', 'unknown', 'failed', 'conflict', 'discarded', 'undone', undefined])('restored %s controls have no Apply or Undo button', status => {
  const html = renderHTML({ controls: normalizeAppControls([{ ...record, status, undoAvailable: true }]), index: 0 });
  expect(html).not.toMatch(/(?:apply|undo)-app-control/);
});
it('retains literal profile names while keeping every historical transition inactive', () => {
  const profile = { ...record, action: 'profile.selection', leaseId: 'profile-lease', parameters: { profileId: 'target' }, baseline: { id: 'profile-test', name: '<Origin>' }, proposed: { id: 'target', name: '<Destination>' } };
  for (const status of ['pending','changed','undone','expired']) {
    const html = renderHTML({ controls: normalizeAppControls([{...profile,status,undoAvailable:true}],true), index:0 });
    expect(html).toContain('&lt;Destination>'); expect(html).not.toContain('<Destination>'); expect(html).toContain('Previous app-management request');
    expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/); expect(html).not.toContain('Profile switch completed');
  }
});

it('renders ordering labels as text with explicit whole-scope reset and selective Undo wording', () => {
  const common = { version: 1, id: 'ordering-review', profileId: 'profile-test', threadId: 'thread', reason: 'Requested order', evidence: 'Move it', status: 'pending', action: 'labs.ordering', leaseId: 'ordering-lease' };
  const baseline = { scopeId: 'markers.biochemistry', label: '<Scope>', kind: 'markers', revision: 'a'.repeat(64), move: { item: { id: 'biochemistry.urea', label: '<Urea>' }, anchor: { id: 'biochemistry.glucose', label: '<Glucose>' }, position: 'before' } };
  const controls = normalizeAppControls([{ ...common, parameters: { scopeId: baseline.scopeId, move: { item: baseline.move.item.id, before: baseline.move.anchor.id } }, baseline }], true);
  const html = renderHTML({ controls, index: 0 }); expect(html).toContain('Lab presentation order'); expect(html).toContain('Previous app-management request'); expect(html).not.toContain('<Urea>'); expect(html).toContain('Use the native settings or editor'); expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/); expect(html).not.toContain('Assistant selection');
  const reset = renderHTML({ controls: normalizeAppControls([{ ...common, parameters: { scopeId: baseline.scopeId, reset: true }, baseline: { ...baseline, move: null } }], true), index: 0 });
  expect(reset).toContain('Use the native settings or editor'); expect(reset).not.toMatch(/(?:apply|undo|discard)-app-control/); expect(reset).not.toContain('Other items retain their relative order');
});
it('renders historical persona controls as read-only across all statuses', () => {
  const input = { version: 1, id: 'persona-control', profileId: 'profile-test', threadId: 'thread', action: 'assistant.persona', automatic: true, leaseId: 'persona-lease', parameters: { personaId: 'next' }, baseline: { id: 'default', name: 'Original', icon: 'O' }, proposed: { id: 'next', name: '<Persona>', icon: 'N' }, reason: 'Requested persona switch', evidence: 'Use that persona.', status: 'pending' };
  for (const status of ['pending', 'applying', 'changed', 'undone', 'failed']) {
    for (const allowInFlight of [false, true]) {
      const html = renderHTML({ controls: normalizeAppControls([{ ...input, status, undoAvailable: true }], allowInFlight), index: 0 });
      expect(html).toContain('Previous app-management request');
      expect(html).toContain('&lt;Persona>'); expect(html).not.toContain('<Persona>');
      expect(html).not.toMatch(/(?:apply|undo|discard)-app-control/);
      expect(html).not.toContain('Persona selection saved');
    }
  }
});
