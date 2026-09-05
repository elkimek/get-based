// @ts-check
// Dense grid packing using measured natural card heights. DOM/saved order is
// untouched; Customize and narrow layouts retain the ordinary ordered grid.
let disconnectPacking = () => {};

/** @param {HTMLElement} main */
export function setupDashboardWidgetPacking(main) {
  disconnectPacking();
  const grid = main.querySelector('.dashboard-widgets');
  if (!(grid instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return;
  let frame = 0;
  let stopped = false;
  const cards = [...grid.children].filter(node => node instanceof HTMLElement);
  const layout = () => {
    frame = 0;
    if (!grid.isConnected) { cleanup(); return; }
    const enabled = grid.clientWidth >= 720 && !grid.classList.contains('is-organizing');
    grid.classList.toggle('is-packed', enabled);
    if (!enabled) {
      for (const card of cards) card.style.removeProperty('--widget-row-span');
      return;
    }
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 18;
    // Read all heights first to avoid alternating layout reads and writes.
    const heights = cards.map(card => Math.ceil(card.getBoundingClientRect().height + gap));
    cards.forEach((card, index) => card.style.setProperty('--widget-row-span', String(heights[index])));
  };
  const schedule = () => {
    if (!stopped && !frame) frame = requestAnimationFrame(layout);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(grid);
  for (const card of cards) resize.observe(card);
  const mutations = new MutationObserver(() => {
    if (!grid.isConnected) cleanup();
    else schedule();
  });
  mutations.observe(main, { childList: true });
  mutations.observe(grid, { attributes: true, attributeFilter: ['class'] });
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
  };
  disconnectPacking = cleanup;
  schedule();
}
