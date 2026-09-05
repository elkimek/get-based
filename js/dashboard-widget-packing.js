// @ts-check
// Adaptive rows preserve saved order and share width by natural content size.
let disconnectPacking = () => {};

function preferredSpan(card) {
  if (card.classList.contains('dashboard-widget-half')) return 6;
  if (card.classList.contains('dashboard-widget-third')) return 4;
  if (card.classList.contains('dashboard-widget-quarter')) return 3;
  if (card.classList.contains('dashboard-widget-two-third')) return 8;
  return 12;
}

function naturalHeight(card) {
  const style = getComputedStyle(card);
  return [...card.children].filter(child => child instanceof HTMLElement).reduce((height, child) => {
    const css = getComputedStyle(child);
    return height + child.getBoundingClientRect().height + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
  }, (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0));
}

/** @param {HTMLElement} main */
export function setupDashboardWidgetPacking(main) {
  disconnectPacking();
  const grid = main.querySelector('.dashboard-widgets');
  if (!(grid instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return;
  let frame = 0;
  let stopped = false;
  let lastWidth = -1;
  let contentChanged = true;
  let cards = [...grid.children].filter(node => node instanceof HTMLElement);
  const layout = () => {
    frame = 0;
    if (!grid.isConnected) { cleanup(); return; }
    cards = [...grid.children].filter(node => node instanceof HTMLElement);
    const enabled = grid.clientWidth >= 720;
    grid.classList.toggle('is-adaptive', enabled);
    if (!enabled) {
      for (const card of cards) {
        card.style.removeProperty('--widget-columns');
        card.style.removeProperty('--widget-row');
      }
      lastWidth = grid.clientWidth;
      return;
    }
    if (!contentChanged && lastWidth === grid.clientWidth) return;
    lastWidth = grid.clientWidth;
    contentChanged = false;
    const rows = [];
    let row = [];
    let used = 0;
    for (const card of cards) {
      const span = preferredSpan(card);
      if (used + span > 12) { rows.push(row); row = []; used = 0; }
      row.push(card); used += span;
      if (used === 12) { rows.push(row); row = []; used = 0; }
    }
    if (row.length) rows.push(row);
    grid.classList.add('is-measuring');
    rows.forEach((items, index) => {
      const total = items.reduce((sum, card) => sum + preferredSpan(card), 0);
      let remaining = 12;
      items.forEach((card, i) => {
        const columns = i === items.length - 1 ? remaining : Math.round(preferredSpan(card) * 12 / total);
        remaining -= columns;
        card.style.setProperty('--widget-row', String(index + 1));
        card.style.setProperty('--widget-columns', String(columns));
      });
    });
    for (const items of rows) {
      if (items.length !== 2) continue;
      const min = grid.clientWidth >= 1200 ? 3 : grid.clientWidth >= 960 ? 4 : 6;
      let best = 6;
      let bestCost = Infinity;
      for (let span = min; span <= 12 - min; span++) {
        items[0].style.setProperty('--widget-columns', String(span));
        items[1].style.setProperty('--widget-columns', String(12 - span));
        const heights = items.map(naturalHeight);
        const cost = Math.max(...heights) + Math.abs(heights[0] - heights[1]) * 0.5 + Math.abs(span - 6);
        if (cost < bestCost) { bestCost = cost; best = span; }
      }
      items[0].style.setProperty('--widget-columns', String(best));
      items[1].style.setProperty('--widget-columns', String(12 - best));
    }
    grid.classList.remove('is-measuring');
  };
  const schedule = () => {
    if (!stopped && !frame) frame = requestAnimationFrame(layout);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(grid);
  const mutations = new MutationObserver(records => {
    if (!grid.isConnected) { cleanup(); return; }
    // Ignore our grid/column styles; content updates must trigger a fresh fit.
    if (records.some(record => record.type !== 'attributes' || !cards.some(card => card === record.target) && record.target !== grid)) contentChanged = true;
    schedule();
  });
  mutations.observe(main, { childList: true });
  mutations.observe(grid, { childList: true, subtree: true, characterData: true, attributes: true });
  const loaded = () => { contentChanged = true; schedule(); };
  grid.addEventListener('load', loaded, true);
  void document.fonts?.ready.then(loaded);
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    grid.removeEventListener('load', loaded, true);
  };
  disconnectPacking = cleanup;
  schedule();
}
