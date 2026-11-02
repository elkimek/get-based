import { expect, it } from 'vitest';
import { parsePersonaEditorDraft } from '../shared/persona-control-contract.js';
import { validateAppNavigation } from '../shared/app-navigation-contract.js';
it.each([null, [], {}, { name: '' }, { name: ' leading' }, { name: 'line\nbreak' }, { name: 'x'.repeat(61) }, { promptText: 'x'.repeat(12001) }, { promptText: 'nul\0' }, { promptMode: 'append' }, { promptText: 'Guide', promptMode: 'unknown' }, { promptText: 'Guide', promptMode: ['append'] }, { promptText: 'Guide', promptMode: { value: 'append' } }, { promptText: 'Guide', id: 'custom_injected' }, { promptText: 'Guide', personaAgreement: { accepted: true } }, { promptText: 'Guide', saved: true }])('rejects invalid prepared native draft fields: %j', input => {
  expect(parsePersonaEditorDraft(input)).toBeNull();
});
it.each([{ name: 'Reviewer' }, { promptText: 'Guide' }, { name: 'Reviewer', promptText: 'Guide', promptMode: 'append' as const }, { promptText: 'Guide', promptMode: 'replace' as const }])('retains exact allowed draft fields: %j', input => {
  expect(parsePersonaEditorDraft(input)).toEqual(input);
});
it('keeps prepared persona drafts out of every chat navigation route', () => {
  const personaDraft = JSON.stringify({ promptText: 'New guidance.', promptMode: 'append' });
  expect(() => validateAppNavigation({ view: 'personaEditor', marker: '', snapshotId: 'fresh', recordId: 'custom_exact', personaDraft })).toThrow('manual persona');
  expect(() => validateAppNavigation({ view: 'personaEditor', marker: '', snapshotId: 'fresh', personaDraft })).toThrow();
  expect(() => validateAppNavigation({ view: 'dashboard', marker: '', personaDraft })).toThrow();
});
