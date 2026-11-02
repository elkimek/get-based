import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import crypto from 'node:crypto';
import {PATIENT_PLACEHOLDER, detectSexFromPDF, parsePersonName, parseReportDate, patientPseudonym, redactReportText, reportLanguageHint} from '../js/pii-redaction.js';
import {hmacSha256, sha256} from '../js/pii-pseudonym.js';
import {obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming} from '../js/pii.js';
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
    expect(pageLines(text, `${PATIENT_PLACEHOLDER}  DOB:`)).toHaveLength(4);
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
    expect(pageLines(text, `${PATIENT_PLACEHOLDER}  DOB:`).every(line => line.endsWith('  Patient Report'))).toBe(true);
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
    expect(out).toContain('Pacient Jana Nováková');
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

describe('report-scoped redaction in pii.js', () => {
  let previous = { currentProfile: state.currentProfile, profiles: state.profiles, profileDob: state.profileDob, profileSex: state.profileSex };
  beforeEach(() => localStorage.clear());
  beforeEach(() => { previous = { currentProfile: state.currentProfile, profiles: state.profiles, profileDob: state.profileDob, profileSex: state.profileSex }; });
  afterEach(() => { Object.assign(state, previous); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps repeated values consistent within a report without persisting or reusing a key', () => {
    const writes = vi.spyOn(localStorage, 'setItem');
    const a = obfuscatePDFText(fixture).obfuscated;
    const b = obfuscatePDFText(fixture).obfuscated;
    expect(a).not.toMatch(/quill|vanterpool/i);
    expect(new Set(pageLines(a, 'Patient ID:')).size).toBe(1);
    expect(new Set(pageLines(b, 'Patient ID:')).size).toBe(1);
    expect(pageLines(a, 'Patient ID:')[0]).not.toBe(pageLines(b, 'Patient ID:')[0]);
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('does not request randomness when the report contains no identifiers', () => {
    const randomness = vi.spyOn(globalThis.crypto, 'getRandomValues');
    expect(obfuscatePDFText(results)).toMatchObject({obfuscated: results, replacements: 0});
    expect(randomness).not.toHaveBeenCalled();
  });

  it.each(['plain', 'stream'] as const)('retains one key and captured profile hints through %s model finalization', async mode => {
    state.currentProfile = 'profile-a';
    state.profiles = [{id: 'profile-a', name: 'Nadia Ostrowski'}, {id: 'profile-b', name: 'Other Person'}];
    state.profileDob = '1999-03-14';
    state.profileSex = 'female';
    localStorage.setItem('labcharts-ollama-pii-url', 'http://localhost:11434');
    localStorage.setItem('labcharts-ollama-pii-model', 'privacy-qwen:7b');
    let supplied = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith('/v1/chat/completions')) return Response.json({});
      const body = JSON.parse(String(init?.body)) as {messages: Array<{content: string}>};
      supplied = body.messages[0]!.content.split('TEXT TO PROCESS:\n')[1]!;
      expect(supplied).not.toMatch(/Ostrowski|1999-03-14|PX4471/);
      state.currentProfile = 'profile-b';
      state.profileDob = '1980-01-01';
      state.profileSex = 'male';
      const content = supplied + '\nNadia Ostrowski\nBorn 1999-03-14';
      if (mode === 'plain') return Response.json({choices: [{message: {content}}]});
      return new Response(`data: ${JSON.stringify({choices: [{delta: {content}}]})}\n\ndata: [DONE]\n\n`, {headers: {'Content-Type': 'text/event-stream'}});
    }));
    const input = 'Report for Nadia Ostrowski\nDOB: 1999-03-14\nPatient ID: PX4471\nPatient ID: PX4471\nCollected: 2026-09-30\nGlucose 91 mg/dL';
    const chunks: string[] = [];
    const out = mode === 'plain' ? await sanitizeWithOllama(input) : await sanitizeWithOllamaStreaming(input, chunk => chunks.push(chunk), undefined, () => {});
    const dob = supplied.match(/DOB: (\S+)/)![1];
    expect(out).toBe(supplied + `\nJane Doe\nBorn ${dob}`);
    expect(out).not.toMatch(/Ostrowski|1999-03-14|PX4471/);
    expect(new Set(pageLines(out, 'Patient ID:')).size).toBe(1);
    expect(localStorage.getItem('labcharts-profile-a-pii-pseudonym-key')).toBeNull();
    if (mode === 'stream') expect(chunks.join('')).toContain(supplied);
  });
});

describe('names that are also calendar words', () => {
  it('removes full names like "Jan Novotny" or "May Ortega" without touching month words elsewhere', () => {
    const out = redactReportText('Jmeno: Jan Novotny\nPatient Name: May Ortega\nCollected: May 3, 2026\nORTEGA, MAY', {key: 'k'}).text;
    expect(out).toBe('Jmeno: Jan Novák\nPatient Name: Jan Novák\nCollected: May 3, 2026\nJan Novák');
  });
});

describe('fictional patient names and medical text', () => {
  const run = (input: string) => redactReportText(input, {key: 'synthetic-report-key'}).text;

  it.each([
    ['Jméno: Karel Svoboda\nPohlaví: muž', 'Jan Novák'],
    ['Jméno: Eva Svobodová\nPohlaví: žena', 'Jana Nováková'],
    ['Meno: Martin Kováč\nPohlavie: muž', 'Peter Horváth'],
    ['Meno: Anna Kováčová\nPohlavie: žena', 'Petra Horváthová'],
    ['Patient: Robert Smith\nSex: Male', 'John Doe'],
    ['Patient: Alice Smith\nSex: Female', 'Jane Doe'],
  ])('uses a consistent conventional name for %s', (input, replacement) => {
    const out = run(`=== Page 1 ===\n${input}\n=== Page 2 ===\n${input}`);
    expect(out.split(replacement)).toHaveLength(3);
    expect(out).toBe(`=== Page 1 ===\n${input.replace(/: [^\n]+/, `: ${replacement}`)}\n=== Page 2 ===\n${input.replace(/: [^\n]+/, `: ${replacement}`)}`);
  });

  it('uses profile sex only as a fallback and avoids copying a real namesake', () => {
    expect(patientPseudonym('Patient: Alice Smith', 'female')).toBe('Jane Doe');
    expect(patientPseudonym('Patient: Alice Smith\nSex: Male', 'female')).toBe('John Doe');
    expect(patientPseudonym('Jméno: Jan Novak\nPohlaví: muž')).toBe('Petr Svoboda');
    expect(run('Patient: John Doe')).not.toContain('John Doe');
  });

  it.each([
    ['Alice White', 'White blood cell count 6.1 x10E3/uL 3.4-10.8'],
    ['Jane Free', 'Free T4 1.2 ng/dL 0.8-1.8'],
    ['Ana Sodium', 'Sodium 140 mmol/L 135-145'],
    ['Alice Low', 'Eosinophils 0.5 % Low'],
  ])('preserves the exact clinical row when the patient is %s', (name, row) => {
    expect(run(`Patient: ${name}\n${row}`)).toBe(`Patient: John Doe\n${row}`);
  });

  it('redacts explicit names beside results and retains physician-name collisions in clinical text', () => {
    expect(run('Surname: White  White blood cell count 6.1 x10E3/uL')).toBe('Surname: John Doe  White blood cell count 6.1 x10E3/uL');
    const out = run('Ordering Physician: Sarah Free\nFree T4 1.2 ng/dL');
    expect(out).toMatch(/^Ordering Physician: \[PHYSICIAN-[A-Z2-9]{4}\]\nFree T4 1\.2 ng\/dL$/);
  });

  it('redacts short and lowercase separately labeled names without changing medical abbreviations', () => {
    expect(run('Surname: Li\nFirst Name: Bo\nBo: 5.2 mg/dL')).toBe('Surname: John Doe\nFirst Name: John Doe\nBo: 5.2 mg/dL');
    expect(run('Surname: li  First Name: bo')).toBe('Surname: John Doe  First Name: John Doe');
    expect(run('Příjmení: Li\nJméno: Bo')).toBe('Příjmení: Jan Novák\nJméno: Jan Novák');
  });

  it('redacts untitled and lowercase physicians and whitespace-separated addresses', () => {
    expect(run('Ordering Sarah Williams')).not.toMatch(/Sarah|Williams/);
    expect(run('Physician: sarah williams')).not.toMatch(/sarah|williams/);
    expect(run('Address Hlavni 42, Praha')).toMatch(/^Address \[ADDRESS-[A-Z2-9]{4}\]$/);
    expect(run('Adresa Hlavní 42, Praha')).toMatch(/^Adresa \[ADDRESS-[A-Z2-9]{4}\]$/);
  });

  it('keeps numeric result rows and test names after empty identifying fields', () => {
    const input = 'Patient ID:\n12345 91 mg/dL\nAddress:\nGlucose 91 mg/dL\nPatient:\nFerritin 120 ng/mL';
    expect(run(input)).toBe(input);
  });

  it('keeps a labeled collection date even when it equals the date of birth', () => {
    const out = run('DOB: 2026-09-30\nCollected: 2026-09-30\nGlucose 91 mg/dL');
    expect(out).toContain('Collected: 2026-09-30\nGlucose 91 mg/dL');
    expect(out).not.toContain('DOB: 2026-09-30');
  });
});

describe('Slovak redaction and report-language hints', () => {
  const run = (input: string) => redactReportText(input, {key: 'synthetic-slovak-report-key'}).text;

  it.each([
    ['Jméno: Karel Svoboda', 'cs'],
    ['Jmeno: Karel Svoboda', 'cs'],
    ['Příjmení: Svoboda', 'cs'],
    ['Pohlaví: žena', 'cs'],
    ['Meno: Martin Kováč', 'sk'],
    ['Priezvisko: Kováč', 'sk'],
    ['Pohlavie: žena', 'sk'],
    ['Dátum odberu: 15.01.2026', 'sk'],
    ['Datum narodenia: 15.01.1990', 'sk'],
    ['Pacient: Martin Kováč', null],
    ['Rodné číslo: 900115/1234', null],
    ['Meno: Martin Kováč\nJméno: Karel Svoboda', null],
    ['Patient: Robert Smith', null],
    ['Patient: Meno Smith', null],
    ['Patient: Dátum Smith', null],
  ] as const)('uses specific language clues in %s', (input, language) => {
    expect(reportLanguageHint(input)).toBe(language);
  });

  it('redacts the previously missed Slovak fields without any profile-name hint', () => {
    const input = 'Meno: Martin Kováč\nPriezvisko: Kováč\nPohlavie: muž\nDátum odberu: 15.01.2026\nGlukóza 5.2 mmol/L 3.9-5.6';
    expect(run(input)).toBe('Meno: Peter Horváth\nPriezvisko: Peter Horváth\nPohlavie: muž\nDátum odberu: 15.01.2026\nGlukóza 5.2 mmol/L 3.9-5.6');
  });

  it.each([
    'Meno a priezvisko: Anna Kováčová',
    'Priezvisko a meno: Kováčová, Anna',
    'Meno pacienta: Anna Kováčová',
    'Meno Anna Kováčová',
    'Meno: anna kováčová',
  ])('handles combined, whitespace and lowercase Slovak name fields: %s', field => {
    const out = run(`${field}\nPohlavie: žena\nPacient: Anna Kováčová`);
    expect(out).not.toMatch(/Kováčová|Anna/iu);
    expect(out.match(/Petra Horváthová/g)).toHaveLength(2);
  });

  it('bounds separately labeled names and Slovak sex on the same line', () => {
    expect(run('Meno: Anna Priezvisko: Kováčová Pohlavie: žena')).toBe('Meno: Petra Horváthová Priezvisko: Petra Horváthová Pohlavie: žena');
    expect(run('Meno: Bo Priezvisko: Li Pohlavie: muž')).toBe('Meno: Peter Horváth Priezvisko: Peter Horváth Pohlavie: muž');
  });

  it('uses reported Slovak sex before profile sex, with or without accents', () => {
    expect(detectSexFromPDF('Pohlavie: žena')).toBe('female');
    expect(detectSexFromPDF('Pohlavie: zena')).toBe('female');
    expect(detectSexFromPDF('Pohlavie: M')).toBe('male');
    expect(patientPseudonym('Meno: Anna Kováčová\nPohlavie: žena', 'male')).toBe('Petra Horváthová');
    expect(patientPseudonym('Meno: Martin Kováč\nPohlavie: muž', 'female')).toBe('Peter Horváth');
    expect(patientPseudonym('Meno: Anna Kováčová', 'female')).toBe('Petra Horváthová');
  });

  it('does not reuse the original Slovak name when it equals a fixed alias', () => {
    expect(patientPseudonym('Meno: Peter Horvath\nPohlavie: muž')).toBe('Ján Novák');
    expect(patientPseudonym('Meno: Petra Horváthová\nPohlavie: žena')).toBe('Jana Nováková');
  });

  it('keeps name removal independent of an unknown or mixed language hint', () => {
    expect(run('Pacient: Martin Kováč')).toBe('Pacient: John Doe');
    expect(run('Meno: Martin Kováč\nJméno: Karel Svoboda')).toBe('Meno: John Doe\nJméno: John Doe');
  });

  it('handles Slovak DOB, clinician and address fields without changing results or draw dates', () => {
    const input = 'Meno: Anna Kováčová\nPohlavie: žena\nDátum narodenia: 15.01.1990\nLekár: MUDr. Ivana Malá\nBydlisko: Hlavná 42, Nitra\nDátum odberu: 20260115\nGlukóza 5.2 mmol/L 3.9-5.6';
    const out = run(input);
    expect(out).not.toMatch(/Anna|Kováčová|15\.01\.1990|Ivana|Malá|Hlavná|Nitra/u);
    expect(out).toContain('Meno: Petra Horváthová');
    expect(out).toMatch(/Dátum narodenia: \d{2}\.\d{2}\.1990/);
    expect(out).toMatch(/Lekár: \[PHYSICIAN-[A-Z2-9]{4}\]/);
    expect(out).toMatch(/Bydlisko: \[ADDRESS-[A-Z2-9]{4}\]/);
    expect(out).toContain('Dátum odberu: 20260115\nGlukóza 5.2 mmol/L 3.9-5.6');
  });

  it('leaves clinical rows after empty Slovak identity fields intact', () => {
    const input = 'Meno:\nGlukóza 5.2 mmol/L\nPriezvisko:\nKreatinín 80 µmol/L\nDátum narodenia:\nFerritín 120 ng/mL';
    expect(run(input)).toBe(input);
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

  it('redacts titled physician names after a label without a colon but keeps headings', () => {
    const out = redactReportText('Ordering Dr. Sarah Williams\nOrdering Physician\nGlucose 91 mg/dL', {key: 'k', profileName: 'Demo'}).text;
    expect(out).not.toContain('Williams');
    expect(out).toContain('Ordering Physician');
    expect(out).toContain('Glucose 91 mg/dL');
  });
  it('keeps flags, collection dates; redacts odd DOB formats and spaced Czech addresses', () => {
    const o = (t: string) => redactReportText(t, {key: 'k', profileName: 'Demo'}).text;
    expect(o('DOB: 03/14/99')).not.toContain('03/14/99');
    expect(o('DOB: 14 March 1999')).not.toContain('March 1999');
    expect(o('Adresa Hlavní 42, Praha')).not.toContain('Hlavní');
    const flag = o('Patient: Jane Low\nGlucose 60 mg/dL Low');
    expect(flag).toContain('60 mg/dL Low');
    expect(flag).not.toContain('Jane');
    expect(o('Datum odběru: 20260930')).toContain('20260930');
  });

  it('keeps unrelated lines when labels are empty or share a line with identifiers', () => {
    const dob = redactReportText('Date of Birth\nGlucose 91 mg/dL', {key: 'k'}).text;
    expect(dob).toContain('Glucose 91 mg/dL');
    const sur = redactReportText('Patient: Jane Low\nSurname: Low  Age: 27', {key: 'k'}).text;
    expect(sur).not.toMatch(/Surname: Low/);
    const ord = redactReportText('Collected: 20260930  Order: 12345678', {key: 'k'}).text;
    expect(ord).toContain('Collected: 20260930');
    expect(ord).not.toContain('12345678');
  });

  it('matches the exact review examples for empty DOB labels, label surnames and nearby order numbers', () => {
    const dob = redactReportText('Date of Birth\nGlucose 91 mg/dL', {key: 'k'}).text;
    expect(dob).toBe('Date of Birth\nGlucose 91 mg/dL');
    const sur = redactReportText('Surname: Low  Age: 27', {key: 'k'}).text;
    expect(sur).not.toMatch(/Surname:\s*Low\b/);
    const unitSur = redactReportText('Patient: Jane Low\nSurname: Low  Glucose 60 mg/dL', {key: 'k'}).text;
    expect(unitSur).not.toMatch(/Surname:\s*Low\b/);
    expect(unitSur).toContain('60 mg/dL');
    const flag = redactReportText('Patient: Jane Low\nGlucose 60 mg/dL Low', {key: 'k'}).text;
    expect(flag).toContain('60 mg/dL Low');
    const ord = redactReportText('Collected: 2026-09-30  Order: 12345678', {key: 'k'}).text;
    expect(ord).toContain('2026-09-30');
    expect(ord).not.toContain('12345678');
    const compactOrd = redactReportText('Collected: 20260930  Order: 20260930', {key: 'k'}).text;
    expect(compactOrd).toMatch(/^Collected: 20260930 {2}Order: (?!20260930)\d{8}$/);
    expect(redactReportText('Collected  Order: 20260930', {key: 'k'}).text).not.toContain('20260930');
    expect(redactReportText('Collected: 20261399', {key: 'k'}).text).not.toContain('20261399');
    expect(redactReportText('Datum odběru: 20260930', {key: 'k'}).text).toContain('20260930');
    expect(redactReportText('Collection date: 20260930', {key: 'k'}).text).toContain('20260930');
  });

  it('removes every given name after a comma, for patients and physicians', () => {
    const out = redactReportText('Patient Name: Smith, Jane Anne Marie\nLater: Jane Anne Marie Smith and Jane Marie Smith', {key: 'k'}).text;
    expect(out).not.toMatch(/Smith|Jane|Anne|Marie/);
    const doc = redactReportText('Ordering Physician: Brown, Robert James Lee  Glucose 91 mg/dL', {key: 'k'}).text;
    expect(doc).not.toMatch(/Brown|Robert|James|Lee\b/);
    expect(doc).toContain('Glucose 91 mg/dL');
  });
});
