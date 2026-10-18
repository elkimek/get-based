import {renderHTML as panelHTML} from './components/DashboardMtdnaPanel.svelte.html.js';
import {renderHTML as loadingHTML} from './components/DashboardGenomeLoading.svelte.html.js';
import {projectDashboardMtdnaStudy} from './dashboard-mtdna-study-presentation.js';
import type {DashboardMtdnaStudyView} from './dashboard-mtdna-study-presentation.js';
import type {GenomeEvidence,GenomeHaplogroupTable,MtdnaReader} from '../types/dashboard-widget-renderers.js';

interface MismatchReader {message?:unknown;mismatch?:unknown}
export interface DashboardMtdnaPanelView {
  readonly haplogroup:string;readonly lineage:string;readonly lens:string;readonly coupling:{readonly label:string;readonly climate:string}|null;
  readonly origin:string|null;readonly source:string|null;readonly match:string|null;readonly copy:readonly string[];
  readonly environment:{readonly text:string;readonly mismatch:boolean}|null;
  readonly evidence:{readonly count:string;readonly caveat:string|null;readonly studies:readonly DashboardMtdnaStudyView[];readonly issueURL:string|null}|null;
}
const text=(value:unknown):string=>value==null?'':String(value);
/** Preserve the original controller's evaluation order before the Svelte renderer reads primitives. */
export function projectDashboardMtdnaPanel(mtdna:MtdnaReader,table:GenomeHaplogroupTable|null|undefined,
  resolveMismatch:()=>MismatchReader|null|undefined,evidence:GenomeEvidence|null):DashboardMtdnaPanelView {
  const mismatch=resolveMismatch();
  const studies=Array.isArray(table?._meta?.references)?table._meta.references:[];
  const origin=mtdna.origin?text(mtdna.origin):null;
  const source=mtdna.source?text(mtdna.source):null;
  const match=Number.isFinite(Number(mtdna.matchedMutations))&&Number.isFinite(Number(mtdna.totalDiagnostic))
    ?`${Number(mtdna.matchedMutations)} / ${Number(mtdna.totalDiagnostic)}`:null;
  const copy=[mtdna.details,mtdna.coupling?.description,mtdna.coupling?.implications].filter(Boolean).map(text);
  const haplogroup=text(mtdna.haplogroup||'');
  const lineage=text(mtdna.haplogroup||'Unresolved');
  const lens=text(mtdna.coupling?.shortLabel||'Wallace lens');
  const coupling=mtdna.coupling?{label:text(mtdna.coupling.label||'Coupling context'),climate:text(mtdna.coupling.climate||'')}:null;
  const environment=mismatch?.message?{mismatch:!!mismatch.mismatch,text:text(mismatch.message)}:null;
  let viewEvidence:DashboardMtdnaPanelView['evidence']=null;
  if(studies.length){
    const count=`${studies.length}`;
    const caveat=table?._meta?.caveat?text(table._meta.caveat):null;
    // Keep the native map callback/read order and omit holes, as native map/join did.
    const mapped = studies.map(projectDashboardMtdnaStudy);
    const studyViews: DashboardMtdnaStudyView[] = [];
    for (let index = 0; index < mapped.length; index++) {
      if (index in mapped) studyViews.push(mapped[index]!);
    }
    const issueURL=evidence?text(evidence.mtdnaEvidenceIssueUrl()):null;
    viewEvidence={count,caveat,studies:studyViews,issueURL};
  }
  return {haplogroup,lineage,lens,coupling,origin,source,match,copy,environment,evidence:viewEvidence};
}
export function renderDashboardMtdnaPanelPresentation(mtdna:MtdnaReader,table:GenomeHaplogroupTable|null|undefined,
  resolveMismatch:()=>MismatchReader|null|undefined,evidence:GenomeEvidence|null):string {
  return panelHTML({view: projectDashboardMtdnaPanel(mtdna,table,resolveMismatch,evidence)});
}
export function renderDashboardGenomeLoading(snpCount:number):string {
  const count=`${snpCount}`,plural=snpCount===1?'':'s';
  return loadingHTML({count,plural});
}
