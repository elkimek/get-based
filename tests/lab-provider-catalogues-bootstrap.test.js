import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('lab provider catalogue browser bootstrap', () => {
  it('loads the extensionless API route so static dev servers do not serve the Vercel function source as JS', () => {
    expect(indexHtml).toContain('<script src="/api/lab-provider-catalogues"></script>');
    expect(indexHtml).not.toContain('<script src="/api/lab-provider-catalogues.js"></script>');
  });
});
