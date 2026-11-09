// Compares the engine with output captured from real Java (jshell). Regenerate: node tools/java-fixtures/gen.mjs
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/java-output.json';
import { PLAYS, universe } from '../src/content/music';
import { typecheck, type Env } from '../src/lang/check';
import { evaluate } from '../src/lang/eval';
import { parseExpr } from '../src/lang/parse';
import { ANY, STRING, cls, type JType } from '../src/lang/types';
import { JavaException, toJavaString } from '../src/engine/values';

const WORDS = ['stream', 'map', 'filter', 'limit', 'of', 'sorted', 'distinct', 'collect', 'reduce', 'flat', 'count', 'peek', 'skip', 'find', 'any', 'none', 'all'];
const NUMS = [5, 3, 8, 3, 12, 7, 1, 8, 20, 17, 33, 16, 65, 100];
const DS = [0.1, 0.2, 0.3, 7.0, 1.0e7, 0.001, 1.0e-4, 123456789.125, 2.5, 1.0 / 3];

const types: Record<string, JType> = {
  plays: cls('List', cls('Play')),
  words: cls('List', STRING),
  noWords: cls('List', STRING),
  nums: cls('List', cls('Integer')),
  noInts: cls('List', cls('Integer')),
  ds: cls('List', cls('Double')),
};
const data: Record<string, unknown> = { plays: PLAYS, words: WORDS, noWords: [], nums: NUMS, noInts: [], ds: DS };

describe('engine output equals real Java output', () => {
  for (const { expr, java } of fixtures as { expr: string; java: string }[]) {
    it(expr, () => {
      const root = parseExpr(expr, universe.kindOf);
      const res = typecheck({ type: ANY, root }, new Map(Object.entries(types)), universe);
      expect(res.errors).toEqual([]);
      let out: string;
      try {
        const v = evaluate(root, new Map(Object.entries(data)), res.info, universe);
        out = toJavaString(v, res.type, universe);
      } catch (e) {
        if (!(e instanceof JavaException)) throw e;
        out = `${e.javaName}: ${e.message}`;
      }
      expect(out).toBe(java);
    });
  }
});
