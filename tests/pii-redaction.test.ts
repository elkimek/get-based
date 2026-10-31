import {beforeEach, describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import {PATIENT_PLACEHOLDER, parsePersonName, parseReportDate, redactReportText} from '../js/pii-redaction.js';
import {hmacSha256, sha256} from '../js/pii-pseudonym.js';
import {getPIIPseudonymKey, obfuscatePDFText} from '../js/pii.js';
import {state} from '../js/state.js';

// Every identifier below is synthetic (fictional names, 555 phone numbers, made-up IDs).
const header = (n: number) => [
  `=== Page ${n} ===`,
  'Quill, Avery  DOB: 03/14/1999  Patient Report',
  'Patient ID: PX4471  Age: 27  Account Number: 30458812',
  'Specimen ID: 271-034-5521-0  Sex: Male  Ordering Physician: T VANTERPOOL',
  'Date Collected: 09/30/2026  Date Received: 09/30/2026  Date Reported: 10/02/2026',
].join('\n');
const results = [
  'Glucose 91 mg/dL 70-99',
  'Ferritin 120 ng/mL 30-400',
  'WBC 6.1 x10E3/uL 3.4-10.8',
].join('\n');
const details = [
  'Patient Details',
  'Quill, Avery',
  'AVERY QUILL',
  'Avery J. Quill',
  'Phone: (404) 555-0182',
  'Date of Birth: 03/14/1999',
  'Age: 27',
  '742 Evergreen Terrace Apt 3',
  'Springfield, GA 30301',
  'Physician Details',
  'Ordering: T VANTERPOOL',
  'Lakeside Family Medicine',
  '1200 Harbor Blvd Ste 210',
  'Riverton, GA 30305',
  'Phone: 770-555-0143',
  'Specimen Details',
  'Specimen ID: 271-034-5521-0',
].join('\n');
const fixture = [1, 2, 3, 4].map(n => `${header(n)}\n${results}`).join('\n') + '\n' + details;
const pageLines = (text: string, prefix: string) => text.split('\n').filter(line => line.startsWith(prefix));

describe('deterministic report redaction', () => {
  const {text, replacements} = redactReportText(fixture, {key: 'test-key-A'});

  it('a) removes the patient name in every written form', () => {
    expect(text).not.toMatch(/quill/i);
    expect(text).not.toMatch(/avery/i);
    expect(text.split(PATIENT_PLACEHOLDER).length - 1).toBeGreaterThanOrEqual(7);
    expect(pageLines(text, '[PATIENT]  DOB:')).toHaveLength(4);
  });

  it('a) uses the profile name as a hint when it looks like a full name', () => {
    const out = redactReportText('Report for Nadia Ostrowski\nGlucose 91 mg/dL', {key: 'k', profileName: 'nadia ostrowski'}).text;
    expect(out).toBe(`Report for ${PATIENT_PLACEHOLDER}\nGlucose 91 mg/dL`);
    const single = redactReportText('Test Glucose 91 mg/dL', {key: 'k', profileName: 'Test'}).text;
    expect(single).toBe('Test Glucose 91 mg/dL');
    const label = redactReportText('=== Page 1 ===\nSynthetic EMF report Bedroom 28 V/m and 45 nT.\n', {key: 'k', profileName: 'Synthetic EMF profile'}).text;
    expect(label).toBe('=== Page 1 ===\nSynthetic EMF report Bedroom 28 V/m and 45 nT.\n');
  });

  it('resolves the key only when something is replaced', () => {
    let calls = 0;
    const key = () => { calls++; return 'lazy-key'; };
    expect(redactReportText('Glucose 91 mg/dL\n', {key}).text).toBe('Glucose 91 mg/dL\n');
    expect(calls).toBe(0);
    const out = redactReportText('Phone: (404) 555-0134\nTel: (404) 555-0199', {key});
    expect(out.replacements).toBe(2);
    expect(calls).toBe(1);
    expect(out.text).toBe(redactReportText('Phone: (404) 555-0134\nTel: (404) 555-0199', {key: 'lazy-key'}).text);
  });

  it('b) keeps the real birth year and age, replaces month/day identically everywhere', () => {
    expect(text).not.toContain('03/14/1999');
    const dobs = [...text.matchAll(/(?:DOB|Date of Birth): (\d{2}\/\d{2}\/\d{4})/g)].map(match => match[1]);
    expect(dobs).toHaveLength(5);
    expect(new Set(dobs).size).toBe(1);
    expect(dobs[0]).toMatch(/\/1999$/);
    expect(text.match(/Age: 27/g)).toHaveLength(5);
  });

  it('b) treats the profile DOB as the DOB in any format and keeps report dates', () => {
    const out = redactReportText('Born 1999-03-14 (14.03.1999)\nCollected: 2026-09-30', {key: 'k', profileDob: '1999-03-14'}).text;
    expect(out).not.toContain('1999-03-14');
    expect(out).not.toContain('14.03.1999');
    expect(out).toMatch(/Born 1999-\d{2}-\d{2} \(\d{2}\.\d{2}\.1999\)/);
    expect(out).toContain('Collected: 2026-09-30');
    const [iso, czech] = [out.match(/1999-(\d{2})-(\d{2})/)!, out.match(/(\d{2})\.(\d{2})\.1999/)!];
    expect([iso[1], iso[2]]).toEqual([czech[2], czech[1]]);
  });

  it('c) maps identifiers, phones, addresses and physicians consistently across pages', () => {
    const idLines = pageLines(text, 'Patient ID:');
    expect(new Set(idLines).size).toBe(1);
    expect(idLines[0]).not.toContain('PX4471');
    expect(idLines[0]).not.toContain('30458812');
    expect(idLines[0]).toMatch(/^Patient ID: [A-Z]{2}\d{4}  Age: 27  Account Number: \d{8}$/);
    const specimens = [...text.matchAll(/Specimen ID: (\S+)/g)].map(match => match[1]);
    expect(specimens).toHaveLength(5);
    expect(new Set(specimens).size).toBe(1);
    expect(specimens[0]).toMatch(/^\d{3}-\d{3}-\d{4}-\d$/);
    expect(specimens[0]).not.toBe('271-034-5521-0');
    const physicians = new Set(text.match(/\[PHYSICIAN-[A-Z0-9]{4}\]/g));
    expect(physicians.size).toBe(1);
    expect(text).not.toMatch(/vanterpool/i);
    expect(text).not.toContain('555-0182');
    expect(text).not.toContain('555-0143');
    expect(text).not.toMatch(/Evergreen|Harbor Blvd|Springfield|Riverton|30301|30305/);
    expect(text).toMatch(/\[ADDRESS-[A-Z0-9]{4}\]/);
    expect(text).toMatch(/\[LOCATION-[A-Z0-9]{4}\]/);
    expect(replacements).toBeGreaterThan(20);
  });

  it('c) is stable across reports for the same key and differs for another key', () => {
    const secondReport = `${header(1)}\n${results}`;
    const again = redactReportText(secondReport, {key: 'test-key-A'}).text;
    expect(again.split('\n').slice(1, 4)).toEqual(text.split('\n').slice(1, 4));
    const otherKey = redactReportText(secondReport, {key: 'test-key-B'}).text;
    expect(otherKey.split('\n')[2]).not.toBe(again.split('\n')[2]);
  });

  it('d) never treats labels as values and keeps header structure and results', () => {
    expect(pageLines(text, '[PATIENT]  DOB:').every(line => line.endsWith('  Patient Report'))).toBe(true);
    for (const label of ['Patient Details', 'Physician Details', 'Specimen Details', '=== Page 4 ===']) expect(text).toContain(label);
    expect(pageLines(text, 'Specimen ID:').filter(line => line.includes('Sex: Male  Ordering Physician: [PHYSICIAN-'))).toHaveLength(4);
    expect(text.match(/Date Collected: 09\/30\/2026  Date Received: 09\/30\/2026  Date Reported: 10\/02\/2026/g)).toHaveLength(4);
    expect(text.match(new RegExp(results.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(4);
    expect(text.split('\n')).toHaveLength(fixture.split('\n').length);
  });

  it('keeps Czech reports working with neutral placeholders', () => {
    const out = redactReportText([
      'Jméno: Karel Svoboda', 'Rodné číslo: 856115/1234', 'Adresa: Hlavní 42, Praha',
      'Lékař: MUDr. Kopecká', 'Datum odběru: 15.01.2024', 'Pacient Karel Svoboda', 'Glukóza 5.2 mmol/L 3.9-5.6',
    ].join('\n'), {key: 'k'}).text;
    expect(out).not.toMatch(/Svoboda|856115\/1234|Hlavní|Kopecká/);
    expect(out).toContain('Datum odběru: 15.01.2024');
    expect(out).toContain('Glukóza 5.2 mmol/L 3.9-5.6');
    expect(out).toContain(`Pacient ${PATIENT_PLACEHOLDER}`);
  });

  it('parses names and dates in the formats reports use', () => {
    expect(parsePersonName('Quill, Avery J')).toMatchObject({first: 'Avery', last: 'Quill', middle: 'J'});
    expect(parsePersonName('Dr. Sarah Lin  DOB: 1/2/1990')).toMatchObject({first: 'Sarah', last: 'Lin'});
    expect(parsePersonName('Report')).toBeNull();
    expect(parseReportDate('03/14/1999')).toEqual({y: 1999, m: 3, d: 14});
    expect(parseReportDate('14.03.1999')).toEqual({y: 1999, m: 3, d: 14});
    expect(parseReportDate('Mar 14, 1999')).toEqual({y: 1999, m: 3, d: 14});
    expect(parseReportDate('13/40/1999')).toBeNull();
  });
});

describe('keyed digest', () => {
  it('matches node crypto for SHA-256 and HMAC-SHA256', () => {
    const encoder = new TextEncoder();
    for (const sample of ['', 'abc', 'x'.repeat(200)]) {
      expect(Buffer.from(sha256(encoder.encode(sample))).toString('hex')).toBe(crypto.createHash('sha256').update(sample).digest('hex'));
      expect(Buffer.from(hmacSha256(encoder.encode('key'.repeat(30)), encoder.encode(sample))).toString('hex'))
        .toBe(crypto.createHmac('sha256', 'key'.repeat(30)).update(sample).digest('hex'));
    }
  });
});

describe('profile-scoped key in pii.js', () => {
  beforeEach(() => localStorage.clear());
  it('persists one random key per profile and uses it for obfuscatePDFText', () => {
    const first = getPIIPseudonymKey('profile-a');
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(getPIIPseudonymKey('profile-a')).toBe(first);
    expect(getPIIPseudonymKey('profile-b')).not.toBe(first);
    expect(localStorage.getItem('labcharts-profile-a-pii-pseudonym-key')).toBe(first);
    const previous = state.currentProfile;
    try {
      state.currentProfile = 'profile-a';
      const a = obfuscatePDFText(fixture).obfuscated;
      expect(obfuscatePDFText(fixture).obfuscated).toBe(a);
      expect(a).not.toMatch(/quill|vanterpool/i);
      state.currentProfile = 'profile-b';
      expect(obfuscatePDFText(fixture).obfuscated).not.toBe(a);
    } finally {
      state.currentProfile = previous;
    }
  });
});

describe('names that are also calendar words', () => {
  it('removes full names like "Jan Novotny" or "May Ortega" without touching month words elsewhere', () => {
    const out = redactReportText('Jmeno: Jan Novotny\nPatient Name: May Ortega\nCollected: May 3, 2026\nORTEGA, MAY', {key: 'k'}).text;
    expect(out).toBe(`Jmeno: ${PATIENT_PLACEHOLDER}\nPatient Name: ${PATIENT_PLACEHOLDER}\nCollected: May 3, 2026\n${PATIENT_PLACEHOLDER}`);
  });
});

describe('review findings on PR #1699', () => {
  const run = (input: string, extra: Record<string, unknown> = {}) => redactReportText(input, {key: 'k', profileName: 'Demo', ...extra}).text;

  it('removes names after English labels without a colon, but keeps headings', () => {
    expect(run('Patient Jane Smith\nGlucose 91 mg/dL')).toBe(`Patient ${PATIENT_PLACEHOLDER}\nGlucose 91 mg/dL`);
    expect(run('Name Jane Smith  DOB: 1990')).not.toMatch(/Jane|Smith/);
    expect(run('Patient Report\nPatient Details\nPatient Service Center')).toBe('Patient Report\nPatient Details\nPatient Service Center');
  });

  it('removes lowercase full names behind an explicit label', () => {
    expect(run('Patient: jane smith\nGlucose 91 mg/dL')).toBe(`Patient: ${PATIENT_PLACEHOLDER}\nGlucose 91 mg/dL`);
    expect(run('Name: unknown\nGlucose 91 mg/dL')).toBe('Name: unknown\nGlucose 91 mg/dL');
  });

  it('replaces uppercase birth dates and keeps their year and case', () => {
    const out = run('DOB: JAN 2, 1990\nSeen JAN 2, 1990');
    expect(out).not.toContain('JAN 2, 1990');
    expect(out).toMatch(/DOB: [A-Z]{3} \d{1,2}, 1990/);
    const [first, second] = out.split('\n');
    expect(first!.slice(5)).toBe(second!.slice(5));
  });

  it('keeps the next line intact when an ID field is empty', () => {
    expect(run('Patient ID:\nGlucose 91 mg/dL')).toContain('Glucose 91 mg/dL');
  });

  it('replaces letters-only and dotted labeled IDs completely', () => {
    expect(run('Patient ID: ABCDEF  Sex: F')).not.toContain('ABCDEF');
    const dotted = run('MRN: 12.34_56A');
    expect(dotted).not.toMatch(/12|34|56/);
    expect(dotted).toMatch(/^MRN: \d\d\.\d\d_\d\d[A-Z]$/);
    expect(run('Specimen Type: Serum')).toBe('Specimen Type: Serum');
  });

  it('gives a labeled and an unlabeled birth number the same replacement', () => {
    const out = run('Rodné číslo: 856115/1234\nPacient 856115/1234');
    const [labeled, bare] = out.split('\n');
    const value = labeled!.split(': ')[1]!;
    expect(value).not.toBe('856115/1234');
    expect(value).toMatch(/^85(5[1-9]|6[0-2])\d{2}\/\d{4}$/);
    expect(bare).toContain(value);
  });

  it('leaves pH values alone and keeps numbers after a phone number', () => {
    expect(run('pH: 7.40 7.35-7.45')).toBe('pH: 7.40 7.35-7.45');
    const out = run('Phone: 404 555 0182 7.40 120\nPh: 770-555-0143');
    expect(out).toMatch(/^Phone: \[PHONE-[A-Z2-9]{4}\] 7\.40 120\nPh: \[PHONE-[A-Z2-9]{4}\]$/);
  });

  it('does not re-replace values an earlier pass produced', () => {
    const input = 'DOB: 03/14/1999\nPatient ID: PX4471';
    const first = redactReportText(input, {key: 'k'});
    const second = redactReportText(first.text, {key: 'k', preserve: first.produced});
    expect(second.text).toBe(first.text);
    expect(second.replacements).toBe(0);
  });
});
