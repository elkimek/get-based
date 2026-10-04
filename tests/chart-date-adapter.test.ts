import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// This is the private reader of the implementation captured by the fixture's
// override callback, not a declaration of Chart.js or validated raw inputs.
interface CapturedAdapter {
  formats(): unknown;
  parse(value: unknown): unknown;
  format(timestamp: unknown, format: unknown): unknown;
  add(timestamp: unknown, amount: unknown, unit: unknown): unknown;
  diff(a: unknown, b: unknown, unit: unknown): unknown;
  startOf(timestamp: unknown, unit: unknown, weekday?: unknown): unknown;
  endOf(timestamp: unknown, unit: unknown): unknown;
}

const runtime = readFileSync(new URL('../vendor/chartjs-adapter-native.js', import.meta.url), 'utf8');
function loadAdapter(intl: unknown = Intl) {
  const captured: { value?: unknown } = {};
  const registry = { override(implementation: unknown) { captured.value = implementation; } };
  const context = vm.createContext({ Chart: { _adapters: { _date: registry } }, Date, Intl: intl });
  new vm.Script(runtime).runInContext(context);
  return captured.value as CapturedAdapter;
}

// A local midday avoids timezone-dependent date transitions in these tests.
const timestamp = new Date(2024, 1, 29, 13, 45, 27, 123).getTime();

describe('classic native Chart date adapter', () => {
  it('registers its formats and retains canonical dates and boundaries', () => {
    const adapter = loadAdapter();
    expect(adapter.formats()).toMatchObject({ day: 'MMM d', month: 'MMM yyyy', year: 'yyyy' });
    expect(adapter.parse('2024-02-29')).toBe(new Date('2024-02-29T00:00:00').getTime());
    expect(adapter.parse(new Date(timestamp))).toBe(timestamp);
    expect(adapter.add(timestamp, 1, 'day')).toBe(new Date(2024, 2, 1, 13, 45, 27, 123).getTime());
    expect(adapter.startOf(timestamp, 'month')).toBe(new Date(2024, 1, 1).getTime());
    expect(adapter.endOf(timestamp, 'day')).toBe(new Date(2024, 2, 1).getTime() - 1);
    expect(adapter.diff(timestamp, timestamp - 86400000, 'day')).toBe(1);
    expect(adapter.format(timestamp, 'yyyy')).toBe('2024');
  });

  it('preserves number-only fast paths and raw coercion ordering', () => {
    const adapter = loadAdapter();
    expect(adapter.parse(undefined)).toBeNull();
    expect(adapter.parse(null)).toBeNull();
    expect(adapter.parse('')).toBeNull();
    expect(adapter.parse('invalid')).toBeNull();
    expect(adapter.parse(NaN)).toBeNaN();
    expect(adapter.parse(Infinity)).toBe(Infinity);
    const trace: string[] = [];
    const raw = { [Symbol.toPrimitive](hint: string) { trace.push(hint); return '2024-02-29'; } };
    expect(adapter.parse(raw)).toBe(new Date('2024-02-29').getTime());
    expect(trace).toEqual(['string']);
    expect(adapter.add(timestamp, '1', 'month')).toBe(new Date(2024, 11, 29, 13, 45, 27, 123).getTime());
    expect(() => adapter.parse(Symbol('raw'))).toThrow(/Cannot (?:convert|mix|read)/);
    expect(() => adapter.add(timestamp, 1n, 'day')).toThrow(/Cannot (?:convert|mix|read)/);
  });

  it('keeps Date valueOf before the separately reread getTime method', () => {
    const adapter = loadAdapter();
    expect(adapter.parse(new Date(NaN))).toBeNull();
    const date = new Date(timestamp), trace: string[] = [], opaque = { raw: true };
    Object.defineProperty(date, 'valueOf', { value: () => { trace.push('valueOf'); return 0; } });
    Object.defineProperty(date, 'getTime', { get() { trace.push('getTime'); return () => opaque; } });
    expect(adapter.parse(date)).toBe(opaque);
    expect(trace).toEqual(['valueOf', 'getTime']);
    const invalid = new Date(timestamp);
    Object.defineProperty(invalid, 'valueOf', { value: () => NaN });
    Object.defineProperty(invalid, 'getTime', { get() { throw Error('must remain guarded'); } });
    expect(adapter.parse(invalid)).toBeNull();
    const throws = new Date(timestamp);
    Object.defineProperty(throws, 'valueOf', { value: () => { throw Error('conversion failed'); } });
    expect(() => adapter.parse(throws)).toThrow('conversion failed');
  });

  it('retains the native date string fallback when Intl fails', () => {
    const constructorFailure = { DateTimeFormat: function () { throw Error('Intl unavailable'); } };
    const formatFailure = { DateTimeFormat: function () { return { format() { throw Error('format unavailable'); } }; } };
    expect(loadAdapter(constructorFailure).format(timestamp, 'MMM yyyy')).toBe(new Date(timestamp).toLocaleDateString());
    expect(loadAdapter(formatFailure).format(timestamp, 'MMM yyyy')).toBe(new Date(timestamp).toLocaleDateString());
  });

  it('retains BigInt subtraction and borrowed receiver operation order', () => {
    const adapter = loadAdapter();
    expect(adapter.diff(5n, 2n, 'millisecond')).toBe(3n);
    expect(adapter.diff(5n, 2n, 'other')).toBe(3n);
    expect(() => adapter.diff(5n, 2n, 'second')).toThrow(/Cannot (?:convert|mix|read)/);
    expect(adapter.diff.call({ diff: () => '12' }, timestamp, 0, 'quarter')).toBe(4);
    expect(() => adapter.diff.call({ diff: () => 2n }, timestamp, 0, 'quarter')).toThrow(/Cannot (?:convert|mix|read)/);
    const trace: unknown[] = [];
    const receiver = {
      get add() { trace.push('get add'); return function (this: unknown, ...args: unknown[]) { trace.push(['add', this === receiver, ...args]); return '10'; }; },
      get startOf() { trace.push('get start'); return function (this: unknown, ...args: unknown[]) { trace.push(['start', this === receiver, ...args]); return 7; }; },
    };
    expect(adapter.endOf.call(receiver, timestamp, 'day')).toBe(9);
    expect(trace).toEqual(['get add', 'get start', ['start', true, timestamp, 'day'], ['add', true, 7, 1, 'day']]);
    expect(() => adapter.endOf.call(undefined, timestamp, 'day')).toThrow(/Cannot (?:convert|mix|read)/);
  });

  it('retains the required unbound classic Chart lookup', () => {
    expect(() => new vm.Script(runtime).runInContext(vm.createContext({ Date, Intl }))).toThrow('Chart is not defined');
  });
});
