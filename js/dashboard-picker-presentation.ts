import {DASHBOARD_WIDGET_SOURCE_ORDER} from './dashboard-widgets.js';
import type {
  ControlsBiometricOption,
  ControlsMarkerOption,
  ControlsWidget,
} from '../types/dashboard-widget-controls.js';

/** Literal picker data; selection, filtering and preference writes stay in the controller. */
export interface DashboardPickerCard {
  id: string | undefined;
  title: string;
  titleDetail: string;
  hasTitleDetail: boolean;
  subtitle: string;
  action: 'show-widget' | 'add-biometric-metric' | 'add-marker-widget';
  actionLabel: string;
  search?: string;
}
export interface DashboardPickerFixedGroup {
  source: string;
  cards: DashboardPickerCard[];
}
export type DashboardPickerInput =
  | {kind: 'dashboard'; hidden: ControlsWidget[]; biometrics: ControlsBiometricOption[]; markers: ControlsMarkerOption[]}
  | {kind: 'biometric'; biometrics: ControlsBiometricOption[]};
export interface DashboardPickerView {
  kind: DashboardPickerInput['kind'];
  fixedGroups: DashboardPickerFixedGroup[];
  biometrics: DashboardPickerCard[];
  markers: DashboardPickerCard[];
}

// Match the original escaping helpers' nullish handling and delegated attribute omission.
const text = (value: unknown): string => value == null ? '' : String(value);
const actionId = (value: unknown): string | undefined =>
  value == null || value === '' ? undefined : String(value);

function projectFixedGroups(hidden: ControlsWidget[]): DashboardPickerFixedGroup[] {
  const groups = new Map<unknown, ControlsWidget[]>();
  for (const def of hidden) {
    const source = def.source || 'Other';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push(def);
  }
  const orderedSources = [
    ...DASHBOARD_WIDGET_SOURCE_ORDER,
    ...[...groups.keys()].filter(source => !(DASHBOARD_WIDGET_SOURCE_ORDER as readonly unknown[]).includes(source)).sort(),
  ];
  return orderedSources.filter(source => groups.has(source)).map(source => ({
    source: text(source),
    cards: groups.get(source)!.map(def => ({
      id: actionId(def.id),
      title: text(def.title),
      titleDetail: '',
      hasTitleDetail: false,
      subtitle: text(def.description || ''),
      action: 'show-widget',
      actionLabel: 'Add dashboard widget',
    })),
  }));
}

function projectBiometric(option: ControlsBiometricOption): DashboardPickerCard {
  return {
    id: actionId(option.id),
    title: text(option.label),
    titleDetail: option.sub ? text(option.sub) : '',
    hasTitleDetail: Boolean(option.sub),
    subtitle: `${text(option.value)}${option.unit ? ` ${text(option.unit)}` : ''} · ${text(option.change || 'latest')}`,
    action: 'add-biometric-metric',
    actionLabel: 'Add to Biometrics Overview',
    search: `${option.label} ${option.sub} ${option.value} ${option.unit} ${option.change}`.toLowerCase(),
  };
}

function projectMarker(option: ControlsMarkerOption): DashboardPickerCard {
  return {
    id: actionId(option.id),
    title: text(option.name),
    titleDetail: '',
    hasTitleDetail: false,
    subtitle: `${text(option.category)} · ${text(option.value)}${option.unit ? ` ${text(option.unit)}` : ''}`,
    action: 'add-marker-widget',
    actionLabel: 'Add marker widget',
    search: `${option.name} ${option.category} ${option.value} ${option.unit}`.toLowerCase(),
  };
}

export function projectDashboardPickerPresentation(input: DashboardPickerInput): DashboardPickerView {
  return {
    kind: input.kind,
    fixedGroups: input.kind === 'dashboard' ? projectFixedGroups(input.hidden) : [],
    biometrics: input.biometrics.map(projectBiometric),
    markers: input.kind === 'dashboard' ? input.markers.map(projectMarker) : [],
  };
}
