// pii-redaction.ts — deterministic local redaction of lab-report text.
//
// Every replacement is derived from a keyed digest of the original value, so a
// value maps to the same replacement on every page and in every report that
// uses the same key (one key per profile). Patient names are removed outright;
// dates of birth keep their real year; labels are never treated as values.

import { createPseudonymDigest } from './pii-pseudonym.js';
import type { PseudonymFn } from './pii-pseudonym.js';

export interface RedactionContext {
  /** Per-profile secret, or a getter called only once a replacement is needed. Same key → same replacements. */
  readonly key: string | (() => string);
  /** Profile display name; used as a patient-name hint only when it looks like a full name. */
  readonly profileName?: string | null | undefined;
  /** Profile date of birth (YYYY-MM-DD); every occurrence in the report is treated as the DOB. */
  readonly profileDob?: string | null | undefined;
  /** Replacements an earlier pass already produced; kept verbatim so a second pass cannot re-replace them. */
  readonly preserve?: Iterable<string> | undefined;
}

export interface RedactionResult { readonly text: string; readonly replacements: number; readonly produced: readonly string[]; }

export const PATIENT_PLACEHOLDER = '[PATIENT]';

interface Person { first: string; last: string; middle: string; raw: string; }
interface ParsedDate { y: number; m: number; d: number; }

const L = '\\p{L}';
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';
const NAME_TOKEN_RE = /^[\p{L}][\p{L}'’.-]*,?$/u;
const TITLE_RE = /^(?:dr|mudr|mddr|md|m\.d|do|mr|mrs|ms|miss|ing|bc|mgr|phd|prof|np|pa|pa-c|dnp|rn|fnp|fnp-c)\.?,?$/i;
// Words that are report vocabulary, never parts of a person's name.
const NON_NAME_WORDS = new Set([
  'patient', 'report', 'details', 'detail', 'specimen', 'physician', 'doctor', 'provider', 'ordering', 'referring',
  'date', 'dob', 'birth', 'sex', 'male', 'female', 'age', 'account', 'number', 'id', 'phone', 'fax', 'address',
  'collected', 'received', 'reported', 'entered', 'final', 'result', 'results', 'flag', 'units', 'unit', 'reference',
  'interval', 'range', 'test', 'tests', 'lab', 'labs', 'page', 'name', 'status', 'npi', 'clinical', 'info', 'information',
  'fasting', 'yes', 'no', 'not', 'the', 'and', 'for', 'of', 'mrn', 'acct', 'control', 'requisition', 'accession',
  'default', 'profile', 'service', 'center', 'centre', 'copy', 'portal', 'summary', 'history', 'instructions', 'education',
  'demographics', 'identification', 'signature', 'consent', 'location', 'value', 'values', 'type', 'source', 'comments', 'notes',
  'unknown', 'none', 'n/a', 'provided', 'available', 'redacted', 'anonymous', 'withheld', 'on', 'file', 'is', 'to', 'be',
  'pohlaví', 'pohlavi', 'věk', 'vek', 'datum', 'narození', 'narozeni', 'adresa', 'lékař', 'lekar', 'pacient', 'jméno', 'jmeno',
]);
// Real first names that are also common report words: replaced only inside full-name forms, never standalone.
const STANDALONE_DENY = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'will', 'mark', 'iron', 'bill',
]);
// Profile names that are labels ("Synthetic EMF profile", "My labs") rather than a person.
const PROFILE_LABEL_WORDS = new Set([
  'profile', 'profiles', 'synthetic', 'demo', 'sample', 'example', 'default', 'main', 'primary', 'personal', 'family',
  'my', 'me', 'mine', 'our', 'self', 'kid', 'kids', 'child', 'baby', 'mom', 'dad', 'wife', 'husband', 'partner', 'unrelated', 'keep',
]);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR';
const STREET_SUFFIX = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Parkway|Pkwy|Place|Pl|Circle|Cir|Highway|Hwy|Terrace|Ter|Trail|Trl|Square|Sq|Loop|Pike|Plaza|Plz';
const UNIT_KEYWORDS = /\b(mmol|µmol|µkat|umol|ukat|g\/l|mg\/l|ng\/l|µg|ug|mU\/l|pmol|nmol|ml\/s|fL|pg|×10|10\^|u\/l|iu\/l|%|sec|s\/1|mg\/dL|ng\/dL|mIU\/mL|mEq\/L|mcg|cells\/uL|thou\/uL|mill\/uL|x10E\d)\b/i;
const NEXT_LABEL_RE = /\s{2,}|\t|\s+(?:DOB|D\.O\.B|Date|Sex|Gender|Age|Phone|Tel|Fax|Email|Patient|Account|Acct|Specimen|Accession|Control|MRN|ID|NPI|Address|Physician|Ordering|Referring|Doctor|Provider|Collected|Received|Reported|Pohlav[ií]|V[ěe]k|Datum|Adresa|Rodn[ée]|L[ée]ka[řr])\b[^:\n]{0,20}:/iu;
const MAX_SPANS = 0xF8FF - 0xE100;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DATE_SOURCE = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\.\s\d{1,2}\.\s\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})`;
const DOB_LABEL_SOURCE = String.raw`(?:DOB|D\.O\.B\.?|date\s+of\s+birth|birth\s*date|datum\s+narozen[ií]|narozen[ií]?|nar\.)`;

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function parseReportDate(raw: string): ParsedDate | null {
  const value = raw.trim();
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, m: number, d: number;
  if (match) { y = +match[1]!; m = +match[2]!; d = +match[3]!; }
  else if ((match = value.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/))) { d = +match[1]!; m = +match[2]!; y = +match[3]!; }
  else if ((match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) {
    const a = +match[1]!, b = +match[2]!;
    y = +match[3]!;
    if (a > 12) { d = a; m = b; } else { m = a; d = b; }
  } else if ((match = value.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    m = MONTHS.indexOf(match[1]!.toLowerCase()) + 1;
    d = +match[2]!; y = +match[3]!;
    if (m === 0) return null;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1850 || y > 2200) return null;
  return { y, m, d };
}

/** Renders month/day into the same textual shape as `raw` (separator, order, padding). */
function formatLike(raw: string, date: ParsedDate): string {
  const pad = (n: number, like: string | undefined) => (like && like.length === 2 ? String(n).padStart(2, '0') : String(n));
  let match = raw.match(/^(\d{4})(-)(\d{1,2})-(\d{1,2})$/);
  if (match) return `${date.y}-${pad(date.m, match[3])}-${pad(date.d, match[4])}`;
  if ((match = raw.match(/^(\d{1,2})(\.\s?)(\d{1,2})\.(\s?)(\d{4})$/))) return `${pad(date.d, match[1])}${match[2]}${pad(date.m, match[3])}.${match[4]}${date.y}`;
  if ((match = raw.match(/^(\d{1,2})([/-])(\d{1,2})[/-](\d{4})$/))) {
    const dayFirst = +match[1]! > 12;
    return dayFirst
      ? `${pad(date.d, match[1])}${match[2]}${pad(date.m, match[3])}${match[2]}${date.y}`
      : `${pad(date.m, match[1])}${match[2]}${pad(date.d, match[3])}${match[2]}${date.y}`;
  }
  if ((match = raw.match(/^([A-Za-z]{3})([A-Za-z]*)(\.?)\s+\d{1,2}(,?)\s+\d{4}$/))) {
    const full = MONTH_NAMES[date.m - 1]!;
    const name = match[2] ? full : full.slice(0, 3);
    const upper = /^[A-Z]+$/.test(match[1]! + match[2]!);
    return `${upper ? name.toUpperCase() : name}${match[3]} ${date.d}${match[4]} ${date.y}`;
  }
  return raw;
}

function dateKey(date: ParsedDate) { return `${date.y}-${date.m}-${date.d}`; }

/** Splits a labeled value at a column gap, tab, or the next "Label:" so neighbouring fields survive. */
function segmentValue(rest: string) {
  const gap = rest.search(NEXT_LABEL_RE);
  return gap === -1 ? rest : rest.slice(0, gap);
}

/** Parses a person name at the start of `value`; returns null when it does not look like one. */
export function parsePersonName(value: string, options: { allowLowercase?: boolean; minTokens?: number } = {}): Person | null {
  const tokens = value.trim().split(/\s+/);
  const kept: string[] = [];
  const raw: string[] = [];
  for (const token of tokens) {
    if (kept.length >= 4 || !token || token.endsWith(':') || /\d/.test(token)) break;
    if (!NAME_TOKEN_RE.test(token)) break;
    if (TITLE_RE.test(token)) { raw.push(token); continue; }
    if (NON_NAME_WORDS.has(token.replace(/[,.]$/, '').toLowerCase())) break;
    kept.push(token);
    raw.push(token);
  }
  if (kept.length === 0 || kept.length < (options.minTokens ?? 1)) return null;
  // Lowercase values are accepted only behind an explicit label, and only as a full name.
  if (!/^\p{Lu}/u.test(kept[0]!) && !(options.allowLowercase && kept.length >= 2)) return null;
  const clean = (token: string) => token.replace(/[,.]+$/, '');
  const commaIndex = kept.findIndex(token => token.endsWith(','));
  let first = '', last = '', middle = '';
  if (commaIndex >= 0 && commaIndex < kept.length - 1) {
    last = kept.slice(0, commaIndex + 1).map(clean).join(' ');
    first = clean(kept[commaIndex + 1]!);
    middle = kept[commaIndex + 2] ? clean(kept[commaIndex + 2]!) : '';
  } else if (kept.length === 1) {
    last = clean(kept[0]!);
  } else {
    first = clean(kept[0]!);
    last = clean(kept[kept.length - 1]!);
    middle = kept.length > 2 ? kept.slice(1, -1).map(clean).join(' ') : '';
  }
  while (raw.length && TITLE_RE.test(raw[raw.length - 1]!)) raw.pop();
  return { first, last, middle, raw: raw.join(' ').replace(/,$/, '') };
}

function personKey(person: Person) {
  return `${person.last.toLowerCase()}|${(person.first[0] || '').toLowerCase()}`;
}

/** Regex sources (most specific first) for the written forms of one person's name. */
function personForms(person: Person, allowStandaloneFirst: boolean): string[] {
  const forms: string[] = [];
  const word = (value: string) => escapeRegExp(value).replace(/\s+/g, '\\s+');
  const midOpt = `(?:\\s+(?:${person.middle ? word(person.middle) + '|' : ''}[${L}]\\.?))?`;
  const { first, last } = person;
  if (first && last) {
    forms.push(`${word(last)}\\s*,\\s*${word(first)}${midOpt}`);
    forms.push(`${word(first)}${midOpt}\\s+${word(last)}`);
    forms.push(`${word(last)}\\s+${word(first)}`);
  }
  const standalone = (value: string) => value.length >= 3 && !NON_NAME_WORDS.has(value.toLowerCase()) && !STANDALONE_DENY.has(value.toLowerCase());
  if (last && standalone(last)) forms.push(word(last));
  if (allowStandaloneFirst && first && standalone(first)) forms.push(word(first));
  return forms;
}

export function redactReportText(input: string, context: RedactionContext): RedactionResult {
  // The key is resolved on the first replacement, so text with nothing to redact
  // never creates or reads a stored key.
  let keyedDigest: PseudonymFn | null = null;
  const digest: PseudonymFn = (kind, value) => {
    keyedDigest ??= createPseudonymDigest(typeof context.key === 'function' ? context.key() : context.key);
    return keyedDigest(kind, value);
  };
  const spans: string[] = [];
  let text = input;

  // Replaced regions become private-use sentinels so later patterns cannot
  // re-match fake values or the inside of a placeholder.
  const protect = (replacement: string) => {
    if (spans.length >= MAX_SPANS) return replacement;
    spans.push(replacement);
    return `\uE000${String.fromCharCode(0xE100 + spans.length - 1)}\uE001`;
  };
  const code = (kind: string, value: string) => {
    const bytes = digest(kind, value);
    let out = '';
    for (let i = 0; i < 4; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    return out;
  };
  const lineAt = (source: string, offset: number) => {
    const start = source.lastIndexOf('\n', offset - 1) + 1;
    const end = source.indexOf('\n', offset);
    return source.slice(start, end === -1 ? source.length : end);
  };
  /** Same characters classes, keyed digits/letters, separators kept. */
  const formatPreserving = (kind: string, value: string) => {
    const normalized = value.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
    let bytes = digest(kind, normalized);
    let counter = 0;
    let index = 0;
    const next = () => {
      if (index >= bytes.length) { counter++; bytes = digest(kind, `${normalized}#${counter}`); index = 0; }
      return bytes[index++]!;
    };
    let out = '';
    for (const char of value) {
      if (/\d/.test(char)) out += String(next() % 10);
      else if (/[A-Z]/.test(char)) out += String.fromCharCode(65 + (next() % 26));
      else if (/[a-z]/.test(char)) out += String.fromCharCode(97 + (next() % 26));
      else out += char;
    }
    if (out === value && /\d/.test(value)) {
      out = out.replace(/\d(?!.*\d)/, digit => String((Number(digit) + 1) % 10));
    }
    return out;
  };

  // ── Values an earlier pass produced stay exactly as they are ──
  const preserved = [...new Set(context.preserve ?? [])].filter(value => value.trim().length >= 4).sort((a, b) => b.length - a.length);
  if (preserved.length) {
    text = text.replace(new RegExp(preserved.map(escapeRegExp).join('|'), 'g'), match => protect(match));
  }
  const preservedCount = spans.length;

  // ── Emails ──
  text = text.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, match =>
    protect(`[EMAIL-${code('email', match.toLowerCase())}]`));

  // ── Detection on the original text (before anything changes) ──
  const dobKeys = new Set<string>();
  const profileDob = context.profileDob ? parseReportDate(context.profileDob) : null;
  if (profileDob) dobKeys.add(dateKey(profileDob));
  const dobLabeled = new RegExp(`${DOB_LABEL_SOURCE}\\s*[:]?\\s*(${DATE_SOURCE})`, 'gi');
  for (const match of input.matchAll(dobLabeled)) {
    const parsed = parseReportDate(match[1]!);
    if (parsed) dobKeys.add(dateKey(parsed));
  }

  const patients: Person[] = [];
  const addPatient = (person: Person | null) => { if (person && person.last) patients.push(person); };
  const patientLabel = /(?:^|[^\p{L}])(?:(?:patient|full|legal)\s+name|(?<!(?:physician|doctor|provider|clinician|facility|lab|laboratory|test|company|practice|clinic|hospital|ordering|referring|plan|insurance|file|user)\s+)name|patient|surname|last\s+name|first\s+name|jm[ée]no(?:\s+a\s+p[řr][íi]jmen[íi])?|p[řr][íi]jmen[íi]|pacient)\s*:\s*/giu;
  const czechPatientLabel = /(?:^|[^\p{L}])(?:jm[ée]no|pacient|p[řr][íi]jmen[íi])\s+(?=\p{Lu})/giu;
  // English labels followed by a space instead of a colon ("Patient Jane Smith"): only at the start of a
  // line or column, and only as a full capitalized name, so headings like "Patient Report" stay.
  const spacedPatientLabel = /(?:^|\n|\t|[ ]{2,})(?:(?:patient|full|legal)\s+name|patient|name)[ \t]+(?=\p{Lu})/giu;
  const labelRuns: Array<{ re: RegExp; options: { allowLowercase?: boolean; minTokens?: number } }> = [
    { re: patientLabel, options: { allowLowercase: true } },
    { re: czechPatientLabel, options: {} },
    { re: spacedPatientLabel, options: { minTokens: 2 } },
  ];
  for (const { re, options } of labelRuns) {
    for (const match of input.matchAll(re)) {
      const rest = input.slice(match.index! + match[0].length).split('\n')[0]!;
      addPatient(parsePersonName(segmentValue(rest), options));
    }
  }
  // Header layouts such as "Doe, Jane  DOB: 01/02/1990  Patient Report".
  const headerName = new RegExp(`(?:^|\\s)([\\p{Lu}][\\p{L}'’-]+(?:[ -][\\p{Lu}][\\p{L}'’-]+)?,\\s*[\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}]\\.?)?)(?=\\s+(?:${DOB_LABEL_SOURCE})\\b)`, 'giu');
  for (const match of input.matchAll(headerName)) addPatient(parsePersonName(match[1]!));
  if (context.profileName) {
    const rawTokens = context.profileName.trim().split(/\s+/);
    const tokens = rawTokens.filter(token => /^[\p{L}][\p{L}'’.-]+$/u.test(token));
    const looksLikePerson = tokens.length >= 2 && tokens.length <= 4 && tokens.length === rawTokens.length
      && tokens.every(token => !PROFILE_LABEL_WORDS.has(token.toLowerCase()) && !NON_NAME_WORDS.has(token.toLowerCase())
        && !(token.length <= 5 && token === token.toUpperCase() && token !== token.toLowerCase()));
    if (looksLikePerson) addPatient(parsePersonName(tokens.map(token => token[0]!.toUpperCase() + token.slice(1)).join(' ')));
  }

  const physicians: Person[] = [];
  const physicianLabel = /(?:^|[^\p{L}])(?:(?:(?:ordering|referring|attending|treating|primary)\s+)?(?:physician|doctor|provider|clinician)(?:\s+name)?|ordering|referring|l[ée]ka[řr]|o[šs]et[řr]uj[íi]c[íi](?:\s+l[ée]ka[řr])?)\s*:\s*/giu;
  for (const match of input.matchAll(physicianLabel)) {
    const rest = input.slice(match.index! + match[0].length).split('\n')[0]!;
    const person = parsePersonName(segmentValue(rest));
    if (person && person.last) physicians.push(person);
  }

  // ── Addresses ──
  const addressLabel = /((?:^|[^\p{L}])(?:address|adresa|bydli[šs]t[ěe]|residence|trval[ée]\s+bydli[šs]t[ěe])\s*:\s*)([^\n]+)/giu;
  text = text.replace(addressLabel, (_match, label: string, rest: string) => {
    const value = segmentValue(rest).trim();
    if (!value || /^\uE000/.test(value)) return label + rest;
    return label + protect(`[ADDRESS-${code('address', value.toLowerCase().replace(/\s+/g, ' '))}]`) + rest.slice(rest.indexOf(value) + value.length);
  });
  const street = new RegExp(String.raw`\b\d{1,6}[ \t]+(?:[NSEW]\.?[ \t]+)?(?:[\p{L}0-9'.-]+[ \t]+){0,4}(?:${STREET_SUFFIX})\b\.?(?:[ \t]+(?:NE|NW|SE|SW|N|S|E|W)\b)?(?:,?[ \t]*(?:Apt|Apartment|Suite|Ste|Unit|Bldg|Fl|Floor|#)\.?[ \t]*#?[ \t]*[\p{L}\d-]+)?`, 'giu');
  text = text.replace(street, (match: string, offset: number, whole: string) => {
    const words = match.split(/\s+/).slice(1, -1);
    if (words.some(token => /^\p{Ll}/u.test(token))) return match;
    if (UNIT_KEYWORDS.test(lineAt(whole, offset))) return match;
    return protect(`[ADDRESS-${code('address', match.toLowerCase().replace(/\s+/g, ' '))}]`);
  });
  const cityStateZip = new RegExp(String.raw`(?:\p{Lu}[\p{L}.'-]*[ \t]+){0,3}\p{Lu}[\p{L}.'-]*,?[ \t]+(?:${US_STATES})[ \t]+\d{5}(?:-\d{4})?\b`, 'gu');
  text = text.replace(cityStateZip, match => protect(`[LOCATION-${code('location', match.toLowerCase().replace(/[\s,]+/g, ' '))}]`));
  text = text.replace(/\b(?:P\.?\s?O\.?\s+Box|POB)\s+\d+\b/gi, match => protect(`[ADDRESS-${code('address', match.toLowerCase())}]`));

  // ── Dates of birth: keep the year, keyed month/day, every occurrence ──
  if (dobKeys.size > 0) {
    text = text.replace(new RegExp(`(?<!\\d)${DATE_SOURCE}(?!\\d)`, 'gi'), raw => {
      const parsed = parseReportDate(raw);
      if (!parsed || !dobKeys.has(dateKey(parsed))) return raw;
      const bytes = digest('dob', dateKey(parsed));
      let m = 1 + (bytes[0]! % 12);
      let d = 1 + (bytes[1]! % 28);
      if (m === parsed.m && d === parsed.d) d = (d % 28) + 1;
      return protect(formatLike(raw, { y: parsed.y, m, d }));
    });
  }

  // ── Patient names: removed outright, every written form ──
  const patientForms = [...new Set(patients.flatMap(person => personForms(person, true)))].sort((a, b) => b.length - a.length);
  if (patientForms.length) {
    const re = new RegExp(`${NOT_WORD_BEFORE}(?:${patientForms.join('|')})${NOT_WORD_AFTER}`, 'giu');
    text = text.replace(re, () => protect(PATIENT_PLACEHOLDER));
  }

  // ── Physicians: one keyed placeholder per person, every written form ──
  const physicianByForm: Array<{ source: string; replacement: string }> = [];
  for (const person of physicians) {
    const replacement = `[PHYSICIAN-${code('physician', personKey(person))}]`;
    for (const source of personForms(person, false)) physicianByForm.push({ source, replacement });
  }
  physicianByForm.sort((a, b) => b.source.length - a.source.length);
  for (const { source, replacement } of physicianByForm) {
    text = text.replace(new RegExp(`${NOT_WORD_BEFORE}${source}${NOT_WORD_AFTER}`, 'giu'), () => protect(replacement));
  }

  // ── Czech/Slovak birth numbers: real year kept, keyed rest, female offset kept ──
  const BIRTH_NUMBER = /^(\d{2})(0[1-9]|1[0-2]|5[1-9]|6[0-2])(0[1-9]|[12]\d|3[01])\/(\d{3,4})$/;
  const birthNumber = (match: string) => {
    const [, y, m, , suffix] = match.match(BIRTH_NUMBER)!;
    const bytes = digest('birth-number', match.replace('/', ''));
    const female = Number(m) > 50;
    const month = 1 + (bytes[0]! % 12) + (female ? 50 : 0);
    const day = 1 + (bytes[1]! % 28);
    let tail = '';
    for (let i = 0; i < suffix!.length; i++) tail += String(bytes[2 + i]! % 10);
    return `${y}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}/${tail}`;
  };
  const idValue = (value: string) => protect(BIRTH_NUMBER.test(value) ? birthNumber(value) : formatPreserving('id', value));

  // ── Labeled identifiers: keyed, format-preserving (same kind for all labels) ──
  const idLabel = /((?:^|[^\p{L}])(?:patient\s*(?:id|no\.?|number)|id\s*pacienta|[čc][íi]slo\s*pacienta|account\s*(?:no\.?|number|#)|acct\.?\s*(?:no\.?|#)?|mrn|medical\s*record(?:\s*(?:no\.?|number))?|specimen(?:\s*(?:id|no\.?|number))?|accession(?:\s*(?:no\.?|number))?|control\s*(?:id|no\.?|number)|requisition(?:\s*(?:id|no\.?|number))?|member\s*id|subscriber\s*id|group\s*(?:no\.?|number|id)|policy(?:\s*(?:no\.?|number))?|insurance\s*(?:no\.?|number|id)|[čc][íi]slo\s*(?:poji[šs]t[ěe]n[cí]e?|insurance)|poji[šs][tť]ovna|npi|ssn|social\s+security(?:\s+(?:no\.?|number))?|rodn[ée]\s*[čc][íi]slo|birth\s*number|r\.\s?[čc]\.)\s*[:#]?\s*)([A-Za-z0-9][A-Za-z0-9_./-]*\d[A-Za-z0-9_./-]*|\d)/giu;
  text = text.replace(idLabel, (_match, label: string, value: string) => label + idValue(value.replace(/[./]+$/, '')) + value.slice(value.replace(/[./]+$/, '').length));
  // Explicit ID labels with a colon or # take any value up to the next space, letters-only included.
  const explicitIdLabel = /((?:^|[^\p{L}])(?:patient\s*(?:id|no\.?|number)|id\s*pacienta|[čc][íi]slo\s*pacienta|account\s*(?:no\.?|number|#)|acct\.?\s*(?:no\.?|#)?|mrn|medical\s*record\s*(?:no\.?|number)|specimen\s*(?:id|no\.?|number)|accession\s*(?:no\.?|number)|control\s*(?:id|no\.?|number)|requisition\s*(?:id|no\.?|number)|member\s*id|subscriber\s*id|group\s*(?:no\.?|number|id)|policy\s*(?:no\.?|number)|insurance\s*(?:no\.?|number|id))[ \t]*[:#][ \t]*)([\p{L}\p{N}][\p{L}\p{N}_./-]*)/giu;
  text = text.replace(explicitIdLabel, (_match, label: string, value: string) => {
    const core = value.replace(/[./]+$/, '');
    return label + idValue(core) + value.slice(core.length);
  });

  text = text.replace(/\b\d{2}(?:0[1-9]|1[0-2]|5[1-9]|6[0-2])(?:0[1-9]|[12]\d|3[01])\/\d{3,4}\b/g, match => protect(birthNumber(match)));

  // ── SSN ──
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, match => protect(formatPreserving('id', match)));

  // ── Phones ──
  const phoneReplacement = (match: string) => {
    const digits = match.replace(/\D/g, '');
    return protect(`[PHONE-${code('phone', digits.slice(-10))}]`);
  };
  const phonePatterns = [
    // One field only: single spaces between groups, no column gaps or line breaks. "Ph" is matched only with
    // a capital P and a period or colon so "pH 7.40" stays a lab value.
    /(?<=(?:\b(?:[Tt]el|TEL|[Pp]hone|PHONE|[Ff]ax|FAX|[Mm]obile?|MOBILE?|[Cc]ell|CELL|[Tt]elefon|TELEFON)\.?|\bPh(?:\.|[ \t]*:))[ \t]*:?[ \t]*)\+?[\d(][\d().-]*(?: [\d(][\d().-]*){0,4}/g,
    /\(\d{3}\)\s*\d{3}[\s.-]\d{4}\b/g,
    /(?<![\d-])\d{3}[.-]\d{3}[.-]\d{4}\b(?![-.]\d)/g,
    /\+\d{1,3}[\s-]?\(?\d{2,3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g,
  ];
  /** The labeled match may run into following numbers; keep only the groups that form one phone number. */
  const phonePrefix = (match: string) => {
    const groups = match.split(' ');
    const enough = match.startsWith('+') ? 11 : 10;
    let digits = 0;
    let used = 0;
    for (const group of groups) {
      const count = group.replace(/\D/g, '').length;
      if (used > 0 && (digits >= enough || digits + count > 15)) break;
      digits += count;
      used++;
    }
    const prefix = groups.slice(0, used).join(' ').replace(/[^\d)]+$/, '');
    return digits >= 7 && digits <= 15 ? prefix : '';
  };
  phonePatterns.forEach((pattern, index) => {
    text = text.replace(pattern, (match: string, ...args: unknown[]) => {
      const offset = args[args.length - 2] as number;
      const whole = args[args.length - 1] as string;
      if (UNIT_KEYWORDS.test(lineAt(whole, offset))) return match;
      if (index > 0) return phoneReplacement(match);
      const prefix = phonePrefix(match);
      return prefix ? phoneReplacement(prefix) + match.slice(prefix.length) : match;
    });
  });

  // ── Unlabeled specimen-style IDs and long digit runs on non-result lines ──
  text = text.replace(/\b\d{3}-\d{3}-\d{4}-\d\b/g, match => protect(formatPreserving('id', match)));
  text = text.replace(/\b\d{8,}\b/g, (match: string, offset: number, whole: string) => {
    const line = lineAt(whole, offset);
    if (UNIT_KEYWORDS.test(line) || /===\s*Page/i.test(line)) return match;
    return protect(formatPreserving('id', match));
  });

  const restored = text.replace(/\uE000([\uE100-\uF8FF])\uE001/g, (_match, index: string) => spans[index.charCodeAt(0) - 0xE100] ?? '');
  const produced = spans.slice(preservedCount);
  return { text: restored, replacements: produced.length, produced };
}
