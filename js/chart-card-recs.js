// chart-card-recs.js - Recommendation badges for marker chart cards

import { showNotification } from './utils.js';
import { showDetailModal } from './marker-detail-modal.js';

export async function loadChartCardRecs() {
  if (!window.isProductRecsEnabled || !window.isProductRecsEnabled()) return;
  if (!window.loadCatalog) return;
  const catalog = await window.loadCatalog();
  if (!catalog || !catalog.slots) return;

  const els = document.querySelectorAll('[id^="chart-rec-"]');
  for (const el of els) {
    if (el.children.length > 0) continue;
    const id = el.id.replace('chart-rec-', '');
    const slotKey = id.replace('_', '.');
    const slot = catalog.slots[slotKey];
    if (!slot) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'What can help';
    badge.onclick = e => {
      e.stopPropagation();
      showDetailModal(id, { scrollToRec: true });
    };
    el.appendChild(badge);
  }

  // Reorder chart cards: those with tips badges first (within each grid)
  for (const grid of document.querySelectorAll('.charts-grid')) {
    const cards = Array.from(grid.querySelectorAll('.chart-card'));
    const withRec = cards.filter(c => c.querySelector('.ctx-tips-badge'));
    const without = cards.filter(c => !c.querySelector('.ctx-tips-badge'));
    for (const c of [...withRec, ...without]) grid.appendChild(c);
  }

  // One-time nudge (must query after badges are added)
  const recLinks = document.querySelectorAll('[id^="chart-rec-"] .ctx-tips-badge');
  const modalOpen = !!document.querySelector('.modal-overlay.show');
  if (recLinks.length > 0 && !modalOpen && !localStorage.getItem('labcharts-rec-nudge-seen')) {
    localStorage.setItem('labcharts-rec-nudge-seen', '1');
    showNotification(`${recLinks.length} marker${recLinks.length > 1 ? 's have' : ' has'} actionable tips \u2014 look for the Tips badge on your chart cards`, 'info');
  }
}
