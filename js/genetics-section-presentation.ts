import {renderHTML} from './components/GeneticsSection.svelte.html.js';

export type GeneticsActionName = 'import-file' | 'import-snp-report' | 'add-manual-snp' | 'toggle-genetics-collapse' | 'delete-mtdna' | 'ask-ai-snp' | 'toggle-genetics-expand' | 'reimport-dna' | 'delete-dna';
export interface GeneticsActionView { readonly action:GeneticsActionName; readonly rsid:string|null; }
/** Capture at the original action helper site; Svelte owns the known namespace. */
export function captureGeneticsAction(action:GeneticsActionName,attrs:{readonly rsid:unknown}|undefined=undefined):GeneticsActionView {
  const name=String(action) as GeneticsActionName;
  const value=attrs?.rsid;
  return {action:name,rsid:value===undefined||value===null||value===''?null:String(value)};
}
/** Preserve escapeHTML/escapeAttr nullish and String chronology without encoding. */
export function captureGeneticsText(value:unknown):string { return value===null||value===undefined?'':String(value); }

export interface GeneticsAxesView { readonly evidenceClass:string; readonly evidenceTitle:string; readonly evidenceLabel:string; readonly relevanceClass:string; readonly relevanceTitle:string; readonly relevanceLabel:string;
}
export interface GeneticsRowView { readonly classes:string; readonly dot:string; readonly gene:string; readonly rsid:string; readonly impactClass:string; readonly impact:string; readonly genotype:string; readonly axes:GeneticsAxesView; readonly note:string; readonly links:{ readonly primaryHref:string|null; readonly snpediaHref:string; readonly askActions:GeneticsActionView; readonly correctionHref:string}|null;
}
export interface GeneticsGroupView { readonly classes:string; readonly label:string; readonly rows:readonly GeneticsRowView[]}
export interface GeneticsMtdnaView { readonly haplogroup:string; readonly coupling:{ readonly label:string; readonly climate:string}|null; readonly facts:ReadonlyArray<{ readonly label:string; readonly value:string}>; readonly details:readonly string[]; readonly match:{ readonly classes:string; readonly message:string}|null; readonly evidenceHref:string; readonly removeActions:GeneticsActionView;
}
export interface GeneticsSectionView { readonly kind:'populated'; readonly headerActions:GeneticsActionView; readonly meta:string; readonly arrowClass:string; readonly bodyClass:string; readonly cards:ReadonlyArray<{ readonly label:string; readonly value:string; readonly sub:string}>; readonly mtdna:GeneticsMtdnaView|null; readonly apoe:{ readonly value:string; readonly axes:GeneticsAxesView}|null; readonly groups:readonly GeneticsGroupView[]; readonly more:{ readonly actions:GeneticsActionView; readonly count:string}|null; readonly otherGroups:readonly GeneticsGroupView[]; readonly otherCount:string; readonly stale:string|null; readonly actions:readonly GeneticsActionView[]; readonly issueHref:string;
}
export type GeneticsView = { readonly kind:'empty'; readonly actions:readonly GeneticsActionView[]} | GeneticsSectionView;

/** Render the complete captured view once; no placeholders, parsing or stitching. */
export function renderGeneticsSectionView(view:GeneticsView):string { return renderHTML({view}); }
