import type {TherapyComparisonGroupView,TherapyComparisonMeasurementView,TherapyComparisonPeriodView} from '../therapy-comparison-presentation.js';
export function renderHTML(props:{view:{kind:'groups';rows:readonly TherapyComparisonGroupView[]}|{kind:'measurements';rows:readonly TherapyComparisonMeasurementView[]}|{kind:'periods';rows:readonly TherapyComparisonPeriodView[]}}):string;
