/** Complete native scalar snapshots, never escaped markup or callback ports. */
export interface PlacementActionView {readonly action:'open-marker-placement'|'restore-marker-placement'|'show-detail-modal'|'close-modal'|'save-marker-placement';readonly id:string|null;}
export interface PlacementOptionView {readonly value:string;readonly selected:boolean;readonly label:string;}
export interface PlacementOptionGroup {readonly label:string;readonly rows:readonly PlacementOptionView[];}
export interface PlacementSummaryView {readonly currentLabel:string;readonly markerName:string;readonly open:PlacementActionView;readonly native:null|{readonly label:string;readonly restore:PlacementActionView};}
export interface PlacementFormView {readonly back:PlacementActionView;readonly markerName:string;readonly close:PlacementActionView;readonly groups:readonly PlacementOptionGroup[];readonly currentLabel:string;readonly nativeLabel:string;readonly help:string;readonly restore:PlacementActionView|null;readonly cancel:PlacementActionView;readonly save:PlacementActionView;}
