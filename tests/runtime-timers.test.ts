import { expect, it } from 'vitest';
import { scheduleRuntimeTask } from '../js/runtime-callbacks.js';
import { captureRuntimeGlobals, setRuntimeValue } from './helpers/runtime-globals.js';

it('keeps browser timer binding, inherited hooks and getter reads', () => {
  const restore = captureRuntimeGlobals(['window']);
  try {
    let reads = 0;
    const calls: unknown[][] = [];
    const callback = () => calls.push(['task']);
    const runtime = Object.create({
      get setTimeout() {
        reads++;
        return function (this: unknown, task: () => void, delay: number) {
          calls.push([this, task, delay]);
          return 73;
        };
      },
    }) as object;
    setRuntimeValue('window', runtime);
    expect(scheduleRuntimeTask(callback, 125)).toBe(73);
    expect(reads).toBe(2);
    expect(calls).toEqual([[runtime, callback, 125]]);
  } finally { restore(); }
});

it('falls back to an unbound global timer with the original callback and default delay', () => {
  const restore = captureRuntimeGlobals(['window', 'setTimeout']);
  try {
    setRuntimeValue('window', { setTimeout: false });
    const calls: unknown[][] = [];
    const callback = () => calls.push(['task']);
    setRuntimeValue('setTimeout', function (this: unknown, task: () => void, delay: number) {
      calls.push([this, task, delay]);
      return 74;
    });
    expect(scheduleRuntimeTask(callback)).toBe(74);
    expect(calls).toEqual([[undefined, callback, 0]]);
  } finally { restore(); }
});

it('runs immediately without timers and preserves callback and timer exceptions', () => {
  const restore = captureRuntimeGlobals(['window', 'setTimeout']);
  try {
    setRuntimeValue('window', undefined);
    setRuntimeValue('setTimeout', undefined);
    let calls = 0;
    expect(scheduleRuntimeTask(() => { calls++; }, 125)).toBeNull();
    expect(calls).toBe(1);
    const failure = new Error('callback failure');
    expect(() => scheduleRuntimeTask(() => { throw failure; })).toThrow(failure);
    setRuntimeValue('window', { get setTimeout() { throw failure; } });
    expect(() => scheduleRuntimeTask(() => { calls++; })).toThrow(failure);
    expect(calls).toBe(1);
  } finally { restore(); }
});
