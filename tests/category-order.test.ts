import { describe, expect, it } from 'vitest';

import { getLabCategoryEntriesInSidebarOrder } from '../js/category-order.js';

describe('lab category order', () => {
  it('keeps regular categories first and preserves sidebar specialty groups', () => {
    const categories = {
      biochemistry: { label: 'Biochemistry' },
      bodyComposition: { label: 'Body Composition', group: 'DEXA' },
      customPanel: { label: 'Custom Panel' },
      boneDensity: { label: 'Bone Density', group: 'DEXA' },
      oatEnergy: { label: 'Energy', group: 'OAT' },
    };

    expect(getLabCategoryEntriesInSidebarOrder(categories).map(([key]) => key)).toEqual([
      'biochemistry',
      'customPanel',
      'bodyComposition',
      'boneDensity',
      'oatEnergy',
    ]);
  });
});
