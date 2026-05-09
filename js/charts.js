// charts.js — Chart.js plugins, chart creation, marker descriptions

import { state } from './state.js';
import { getStatus, formatValue } from './utils.js';
import { getChartColors } from './theme.js';
import { getEffectiveRange, getEffectiveRangeForDate, getPhaseRefEnvelope } from './data.js';

// Chart.js plugin for reference range band
export const refBandPlugin = {
  id: "refBand",
  beforeDraw(chart) {
    const opts = chart.options.plugins.refBand;
    if (!opts || !chart.chartArea || (opts.refMin == null && opts.refMax == null)) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    if (!y) return;
    const cs = getComputedStyle(document.documentElement);
    const bandColor = cs.getPropertyValue('--ref-band').trim();
    const borderColor = cs.getPropertyValue('--ref-border').trim();
    ctx.save();
    ctx.setLineDash([4,4]); ctx.lineWidth = 1;
    if (opts.refMin != null && opts.refMax != null) {
      // Two-sided: shade the in-range band
      const yMin = y.getPixelForValue(opts.refMin);
      const yMax = y.getPixelForValue(opts.refMax);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, Math.min(yMin,yMax), right-left, Math.abs(yMax-yMin));
      ctx.strokeStyle = borderColor;
      ctx.beginPath(); ctx.moveTo(left,yMin); ctx.lineTo(right,yMin); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left,yMax); ctx.lineTo(right,yMax); ctx.stroke();
    } else if (opts.refMin != null) {
      // Lower bound only: shade above refMin (in-range zone) + solid line
      const yMin = y.getPixelForValue(opts.refMin);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, top, right-left, yMin-top);
      ctx.strokeStyle = borderColor;
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left,yMin); ctx.lineTo(right,yMin); ctx.stroke();
    } else {
      // Upper bound only: shade below refMax (in-range zone) + solid line
      const yMax = y.getPixelForValue(opts.refMax);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, yMax, right-left, bottom-yMax);
      ctx.strokeStyle = borderColor;
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left,yMax); ctx.lineTo(right,yMax); ctx.stroke();
    }
    ctx.restore();
  }
};

// Chart.js plugin for optimal range band (green dashed, inside ref band)
export const optimalBandPlugin = {
  id: "optimalBand",
  beforeDraw(chart) {
    const opts = chart.options.plugins.optimalBand;
    if (!opts || !chart.chartArea || (opts.optimalMin == null && opts.optimalMax == null)) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    if (!y) return;
    const bandColor = "rgba(52, 211, 153, 0.06)";
    const borderColor = "rgba(52, 211, 153, 0.3)";
    ctx.save();
    ctx.setLineDash([3,3]); ctx.lineWidth = 1;
    if (opts.optimalMin != null && opts.optimalMax != null) {
      const yMin = y.getPixelForValue(opts.optimalMin);
      const yMax = y.getPixelForValue(opts.optimalMax);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, Math.min(yMin,yMax), right-left, Math.abs(yMax-yMin));
      ctx.strokeStyle = borderColor;
      ctx.beginPath(); ctx.moveTo(left,yMin); ctx.lineTo(right,yMin); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left,yMax); ctx.lineTo(right,yMax); ctx.stroke();
    } else if (opts.optimalMin != null) {
      const yMin = y.getPixelForValue(opts.optimalMin);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, top, right-left, yMin-top);
      ctx.strokeStyle = borderColor;
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left,yMin); ctx.lineTo(right,yMin); ctx.stroke();
    } else {
      const yMax = y.getPixelForValue(opts.optimalMax);
      ctx.fillStyle = bandColor;
      ctx.fillRect(left, yMax, right-left, bottom-yMax);
      ctx.strokeStyle = borderColor;
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(left,yMax); ctx.lineTo(right,yMax); ctx.stroke();
    }
    ctx.restore();
  }
};

// Chart.js plugin for note annotation dots with hover tooltip
export const noteAnnotationPlugin = {
  id: "noteAnnotations",
  _getNoteDots(chart) {
    const opts = chart.options.plugins.noteAnnotations;
    if (!opts || !opts.notes || !opts.notes.length || !chart.chartArea) return [];
    const { chartArea: { left, right, top }, scales: { x } } = chart;
    if (!x) return [];
    const isTime = x.type === 'time';
    const chartDates = opts.chartDates || [];
    const dots = [];
    const DOT_RADIUS = window.innerWidth <= 768 ? 8 : 5;
    const DOT_Y = top + DOT_RADIUS + 2;
    for (const note of opts.notes) {
      let pixelX;
      if (isTime) {
        pixelX = x.getPixelForValue(new Date(note.date + 'T00:00:00').getTime());
      } else {
        // Category scale: match label or interpolate between chartDates
        const noteDateLabel = new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const idx = (chart.data.labels || []).indexOf(noteDateLabel);
        if (idx !== -1) { pixelX = x.getPixelForValue(idx); }
        else if (chartDates.length >= 2 && note.date >= chartDates[0] && note.date <= chartDates[chartDates.length - 1]) {
          for (let i = 0; i < chartDates.length - 1; i++) {
            if (note.date >= chartDates[i] && note.date <= chartDates[i + 1]) {
              const frac = (new Date(note.date).getTime() - new Date(chartDates[i]).getTime()) / (new Date(chartDates[i + 1]).getTime() - new Date(chartDates[i]).getTime());
              pixelX = x.getPixelForValue(i) + frac * (x.getPixelForValue(i + 1) - x.getPixelForValue(i));
              break;
            }
          }
        }
      }
      if (pixelX == null || isNaN(pixelX) || pixelX < left || pixelX > right) continue;
      dots.push({ x: pixelX, y: DOT_Y, radius: DOT_RADIUS, note });
    }
    return dots;
  },
  afterDatasetsDraw(chart) {
    const dots = this._getNoteDots(chart);
    if (!dots.length) return;
    const { ctx } = chart;
    ctx.save();
    for (const dot of dots) {
      ctx.fillStyle = dot === chart._hoveredNoteDot
        ? "rgba(251, 191, 36, 1)"
        : "rgba(251, 191, 36, 0.7)";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // Draw tooltip for hovered dot
    if (chart._hoveredNoteDot) {
      const dot = chart._hoveredNoteDot;
      const dateStr = new Date(dot.note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const text = dot.note.text.length > 60 ? dot.note.text.slice(0, 60) + '...' : dot.note.text;
      ctx.font = "12px Inter, sans-serif";
      const dateWidth = ctx.measureText(dateStr).width;
      const textWidth = ctx.measureText(text).width;
      const boxWidth = Math.max(dateWidth, textWidth) + 16;
      const boxHeight = 42;
      const boxPad = 8;
      // Position tooltip below the dot
      let tooltipX = dot.x - boxWidth / 2;
      let tooltipY = dot.y + dot.radius + 6;
      // Clamp to chart area
      const { left, right } = chart.chartArea;
      if (tooltipX < left) tooltipX = left;
      if (tooltipX + boxWidth > right) tooltipX = right - boxWidth;
      // Background
      const cs = getComputedStyle(document.documentElement);
      ctx.fillStyle = cs.getPropertyValue('--chart-tooltip-bg').trim();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 6);
      ctx.fill();
      ctx.stroke();
      // Date label (bold)
      ctx.fillStyle = "rgba(251, 191, 36, 1)";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(dateStr, tooltipX + boxPad, tooltipY + 15);
      // Note text
      ctx.fillStyle = cs.getPropertyValue('--text-primary').trim();
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(text, tooltipX + boxPad, tooltipY + 31);
    }
    ctx.restore();
  },
  afterEvent(chart, args) {
    const { event } = args;
    if (event.type !== 'mousemove') return;
    const dots = this._getNoteDots(chart);
    let hovered = null;
    for (const dot of dots) {
      const dx = event.x - dot.x;
      const dy = event.y - dot.y;
      if (dx * dx + dy * dy <= (dot.radius + 3) * (dot.radius + 3)) {
        hovered = dot;
        break;
      }
    }
    const prev = chart._hoveredNoteDot;
    chart._hoveredNoteDot = hovered;
    if (prev !== hovered) {
      chart.canvas.style.cursor = hovered ? 'pointer' : '';
      args.changed = true;
    }
  }
};

export function getNotesForChart(chartDates) {
  if (state.noteOverlayMode === 'off') return [];
  const notes = (state.importedData.notes || []);
  if (!notes.length || !chartDates.length) return [];
  const minDate = chartDates[0];
  const maxDate = chartDates[chartDates.length - 1];
  return notes.filter(n => n.date >= minDate && n.date <= maxDate);
}

export function getSupplementsForChart(chartDates) {
  if (state.suppOverlayMode === 'off') return [];
  const supps = (state.importedData.supplements || []);
  if (!supps.length || !chartDates.length) return [];
  const minDate = chartDates[0];
  const maxDate = chartDates[chartDates.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  return supps.filter(s => {
    const pds = (s.periods && s.periods.length > 0) ? s.periods : [{ start: s.startDate, end: s.endDate }];
    return pds.some(p => {
      const end = p.end || today;
      return p.start <= maxDate && end >= minDate;
    });
  });
}

export const supplementBarPlugin = {
  id: 'supplementBars',
  _dateToPixelX(dateStr, chart) {
    const x = chart.scales.x;
    const { left, right } = chart.chartArea;
    if (x.type === 'time') {
      const px = x.getPixelForValue(new Date(dateStr + 'T00:00:00').getTime());
      return Math.max(left, Math.min(right, px));
    }
    // Category scale fallback
    const chartDates = chart.options.plugins.supplementBars?.chartDates || [];
    const idx = chartDates.indexOf(dateStr);
    if (idx !== -1) return x.getPixelForValue(idx);
    for (let i = 0; i < chartDates.length - 1; i++) {
      if (dateStr > chartDates[i] && dateStr < chartDates[i + 1]) {
        const frac = (new Date(dateStr + 'T00:00:00').getTime() - new Date(chartDates[i] + 'T00:00:00').getTime()) / (new Date(chartDates[i + 1] + 'T00:00:00').getTime() - new Date(chartDates[i] + 'T00:00:00').getTime());
        return x.getPixelForValue(i) + frac * (x.getPixelForValue(i + 1) - x.getPixelForValue(i));
      }
    }
    if (dateStr <= chartDates[0]) return Math.max(left, x.getPixelForValue(0));
    return Math.min(right, x.getPixelForValue(chartDates.length - 1));
  },
  _getBarRects(chart) {
    const cfg = chart.options.plugins.supplementBars;
    if (!cfg || !cfg.supplements || !cfg.supplements.length) return [];
    const { left, right, top } = chart.chartArea;
    const BAR_H = 12, GAP = 2, TOP_PAD = 4;
    const today = new Date().toISOString().slice(0, 10);
    const rects = [];
    cfg.supplements.forEach((s, i) => {
      const pds = (s.periods && s.periods.length > 0) ? s.periods : [{ start: s.startDate, end: s.endDate }];
      for (const p of pds) {
        const startX = this._dateToPixelX(p.start, chart);
        const endDate = p.end || today;
        const endX = this._dateToPixelX(endDate, chart);
        const clampedLeft = Math.max(startX, left);
        const clampedRight = Math.min(endX, right);
        if (clampedRight <= clampedLeft) continue;
        const y = top + TOP_PAD + i * (BAR_H + GAP);
        rects.push({
          x: clampedLeft, y, w: clampedRight - clampedLeft, h: BAR_H,
          supplement: s, ongoing: !p.end,
          periodStart: p.start, periodEnd: p.end
        });
      }
    });
    return rects;
  },
  afterDatasetsDraw(chart) {
    const rects = this._getBarRects(chart);
    if (!rects.length) return;
    const { ctx } = chart;
    ctx.save();
    for (const r of rects) {
      const isMed = r.supplement.type === 'medication';
      ctx.fillStyle = isMed ? 'rgba(167, 139, 250, 0.7)' : 'rgba(56, 189, 248, 0.6)';
      if (r.ongoing) {
        // Gradient fade for ongoing
        const grad = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        grad.addColorStop(0, isMed ? 'rgba(167, 139, 250, 0.7)' : 'rgba(56, 189, 248, 0.6)');
        grad.addColorStop(0.7, isMed ? 'rgba(167, 139, 250, 0.7)' : 'rgba(56, 189, 248, 0.6)');
        grad.addColorStop(1, isMed ? 'rgba(167, 139, 250, 0)' : 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
      }
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 3);
      ctx.fill();
      // Label inside bar if wide enough
      const label = r.supplement.name;
      ctx.font = '10px Inter, sans-serif';
      const textW = ctx.measureText(label).width;
      if (r.w > textW + 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, r.x + 4, r.y + r.h / 2);
      }
    }
    // Draw tooltip for hovered bar
    if (chart._hoveredSuppBar) {
      const r = chart._hoveredSuppBar;
      const s = r.supplement;
      const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const line1 = `${s.name}${s.dosage ? ' — ' + s.dosage : ''}`;
      const line2 = `${fmtDate(r.periodStart)} \u2192 ${r.periodEnd ? fmtDate(r.periodEnd) : 'ongoing'}`;
      const line3 = s.note ? (s.note.length > 60 ? s.note.slice(0, 57) + '...' : s.note) : null;
      ctx.font = '12px Inter, sans-serif';
      const w1 = ctx.measureText(line1).width;
      const w2 = ctx.measureText(line2).width;
      const w3 = line3 ? ctx.measureText(line3).width : 0;
      const boxW = Math.max(w1, w2, w3) + 16;
      const boxH = line3 ? 52 : 38;
      let tx = r.x + r.w / 2 - boxW / 2;
      let ty = r.y + r.h + 6;
      const { left, right } = chart.chartArea;
      if (tx < left) tx = left;
      if (tx + boxW > right) tx = right - boxW;
      const isMed = s.type === 'medication';
      const cs = getComputedStyle(document.documentElement);
      ctx.fillStyle = cs.getPropertyValue('--chart-tooltip-bg').trim();
      ctx.strokeStyle = isMed ? 'rgba(167, 139, 250, 0.6)' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isMed ? 'rgba(167, 139, 250, 1)' : 'rgba(56, 189, 248, 1)';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line1, tx + 8, ty + 6);
      ctx.fillStyle = cs.getPropertyValue('--text-primary').trim();
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(line2, tx + 8, ty + 22);
      if (line3) {
        ctx.fillStyle = cs.getPropertyValue('--text-muted').trim() || '#999';
        ctx.font = 'italic 10px Inter, sans-serif';
        ctx.fillText(line3, tx + 8, ty + 37);
      }
    }
    ctx.restore();
  },
  afterEvent(chart, args) {
    const { event } = args;
    if (event.type !== 'mousemove') return;
    const rects = this._getBarRects(chart);
    let hovered = null;
    for (const r of rects) {
      if (event.x >= r.x && event.x <= r.x + r.w && event.y >= r.y && event.y <= r.y + r.h) {
        hovered = r;
        break;
      }
    }
    const prev = chart._hoveredSuppBar;
    chart._hoveredSuppBar = hovered;
    if (prev !== hovered) {
      if (!chart._hoveredNoteDot) {
        chart.canvas.style.cursor = hovered ? 'pointer' : '';
      }
      args.changed = true;
    }
  }
};

// Chart.js plugin for cycle phase background bands
export const phaseBandPlugin = {
  id: 'phaseBands',
  beforeDraw(chart) {
    const cfg = chart.options.plugins.phaseBands;
    if (!cfg?.phases?.length || !cfg?.chartDates?.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    if (!x || !chartArea) return;
    const { top, bottom } = chartArea;
    const colors = {
      menstrual:  'rgba(239, 68, 68, 0.08)',
      follicular: 'rgba(59, 130, 246, 0.08)',
      ovulatory:  'rgba(168, 85, 247, 0.08)',
      luteal:     'rgba(245, 158, 11, 0.08)'
    };
    const labelColors = {
      menstrual:  'rgba(239, 68, 68, 0.6)',
      follicular: 'rgba(59, 130, 246, 0.6)',
      ovulatory:  'rgba(168, 85, 247, 0.6)',
      luteal:     'rgba(245, 158, 11, 0.6)'
    };
    const phaseLetters = { menstrual: 'M', follicular: 'F', ovulatory: 'O', luteal: 'L' };
    const phases = cfg.phases;
    const chartDates = cfg.chartDates;
    const toTs = d => new Date(d + 'T00:00:00').getTime();
    ctx.save();
    for (let i = 0; i < phases.length; i++) {
      if (!phases[i] || !colors[phases[i]] || !chartDates[i]) continue;
      const px = x.getPixelForValue(toTs(chartDates[i]));
      const prevPx = i > 0 && chartDates[i - 1] ? x.getPixelForValue(toTs(chartDates[i - 1])) : null;
      const nextPx = i < phases.length - 1 && chartDates[i + 1] ? x.getPixelForValue(toTs(chartDates[i + 1])) : null;
      const left = prevPx != null ? (px + prevPx) / 2 : chartArea.left;
      const right = nextPx != null ? (px + nextPx) / 2 : chartArea.right;
      ctx.fillStyle = colors[phases[i]];
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    // Phase labels at top
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < phases.length; i++) {
      if (!phases[i] || !chartDates[i]) continue;
      if (i > 0 && phases[i] === phases[i - 1]) continue;
      const px = x.getPixelForValue(toTs(chartDates[i]));
      ctx.fillStyle = labelColors[phases[i]] || 'rgba(150,150,150,0.6)';
      ctx.fillText(phaseLetters[phases[i]] || '', px, top + 2);
    }
    ctx.restore();
  }
};

export function createLineChart(id, marker, dateLabels, chartDates, phaseLabels) {
  const canvas = document.getElementById("chart-" + id);
  if (!canvas) return;
  const tc = getChartColors();
  let dates = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : dateLabels;
  let values = marker.values;
  let valid = values.filter(v => v !== null);
  if (valid.length === 0) return;
  const useTimeScale = !marker.singlePoint && valid.length > 1;
  // Trim leading/trailing nulls for category scale (time scale handles gaps proportionally)
  let trimOffset = 0;
  if (!useTimeScale && !marker.singlePoint && values.length > 1) {
    let first = values.findIndex(v => v !== null);
    let last = values.length - 1;
    while (last > first && values[last] === null) last--;
    if (first > 0 || last < values.length - 1) {
      trimOffset = first;
      values = values.slice(first, last + 1);
      dates = dates.slice(first, last + 1);
      if (chartDates) chartDates = chartDates.slice(first, last + 1);
      if (phaseLabels) phaseLabels = phaseLabels.slice(first, last + 1);
    }
  }

  // Extend chart to today so supplements/notes after last lab date are visible (skip if <30 days)
  if (!marker.singlePoint && chartDates && chartDates.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = chartDates[chartDates.length - 1];
    const daysSince = Math.round((new Date(today) - new Date(lastDate + 'T00:00:00')) / 86400000);
    if (daysSince >= 30) {
      chartDates = [...chartDates, today];
      dates = [...dates, 'Today'];
      values = [...values, null];
      if (phaseLabels) phaseLabels = [...phaseLabels, null];
    }
  }

  // Biological Age: add chronological age line for comparison
  const isPhenoAge = marker.name && (marker.name === 'Biological Age' || marker.name.startsWith('PhenoAge'));
  let chronoAgeValues = null;
  if (isPhenoAge && state.profileDob && chartDates && chartDates.length) {
    const dobDate = new Date(state.profileDob + 'T00:00:00');
    chronoAgeValues = chartDates.map(d => {
      const draw = new Date(d + 'T00:00:00');
      const age = (draw - dobDate) / (365.25 * 24 * 60 * 60 * 1000);
      return age > 0 ? Math.round(age * 10) / 10 : null;
    });
  }
  const allValid = chronoAgeValues ? [...valid, ...chronoAgeValues.filter(v => v !== null)] : valid;
  const envelope = getPhaseRefEnvelope(marker);
  const refMinSafe = envelope ? Math.min(marker.refMin != null ? marker.refMin : Infinity, envelope.min) : (marker.refMin != null ? marker.refMin : Infinity);
  const refMaxSafe = envelope ? Math.max(marker.refMax != null ? marker.refMax : -Infinity, envelope.max) : (marker.refMax != null ? marker.refMax : -Infinity);
  const optMinSafe = marker.optimalMin != null ? marker.optimalMin : Infinity;
  const optMaxSafe = marker.optimalMax != null ? marker.optimalMax : -Infinity;
  const minV = Math.min(...allValid, refMinSafe, optMinSafe);
  const maxV = Math.max(...allValid, refMaxSafe, optMaxSafe);
  const pad = (maxV - minV) * 0.15 || 1;
  const chartRange = getEffectiveRange(marker);
  const ptColors = []; const ptStyles = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) { ptColors.push("transparent"); ptStyles.push('circle'); continue; }
    const r = getEffectiveRangeForDate(marker, i + trimOffset);
    const s = getStatus(v, r.min, r.max);
    ptColors.push(s==="normal"?tc.green:s==="high"?tc.red:tc.yellow);
    ptStyles.push('circle');
  }
  const rawDates = chartDates || [];
  const chartNotes = marker.singlePoint ? [] : getNotesForChart(rawDates);
  const chartSupps = marker.singlePoint ? [] : getSupplementsForChart(rawDates);
  const datasets = [{
    data: values, borderColor: tc.lineColor, backgroundColor: tc.lineFill,
    borderWidth: 2.5, pointBackgroundColor: ptColors, pointBorderColor: ptColors,
    pointStyle: ptStyles, pointRadius: 6, pointHoverRadius: 8, tension: 0.3, fill: false, spanGaps: true,
    label: isPhenoAge ? 'Biological Age' : ''
  }];
  if (chronoAgeValues) {
    datasets.push({
      data: chronoAgeValues, borderColor: tc.chronoLineColor, backgroundColor: "transparent",
      borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 4,
      tension: 0.3, fill: false, spanGaps: true, label: 'Chronological Age'
    });
  }
  const chartLabels = useTimeScale ? rawDates : dates;
  const xScale = useTimeScale
    ? { type: 'time',
        time: { tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d, yyyy', month: 'MMM yyyy', year: 'yyyy' } },
        // `source: 'labels'` forces a tick at every datapoint, which
        // collides at "Dec 2025 / Jan 2026" zoom levels — adjacent
        // datapoints render labels that overlap. Letting Chart.js
        // auto-pick tick positions (default `source: 'auto'`) means it
        // picks the LARGER of day/month/year that fits the available
        // width; with autoSkip + a tighter cap the labels stay legible
        // and the day-precision is still in the tooltip on hover.
        ticks: { color: tc.tickColor, font: { size: 11 }, maxTicksLimit: 6, autoSkip: true, maxRotation: 0 },
        grid: { display: false } }
    : { ticks: { color: tc.tickColor, font: { size: 11 }, maxRotation: 0, autoSkip: true }, grid: { display: false } };
  state.chartInstances[id] = new Chart(canvas, {
    type: "line",
    data: { labels: chartLabels, datasets },
    options: { responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ display: isPhenoAge && chronoAgeValues ? true : false, labels: { color: tc.legendColor, font: { size: 11 }, boxWidth: 20, padding: 10 } },
        tooltip:{ backgroundColor:tc.tooltipBg, titleColor:tc.tooltipTitle, bodyColor:tc.tooltipBody, borderColor:tc.tooltipBorder, borderWidth:1,
          callbacks:{ label:(c)=>`${c.dataset.label ? c.dataset.label + ': ' : ''}${formatValue(c.parsed.y)} ${marker.unit}`, afterLabel:(c)=> { if (c.datasetIndex !== 0) return ''; const di = c.dataIndex; const oi = di + trimOffset; const pr = getEffectiveRangeForDate(marker, oi); const phaseLabel = marker.phaseLabels && marker.phaseLabels[oi]; const lines = []; if (phaseLabel) lines.push(`Phase: ${phaseLabel}`); if (pr.min != null || pr.max != null) { const rl = phaseLabel ? 'Phase ref' : (state.rangeMode === 'optimal' && marker.optimalMin != null ? 'Optimal' : 'Ref'); const rMin = pr.min != null ? formatValue(pr.min) : '–'; const rMax = pr.max != null ? formatValue(pr.max) : '–'; lines.push(`${rl}: ${rMin} \u2013 ${rMax}`); } return lines.join('\n'); } }},
        refBand: (() => { const env = getPhaseRefEnvelope(marker); if (state.rangeMode === 'both') return { refMin: marker.refMin, refMax: marker.refMax }; if (env) return { refMin: env.min, refMax: env.max }; return { refMin: chartRange.min, refMax: chartRange.max }; })(),
        optimalBand: state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) ? { optimalMin: marker.optimalMin, optimalMax: marker.optimalMax } : false,
        noteAnnotations: chartNotes.length ? { notes: chartNotes, chartDates: rawDates } : false,
        supplementBars: chartSupps.length ? { supplements: chartSupps, chartDates: rawDates } : false,
        phaseBands: (phaseLabels && phaseLabels.some(p => p) && state.phaseOverlayMode === 'on') ? { phases: phaseLabels, chartDates: rawDates } : false},
      layout: { padding: { top: chartSupps.length ? chartSupps.length * 14 + 6 : 0 } },
      scales: { x: xScale,
        y:{min:minV-pad, max:maxV+pad, ticks:{color:tc.tickColor,font:{size:10}}, grid:{color:tc.gridColor}}}
    },
    plugins: [phaseBandPlugin, refBandPlugin, optimalBandPlugin, noteAnnotationPlugin, supplementBarPlugin]
  });
}

export function getMarkerDescription(markerId) {
  const marker = state.markerRegistry[markerId];
  if (marker && marker.desc) return marker.desc;
  // Fallback to localStorage cache for custom markers
  const cache = JSON.parse(localStorage.getItem('labcharts-marker-desc') || '{}');
  return cache[markerId] || null;
}

Object.assign(window, { refBandPlugin, optimalBandPlugin, noteAnnotationPlugin, supplementBarPlugin, phaseBandPlugin, getNotesForChart, getSupplementsForChart, createLineChart, getMarkerDescription });
