import { describe, expect, it } from 'vitest';
import { getWidgetHeaderDescription } from '../js/dashboard-widget-copy.js';

describe('widget heading curation', () => {
  it('omits redundant captions without changing the catalog description', () => {
    const widget = { id: 'cycle', description: 'Menstrual cycle context' };
    expect(getWidgetHeaderDescription(widget.id, widget.description)).toBe('');
    expect(widget.description).toBe('Menstrual cycle context');
  });
  it('keeps unfamiliar score explanations and informative captions by default', () => {
    for (const id of ['biology-score-metabolicFlexibility', 'biology-score-detail-metabolicFlexibility', 'new-widget', 'recommendations']) {
      expect(getWidgetHeaderDescription(id, 'Educational proxy, not a diagnosis')).toBe('Educational proxy, not a diagnosis');
    }
    expect(getWidgetHeaderDescription('new-widget')).toBe('');
  });
});
