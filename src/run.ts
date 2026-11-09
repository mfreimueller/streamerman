// Runs a finished program against a task's checks.
import type { Program } from './lang/ast';
import { typecheck, type Env } from './lang/check';
import { evaluate } from './lang/eval';
import { bindingsOf, type Check, type Task, type Unit } from './content/types';
import { JavaException, isEnum, javaDouble, jEquals, toDisplay } from './engine/values';
import { type JType } from './lang/types';

export interface CheckOutcome {
  name: string;
  hidden: boolean;
  passed: boolean;
  /** e.g. titlesReleasedAfter(2000) */
  call: string;
  expectedText: string;
  actualText: string;
  /** Java exception, e.g. "ArithmeticException: / by zero" */
  error?: string;
}

export interface RunReport {
  /** Why the program could not be run (gaps, type errors). */
  problems: string[];
  checks: CheckOutcome[];
  allPassed: boolean;
}

export function taskEnv(unit: Unit, task: Task): Env {
  const env: Env = new Map();
  for (const b of bindingsOf(unit, task)) env.set(b.name, b.type);
  for (const p of task.params) env.set(p.name, p.type);
  return env;
}

function argText(v: unknown, t: JType, unit: Unit): string {
  if (isEnum(v)) return `${v.$enum}.${v.name}`;
  if (typeof v === 'number' && t.k === 'prim' && t.n === 'double') return javaDouble(v);
  return toDisplay(v, t, unit.universe);
}

export const describeProblems = (p: ReturnType<typeof typecheck>): string[] => [
  ...p.errors.map((e) => e.message),
  ...(p.incomplete ? [`${p.holes.length} gap${p.holes.length > 1 ? 's' : ''} left to fill`] : []),
];

export function runTask(unit: Unit, task: Task, program: Program): RunReport {
  const stmt = program.stmts[program.stmts.length - 1];
  const env = taskEnv(unit, task);
  const res = typecheck(stmt, env, unit.universe);
  const problems = describeProblems(res);
  if (problems.length) return { problems, checks: [], allPassed: false };

  const u = unit.universe;
  const ret = task.returnType;
  const checks = task.checks.map((c: Check): CheckOutcome => {
    const values = new Map<string, unknown>();
    for (const b of bindingsOf(unit, task)) values.set(b.name, c.data && b.name in c.data ? c.data[b.name] : b.value);
    task.params.forEach((p, i) => values.set(p.name, c.args[i]));
    const call = `${task.id}(${task.params.map((p, i) => argText(c.args[i], p.type, unit)).join(', ')})`;
    const expectedText = toDisplay(c.expected, ret, u);
    try {
      const actual = evaluate(stmt.root, values, res.info, u);
      return {
        name: c.name, hidden: c.hidden, call, expectedText,
        passed: jEquals(actual, c.expected),
        actualText: toDisplay(actual, res.type.k === 'any' ? ret : res.type, u),
      };
    } catch (e) {
      if (e instanceof JavaException) {
        return { name: c.name, hidden: c.hidden, call, expectedText, passed: false, actualText: '', error: `${e.javaName}${e.message ? `: ${e.message}` : ''}` };
      }
      throw e;
    }
  });
  return { problems: [], checks, allPassed: checks.every((c) => c.passed) };
}


