// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { aiActionAttrs, registerAIActionHandler, KNOWN_AI_ACTIONS } from '../js/ai-action-delegates.js';
let retire: (() => void)[] = [];
beforeEach(() => { state.currentProfile = 'a'; state.importedData = createDefaultProfileData(); });
afterEach(() => { retire.forEach(fn => fn()); retire = []; document.body.innerHTML = ''; });
function control(action: string, id = '') {
  const host = document.createElement('div'); host.innerHTML = `<button ${aiActionAttrs(action, id, { stopPropagation: true })}><span>Run</span></button>`; document.body.append(host); return host;
}
for (const action of KNOWN_AI_ACTIONS) it(`${action} rejects a control rendered for a replaced profile and accepts the new control`, () => {
  const handler = vi.fn(); retire.push(registerAIActionHandler(action, handler));
  const old = control(action, 'same-id'); state.currentProfile = 'b'; state.importedData = createDefaultProfileData();
  old.querySelector('span')!.click(); expect(handler).not.toHaveBeenCalled();
  control(action, 'same-id').querySelector('span')!.click(); expect(handler).toHaveBeenCalledExactlyOnceWith('same-id');
});
it('rejects same-profile root replacement and does not revive retired controls after switching away and back', () => {
  const handler = vi.fn(); retire.push(registerAIActionHandler('refresh-onboarding', handler));
  const old = control('refresh-onboarding'); const original = state.importedData;
  state.importedData = createDefaultProfileData(); old.querySelector('button')!.click(); expect(handler).not.toHaveBeenCalled();
  state.importedData = original; dispatchEvent(new Event('labcharts-profile-switched')); old.querySelector('button')!.click(); expect(handler).not.toHaveBeenCalled();
  control('refresh-onboarding').querySelector('button')!.click(); expect(handler).toHaveBeenCalledExactlyOnceWith();
});
it('stops retired row controls from opening the parent and ignores controls without a render owner', () => {
  const handler = vi.fn(), row = vi.fn(); retire.push(registerAIActionHandler('refresh-sun-session', handler));
  const old = control('refresh-sun-session', 'row'); old.addEventListener('click', row);
  state.currentProfile = 'b'; old.querySelector('button')!.click(); expect(row).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled();
  old.innerHTML = '<button data-ai-action="refresh-sun-session" data-ai-target="row">Unowned</button>';
  old.querySelector('button')!.click(); expect(handler).not.toHaveBeenCalled();
});
