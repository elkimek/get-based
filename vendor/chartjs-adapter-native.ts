// vendor/chartjs-adapter-native.js — Minimal Chart.js 4.x date adapter
// Uses native Date + Intl.DateTimeFormat. Zero dependencies.
// Load after chart.min.js: <script src="vendor/chartjs-adapter-native.js"></script>
// The classic bundle supplies this unvalidated host identifier.
declare const Chart: unknown;

(function () {
  'use strict';

  function fmt(date: Date, options: Intl.DateTimeFormatOptions) {
    try { return new Intl.DateTimeFormat('en-US', options).format(date); }
    catch (_) { return date.toLocaleDateString(); }
  }

  (Chart as { _adapters: { _date: { override(adapter: unknown): unknown } } })._adapters._date.override({
    formats() {
      return { datetime: 'MMM d, yyyy', millisecond: 'MMM d, yyyy', second: 'MMM d, yyyy', minute: 'MMM d, yyyy', hour: 'MMM d, yyyy', day: 'MMM d', week: 'MMM d', month: 'MMM yyyy', quarter: 'MMM yyyy', year: 'yyyy' };
    },
    parse(value: unknown): unknown {
      if (value == null || value === '') return null;
      if (value instanceof Date) return isNaN(value as unknown as number) ? null : value.getTime();
      if (typeof value === 'number') return value;
      var ts = Date.parse(typeof value === 'string' && value.length === 10 ? value + 'T00:00:00' : value as string);
      return isNaN(ts) ? null : ts;
    },
    format(timestamp: unknown, fmtStr: unknown) {
      var d = new Date(timestamp as number);
      if (fmtStr === 'MMM yyyy') return fmt(d, { month: 'short', year: 'numeric' });
      if (fmtStr === 'MMM d, yyyy') return fmt(d, { month: 'short', day: 'numeric', year: 'numeric' });
      if (fmtStr === 'MMM d') return fmt(d, { month: 'short', day: 'numeric' });
      if (fmtStr === 'yyyy') return fmt(d, { year: 'numeric' });
      if (fmtStr === 'MMM') return fmt(d, { month: 'short' });
      return fmt(d, { month: 'short', day: 'numeric', year: 'numeric' });
    },
    add(timestamp: unknown, amount: unknown, unit: unknown) {
      var d = new Date(timestamp as number);
      switch (unit) {
        case 'millisecond': d.setMilliseconds(d.getMilliseconds() + (amount as number)); break;
        case 'second': d.setSeconds(d.getSeconds() + (amount as number)); break;
        case 'minute': d.setMinutes(d.getMinutes() + (amount as number)); break;
        case 'hour': d.setHours(d.getHours() + (amount as number)); break;
        case 'day': d.setDate(d.getDate() + (amount as number)); break;
        case 'week': d.setDate(d.getDate() + (amount as number) * 7); break;
        case 'month': d.setMonth(d.getMonth() + (amount as number)); break;
        case 'quarter': d.setMonth(d.getMonth() + (amount as number) * 3); break;
        case 'year': d.setFullYear(d.getFullYear() + (amount as number)); break;
      }
      return d.getTime();
    },
    diff(this: { diff(a: unknown, b: unknown, unit: unknown): unknown }, a: unknown, b: unknown, unit: unknown): unknown {
      var ms = (a as number) - (b as number);
      switch (unit) {
        case 'millisecond': return ms;
        case 'second': return ms / 1000;
        case 'minute': return ms / 60000;
        case 'hour': return ms / 3600000;
        case 'day': return ms / 86400000;
        case 'week': return ms / 604800000;
        case 'month': return (new Date(a as number).getFullYear() - new Date(b as number).getFullYear()) * 12 + new Date(a as number).getMonth() - new Date(b as number).getMonth();
        case 'quarter': return (this.diff(a, b, 'month') as number) / 3;
        case 'year': return (this.diff(a, b, 'month') as number) / 12;
        default: return ms;
      }
    },
    startOf(timestamp: unknown, unit: unknown, weekday?: unknown) {
      var d = new Date(timestamp as number);
      switch (unit) {
        case 'second': d.setMilliseconds(0); break;
        case 'minute': d.setSeconds(0, 0); break;
        case 'hour': d.setMinutes(0, 0, 0); break;
        case 'day': d.setHours(0, 0, 0, 0); break;
        case 'week': d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() - (weekday as number || 0) + 7) % 7)); break;
        case 'month': d.setDate(1); d.setHours(0, 0, 0, 0); break;
        case 'quarter': d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0); break;
        case 'year': d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break;
      }
      return d.getTime();
    },
    endOf(this: { add(timestamp: unknown, amount: unknown, unit: unknown): unknown; startOf(timestamp: unknown, unit: unknown): unknown }, timestamp: unknown, unit: unknown) {
      return (this.add(this.startOf(timestamp, unit), 1, unit) as number) - 1;
    }
  });
})();
