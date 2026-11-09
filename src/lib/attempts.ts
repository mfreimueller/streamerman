// Saving and restoring the last attempt of a task (all steps) as plain JSON.
import { newId, type Node, type Program } from '../lang/ast';
import { sameType, type JType } from '../lang/types';
import { stepsOf, type Task } from '../content/types';

const VERSION = 1;

interface Saved {
  v: number;
  stmts: { name?: string; type: JType; root: unknown }[];
}

export function serializeProgram(p: Program): Saved {
  return { v: VERSION, stmts: p.stmts.map((s) => ({ name: s.name, type: s.type, root: s.root })) };
}

const KINDS = new Set(['hole', 'name', 'lit', 'call', 'scall', 'enum', 'lambda', 'mref', 'bin', 'un']);

/** Rebuild a node with fresh ids; throws on anything that does not look like a node. */
function revive(raw: any): Node {
  if (!raw || typeof raw !== 'object' || !KINDS.has(raw.t)) throw new Error('bad node');
  const id = newId();
  const kid = (k: unknown) => revive(k);
  switch (raw.t) {
    case 'hole': return { t: 'hole', id };
    case 'name': return { t: 'name', id, name: String(raw.name) };
    case 'lit': return { t: 'lit', id, type: raw.type, value: raw.value };
    case 'enum': return { t: 'enum', id, owner: String(raw.owner), name: String(raw.name) };
    case 'mref': return { t: 'mref', id, owner: String(raw.owner), name: String(raw.name) };
    case 'call': return { t: 'call', id, target: kid(raw.target), name: String(raw.name), args: raw.args.map(kid) };
    case 'scall': return { t: 'scall', id, owner: String(raw.owner), name: String(raw.name), args: raw.args.map(kid) };
    case 'lambda': return { t: 'lambda', id, params: raw.params.map(String), body: kid(raw.body), ptypes: raw.ptypes };
    case 'bin': return { t: 'bin', id, op: raw.op, left: kid(raw.left), right: kid(raw.right) };
    default: return { t: 'un', id, op: raw.op, operand: kid(raw.operand) };
  }
}

/** The saved program if it is valid and fits the task's steps; otherwise undefined. */
export function deserializeProgram(raw: unknown, task: Task): Program | undefined {
  try {
    const s = raw as Saved;
    const steps = stepsOf(task);
    if (!s || s.v !== VERSION || !Array.isArray(s.stmts) || s.stmts.length !== steps.length) return undefined;
    const stmts = s.stmts.map((x, i) => {
      if (x.name !== steps[i].name || !sameType(x.type, steps[i].type)) throw new Error('steps changed');
      return { name: x.name, type: x.type, root: revive(x.root) };
    });
    return { stmts };
  } catch {
    return undefined;
  }
}

/** Is there anything worth saving (some step is not just a gap)? */
export const hasCode = (p: Program) => p.stmts.some((s) => s.root.t !== 'hole');
