// Interpreter over the typed tree.
import type { Node } from './ast';
import type { NodeInfo } from './check';
import { isNumeric, show, type JType } from './types';
import type { Universe } from './universe';
import { JavaException, toJavaString } from '../engine/values';

export type Values = Map<string, unknown>;

export function evaluate(root: Node, values: Values, info: Map<number, NodeInfo>, u: Universe): unknown {
  const typeOf = (n: Node): JType => info.get(n.id)!.type;

  const ev = (n: Node, env: Values): any => {
    switch (n.t) {
      case 'hole':
        throw new Error('Cannot run: the program still has a gap');
      case 'name':
        return env.get(n.name);
      case 'lit':
        return n.value;
      case 'enum':
        return u.enumValue(n.owner, n.name);
      case 'lambda':
        return (...xs: unknown[]) => {
          const e2 = new Map(env);
          n.params.forEach((p, i) => e2.set(p, xs[i]));
          return ev(n.body, e2);
        };
      case 'mref': {
        const ni = info.get(n.id)!;
        const m = ni.member!;
        return (x: unknown) => {
          if (x === null || x === undefined) throw new JavaException('NullPointerException');
          return m.eval(x, [], { u }, { recv: ni.recv!, args: [] });
        };
      }
      case 'call': {
        const ni = info.get(n.id)!;
        const recv = ev(n.target, env);
        if (recv === null || recv === undefined) {
          throw new JavaException('NullPointerException', `Cannot invoke "${n.name}()" because value is null`);
        }
        const args = n.args.map((a) => ev(a, env));
        return ni.member!.eval(recv, args, { u }, { recv: ni.recv!, args: ni.argTypes ?? [] });
      }
      case 'scall':
        throw new Error(`Unsupported static call ${n.owner}.${n.name}`);
      case 'un': {
        const v = ev(n.operand, env);
        if (n.op === '!') return !v;
        return typeOf(n).k === 'prim' && (typeOf(n) as any).n === 'int' ? (-v) | 0 : -v;
      }
      case 'bin':
        return binary(n, env);
    }
  };

  const binary = (n: Extract<Node, { t: 'bin' }>, env: Values): unknown => {
    const op = n.op;
    if (op === '&&') return ev(n.left, env) && ev(n.right, env);
    if (op === '||') return ev(n.left, env) || ev(n.right, env);
    const l = ev(n.left, env);
    const r = ev(n.right, env);
    const lt = typeOf(n.left);
    const rt = typeOf(n.right);
    const res = typeOf(n);
    if (op === '==' || op === '!=') {
      let same: boolean;
      if (lt.k === 'cls' && lt.n === 'String' && rt.k === 'cls' && rt.n === 'String') {
        // Reference comparison: data strings are distinct objects; only literals and the same variable are identical.
        same =
          (n.left.t === 'lit' && n.right.t === 'lit' && n.left.value === n.right.value) ||
          (n.left.t === 'name' && n.right.t === 'name' && n.left.name === n.right.name);
      } else same = l === r;
      return op === '==' ? same : !same;
    }
    if (op === '+' && res.k === 'cls' && res.n === 'String') {
      return toJavaString(l, lt, u) + toJavaString(r, rt, u);
    }
    if (l === null || r === null || l === undefined || r === undefined) throw new JavaException('NullPointerException');
    switch (op) {
      case '<': return l < r;
      case '<=': return l <= r;
      case '>': return l > r;
      case '>=': return l >= r;
    }
    const kind = res.k === 'prim' ? res.n : 'double';
    if (!isNumeric(res)) throw new Error(`Bad operand types for ${op}: ${show(lt)} and ${show(rt)}`);
    const wrap = (x: number) => (kind === 'int' ? x | 0 : x);
    switch (op) {
      case '+': return wrap(l + r);
      case '-': return wrap(l - r);
      case '*': return kind === 'int' ? Math.imul(l, r) : l * r;
      case '/':
        if (kind === 'double') return l / r;
        if (r === 0) throw new JavaException('ArithmeticException', '/ by zero');
        return wrap(Math.trunc(l / r));
      case '%':
        if (kind === 'double') return l % r;
        if (r === 0) throw new JavaException('ArithmeticException', '/ by zero');
        return l % r;
    }
    throw new Error(`Unknown operator ${op}`);
  };

  return ev(root, values);
}
