import { describe, expect, it } from 'vitest';
import type { ProfileData } from '../types/app-state.js';
import { projectChatOptionalSetup, projectGeneticsImportConfirmation } from '../js/chat-optional-onboarding-presentation.js';
const project = (data: Partial<ProfileData> = {}, sex = 'female', connected = false) => projectChatOptionalSetup(data as ProfileData, sex, connected, 'Persona <literal>');
describe('optional onboarding projection', () => {
  it('keeps the optional task order, both DNA entry points and disconnected navigation', () => {
    const view = project();
    expect(view.personalityLabel).toBe('Persona <literal>');
    expect(view.tasks.map(task => task.id)).toEqual(['cycle', 'supplements', 'genetics', 'wearables']);
    expect(view.tasks.every(task => !task.complete)).toBe(true);
    expect(view.tasks[2]!.actions).toEqual([{ action: 'import-dna', label: 'Import DNA file' }, { action: 'import-mtdna', label: 'Import mtDNA' }]);
    expect(view.progress).toEqual({ step: 3, total: 4, label: 'Add-ons', previousStep: 2 });
  });
  it('keeps sex-specific cycle visibility, each cycle completion signal and connected progress', () => {
    expect(project({}, 'male', true).tasks.map(task => task.id)).toEqual(['supplements', 'genetics', 'wearables']);
    expect(project({}, 'male', true).progress).toEqual({ step: 2, total: 3, label: 'Add-ons', previousStep: 1 });
    for (const menstrualCycle of [{ periods: [{}] }, { cycleLength: 28 }, { cycleStatus: 'irregular' }]) {
      expect(project({ menstrualCycle }).tasks[0]).toMatchObject({ complete: true, summary: 'Cycle tracking is already set.', actions: [{ action: 'open-cycle-editor', label: 'Edit' }, { action: 'start-file-import', label: 'Import', secondary: true }] });
    }
  });
  it('summarizes current therapy separately from its history without interpreting literal names as markup', () => {
    const supplements = [
      { name: '<b>Iron</b>', dosage: '10 mg', startDate: '2000-01-01' },
      { name: 'Vitamin D', dosage: '1000 IU', startDate: '2000-01-01' },
      { name: 'Third', startDate: '2000-01-01' },
      { name: 'Past', startDate: '2000-01-01', endDate: '2001-01-01' },
    ];
    expect(project({ supplements }).tasks[1]).toMatchObject({ complete: true, summary: '<b>Iron</b> 10 mg, Vitamin D 1000 IU +1 · 1 in history' });
    expect(project({ supplements: [supplements[3]!] }).tasks[1]).toMatchObject({ complete: true, summary: 'No current items · 1 in history', actions: [{ action: 'open-supplements-editor', label: 'Edit' }] });
  });
  it('retains mtDNA-only, SNP-only and combined re-import actions and affiliate visibility', () => {
    const snps = { rs1: {} };
    expect(project({ genetics: { mtdna: { haplogroup: '<H1>' } } }).tasks[2]).toMatchObject({ summary: 'mtDNA <H1>', complete: true, actions: [{ action: 'import-dna', label: 'Import DNA file' }, { action: 'import-mtdna', label: 'Re-import mtDNA', secondary: true }] });
    const view = project({ genetics: { snps, mtdna: { haplogroup: 'H1' } } });
    expect(view.hasSnps).toBe(true);
    expect(view.tasks[2]).toMatchObject({ summary: '1 SNPs · mtDNA H1', actions: [{ action: 'import-dna', label: 'Re-import DNA', secondary: true }, { action: 'import-mtdna', label: 'Re-import mtDNA', secondary: true }] });
    expect(project({ genetics: { snps } }).tasks[2]!.actions.map(action => action.label)).toEqual(['Import mtDNA', 'Re-import DNA']);
  });
  it('keeps the existing wearable connection predicate for token and connectedSince records', () => {
    for (const connection of [{ accessToken: 'token' }, { connectedSince: '2020-01-01' }]) {
      expect(project({ wearableConnections: { fixture: connection } }).tasks.some(task => task.id === 'wearables')).toBe(false);
    }
    expect(project({ wearableConnections: { fixture: {} } }).tasks.at(-1)?.id).toBe('wearables');
  });
  it('derives confirmation from saved calls, excludes APOE component calls and preserves unknown findings', () => {
    const confirmation = projectGeneticsImportConfirmation({ apoe: 'e3/e4', snps: {
      rs429358: { effect: 'risk' }, rs7412: { effect: 'risk' }, rs1: { effect: 'risk' },
      rs2: { valence: 'informational' }, rs3: { effect: 'none' }, rs4: {},
    } }, '<source>');
    expect(confirmation).toEqual({ count: 6, source: '<source>', apoe: 'e3/e4', findings: ['🔴 1 risk association', '🔵 1 informational trait', '⚪ 1 reference / neutral finding', '❓ 1 unclassified finding'] });
    expect(projectGeneticsImportConfirmation(null, 'empty')).toEqual({ count: 0, source: 'empty', apoe: '', findings: [] });
  });
});
