// Public reference data; loading it never reads or writes a profile.
export interface HaplogroupDefinition { mutations: string[]; coupling: string; climate: string; origin?: string; etc?: string; parentHg?: string; }
export interface HaplogroupTable {
  haplogroups: Record<string, HaplogroupDefinition>;
  couplingLevels: Record<string, { label: string; shortLabel: string; description: string; implications: string; latitudeBands: number[] }>;
}
let cached: HaplogroupTable | null = null, pending: Promise<HaplogroupTable> | null = null;
export function loadHaplogroupCatalog({ forceFresh = false } = {}): Promise<HaplogroupTable> {
  if (forceFresh) { cached = null; pending = null; }
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    const loading: Promise<HaplogroupTable> = fetch('data/haplogroups.json', forceFresh ? { cache: 'no-store' } : undefined)
      .then(response => { if (response.ok === false) throw new Error('Maternal haplogroup catalog unavailable.'); return response.json(); })
      .then((data: HaplogroupTable) => { if (!data?.haplogroups || !data.couplingLevels) throw new Error('Invalid maternal haplogroup catalog.'); if (pending === loading) cached = data; return data; })
      .catch(error => { if (pending === loading) pending = null; throw error; });
    pending = loading;
  }
  return pending;
}
