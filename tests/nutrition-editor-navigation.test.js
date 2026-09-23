// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discardSuspendedNutritionEditor, enhanceNutritionEditorNavigation,
  hasSuspendedNutritionEditor, restoreSuspendedNutritionEditor,
  setManualEntryMode, suspendedNutritionEditorHasDraft, suspendNutritionEditor,
} from '../js/nutrition-editor-navigation.js';

function mount(content = '') {
  document.body.innerHTML = `<div id="modal-overlay"><div id="detail-modal" class="nutrition-modal custom-editor">${content}</div></div>`;
  return document.getElementById('detail-modal');
}
beforeEach(() => { discardSuspendedNutritionEditor(); mount(); });
afterEach(() => { discardSuspendedNutritionEditor(); document.body.replaceChildren(); });

describe('nutrition editor draft recovery', () => {
  it('restores the original inputs, values, listeners, scroll and dismissal protection', () => {
    const modal = mount('<input id="nutrition-meal-name"><button>Keep draft</button>');
    const input = modal.querySelector('input');
    input.value = 'Unsaved lunch';
    const clicked = vi.fn();
    modal.querySelector('button').addEventListener('click', clicked);
    modal.scrollTop = 120;
    document.getElementById('modal-overlay').setAttribute('data-modal-dismiss-protected', '');
    expect(suspendNutritionEditor()).toBe(true);
    expect(modal.childNodes.length).toBe(0);
    expect(suspendedNutritionEditorHasDraft()).toBe(true);
    modal.innerHTML = '<p>History view</p>';
    modal.className = 'history-modal';
    modal.scrollTop = 0;
    document.getElementById('modal-overlay').removeAttribute('data-modal-dismiss-protected');
    expect(restoreSuspendedNutritionEditor()).toBe(true);
    expect(modal.querySelector('input')).toBe(input);
    expect(input.value).toBe('Unsaved lunch');
    expect(modal.className).toBe('nutrition-modal custom-editor');
    expect(modal.scrollTop).toBe(120);
    expect(document.getElementById('modal-overlay').hasAttribute('data-modal-dismiss-protected')).toBe(true);
    modal.querySelector('button').click();
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(hasSuspendedNutritionEditor()).toBe(false);
    expect(restoreSuspendedNutritionEditor()).toBe(false);
  });

  it.each(['nutrition-note', 'nutrition-known-details', 'nutrition-meal-name'])('retains a draft entered in %s', id => {
    mount(`<textarea id="${id}">User entry</textarea>`);
    suspendNutritionEditor();
    expect(suspendedNutritionEditorHasDraft()).toBe(true);
  });
  it.each(['data-nutrition-nutrient', 'data-nutrition-reference', 'data-nutrition-component-name', 'data-nutrition-component-grams'])('retains a draft entered in %s', attr => {
    mount(`<input ${attr} value="0">`);
    suspendNutritionEditor();
    expect(suspendedNutritionEditorHasDraft()).toBe(true);
  });
  it.each([['', false], ['1', false], ['0', true], ['2', true]])('classifies consumption %j as draft=%s', (value, draft) => {
    mount(`<input id="nutrition-consumed-amount" value="${value}"><textarea id="nutrition-note">  </textarea>`);
    suspendNutritionEditor();
    expect(suspendedNutritionEditorHasDraft()).toBe(draft);
  });
  it('keeps the first editor when suspension is requested again from history', () => {
    const modal = mount('<input id="nutrition-note" value="original">');
    suspendNutritionEditor();
    modal.innerHTML = '<input id="nutrition-note" value="history">';
    expect(suspendNutritionEditor()).toBe(true);
    restoreSuspendedNutritionEditor();
    expect(modal.querySelector('input').value).toBe('original');
  });
  it('allows restoration to retry after the modal host is temporarily removed', () => {
    mount('<input id="nutrition-note" value="preserved">');
    suspendNutritionEditor();
    document.body.replaceChildren();
    expect(restoreSuspendedNutritionEditor()).toBe(false);
    expect(hasSuspendedNutritionEditor()).toBe(true);
    const replacement = mount();
    expect(restoreSuspendedNutritionEditor()).toBe(true);
    expect(replacement.querySelector('input').value).toBe('preserved');
  });
  it('discards a suspended draft without replacing a newly opened editor', () => {
    suspendNutritionEditor();
    const modal = mount('<p>New editor</p>');
    discardSuspendedNutritionEditor();
    expect(restoreSuspendedNutritionEditor()).toBe(false);
    expect(suspendedNutritionEditorHasDraft()).toBe(false);
    expect(modal.textContent).toBe('New editor');
  });
  it('refuses to suspend a different modal', () => {
    const modal = mount('<p>Other workflow</p>');
    modal.className = 'profile-modal';
    expect(suspendNutritionEditor()).toBe(false);
    expect(modal.textContent).toBe('Other workflow');
    expect(hasSuspendedNutritionEditor()).toBe(false);
  });
  it('removes history dismissal protection when the original editor was unprotected', () => {
    suspendNutritionEditor();
    document.getElementById('modal-overlay').setAttribute('data-modal-dismiss-protected', '');
    restoreSuspendedNutritionEditor();
    expect(document.getElementById('modal-overlay').hasAttribute('data-modal-dismiss-protected')).toBe(false);
  });
  it('restores a selected photo using the same file input node', () => {
    const modal = mount('<input id="nutrition-photo-input" type="file">');
    const input = modal.querySelector('input');
    const photo = new File(['photo'], 'meal.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [photo] });
    suspendNutritionEditor();
    expect(suspendedNutritionEditorHasDraft()).toBe(true);
    restoreSuspendedNutritionEditor();
    expect(modal.querySelector('input').files[0]).toBe(photo);
  });
  it('selects manual entry accessibly without moving focus during initialization', () => {
    const modal = mount('<div class="nutrition-capture-tabs"><button aria-pressed="true" data-nutrition-kind="meal-photo">Camera</button></div><input id="nutrition-meal-name"><section class="nutrition-recent"></section>');
    enhanceNutritionEditorNavigation(modal, { manualDefault: true });
    const tabs = modal.querySelector('.nutrition-capture-tabs');
    expect(tabs.getAttribute('role')).toBe('tablist');
    expect(tabs.querySelector('[data-nutrition-kind="manual"]').getAttribute('aria-selected')).toBe('true');
    expect(tabs.querySelector('[data-nutrition-kind="meal-photo"]').getAttribute('aria-selected')).toBe('false');
    expect(modal.classList.contains('nutrition-manual-mode')).toBe(true);
    expect(document.activeElement).toBe(document.body);
    const input = modal.querySelector('input');
    input.scrollIntoView = vi.fn();
    setManualEntryMode();
    expect(document.activeElement).toBe(input);
    expect(modal.querySelector('[data-nutrition-action="open-history"]')).not.toBeNull();
  });
});
