// Static type checker over the expression tree.
import type { BinOp, Node, Stmt } from './ast';
import { holesOf } from './ast';
import {
  ANY, BOOLEAN, DOUBLE, INT, LONG, STRING, assignable, cls, fnShape, isAny, isBoolean,
  isNumeric, promote, show, unbox, withFnReturn, type JType,
} from './types';
import { findMember, type Member } from './members';
import type { Universe } from './universe';

export type Env = Map<string, JType>;

export interface NodeInfo {
  type: JType;
  expected: JType;
  env: Env;
  error?: string;
  /** Resolved member of a call / method reference. */
  member?: Member;
  recv?: JType;
  argTypes?: JType[];
}

export interface CheckResult {
  info: Map<number, NodeInfo>;
  errors: { id: number; message: string }[];
  holes: number[];
  incomplete: boolean;
  type: JType;
}

const LIT_TYPES = { int: INT, long: LONG, double: DOUBLE, boolean: BOOLEAN, String: STRING } as const;
const ARITH: BinOp[] = ['+', '-', '*', '/', '%'];
const REL: BinOp[] = ['<', '<=', '>', '>='];

const compactCall = (name: string, arity: number) => `${name}(${arity ? '…' : ''})`;

export function typecheck(stmt: Stmt, env: Env, u: Universe): CheckResult {
  const info = new Map<number, NodeInfo>();

  const visit = (n: Node, e: Env, expected: JType): JType => {
    const ni: NodeInfo = { type: ANY, expected, env: e };
    info.set(n.id, ni);
    ni.type = infer(n, e, expected, ni);
    if (!ni.error && n.t !== 'hole' && n.t !== 'lambda' && n.t !== 'mref' && !assignable(ni.type, expected)) {
      ni.error = `Expected ${show(expected)} but got ${show(ni.type)}`;
    }
    return ni.type;
  };

  /** Type of a functional expression given what its body/method returns. */
  const fnResult = (ni: NodeInfo, expected: JType, bodyType: JType, errorTarget: NodeInfo): JType => {
    const shape = fnShape(expected)!;
    if (!isAny(shape.ret) && !assignable(bodyType, shape.ret)) {
      errorTarget.error = `Expected ${show(shape.ret)} but got ${show(bodyType)}`;
    }
    ni.type = withFnReturn(expected, bodyType);
    return ni.type;
  };

  const infer = (n: Node, e: Env, expected: JType, ni: NodeInfo): JType => {
    switch (n.t) {
      case 'hole':
        return ANY;
      case 'name': {
        const t = e.get(n.name);
        if (!t) {
          ni.error = `Cannot find symbol ${n.name}`;
          return ANY;
        }
        return t;
      }
      case 'lit':
        return LIT_TYPES[n.type];
      case 'enum': {
        const def = u.enums[n.owner];
        if (!def || !def.constants.includes(n.name)) ni.error = `Cannot find symbol ${n.owner}.${n.name}`;
        return cls(n.owner);
      }
      case 'lambda': {
        const shape = fnShape(expected);
        if (!shape) {
          ni.error = isAny(expected) ? 'A lambda is not allowed here' : `Expected ${show(expected)} but got a lambda`;
          visit(n.body, e, ANY);
          return ANY;
        }
        if (shape.params.length !== n.params.length) {
          ni.error = `Lambda needs ${shape.params.length} parameter(s)`;
          visit(n.body, e, ANY);
          return expected;
        }
        const e2: Env = new Map(e);
        n.params.forEach((p, i) => e2.set(p, shape.params[i]));
        const bodyExpected = shape.ret.k === 'prim' && shape.ret.n === 'void' ? ANY : shape.ret;
        return withFnReturn(expected, visit(n.body, e2, bodyExpected));
      }
      case 'mref': {
        const shape = fnShape(expected);
        if (!shape || shape.params.length !== 1) {
          ni.error = isAny(expected) ? 'A method reference is not allowed here' : `Expected ${show(expected)} but got a method reference`;
          return ANY;
        }
        const p = shape.params[0];
        if (isAny(p)) return expected;
        if (p.k !== 'cls' || p.n !== n.owner) {
          ni.error = `${n.owner}::${n.name} does not fit ${show(p)}`;
          return expected;
        }
        const m = findMember(p, n.name, 0, u);
        if (!m) {
          ni.error = `Cannot find method ${n.name}() on ${show(p)}`;
          return expected;
        }
        ni.member = m;
        ni.recv = p;
        return fnResult(ni, expected, m.ret(p, [], u), ni);
      }
      case 'call': {
        const rt = visit(n.target, e, ANY);
        const m = n.target.t === 'hole' || isAny(rt) ? undefined : findMember(rt, n.name, n.args.length, u);
        if (!m) {
          if (!isAny(rt)) {
            ni.error = rt.k === 'prim'
              ? `${show(rt)} cannot be dereferenced`
              : `Cannot find method ${compactCall(n.name, n.args.length)} on ${show(rt)}`;
          }
          n.args.forEach((a) => visit(a, e, ANY));
          return ANY;
        }
        ni.member = m;
        ni.recv = rt;
        const exp = m.args(rt, u);
        const ats = n.args.map((a, i) => visit(a, e, exp[i] ?? ANY));
        ni.argTypes = ats;
        return m.ret(rt, ats, u);
      }
      case 'scall': {
        n.args.forEach((a) => visit(a, e, ANY));
        ni.error = `Cannot find method ${n.owner}.${compactCall(n.name, n.args.length)}`;
        return ANY;
      }
      case 'un': {
        if (n.op === '!') {
          visit(n.operand, e, BOOLEAN);
          return BOOLEAN;
        }
        const t = visit(n.operand, e, ANY);
        if (!isAny(t) && !isNumeric(t)) ni.error = `Bad operand type ${show(t)} for unary -`;
        return isAny(t) ? ANY : promote(t, INT);
      }
      case 'bin': {
        const op = n.op;
        const logic = op === '&&' || op === '||';
        const lt = visit(n.left, e, logic ? BOOLEAN : ANY);
        const rt = visit(n.right, e, logic ? BOOLEAN : ANY);
        const bad = () => {
          ni.error = `Bad operand types for ${op}: ${show(lt)} and ${show(rt)}`;
        };
        if (logic) return BOOLEAN; // operands were checked against boolean
        const known = [lt, rt].filter((t) => !isAny(t));
        if (op === '==' || op === '!=') {
          const ok = (t: JType) => isNumeric(t) || isBoolean(t) || (t.k === 'cls' && (t.n === 'String' || !!u.enums[t.n] || !!u.records[t.n]));
          if (!known.every(ok)) bad();
          else if (known.length === 2) {
            const a = unbox(lt), b = unbox(rt);
            const fine = (isNumeric(a) && isNumeric(b)) || (isBoolean(a) && isBoolean(b)) || (lt.k === 'cls' && rt.k === 'cls' && lt.n === rt.n);
            if (!fine) bad();
          }
          return BOOLEAN;
        }
        if (op === '+' && known.some((t) => t.k === 'cls' && t.n === 'String')) return STRING;
        if (!known.every(isNumeric)) {
          bad();
          return REL.includes(op) ? BOOLEAN : ANY;
        }
        if (REL.includes(op)) return BOOLEAN;
        if (ARITH.includes(op)) return known.length === 2 ? promote(lt, rt) : known.length === 1 ? promote(known[0], INT) : ANY;
        return ANY;
      }
    }
  };

  const type = visit(stmt.root, env, stmt.type);
  const errors: { id: number; message: string }[] = [];
  for (const [id, ni] of info) if (ni.error) errors.push({ id, message: ni.error });
  const holes = holesOf(stmt.root).map((h) => h.id);
  return { info, errors, holes, incomplete: holes.length > 0, type };
}

