import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(
  new URL('./fixtures/cashu-token-v4.6.1.json', import.meta.url),
  'utf8'
));
const existingWalletFixture = JSON.parse(await readFile(
  new URL('./fixtures/cashu-wallet-v4.6.1.json', import.meta.url),
  'utf8'
));
const previousCashu = globalThis.cashuts;

beforeAll(async () => {
  const source = await readFile(new URL('../vendor/cashu-ts.js', import.meta.url), 'utf8');
  (0, eval)(source);
});

afterAll(() => {
  if (previousCashu === undefined) delete globalThis.cashuts;
  else globalThis.cashuts = previousCashu;
});

describe('vendored Cashu compatibility', () => {
  for (const format of ['cashuA', 'cashuB']) {
    it(`decodes the frozen 4.6.1 ${format} fixture without changing value or mint`, () => {
      const metadata = globalThis.cashuts.getTokenMetadata(fixture[format]);
      expect(metadata.mint).toBe(fixture.mint);
      expect(metadata.unit).toBe(fixture.unit);
      expect(Number(metadata.amount.toString())).toBe(fixture.amount);

      const decoded = globalThis.cashuts.getDecodedToken(fixture[format], [fixture.proof.id]);
      expect(decoded.mint).toBe(fixture.mint);
      expect(decoded.unit).toBe(fixture.unit);
      expect(decoded.proofs).toHaveLength(1);
      expect(decoded.proofs[0]).toMatchObject({
        id: fixture.proof.id,
        secret: fixture.proof.secret,
        C: fixture.proof.C,
      });
      expect(Number(decoded.proofs[0].amount.toString())).toBe(fixture.amount);
    });
  }

  it('round-trips the frozen proof through the shipped encoder', () => {
    const encoded = globalThis.cashuts.getEncodedToken({
      mint: fixture.mint,
      unit: fixture.unit,
      proofs: [fixture.proof],
    });
    const decoded = globalThis.cashuts.getDecodedToken(encoded, [fixture.proof.id]);
    expect(decoded.mint).toBe(fixture.mint);
    expect(decoded.proofs[0]).toMatchObject({
      id: fixture.proof.id,
      secret: fixture.proof.secret,
      C: fixture.proof.C,
    });
    expect(Number(decoded.proofs[0].amount.toString())).toBe(fixture.amount);
  });

  it('rejects malformed tokens without mutating global codec state', () => {
    expect(() => globalThis.cashuts.getTokenMetadata('cashuB-not-valid')).toThrow();
    expect(globalThis.cashuts.getTokenMetadata(fixture.cashuB).mint).toBe(fixture.mint);
  });

  it('keeps existing-user pending recovery tokens decodable after the vendor upgrade', () => {
    for (const token of [
      existingWalletFixture.pendingDeposit,
      existingWalletFixture.pendingWithdraw.token,
    ]) {
      const metadata = globalThis.cashuts.getTokenMetadata(token);
      expect(metadata.mint).toBe(fixture.mint);
      expect(Number(metadata.amount.toString())).toBe(1);
    }
  });
});
