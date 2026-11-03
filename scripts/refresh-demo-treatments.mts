// Rebuild the static synthetic treatment fixtures using the same owner as the
// rolling demo loader. Run typescript:build before invoking this emitted script.
import fs from 'node:fs';
import { applyDemoTreatmentData } from '../js/demo-treatment-data.js';

for (const sex of ['male', 'female']) {
  const file = new URL(`../data/demo-${sex}.json`, import.meta.url);
  const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  applyDemoTreatmentData(data, sex);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
