// Real profile switching and storage with gated localhost AI responses; used by native browser acceptance.
export async function startLightAIProfileOwnership() {
  localStorage.setItem('labcharts-ai-paused', 'true');
  await (await import('/js/light-sun-loader.js')).loadLightSunUI();
  const [{ state }, profile, data, crypto] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/crypto.js')]);
  const a = state.currentProfile;
  state.importedData = profile.createDefaultProfileData(); state.importedData.nutritionMeals = []; state.importedData.sunDefaults = { fitzpatrick: 'II', completedAt: 1 };
  if (!await data.saveImportedData()) throw new Error('Could not seed A');
  const b = await profile.createProfile('Ownership replacement', { skipInitialSync: true });
  const replacement = profile.createDefaultProfileData(); replacement.nutritionMeals = [];
  replacement.sunDefaults = { fitzpatrick: 'V', completedAt: 2 }; replacement.contextNotes = 'Keep B context';
  if (!await data.saveImportedDataForProfile(b, replacement, { forceProfileScope: true })) throw new Error('Could not seed B');
  // Let the real profile lifecycle hydrate its local defaults before observing the fixture.
  await profile.switchProfile(b);
  if (!await data.saveImportedDataForProfile(b, state.importedData, { forceProfileScope: true })) throw new Error('Could not persist hydrated B');
  await profile.switchProfile(a);
  const beforeA = await crypto.encryptedGetItem(profile.profileStorageKey(a, 'imported'));
  const beforeB = JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(b, 'imported')))!);
  localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'ownership-fixture', mode: 'ollama' }));
  localStorage.setItem('labcharts-ollama-model', 'ownership-fixture'); localStorage.setItem('labcharts-ai-paused', 'false');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const requests: object[] = [], original = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    if (!String(input instanceof Request ? input.url : input).includes('/v1/chat/completions')) return original(input, options);
    requests.push(JSON.parse(String(options?.body || '{}'))); const number = requests.length;
    if (number === 1) await gate;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ dot: 'green', tip: number === 1 ? 'Late A response' : 'Current B response', detail: 'Owned context', actions: ['Keep local context'] }) } }] });
  };
  const ai = await import('/js/sun-onboarding-ai.js');
  Object.assign(window, { ownershipFixture: { a, b, beforeA, beforeB, release, requests, pending: ai.analyzeOnboardingAI({ force: true, userInitiated: true }) } });
}

export function lightAIProfileRequestCount() {
  return (window as unknown as { ownershipFixture: { requests: object[] } }).ownershipFixture.requests.length;
}

export async function finishLightAIProfileOwnership() {
  const fixture = (window as unknown as { ownershipFixture: { a: string; b: string; beforeA: string; beforeB: object; release(): void; pending: Promise<unknown> } }).ownershipFixture;
  const [{ state }, profile, crypto, ai] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/crypto.js'), import('/js/sun-onboarding-ai.js')]);
  await profile.switchProfile(fixture.b);
  const host = document.createElement('div'); host.innerHTML = ai.renderOnboardingAIBlock();
  const initial = host.querySelector('[data-light-onboarding-ai]')?.getAttribute('data-ai-state');
  const current = await ai.analyzeOnboardingAI({ force: true, userInitiated: true });
  fixture.release(); const retired = await fixture.pending;
  const a = await crypto.encryptedGetItem(profile.profileStorageKey(fixture.a, 'imported'));
  const b = JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(fixture.b, 'imported')))!);
  return { initial, current, retired, aUnchanged: a === fixture.beforeA, beforeB: fixture.beforeB, b, live: structuredClone(state.importedData), profile: state.currentProfile, bId: fixture.b, aId: fixture.a, aSnapshot: fixture.beforeA };
}
