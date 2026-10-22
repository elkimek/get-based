import type {Component} from 'svelte';
import type {BodyMeasurement, BodyMeasurementKind, BodyMeasurementDraft} from '../body-measurement-model.js';
declare const component: Component<{
  kind: BodyMeasurementKind; initial: BodyMeasurement[]; initialUnit: 'cm' | 'in'; initialCycle: unknown; initialHeightCm: unknown;
  current(): boolean; save(draft: BodyMeasurementDraft): void; remove(row: BodyMeasurement): void; close(): void;
}, {report(message: string, busy: boolean): void; refresh(rows: BodyMeasurement[], cycleProfile: unknown, heightCm: unknown): void; focusInput(): void}>;
export default component;
export {mount, unmount, flushSync} from 'svelte';
