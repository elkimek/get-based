import {getHostedTransition} from '../shared/hosted-transition.js';

/** Timers alone miss suspended tabs. Recheck wall time on every resume too. */
export function watchHostedTransitionCutoff(onCutoff: () => void): () => void {
  if (!getHostedTransition(location.origin)) return () => {};
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener('visibilitychange', check);
    globalThis.removeEventListener('pageshow', check);
    globalThis.removeEventListener('focus', check);
  };
  const check = () => {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    const transition = getHostedTransition(location.origin);
    if (!transition) {stop(); return;}
    if (transition.phase === 'recovery') {stop(); onCutoff(); return;}
    timer = setTimeout(check, Math.max(1, Math.min(60_000, transition.cutoffAt - Date.now())));
  };
  document.addEventListener('visibilitychange', check);
  globalThis.addEventListener('pageshow', check);
  globalThis.addEventListener('focus', check);
  check();
  return stop;
}
