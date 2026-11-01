// The resident native Dashboard registers its preparation port; chat cannot construct another owner.
import type { createDashboardViewComposition } from './dashboard-view-composition.js';
export type DashboardControlPorts = ReturnType<ReturnType<typeof createDashboardViewComposition>['getDashboardControlPorts']>;
type Prepare = (isCurrent: () => boolean) => Promise<DashboardControlPorts | null>;
interface Registration { prepare: Prepare; current: () => DashboardControlPorts | null }
let registration: Registration | null = null;
export function configureDashboardControlPreparation(next: Registration | null) { const previous = registration; registration = next; return previous; }
export function isNativeDashboardControlCurrent(ports: DashboardControlPorts) { try { return registration?.current() === ports; } catch { return false; } }
export async function prepareNativeDashboardControl(isCurrent: () => boolean) { return isCurrent() && registration ? registration.prepare(isCurrent) : null; }
