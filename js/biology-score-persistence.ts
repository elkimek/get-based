export interface BiologyAIAnswer extends Record<string, unknown> {
  text: string;
  variants?: unknown[];
  materialFingerprint?: unknown;
  fingerprint?: unknown;
  updatedAt?: unknown;
  coveredMaterials?: { length?: number } | null;
}

// Serialize Biology interpretation and context writes before taking snapshots.
// Otherwise a slower context save can overwrite an AI answer that just finished.
let biologyWrites: Promise<unknown> = Promise.resolve();
export function queueBiologyScoreWrite<Value>(write: () => Value | PromiseLike<Value>) {
  const pending = biologyWrites.then(write);
  biologyWrites = pending.catch(() => {});
  return pending;
}

// Eight standard views (four windows × two scoring modes), plus prior evidence.
// Keep legacy top-level fields readable by older clients and backup tooling.
export const MAX_BIOLOGY_AI_VARIANTS = 16;
export function biologyAIRecords(record: unknown) {
  if (!record || typeof record !== 'object') return [];
  return [record, ...(Array.isArray((record as Partial<BiologyAIAnswer>).variants) ? (record as BiologyAIAnswer).variants! : [])]
    .filter(item => item && typeof (item as Partial<BiologyAIAnswer>).text === 'string') as BiologyAIAnswer[];
}

export function mergeBiologyScoreAIRecords(...records: unknown[]) {
  const byMaterial = new Map<unknown, BiologyAIAnswer>();
  for (const record of records.flatMap(biologyAIRecords)) {
    const { variants: _variants, ...answer } = record;
    const key = answer.materialFingerprint || answer.fingerprint || `legacy:${answer.text}`;
    const previous = byMaterial.get(key);
    if (!previous || Number(answer.updatedAt || 0) >= Number(previous.updatedAt || 0)) byMaterial.set(key, answer);
  }
  const sorted = [...byMaterial.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0) || (b.coveredMaterials?.length || 0) - (a.coveredMaterials?.length || 0)).slice(0, MAX_BIOLOGY_AI_VARIANTS);
  if (!sorted.length) return (records.find(record => record && typeof (record as Partial<BiologyAIAnswer>).text === 'string') || null) as BiologyAIAnswer | null;
  const [latest, ...variants] = sorted;
  return variants.length ? { ...latest!, variants } : latest!;
}
