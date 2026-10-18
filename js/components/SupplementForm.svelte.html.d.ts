import type {SupplementFormView, SupplementPhotoControlsView, SupplementChangeDoseView, SupplementScheduleOptionView, SupplementRouteOptionView, SupplementEvidenceScopeOptionView, SupplementPauseStopView, SupplementRestartView, SupplementDeleteRecordView} from '../supplement-form-presentation.js';
export function renderHTML(props:
  {kind: 'form'; view: SupplementFormView}
  | {kind: 'photoControls'; view: SupplementPhotoControlsView}
  | {kind: 'changeDose'; view: SupplementChangeDoseView}
  | {kind: 'scheduleOption'; view: SupplementScheduleOptionView}
  | {kind: 'routeOption'; view: SupplementRouteOptionView}
  | {kind: 'evidenceScopeOption'; view: SupplementEvidenceScopeOptionView}
  | {kind: 'pauseStop'; view: SupplementPauseStopView}
  | {kind: 'restart'; view: SupplementRestartView}
  | {kind: 'deleteRecord'; view: SupplementDeleteRecordView}
): string;
