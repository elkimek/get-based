/** Independent counters and reporting for a legacy suite; assertion expressions stay at their call sites. */
export function createLegacyAssertions(detailSeparator = ' — ') {
  const results = { pass: 0, fail: 0 };
  function assert(name: unknown, condition: unknown, detail?: unknown): void {
    if (condition) { results.pass++; console.log(`  PASS: ${name}`); }
    else {
      results.fail++;
      console.log(`  FAIL: ${name}${detail ? detailSeparator + (detail as string) : ''}`);
    }
  }
  return { assert, results };
}
