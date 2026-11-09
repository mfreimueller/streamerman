// Runs a finished program against a task's checks.
import type { Program } from './lang/ast';
import { checkProgram, type CheckResult, type Env } from './lang/check';
import { evaluate } from './lang/eval';
import { bindingsOf, type Check, type Task, type Unit } from './content/types';
import { Tracer } from './engine/trace';
import { JavaException, isEnum, isRecord, javaDouble, jEquals, toDisplay } from './engine/values';
import { toJavaOp } from './lang/print';
import { DOUBLE, INT, show, typeArg, type JType } from './lang/types';

export interface StepValue {
  /** Step variable name. */
  name: string;
  type: string;
  text: string;
}

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
  /** Values of the named steps that were evaluated (for debugging multi-step solutions). */
  steps: StepValue[];
}

/** What happened in one operation of the top-level chain of a statement. */
export interface OpTrace {
  label: string;
  kind: 'stream' | 'value';
  /** Number of elements that came out (streams). */
  count: number;
  /** Compact form of each element (records: `Movie#1 Eraserhead`). */
  values: string[];
  /** Full toString of each element. */
  full: string[];
  /** Elements the source has (only for the source of the chain). */
  total?: number;
  /** Number of elements that went in (streams after the source). */
  inCount?: number;
  /** Printed result (non-stream values). */
  text?: string;
}

export interface StmtTrace {
  stepName?: string;
  ops: OpTrace[];
}

export interface RunReport {
  /** Why the program could not be run (gaps, type errors). */
  problems: string[];
  checks: CheckOutcome[];
  allPassed: boolean;
  /** The step view: what flowed through each operation, for the first visible check. */
  trace?: { check: string; passed: boolean; stmts: StmtTrace[] };
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

export const describeProblems = (p: CheckResult): string[] => [
  ...p.errors.map((e) => e.message),
  ...(p.incomplete ? [`${p.holes.length} gap${p.holes.length > 1 ? 's' : ''} left to fill`] : []),
];

export function describeProgram(rs: CheckResult[]): string[] {
  return rs.flatMap((r, i) => describeProblems(r).map((m) => (rs.length > 1 ? `Step ${i + 1}: ${m}` : m)));
}

/** Short form of a record for the step view: `Movie#1 Eraserhead`, `Play Segfault Serenade`. */
export function compactValue(v: unknown, t: JType, unit: Unit): string {
  if (!isRecord(v)) return toDisplay(v, t, unit.universe);
  const def = unit.universe.records[v.$rec];
  if (!def) return toDisplay(v, t, unit.universe);
  const idf = def.fields.find((f) => f.name === 'id' || f.name === 'code');
  const strf = def.fields.find((f) => f.type.k === 'cls' && f.type.n === 'String' && f !== idf);
  return `${v.$rec}${idf ? `#${String(v[idf.name])}` : ''}${strf ? ` ${String(v[strf.name])}` : ''}`;
}

function elementType(t: JType): JType {
  if (t.k === 'cls' && t.n === 'IntStream') return INT;
  if (t.k === 'cls' && t.n === 'DoubleStream') return DOUBLE;
  return typeArg(t, 0);
}

function buildTrace(tr: Tracer, res: CheckResult, unit: Unit, stepName?: string): StmtTrace {
  const ops: OpTrace[] = [];
  let prev: OpTrace | undefined;
  for (const id of tr.order) {
    const rec = tr.recs.get(id);
    if (!rec) break;
    const ty = res.info.get(id)!.type;
    let op: OpTrace;
    if (rec.kind === 'stream') {
      const et = elementType(ty);
      op = {
        label: toJavaOp(rec.call), kind: 'stream', count: rec.out.length,
        values: rec.out.map((x) => compactValue(x, et, unit)), full: rec.out.map((x) => toDisplay(x, et, unit.universe)), total: rec.total,
        inCount: prev && prev.kind === 'stream' ? prev.count : undefined,
      };
    } else {
      op = { label: toJavaOp(rec.call), kind: 'value', count: 0, values: [], full: [], text: toDisplay(rec.value, ty, unit.universe) };
    }
    ops.push(op);
    prev = op;
  }
  return { stepName, ops };
}

export function runTask(unit: Unit, task: Task, program: Program): RunReport {
  const results = checkProgram(program, taskEnv(unit, task), unit.universe);
  const problems = describeProgram(results);
  if (problems.length) return { problems, checks: [], allPassed: false };

  const u = unit.universe;
  const ret = task.returnType;
  const last = program.stmts.length - 1;
  const firstVisible = task.checks.findIndex((c) => !c.hidden);
  let trace: RunReport['trace'];

  const checks = task.checks.map((c: Check, ci): CheckOutcome => {
    const values = new Map<string, unknown>();
    for (const b of bindingsOf(unit, task)) values.set(b.name, c.data && b.name in c.data ? c.data[b.name] : b.value);
    task.params.forEach((p, i) => values.set(p.name, c.args[i]));
    const call = `${task.id}(${task.params.map((p, i) => argText(c.args[i], p.type, unit)).join(', ')})`;
    const expectedText = toDisplay(c.expected, ret, u);
    const steps: StepValue[] = [];
    const traced = ci === firstVisible;
    const tracers: Tracer[] = [];
    const finish = (passed: boolean) => {
      if (traced) {
        trace = {
          check: c.name, passed,
          stmts: tracers.map((tr, i) => buildTrace(tr, results[i], unit, program.stmts[i].name)),
        };
      }
    };
    try {
      let actual: unknown;
      for (let i = 0; i <= last; i++) {
        const st = program.stmts[i];
        const tr = traced ? new Tracer(st.root) : undefined;
        if (tr) tracers.push(tr);
        actual = evaluate(st.root, values, results[i].info, u, tr);
        if (st.name) {
          values.set(st.name, actual);
          steps.push({ name: st.name, type: show(st.type), text: toDisplay(actual, st.type, u) });
        }
      }
      const passed = jEquals(actual, c.expected);
      finish(passed);
      const t = results[last].type;
      return { name: c.name, hidden: c.hidden, call, expectedText, passed, actualText: toDisplay(actual, t.k === 'any' ? ret : t, u), steps };
    } catch (e) {
      if (e instanceof JavaException) {
        finish(false);
        return { name: c.name, hidden: c.hidden, call, expectedText, passed: false, actualText: '', error: `${e.javaName}${e.message ? `: ${e.message}` : ''}`, steps };
      }
      throw e;
    }
  });
  return { problems: [], checks, allPassed: checks.every((c) => c.passed), trace };
}

