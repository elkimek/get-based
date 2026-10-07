import type { ChatProfileDraft, ChatProfileOrigin, ChatProfileSavePorts } from './chat-profile-onboarding-contract.js';
const SAVE_ERROR = 'Could not save your profile. Your entries are still here. Try again.';
/** Serializes accepted form snapshots; an in-flight write may finish, but retirement stops later writes and publication. */
export function createChatProfileOnboardingController(ports: ChatProfileSavePorts) {
  const queues = new Map<string, Promise<boolean>>();
  const pending = new WeakMap<ChatProfileOrigin['view'], number>();
  function run(origin: ChatProfileOrigin, operation: () => Promise<boolean>): Promise<boolean> {
    if (!origin.current()) return Promise.resolve(false);
    const view = origin.view;
    pending.set(view, (pending.get(view) || 0) + 1);
    view.setPending(true); view.setError('');
    const work = (queues.get(origin.profileId) || Promise.resolve(true)).then(async () => {
      if (!origin.current()) return false;
      try {
        const saved = await operation();
        if (!saved && origin.current()) view.setError(SAVE_ERROR);
        return saved;
      } catch {
        if (origin.current()) view.setError(SAVE_ERROR);
        return false;
      }
    }).finally(() => {
      pending.set(view, Math.max(0, (pending.get(view) || 1) - 1));
      if (origin.current()) view.setPending((pending.get(view) || 0) > 0);
      if (queues.get(origin.profileId) === work) queues.delete(origin.profileId);
    });
    queues.set(origin.profileId, work);
    return work;
  }
  async function write(origin: ChatProfileOrigin, operation: () => Promise<boolean>): Promise<boolean> {
    return origin.current() && await operation() && origin.current();
  }
  async function location(origin: ChatProfileOrigin, country: string): Promise<boolean> {
    if (!await write(origin, () => ports.location(origin.profileId, country))) return false;
    origin.view.setLatitude(ports.latitude(country));
    return true;
  }
  function saveLocation(origin: ChatProfileOrigin, country: string): Promise<boolean> {
    return run(origin, () => location(origin, country));
  }
  function setSex(origin: ChatProfileOrigin, sex: string | null): Promise<boolean> {
    return run(origin, async () => {
      if (!await write(origin, () => ports.sex(origin.profileId, sex))) return false;
      ports.publishSex(sex); origin.view.setSex(sex);
      origin.view.setContinueEnabled(Boolean(origin.view.readDraft().name.trim() && sex));
      return true;
    });
  }
  function saveProfile(origin: ChatProfileOrigin, draft: ChatProfileDraft, advance: boolean): Promise<boolean> {
    // Copy before any queue or await: replacement fields and later edits cannot change an accepted save.
    const accepted = { ...draft, name: draft.name.trim(), country: draft.country.trim() };
    return run(origin, async () => {
      const { profileId, view } = origin;
      if (accepted.name && !await write(origin, () => ports.rename(profileId, accepted.name))) return false;
      const year = parseInt(accepted.dob.slice(0, 4));
      if (accepted.dob && year >= 1900 && year <= Number(ports.today().slice(0, 4))) {
        if (!await write(origin, () => ports.dob(profileId, accepted.dob))) return false;
        ports.publishDob(accepted.dob);
      }
      const height = parseFloat(accepted.height);
      if (height) {
        const cm = accepted.heightUnit === 'in' ? Math.round(height * 2.54 * 10) / 10 : height;
        if (!await write(origin, () => ports.height(profileId, cm, accepted.heightUnit))) return false;
      }
      const weight = parseFloat(accepted.weight);
      if (weight) {
        if (!origin.current()) return false;
        const data = origin.data; const baseline = structuredClone(data);
        const previous = data.biometrics?.weight;
        const date = ports.today();
        const weights = (previous || []).filter(entry => entry.date !== date);
        weights.push({ date, value: weight, unit: accepted.weightUnit, source: 'manual' });
        weights.sort((a, b) => a.date.localeCompare(b.date));
        data.biometrics = { ...(data.biometrics || { bp: [], pulse: [] }), weight: weights };
        let saved = false;
        try { saved = await ports.data(profileId, data, baseline); }
        finally { if (!saved && data.biometrics?.weight === weights) data.biometrics.weight = previous || []; }
        if (!saved || !origin.current()) return false;
        if (!await write(origin, () => ports.weight(profileId, date, weight, accepted.weightUnit))) return false;
      }
      if (!await location(origin, accepted.country)) return false;
      view.setContinueEnabled(Boolean(view.readDraft().name.trim() && view.readDraft().sex));
      ports.saved(advance && Boolean(accepted.name && view.readDraft().sex));
      return true;
    });
  }
  return { saveProfile, setSex, saveLocation };
}
