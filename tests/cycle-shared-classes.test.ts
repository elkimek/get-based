import {expect,it} from 'vitest';
import {cycleSharedClasses,cycleSharedUtilities} from '../js/cycle-shared-classes.js';
import {cycleEditorClasses} from '../js/cycle-editor-classes.js';
import {cycleImportClasses} from '../js/cycle-import-classes.js';
import {cycleOverviewClasses} from '../js/cycle-overview-classes.js';
const names=['cycle-icon-btn','period-symptom-tag','cycle-period-note','cycle-editor-section','cycle-editor-section-title','cycle-delete-btn'];
const tokens=(value:string)=>value.split(/\s+/).filter(Boolean);
const shared=(value:string)=>new Set(tokens(value).filter(token=>token.startsWith('gb:cycle-shared-ui:')));
it('shares the complete control/history catalog across all actual presentation owners',()=>{
 for(const name of names){
  const expected=shared(cycleSharedUtilities(name));expect(expected.size,name).toBeGreaterThan(0);
  for(const renderClasses of [cycleSharedClasses,cycleEditorClasses,cycleImportClasses,cycleOverviewClasses]){
   const result=tokens(renderClasses(name));expect(result.filter(token=>token===name),name).toEqual([name]);expect(shared(result.join(' ')),name).toEqual(expected);
  }
 }
});
it('retains genuine compound native classes and both ordinary/destructive styles',()=>{
 for(const renderClasses of [cycleSharedClasses,cycleEditorClasses,cycleImportClasses,cycleOverviewClasses]){
  const result=tokens(renderClasses('cycle-icon-btn cycle-delete-btn'));
  expect(result.filter(token=>!token.startsWith('gb:'))).toEqual(['cycle-icon-btn','cycle-delete-btn']);
  expect(shared(result.join(' '))).toEqual(new Set([...shared(cycleSharedUtilities('cycle-icon-btn')),...shared(cycleSharedUtilities('cycle-delete-btn'))]));
  // Both roles request the same phone minima; their semantic class-token set
  // contains one width and height declaration without conflicting values.
  expect([...shared(result.join(' '))].filter(token=>token.includes(':cycle-shared-phone:'))).toEqual(['gb:cycle-shared-ui:cycle-shared-phone:[min-width:40px]','gb:cycle-shared-ui:cycle-shared-phone:[min-height:40px]']);
 }
});
it('keeps inherited prototype keys and unknown names out of the shared catalog',()=>{
 for(const name of ['','future-cycle-class','constructor','toString','hasOwnProperty','__proto__'])expect(cycleSharedUtilities(name)).toBe('');
 expect(cycleSharedClasses('future-cycle-class constructor __proto__')).toBe('future-cycle-class constructor __proto__');
});
it('preserves existing empty/unknown class contracts and area-owned utilities',()=>{
 expect(cycleSharedClasses('')).toBe('');expect(cycleEditorClasses('')).toBe('');expect(cycleOverviewClasses('')).toBe('');expect(cycleImportClasses('')).toBe(' ');
 expect(cycleEditorClasses('future-cycle-class')).toBe('future-cycle-class');expect(cycleOverviewClasses('future-cycle-class')).toBe('future-cycle-class');expect(cycleImportClasses('future-cycle-class')).toBe('future-cycle-class ');
 for(const [renderClasses,compound,prefix] of [
  [cycleEditorClasses,'cycle-editor-section cycle-period-editor','gb:cycle-editor-ui:'],
  [cycleOverviewClasses,'cycle-icon-btn cycle-widget-actions','gb:cycle-overview-ui:'],
 ] as const){
  const result=tokens(renderClasses(compound));expect(result.filter(token=>!token.startsWith('gb:'))).toEqual(compound.split(' '));expect(result.some(token=>token.startsWith(prefix))).toBe(true);expect(shared(result.join(' ')).size).toBeGreaterThan(0);
 }
 // The actual summary section has no area catalog entry. Its shared section
 // role composes without inventing area utilities; coverage is a mapped owner.
 const importSection=tokens(cycleImportClasses('cycle-editor-section cycle-import-summary-section'));
 expect(importSection.filter(token=>!token.startsWith('gb:'))).toEqual(['cycle-editor-section','cycle-import-summary-section']);
 expect(importSection.some(token=>token.startsWith('gb:cycle-import-ui:'))).toBe(false);
 expect(shared(importSection.join(' '))).toEqual(shared(cycleSharedUtilities('cycle-editor-section')));
 const coverage=tokens(cycleImportClasses('cycle-import-coverage'));
 expect(coverage.filter(token=>!token.startsWith('gb:'))).toEqual(['cycle-import-coverage']);
 expect(coverage.some(token=>token.startsWith('gb:cycle-import-ui:'))).toBe(true);
});
