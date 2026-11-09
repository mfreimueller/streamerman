// Compares the engine with output captured from real Java (jshell). Regenerate: node tools/java-fixtures/gen.mjs
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/java-output.json';
import { PLAYS, universe } from '../src/content/music';
import { MISSIONS, universe as spaceUniverse } from '../src/content/space';
import { spaceMission } from '../src/content/space';
import { solutionProgram } from '../src/content/solution';
import { checkProgram } from '../src/lang/check';
import { typecheck, type Env } from '../src/lang/check';
import { evaluate } from '../src/lang/eval';
import { parseExpr } from '../src/lang/parse';
import { ANY, INT, STRING, cls, type JType } from '../src/lang/types';
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
const spaceTask = spaceMission.tasks[0];
const spaceTypes: Record<string, JType> = {
  missions: cls('List', cls('Mission')),
  n: INT,
  launched: cls('List', cls('Mission')),
  colleagues: cls('Map', STRING, cls('Map', STRING, cls('List', STRING))),
};
// values of the first two steps come from the engine itself (the model solution)
const spaceData: Record<string, unknown> = { missions: MISSIONS, n: 3 };
{
  const program = solutionProgram(spaceMission, spaceTask);
  const results = checkProgram(program, new Map(Object.entries({ missions: spaceTypes.missions, n: INT })), spaceUniverse);
  program.stmts.slice(0, 2).forEach((st, i) => {
    spaceData[st.name!] = evaluate(st.root, new Map(Object.entries(spaceData)), results[i].info, spaceUniverse);
  });
}
const data: Record<string, unknown> = { plays: PLAYS, words: WORDS, noWords: [], nums: NUMS, noInts: [], ds: DS };

describe('engine output equals real Java output', () => {
  for (const { expr, java, unit } of fixtures as { expr: string; java: string; unit?: string }[]) {
    it(expr, () => {
      const space = unit === 'space';
      const u = space ? spaceUniverse : universe;
      const root = parseExpr(expr, u.kindOf);
      const res = typecheck({ type: ANY, root }, new Map(Object.entries(space ? spaceTypes : types)), u);
      expect(res.errors).toEqual([]);
      let out: string;
      try {
        const v = evaluate(root, new Map(Object.entries(space ? spaceData : data)), res.info, u);
        out = toJavaString(v, res.type, u);
      } catch (e) {
        if (!(e instanceof JavaException)) throw e;
        out = `${e.javaName}: ${e.message}`;
      }
      expect(out).toBe(java);
    });
  }
});
