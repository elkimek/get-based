// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {projectDnaImportPreview, renderDnaImportPreview, type DnaPreviewFinding, type DnaPreviewInput} from '../js/dna-preview-presentation.js';
import {resolveSnpEvidenceProfile, snpFindingPresentation} from '../js/dna-evidence.js';
import {renderLegalConsentModal} from '../js/legal-consent-presentation.js';
import type {LegalConsentView} from '../js/legal-consent-view.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
const literal = '<em>Recorded fixture text</em>';

it.each([false, true])('keeps native DNA preview grouping, literal labels and explicit import with findings=%s', async populated => {
  const finding = (rsid: string, valence: string): DnaPreviewFinding => ({
    rsid, gene: literal, genotype: 'AG', variant: 'Synthetic catalog variant', category: 'archive',
    note: 'Uncommitted marker note', presentation: snpFindingPresentation('mild', valence), evidenceProfile: resolveSnpEvidenceProfile(),
  });
  const groups: DnaPreviewInput['groups'] = populated
    ? [[finding('rs1', 'risk')], [finding('rs2', 'protective')], [finding('rs3', 'informational')], [finding('rs4', 'neutral')]]
    : [[], [], [], []];
  const input: DnaPreviewInput = {
    groups, source: () => literal, stats: populated ? '4 catalog matches' : '0 catalog matches',
    apoe: populated ? 'Synthetic reported haplotype' : null, categoryLabel: () => 'Stored catalog category',
    importCount: () => populated ? 4 : 0,
  };
  const view = projectDnaImportPreview(input), remembered = JSON.stringify(groups);
  const component = load('../js/components/DnaImportPreview.svelte.native.js') as typeof import('../js/components/DnaImportPreview.svelte.native.js');
  await expectNativeReview(renderDnaImportPreview(input), root => {
    const mounted = component.mount(component.default, {target: root, props: {view}});
    component.flushSync();
    return () => component.unmount(mounted);
  }, root => {
    expect(root.querySelector('.dna-preview-title')?.textContent).toBe('DNA Import — ' + literal);
    expect(root.querySelectorAll('.dna-preview-group')).toHaveLength(populated ? 4 : 0);
    expect(root.querySelectorAll('.dna-preview-assessment')).toHaveLength(populated ? 3 : 0);
    expect(root.querySelectorAll('.dna-preview-collapsed-items .dna-preview-row')).toHaveLength(populated ? 1 : 0);
    expect(root.querySelector('[data-dna-action="toggle-preview-group"]')?.getAttribute('tabindex') ?? null).toBe(populated ? '0' : null);
    expect(root.querySelector('[data-dna-action="confirm-import"]')?.textContent).toBe(populated ? 'Import 4 SNPs' : 'Import 0 SNPs');
    expect(root.querySelector('em, [onclick]')).toBeNull();
  });
  expect(JSON.stringify(groups)).toBe(remembered);
});

const cloud: LegalConsentView = {
  kind: 'cloud', kicker: 'Processing review', title: literal, description: 'Review the selected fields before proceeding',
  statement: 'I agree to the described processing', approveLabel: 'Approve', cancelLabel: 'Cancel',
  titleId: 'review-title', descriptionId: 'review-description', checkboxId: 'review-opt-in',
  points: ['Synthetic data field'], policyGroups: [], remote: false,
};

it.each([
  {view: cloud, action: 'data-ai-processing-action', links: 0},
  {view: {...cloud, remote: true, policyGroups: [
    {leadingBreak: false, label: 'Provider policy', links: [{url: 'https://example.invalid/privacy', label: 'Privacy'}]},
    {leadingBreak: true, label: 'Terms', links: [{url: 'https://example.invalid/terms', label: 'Terms'}]},
  ]}, action: 'data-cloud-ai-consent-action', links: 2},
  {view: {
    kind: 'wearable', title: literal, description: 'Wearable relay review', purpose: 'Show synthetic activity',
    withdrawal: 'Disconnect in Settings', statement: 'I agree to this relay', approveLabel: 'Connect',
  }, action: 'data-wearable-relay-consent-action', links: 1},
] satisfies Array<{view: LegalConsentView; action: string; links: number}>)(
  'requires explicit native consent before enabling approval ($action)',
  async ({view, action, links}) => {
    const component = load('../js/components/LegalConsentModal.svelte.native.js') as typeof import('../js/components/LegalConsentModal.svelte.native.js');
    await expectNativeReview(renderLegalConsentModal(view), root => {
      const mounted = component.mount(component.default, {target: root, props: {view}});
      component.flushSync();
      return () => component.unmount(mounted);
    }, root => {
      const dialog = root.querySelector('[role="dialog"]')!;
      const title = root.querySelector('h2');
      expect(title?.id).toBe(dialog.getAttribute('aria-labelledby'));
      expect(title?.textContent).toBe(literal);
      expect(root.querySelector('em')).toBeNull();
      expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
      expect(root.querySelector<HTMLButtonElement>('[' + action + '="approve"]')?.disabled).toBe(true);
      expect(root.querySelector<HTMLButtonElement>('[' + action + '="cancel"]')?.type).toBe('button');
      expect(root.querySelectorAll('a[target="_blank"][rel="noopener"]')).toHaveLength(links);
    });
  },
);
