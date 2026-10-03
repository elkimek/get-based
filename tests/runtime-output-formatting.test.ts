import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { compactRuntimeIndentation } from '../scripts/build-typescript.js';

function evaluate(source: string): unknown {
  return JSON.parse(JSON.stringify(runInNewContext(source))) as unknown;
}

describe('emitted runtime indentation', () => {
  it('reduces code indentation while preserving cooked and raw multiline templates', () => {
    const source = '(() => {\n    const tag = (parts) => [parts[0], parts.raw[0]];\n    return tag`first\n        second\\n\n    last`;\n})()';
    const compact = compactRuntimeIndentation(source);
    expect(compact.length).toBeLessThan(source.length);
    expect(compact).toContain('first\n        second\\n\n    last');
    expect(evaluate(compact)).toEqual(evaluate(source));
  });

  it('preserves nested template substitutions and continued string literals', () => {
    const source = '(() => {\n    const text = "first\\\n        second";\n    return `outer\n        ${`inner\n            ${text}\n        end`}\n    tail`;\n})()';
    expect(evaluate(compactRuntimeIndentation(source))).toEqual(evaluate(source));
  });

  it('preserves automatic semicolon insertion, regexes, comments and Unicode', () => {
    const source = '(() => {\n    function stop() {\n        return\n        /[ /]+/.test(" / ");\n    }\n    /* preserved\n        multiline comment */\n    return [stop(), /[ /]+/.source, "λ", 8 / 2 / 2];\n})()';
    const compact = compactRuntimeIndentation(source);
    expect(compact).toContain('/* preserved\n        multiline comment */');
    expect(evaluate(compact)).toEqual([null, '[ /]+', 'λ', 2]);
    expect(evaluate(compact)).toEqual(evaluate(source));
  });
  it('preserves raw hashes and HTML entities after template substitutions', () => {
    const source = '(() => {\n    const count = 1;\n    return `value ${count} &#129694;\n        #plain /* template text */\n    end`;\n})()';
    const compact = compactRuntimeIndentation(source);
    expect(compact).toContain('&#129694;\n        #plain /* template text */');
    expect(evaluate(compact)).toEqual(evaluate(source));
  });

});
