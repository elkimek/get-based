import { describe, expect, it } from 'vitest';
import { parseAppleHealthBlob, parseAppleHealthXml } from '../js/wearables-apple-health-parser.js';

const xml = `<HealthData>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-09-28 23:30:00 +0200" value="48" unit="ms"/>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-09-28 02:30:00 +0200" value="72" unit="ms"/>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-09-28 11:30:00 +0200" value="62" unit="ms"/>
<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-09-28 10:00:00 +0200" value="200" unit="count" sourceName="Wátch 😀"/>
<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-09-28 11:00:00 +0200" value="300" unit="count" sourceName="Wátch 😀"/>
<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-09-28 11:00:00 +0200" value="400" unit="count" sourceName="Phone"/>
<Record type="HKQuantityTypeIdentifierBodyMass" startDate="2026-09-28 11:00:00 +0200" value="180" unit="lb"/>
<Record type="HKQuantityTypeIdentifierOxygenSaturation" startDate="2026-09-28 11:00:00 +0200" value="0.98" unit="1"/>
</HealthData>`;

function chunkedBlob(text: string, chunkSize: number): Blob {
  const bytes = new TextEncoder().encode(text);
  return new class extends Blob {
    override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
      let offset = 0;
      return new ReadableStream({
        pull(controller) {
          if (offset >= bytes.length) { controller.close(); return; }
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
        },
      });
    }
  }([text]);
}

describe('Apple Health streaming boundaries', () => {
  it.each([1, 2, 7, 31])('retains Unicode source identity and canonical windows across %i-byte chunks', async chunkSize => {
    const rows = await parseAppleHealthBlob(chunkedBlob(xml, chunkSize));
    expect(rows).toEqual(parseAppleHealthXml(xml));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'apple_health', date: '2026-09-28', hrv_sdnn: 60, hrv_day: 62, steps: 500, spo2_avg: 98 });
    expect(rows[0]!.weight).toBe(81.65);
  });

  it('propagates a stream failure instead of returning partial import rows', async () => {
    const failure = new Error('reader failed');
    const blob = new class extends Blob {
      override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
        return new ReadableStream({ start(controller) { controller.error(failure); } });
      }
    }([xml]);
    await expect(parseAppleHealthBlob(blob)).rejects.toBe(failure);
  });

  it('propagates a failed progress callback to the import caller', async () => {
    const failure = new Error('progress failed');
    await expect(parseAppleHealthBlob(chunkedBlob(xml, 7), () => { throw failure; })).rejects.toBe(failure);
  });
});
