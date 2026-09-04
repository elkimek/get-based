import { describe, expect, it, vi } from 'vitest';
import { bindAgentToolDependenciesToProfile } from '../js/agent-tool-bindings.js';

describe('agent tool profile binding', () => {
  it('fails typed reads and navigation closed after the active profile changes', async () => {
    let activeProfile = 'profile-a';
    const searchMarkers = vi.fn(async () => ({ available: true, matches: ['ApoB'] }));
    const navigate = vi.fn(async () => ({ changed: true, opened: 'labs' }));
    const dependencies = bindAgentToolDependenciesToProfile({
      searchMarkers,
      readMarkerHistory: vi.fn(),
      readNutritionSummary: vi.fn(),
      readWearableSeries: vi.fn(),
      searchKnowledge: vi.fn(),
      navigate,
    }, 'profile-a', () => activeProfile);

    await expect(dependencies.searchMarkers({ query: 'ApoB', limit: 10 }))
      .resolves.toEqual({ available: true, matches: ['ApoB'] });
    activeProfile = 'profile-b';
    await expect(dependencies.searchMarkers({ query: 'ApoB', limit: 10 }))
      .resolves.toMatchObject({ available: false, reason: expect.stringContaining('profile changed') });
    await expect(dependencies.navigate({ view: 'labs', marker: '' }))
      .resolves.toMatchObject({ changed: false, reason: expect.stringContaining('profile changed') });
    expect(searchMarkers).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
